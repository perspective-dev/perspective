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

use std::rc::Rc;

use perspective_client::config::{ViewConfig, ViewConfigUpdate};
use perspective_js::utils::ApiFuture;
use yew::prelude::*;

use super::column_selector::ColumnSelector;
use super::plugin_selector::PluginSelector;
use super::plugin_tab::PluginTab;
use crate::components::containers::sidebar_close_button::SidebarCloseButton;
use crate::components::form::debug::DebugPanel;
use crate::config::PluginUpdate;
use crate::presentation::{ColumnLocator, OpenColumnSettings, Presentation};
use crate::renderer::*;
use crate::session::column_defaults_update::*;
use crate::session::*;
use crate::tasks::update_and_render;
use crate::utils::*;

#[derive(Clone, Properties)]
pub struct SettingsPanelProps {
    pub on_close: Callback<()>,
    pub on_resize: Rc<PubSub<()>>,
    pub on_select_column: Callback<Option<ColumnLocator>>,
    pub on_debug: Callback<()>,
    pub is_debug: bool,

    /// Value props threaded from the root's `RendererProps` / `SessionProps`.
    pub plugin_name: Option<String>,
    pub available_plugins: PtrEqRc<Vec<String>>,
    pub has_table: Option<TableLoadState>,
    pub named_column_count: usize,
    pub view_config: PtrEqRc<ViewConfig>,

    /// Snapshot of the active plugin's `plugin_config` bucket, threaded
    /// from `RendererProps`. Forwarded into `PluginTab` so the tab is
    /// prop-driven instead of reading `Renderer` directly.
    pub plugin_config: PtrEqRc<serde_json::Map<String, serde_json::Value>>,

    /// Column currently being dragged (if any) — threaded to show drag
    /// highlights without per-component `DragDrop` PubSub subscriptions.
    pub drag_column: Option<String>,

    /// Cloned session metadata snapshot — threaded from `SessionProps`
    /// so that metadata changes trigger re-renders via prop diffing.
    pub metadata: SessionMetadataRc,

    /// Snapshot of the column-settings sidebar state — threaded from
    /// `PresentationProps` so that open/close triggers re-renders.
    pub open_column_settings: OpenColumnSettings,

    /// Selected theme name, threaded for PortalModal consumers.
    pub selected_theme: Option<String>,

    /// Controlled: the currently selected tab. Lifted to `PerspectiveViewer`
    /// so that messages like `OpenColumnSettings` can revert the tab without
    /// the panel owning the state.
    pub selected_tab: SelectedTab,

    /// Controlled: the running max of measured tab widths. Lifted so that
    /// `SettingsPanelSizeUpdate(None)` (divider reset) can clear it.
    pub auto_width: f64,

    /// Callback invoked when the user clicks a tab.
    pub on_select_tab: Callback<SelectedTab>,

    /// Callback invoked by tab subtrees reporting their natural width.
    pub on_auto_width: Callback<f64>,

    /// Fires when the outer split-panel divider is reset; threaded into
    /// `ColumnSelector` so its inner `ScrollPanel` can drop its persistent
    /// `viewport_width` and re-measure honestly. Without this, the
    /// `auto_width` reset in `PerspectiveViewer` rebounds immediately as
    /// the ScrollPanel republishes its stale cached width.
    pub on_dimensions_reset: Rc<PubSub<()>>,

    /// State
    pub session: Session,
    pub renderer: Renderer,
    pub presentation: Presentation,
}

impl PartialEq for SettingsPanelProps {
    fn eq(&self, rhs: &Self) -> bool {
        self.is_debug == rhs.is_debug
            && self.plugin_name == rhs.plugin_name
            && self.available_plugins == rhs.available_plugins
            && self.has_table == rhs.has_table
            && self.named_column_count == rhs.named_column_count
            && self.view_config == rhs.view_config
            && self.plugin_config == rhs.plugin_config
            && self.drag_column == rhs.drag_column
            && self.metadata == rhs.metadata
            && self.open_column_settings == rhs.open_column_settings
            && self.selected_theme == rhs.selected_theme
            && self.selected_tab == rhs.selected_tab
            && self.auto_width == rhs.auto_width
    }
}

#[derive(Debug, PartialEq, Clone, Copy, Default)]
pub enum SelectedTab {
    #[default]
    Query,
    Plugin,
    Debug,
}

