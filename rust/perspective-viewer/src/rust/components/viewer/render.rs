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
//! `<regular-layout>` + the plugin `<slot>`s).

use yew::prelude::*;

use super::PerspectiveViewer;
use super::msg::PerspectiveViewerMsg::*;
use crate::components::column_settings_sidebar::ColumnSettingsPanel;
use crate::components::containers::split_panel::SplitPanel;
use crate::components::font_loader::FontLoader;
use crate::components::main_panel::MainPanel;
use crate::components::panel_menu::PanelCommand;
use crate::components::settings_panel::SettingsPanel;
use crate::components::style::StyleProvider;
use crate::queries::*;
use crate::session::TableLoadState;

impl PerspectiveViewer {
    pub(super) fn render(&self, ctx: &Context<Self>) -> Html {
        // The settings panel + status bar bind to the *active* panel's engines;
        // `presentation` is element-level (shared).
        let presentation = &ctx.props().presentation;
        let renderer = &self.active_renderer;
        let session = &self.active_session;

        let is_settings_open = self.settings_open
            && matches!(self.session_props.has_table, Some(TableLoadState::Loaded));

        let mut class = classes!();
        if !is_settings_open {
            class.push("settings-closed");
        }

        if self.session_props.title.is_some() {
            class.push("titled");
        }

        let on_open_expr_panel = ctx.link().callback(|c| OpenColumnSettings {
            locator: c,
            sender: None,
            toggle: true,
        });

        let on_column_settings_panel_resize = ctx
            .link()
            .callback(|(x, _)| ColumnSettingsPanelSizeUpdate(Some(x)));

        let on_close_settings = ctx.link().callback(|()| ToggleSettingsInit(None, None));
        let on_debug = ctx.link().callback(|_| ToggleDebug);
        let selected_column = get_current_column_locator(
            &self.presentation_props.open_column_settings,
            renderer,
            &self.session_props.config,
            &self.session_props.metadata,
        );

        let selected_tab = self.presentation_props.open_column_settings.tab;
        let plugin_name = self.renderer_props.plugin_name.clone();
        let available_plugins = self.renderer_props.available_plugins.clone();
        let has_table = self.session_props.has_table.clone();
        let named_column_count = self.renderer_props.config.config_column_names.len();

        let view_config = self.session_props.config.clone();
        let drag_column = self.dragdrop_props.column.clone();
        let metadata = self.session_props.metadata.clone();
        let on_select_tab = ctx.link().callback(SettingsPanelTabChanged);
        let on_auto_width = ctx.link().callback(SettingsPanelAutoWidth);
        let settings_panel = html! {
            if is_settings_open {
                <SettingsPanel
                    on_close={on_close_settings}
                    on_resize={&self.on_resize}
                    on_select_column={on_open_expr_panel}
                    is_debug={self.debug_open}
                    {on_debug}
                    {plugin_name}
                    {available_plugins}
                    {has_table}
                    {named_column_count}
                    {view_config}
                    plugin_config={self.renderer_props.plugin_config.clone()}
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
                />
            } else {
                // Explicit empty so the always-rendered `app_panel` SplitPanel's
                // `skip_empty` drops this pane when settings is closed.
                <></>
            }
        };

        let on_settings = ctx.link().callback(|()| ToggleSettingsInit(None, None));
        let on_select_tab = ctx.link().callback(ColumnSettingsTabChanged);
        let column_settings_panel = html! {
            if let Some(selected_column) = selected_column {
                <SplitPanel
                    id="modal_panel"
                    reverse=true
                    initial_size={self.settings_geometry.column_settings_width_override}
                    on_reset={ctx.link().callback(|_| ColumnSettingsPanelSizeUpdate(None))}
                    on_resize={on_column_settings_panel_resize}
                >
                    <ColumnSettingsPanel
                        {selected_column}
                        {selected_tab}
                        on_close={self.on_close_column_settings.clone()}
                        width_override={self.settings_geometry.column_settings_width_override}
                        {on_select_tab}
                        plugin_name={self.renderer_props.plugin_name.clone()}
                        {metadata}
                        view_config={self.session_props.config.clone()}
                        column_stats={self.session_props.column_stats.clone()}
                        selected_theme={self.presentation_props.selected_theme.clone()}
                        {presentation}
                        {renderer}
                        {session}
                    />
                    <></>
                </SplitPanel>
            }
        };

        // The toolbar Reset button targets the ACTIVE panel only; the
        // whole-element reset is the public `reset()` API.
        let on_reset = ctx.link().callback(|all| ResetPanel(None, all, None));
        let is_settings_open = self.settings_open
            && matches!(self.session_props.has_table, Some(TableLoadState::Loaded));

        let main_panel = html! {
            <MainPanel
                {on_settings}
                {on_reset}
                on_activate_panel={ctx.link().callback(|id| SetActivePanel(id, None))}
                on_close_panel={ctx.link().callback(|id| ClosePanel(id, None))}
                // The context-menu commands the root executes; Maximize/Restore
                // are handled inside `MainPanel` (it owns the layout element)
                // and Export/Copy inside `PanelMenu` itself.
                on_panel_command={ctx.link().batch_callback(|(id, cmd): (String, PanelCommand)| {
                    match cmd {
                        PanelCommand::New => vec![NewPanel(id)],
                        PanelCommand::NewFrom { client, table } => {
                            vec![NewPanelFrom { client, table }]
                        },
                        PanelCommand::Duplicate => vec![DuplicatePanel(id)],
                        PanelCommand::Reset => vec![ResetPanel(Some(id), false, None)],
                        PanelCommand::ToggleMaster => vec![ToggleMaster(id)],
                        PanelCommand::Close => vec![ClosePanel(id, None)],
                        PanelCommand::Maximize | PanelCommand::Restore => vec![],
                    }
                })}
                session_props={self.session_props.clone()}
                renderer_props={self.renderer_props.clone()}
                presentation_props={self.presentation_props.clone()}
                {is_settings_open}
                update_count={self.update_count}
                panel_ids={ctx.props().workspace.panel_ids()}
                panel_titles={ctx.props()
                    .workspace
                    .panel_ids()
                    .iter()
                    .map(|id| {
                        // Tab label: the panel's *explicit* title only. When absent
                        // the tab shows a muted placeholder (see `PanelTab`), NOT the
                        // table / plugin name.
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

        let is_single_panel = if ctx.props().workspace.panel_ids().len() == 1 {
            "only-child"
        } else {
            ""
        };

        html! {
            <StyleProvider root={ctx.props().elem.clone()}>
                <div id="component_container" class={is_single_panel}>
                    <div id="layout_area">
                        // Always render the `SplitPanel` with `main_panel` as its
                        // last (flex-fill) pane. Toggling the settings sidebar then
                        // only adds/removes the leading settings pane — it never
                        // reparents `main_panel`, so `MainPanel` (and the embedded
                        // `<regular-layout>` + the `<slot>`s projecting the plugins)
                        // is reconciled in place instead of remounted. When closed,
                        // `settings_panel` is `<></>`, which `skip_empty` drops.
                        <SplitPanel
                            id="app_panel"
                            reverse=true
                            skip_empty=true
                            deferred=true
                            size={self.settings_geometry.pane_width_override}
                            initial_size={self.settings_geometry.pane_width_override}
                            on_reset={ctx.link().callback(|_| SettingsPanelSizeUpdate(None))}
                            // Deferred + pump (P1): drags propose widths; the
                            // pane commits only after every visible panel has
                            // presized — and every panel participates, not
                            // just the active one.
                            on_resize={ctx.link().callback(|(x, _): (i32, i32)| SettingsDividerMove(x))}
                            on_resize_finished={ctx.link().callback(|_| SettingsDividerFinish)}
                        >
                            { settings_panel }
                            <div id="main_column_container">
                                { main_panel }
                                { column_settings_panel }
                            </div>
                        </SplitPanel>
                    </div>
                </div>
                <FontLoader ..self.fonts.clone() />
            </StyleProvider>
        }
    }
}
