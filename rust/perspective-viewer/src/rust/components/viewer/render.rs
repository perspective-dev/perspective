// ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
// ┃ ██████ ██████ ██████       █      █      █      █      █ █▄  ▀███ █       ┃
// ┃ ▄▄▄▄▄█ █▄▄▄▄▄ ▄▄▄▄▄█  ▀▀▀▀▀█▀▀▀▀▀ █ ▀▀▀▀▀█ ████████▌▐███ ███▄  ▀█ █ ▀▀▀▀▀ ┃
// ┃ █▀▀▀▀▀ █▀▀▀▀▀ █▀██▀▀ ▄▄▄▄▄ █ ▄▄▄▄▄█ ▄▄▄▄▄█ ████████▌▐███ █████▄   █ ▄▄▄▄▄ ┃
// ┃ █      ██████ █  ▀█▄       █ ██████      █      ███▌▐███ ███████▄ █       ┃
// ┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
// ┃ Copyright (c) 2017, the Perspective Authors.                              ┃
// ┃ ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ ┃
// ┃ This file is part of the Perspective library, distributed under the terms ┃
// ┃ of the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0). ┃
// ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

//! The root component's `view()`: composition of the settings pane, the
//! column-settings drawer, and the multi-panel `MainPanel`.
//!
//! INVARIANT: the `SplitPanel` is ALWAYS rendered with `main_panel` as its
//! last (flex-fill) pane — toggling the settings sidebar only adds/removes the
//! leading pane, never reparents `main_panel` (a remount would tear down
//! `<regular-layout>` + the plugin `<slot>`s). The children of
//! `#main_column_container` are FULLY KEYED for the same reason: the
//! workspace drawer mounts ahead of `main_panel`.

use yew::prelude::*;

use super::PerspectiveViewer;
use super::msg::PerspectiveViewerMsg::*;
use super::msg::{Divider, PaneTarget};
use crate::components::column_settings_sidebar::ColumnSettingsPanel;
use crate::components::main_panel::MainPanel;
use crate::components::panel_menu::PanelCommand;
use crate::components::settings_panel::SettingsPanel;
use crate::components::style::StyleSurface;
use crate::components::workspace_panel::WorkspacePanel;
use crate::config::SettingsUpdate;
use crate::presentation::ColumnSettingsTarget;
use crate::queries::*;
use crate::renderer::{LocalKeyRcRefCellVecPluginRecordExt, PLUGIN_REGISTRY};
use crate::session::TableLoadState;
use crate::ui::{FontLoader, SplitPanel, StyleProvider};
use crate::utils::PtrEqRc;

impl PerspectiveViewer {
    /// The registered plugin names, for the empty-stage plugin selector.
    /// Cached by VALUE so an unchanged registry keeps the same `PtrEqRc`
    /// (which compares by pointer) and does not re-render `SettingsPanel`.
    fn registry_plugin_names(&self) -> PtrEqRc<Vec<String>> {
        let names = PLUGIN_REGISTRY
            .plugin_configs()
            .iter()
            .map(|c| c.name.clone())
            .collect::<Vec<_>>();

        let mut cached = self.registry_plugins.borrow_mut();
        if **cached != names {
            *cached = PtrEqRc::new(names);
        }

        cached.clone()
    }