#[function_component]
pub fn SettingsPanel(props: &SettingsPanelProps) -> Html {
    let SettingsPanelProps {
        presentation,
        renderer,
        session,
        ..
    } = &props;

    let selected_column = {
        let locator = props.open_column_settings.locator.clone();
        let config = &props.view_config;
        locator.filter(|locator| match locator {
            ColumnLocator::Table(_name) => {
                locator
                    .name()
                    .map(|n| {
                        config.columns.iter().any(|maybe_col| {
                            maybe_col.as_ref().map(|col| col == n).unwrap_or_default()
                        }) || config.group_by.iter().any(|col| col == n)
                            || config.split_by.iter().any(|col| col == n)
                            || config.filter.iter().any(|col| col.column() == n)
                            || config.sort.iter().any(|col| &col.0 == n)
                    })
                    .unwrap_or_default()
                    && props.renderer.can_render_column_styles()
            },
            _ => true,
        })
    };

    let plugin_name = props.plugin_name.clone();
    let available_plugins = props.available_plugins.clone();
    let selected = props.selected_tab;

    // Shared trap-door width across tabs. Each tab subtree measures its
    // natural width and feeds the result back through `on_auto_width`;
    // the parent keeps the running max so a tab switch never shrinks the
    // panel, and clears it on divider reset.
    let width = props.auto_width;
    let on_auto_width = props.on_auto_width.clone();

    // Dispatch callback: captures engine handles, constructs config update,
    // hands the apply+draw work to `tasks::update_and_render`.
    let on_select_plugin = {
        clone!(renderer, session, presentation);
        let session_metadata = props.metadata.clone();
        let view_config = props.view_config.clone();
        Callback::from(move |plugin_name: String| {
            if session.is_errored() {
                return;
            }
            let metadata = renderer.get_next_plugin_metadata(&PluginUpdate::Update(plugin_name));
            let prev_metadata = renderer.metadata();
            let plugin_config = metadata.as_deref().unwrap_or(&*prev_metadata);
            let rollup_features = session_metadata
                .get_features()
                .map(|x| x.get_group_rollup_modes())
                .unwrap();

            let group_rollups = plugin_config.get_group_rollups(&rollup_features);
            let mut update = ViewConfigUpdate {
                group_rollup_mode: group_rollups.first().cloned(),
                ..ViewConfigUpdate::default()
            };

            update.set_update_column_defaults(
                &session_metadata,
                &view_config.columns,
                plugin_config,
            );

            if let Ok(task) = update_and_render(&session, &renderer, update) {
                ApiFuture::spawn(task);
            }

            presentation.set_open_column_settings(None);
        })
    };

    let cb1 = props.on_select_column.clone();
    let set_debug = use_callback(
        props.on_select_tab.clone(),
        move |_: PointerEvent, on_select_tab| {
            on_select_tab.emit(SelectedTab::Debug);
            cb1.emit(None)
        },
    );

    let cb2 = props.on_select_column.clone();
    let set_plugin = use_callback(
        props.on_select_tab.clone(),
        move |_: PointerEvent, on_select_tab| {
            on_select_tab.emit(SelectedTab::Plugin);
            cb2.emit(None)
        },
    );

    let set_query = use_callback(
        props.on_select_tab.clone(),
        |_: PointerEvent, on_select_tab| on_select_tab.emit(SelectedTab::Query),
    );

    let tab_class = |l_tab: SelectedTab, r_tab: SelectedTab| {
        if l_tab == r_tab {
            "settings_tab selected_tab"
        } else {
            "settings_tab"
        }
    };

    let on_open_expr_panel = use_callback(props.on_select_column.clone(), |c, on_select| {
        on_select.emit(Some(c))
    });

    html! {
        <div id="settings_panel" class="sidebar_column noselect split-panel orient-vertical">
            if selected_column.is_none() {
                <SidebarCloseButton
                    id="settings_close_button"
                    on_close_sidebar={&props.on_close.clone()}
                />
            }
            <PluginSelector
                {plugin_name}
                {available_plugins}
                {on_select_plugin}
            />
            <div id="settings_tab_bar" class="settings_tab_bar_scroll_offset">
                <div
                    id="query_tabbar_tab"
                    class={tab_class(selected, SelectedTab::Query)}
                    onpointerdown={set_query}
                />
                <div
                    id="plugin_tabbar_tab"
                    class={tab_class(selected, SelectedTab::Plugin)}
                    onpointerdown={set_plugin}
                />
                <div
                    id="debug_tabbar_tab"
                    class={tab_class(selected, SelectedTab::Debug)}
                    onpointerdown={set_debug}
                />
            </div>
            if selected == SelectedTab::Query {
                <ColumnSelector
                    on_resize={&props.on_resize}
                    {on_open_expr_panel}
                    {selected_column}
                    has_table={props.has_table.clone()}
                    named_column_count={props.named_column_count}
                    view_config={props.view_config.clone()}
                    drag_column={props.drag_column.clone()}
                    metadata={props.metadata.clone()}
                    selected_theme={props.selected_theme.clone()}
                    presentation={presentation.clone()}
                    renderer={renderer.clone()}
                    session={session.clone()}
                    initial_width={width}
                    on_auto_width={on_auto_width.clone()}
                    on_dimensions_reset={&props.on_dimensions_reset}
                />
            } else if selected == SelectedTab::Plugin {
                <PluginTab
                    view_config={props.view_config.clone()}
                    plugin_config={props.plugin_config.clone()}
                    renderer={renderer.clone()}
                    session={session.clone()}
                // initial_width={width}
                // on_auto_width={on_auto_width.clone()}
                />
            } else {
                <DebugPanel
                    {presentation}
                    {renderer}
                    {session}
                    initial_width={width}
                    on_auto_width={on_auto_width.clone()}
                />
            }
            // Sibling sizer keeps the panel width pinned across tab
            // switches; lives outside the tab-body so it survives the
            // tab subtree's unmount.
            <div class="scroll-panel-auto-width" style={format!("width:{}px", width)} />
        </div>
    }
}