    pub(super) fn render(&self, ctx: &Context<Self>) -> Html {
        // The settings panel + status bar bind to the *active* panel's engines;
        // `presentation` is element-level (shared).
        let presentation = &ctx.props().presentation;
        let renderer = &self.active_renderer;
        let session = &self.active_session;

        // EMPTY STAGE: zero panels and no pending `load()`. The chrome binds
        // the detached `empty_*` engines, which have no table — so the
        // table-loaded gates below also admit this mode explicitly.
        let is_empty = ctx.props().workspace.is_empty_stage();
        let is_settings_open = self.settings_open
            && (is_empty || matches!(self.session_props.has_table, Some(TableLoadState::Loaded)));

        let mut class = classes!();
        if !is_settings_open {
            class.push("settings-closed");
        }

        if self.session_props.title.is_some() {
            class.push("titled");
        }

        let on_open_expr_panel = ctx.link().callback(|c| OpenColumnSettings {
            target: c,
            sender: None,
            toggle: true,
        });

        let on_close_settings = ctx
            .link()
            .callback(|()| ToggleSettingsInit(None, true, None));
        let on_debug = ctx.link().callback(|_| ToggleDebug);
        let selected_column = get_current_column_locator(
            &self.presentation_props.open_column_settings,
            renderer,
            &self.session_props.config,
            &self.session_props.metadata,
        );

        let selected_tab = self.presentation_props.open_column_settings.tab;
        let plugin_name = self.renderer_props.plugin_name.clone();
        // The empty renderer never selects a plugin (selecting before the
        // real plugins register pins its store to `Debug`), so its props
        // carry no plugin list — read the registry instead.
        let available_plugins = if is_empty {
            self.registry_plugin_names()
        } else {
            self.renderer_props.available_plugins.clone()
        };
        let has_table = self.session_props.has_table.clone();
        let named_column_count = self.renderer_props.config.config_column_names.len();

        let view_config = self.session_props.config.clone();
        let drag_column = self.dragdrop_props.column.clone();
        let metadata = self.session_props.metadata.clone();
        let on_select_tab = ctx.link().callback(SettingsPanelTabChanged);
        let on_auto_width = ctx.link().callback(SettingsPanelAutoWidth);
        let settings_panel = if is_settings_open {
            html! {
                <SettingsPanel
                    on_close={on_close_settings}
                    {is_empty}
                    on_resize={&self.on_resize}
                    on_select_column={on_open_expr_panel}
                    is_debug={self.debug_open}
                    {on_debug}
                    {plugin_name}
                    {available_plugins}
                    {has_table}
                    {named_column_count}
                    plugin_static_config={self.renderer_props.config.clone()}
                    {view_config}
                    plugin_config={self.renderer_props.plugin_config.clone()}
                    columns_config={self.renderer_props.columns_config.clone()}
                    config_defaults={self.renderer_props.config_defaults.clone()}
                    {drag_column}
                    metadata={metadata.clone()}
                    open_column_settings={self.presentation_props.open_column_settings.clone()}
                    selected_theme={self.presentation_props.selected_theme.clone()}
                    selected_tab={self.settings_geometry.selected_tab}
                    auto_width={self.settings_geometry.auto_width}
                    on_dimensions_reset={&self.on_settings_panel_dimensions_reset}
                    {on_select_tab}
                    {on_auto_width}
                    {presentation}
                    {renderer}
                    {session}
                    workspace={ctx.props().workspace.clone()}
                />
            }
        } else {
            html! { <></> }
        };

        let on_settings = ctx
            .link()
            .callback(|()| ToggleSettingsInit(None, true, None));
        let on_select_tab = ctx.link().callback(ColumnSettingsTabChanged);
        // Pinning the drawer is a pure CSS positioning flip on `#modal_panel`
        // (absolute overlay over the main panel <-> static flex sibling
        // between the main panel and the settings pane) - the drawer NEVER
        // reparents, so neither `MainPanel` nor the drawer subtree remounts
        // on toggle, and the divider/width-override machinery is identical
        // in both modes.
        let is_pinned = self.settings_geometry.column_settings_pinned;
        // No columns exist at zero panels; never mount the drawer there.
        let selected_column = selected_column.filter(|_| !is_empty);
        let column_settings_panel = selected_column.map(|selected_column| {
            html! {
                <SplitPanel
                    key="column_settings"
                    id="modal_panel"
                    class={classes!(is_pinned.then_some("pinned"))}
                    reverse=true
                    deferred={is_pinned}
                    size={self.settings_geometry.column_settings_width_override}
                    initial_size={self.settings_geometry.column_settings_width_override}
                    on_reset={ctx.link().callback(|_| DividerMove(Divider::ColumnSettings, PaneTarget::Natural))}
                    on_resize={ctx.link().callback(|(x, _): (i32, i32)| DividerMove(Divider::ColumnSettings, PaneTarget::Width(x)))}
                    on_resize_finished={ctx.link().callback(|_| DividerFinish(Divider::ColumnSettings))}
                >
                    <ColumnSettingsPanel
                        {selected_column}
                        {selected_tab}
                        on_close={self.on_close_column_settings.clone()}
                        width_override={self.settings_geometry.column_settings_width_override}
                        auto_width={self.settings_geometry.column_settings_auto_width}
                        on_auto_width={ctx.link().callback(ColumnSettingsPanelAutoWidth)}
                        {is_pinned}
                        on_toggle_pin={ctx.link().callback(|()| ToggleColumnSettingsPin)}
                        {on_select_tab}
                        plugin_name={self.renderer_props.plugin_name.clone()}
                        config_defaults={self.renderer_props.config_defaults.clone()}
                        {metadata}
                        view_config={self.session_props.config.clone()}
                        column_stats={self.session_props.column_stats.clone()}
                        selected_theme={self.presentation_props.selected_theme.clone()}
                        {presentation}
                        {renderer}
                        {session}
                        workspace={ctx.props().workspace.clone()}
                    />
                    <></>
                </SplitPanel>
            }
        });

        let drawer = self.workspace_drawer.shown;
        let workspace_drawer = drawer.open.then(|| {
            let auto_width = match self.workspace_drawer.width_override {
                None => self.workspace_drawer.auto_width,
                Some(_) => 0.0,
            };

            let workspace = &ctx.props().workspace;
            let panels = workspace
                .panels()
                .into_iter()
                .filter(|panel| {
                    crate::tasks::can_derive(&panel.session) && panel.session.get_table().is_some()
                })
                .map(|panel| {
                    let title = panel.session.get_title().filter(|t| !t.is_empty());
                    (panel.id.as_str().to_owned(), title)
                })
                .collect::<Vec<_>>();

            html! {
                <SplitPanel
                    key="workspace"
                    id="workspace_drawer"
                    class={classes!(drawer.pinned.then_some("pinned"))}
                    deferred={drawer.pinned}
                    size={self.workspace_drawer.width_override}
                    initial_size={self.workspace_drawer.width_override}
                    on_reset={ctx.link().callback(|_| DividerMove(Divider::Workspace, PaneTarget::Natural))}
                    on_resize={ctx.link().callback(|(x, _): (i32, i32)| DividerMove(Divider::Workspace, PaneTarget::Width(x)))}
                    on_resize_finished={ctx.link().callback(|_| DividerFinish(Divider::Workspace))}
                >
                    <WorkspacePanel
                        host={self.host.clone()}
                        status={self.workspace_status.clone()}
                        selected_tab={self.workspace_drawer.selected_tab}
                        is_pinned={drawer.pinned}
                        {auto_width}
                        panels={std::rc::Rc::new(panels)}
                        on_toggle={ctx.link().callback(|()| StatusIndicatorClicked)}
                        on_toggle_pin={ctx.link().callback(|()| ToggleWorkspaceDrawerPin)}
                        on_select_tab={ctx.link().callback(WorkspaceTabChanged)}
                        on_auto_width={ctx.link().callback(WorkspacePanelAutoWidth)}
                        on_new_panel={ctx.link().callback(|(client, table)| NewPanelFrom { client, table })}
                        on_derive_panel={ctx.link().callback(DerivePanel)}
                    />
                    <></>
                </SplitPanel>
            }
        });

        let on_reset = ctx.link().callback(|all| ResetPanel(None, all, None));
        let main_panel = html! {
            <MainPanel
                key="main"
                {on_settings}
                {on_reset}
                on_activate_panel={ctx.link().callback(|id| SetActivePanel(id, None))}
                on_close_panel={ctx.link().callback(|id| ClosePanel(id, None))}
                on_panel_closed={ctx.link().callback(PanelClosed)}
                on_panel_command={ctx.link().batch_callback(|(id, cmd): (String, PanelCommand)| {
                    match cmd {
                        PanelCommand::New => vec![NewPanel(id)],
                        PanelCommand::NewFrom { client, table } => {
                            vec![NewPanelFrom { client, table }]
                        },
                        PanelCommand::Duplicate => vec![DuplicatePanel(id)],
                        PanelCommand::Derive => vec![DerivePanel(id)],
                        PanelCommand::NewFromPanel(source) => vec![DuplicatePanel(source)],
                        PanelCommand::Reset => vec![ResetPanel(Some(id), false, None)],
                        PanelCommand::ToggleMaster => vec![ToggleMaster(id)],
                        PanelCommand::Close => vec![ClosePanel(id, None)],
                        PanelCommand::ColumnSettings(column) => vec![
                            SetActivePanel(id, None),
                            OpenSettingsWithColumn(ColumnSettingsTarget::Column(column)),
                        ],
                        PanelCommand::PanelSettings => vec![
                            SetActivePanel(id, None),
                            ToggleSettingsInit(Some(SettingsUpdate::Update(true)), true, None),
                        ],
                        PanelCommand::Maximize | PanelCommand::Restore => vec![],
                    }
                })}
                session_props={self.session_props.clone()}
                renderer_props={self.renderer_props.clone()}
                presentation_props={self.presentation_props.clone()}
                {is_settings_open}
                {is_empty}
                has_clients={!ctx.props().workspace.clients().is_empty()}
                status={self.workspace_status.clone()}
                show_status={!drawer.open}
                on_status_click={ctx.link().callback(|()| StatusIndicatorClicked)}
                panel_ids={ctx.props().workspace.panel_ids()}
                panel_titles={ctx.props()
                    .workspace
                    .panel_ids()
                    .iter()
                    .map(|id| {
                        let title = ctx
                            .props()
                            .workspace
                            .panel(id)
                            .and_then(|p| p.session.get_title())
                            .filter(|t| !t.is_empty());
                        (id.as_str().to_owned(), title)
                    })
                    .collect::<Vec<_>>()}
                panel_themes={ctx.props()
                    .workspace
                    .panel_ids()
                    .iter()
                    .map(|id| {
                        (
                            id.as_str().to_owned(),
                            ctx.props().workspace.panel(id).and_then(|p| p.renderer.theme()),
                        )
                    })
                    .collect::<Vec<_>>()}
                panel_masters={ctx.props().workspace.masters()}
                workspace={ctx.props().workspace.clone()}
                global_filters={self.global_filters.clone()}
                on_remove_global_filter={ctx.link().callback(RemoveGlobalFilter)}
                on_clear_global_filters={ctx.link().callback(|_| ClearGlobalFilters)}
                {presentation}
                {renderer}
                {session}
            />
        };

        let is_single_panel = if ctx.props().workspace.placed_count() == 1 {
            "only-child"
        } else {
            ""
        };

        html! {
            <StyleProvider root={ctx.props().elem.clone()} sheet={StyleSurface::Viewer.sheet()}>
                <div id="component_container" class={is_single_panel}>
                    <slot name="modal" />
                    <div id="layout_area">
                        <SplitPanel
                            id="app_panel"
                            reverse=true
                            skip_empty=true
                            deferred=true
                            size={self.settings_geometry.pane_width_override}
                            initial_size={self.settings_geometry.pane_width_override}
                            on_reset={ctx.link().callback(|_| DividerMove(Divider::Settings, PaneTarget::Natural))}
                            on_resize={ctx.link().callback(|(x, _): (i32, i32)| DividerMove(Divider::Settings, PaneTarget::Width(x)))}
                            on_resize_finished={ctx.link().callback(|_| DividerFinish(Divider::Settings))}
                        >
                            { settings_panel }
                            <div id="main_column_container">
                                { for workspace_drawer.into_iter().chain([main_panel]).chain(column_settings_panel) }
                            </div>
                        </SplitPanel>
                    </div>
                </div>
                <FontLoader ..self.fonts.clone() />
            </StyleProvider>
        }
    }
}
