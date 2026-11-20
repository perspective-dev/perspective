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
use crate::components::debug_panel::DebugPanel;
use crate::components::empty_placeholder::EmptyPlaceholder;
use crate::config::{PluginStaticConfig, PluginUpdate};
use crate::presentation::{ColumnLocator, ColumnSettingsTarget, OpenColumnSettings, Presentation};
use crate::queries::{classify_column, is_pivot_column};
use crate::renderer::*;
use crate::session::column_defaults_update::*;
use crate::session::*;
use crate::tasks::update_plugin_and_render;
use crate::ui::SidebarCloseButton;
use crate::utils::*;
use crate::workspace::Workspace;

#[derive(Clone, Properties)]
pub struct SettingsPanelProps {
    pub on_close: Callback<()>,

    /// The element is an EMPTY STAGE (zero panels): `session`/`renderer`
    /// are the detached empty engines. The plugin selector is browse-only
    /// (a pick touches no engine state and does not affect the first
    /// panel), and the table-bound tabs render [`EmptyPlaceholder`].
    #[prop_or_default]
    pub is_empty: bool,
    pub on_resize: Rc<PubSub<()>>,
    pub on_select_column: Callback<Option<ColumnSettingsTarget>>,
    pub on_debug: Callback<()>,
    pub is_debug: bool,

    /// Value props threaded from the root's `RendererProps` / `SessionProps`.
    pub plugin_name: Option<String>,
    pub available_plugins: PtrEqRc<Vec<String>>,
    pub has_table: Option<TableLoadState>,
    pub named_column_count: usize,

    /// The ACTIVE plugin's declared contract, threaded as a value prop so
    /// that switching plugins re-renders the panes that read it. The
    /// renderer handle cannot serve this: it is excluded from prop
    /// equality (it is a handle, not a value), so a plugin swap that
    /// leaves the view config untouched — Y Line back to Datagrid, both
    /// of which name one column slot — would otherwise change nothing any
    /// component compares.
    pub plugin_static_config: Rc<PluginStaticConfig>,
    pub view_config: PtrEqRc<ViewConfig>,

    /// Snapshot of the active plugin's `plugin_config` bucket, threaded
    /// from `RendererProps`. Forwarded into `PluginTab` so the tab is
    /// prop-driven instead of reading `Renderer` directly.
    pub plugin_config: PtrEqRc<serde_json::Map<String, serde_json::Value>>,

    /// Snapshot of the active plugin's `columns_config` bucket, threaded
    /// from `RendererProps` into `ColumnSelector`.
    pub columns_config: PtrEqRc<ColumnConfigMap>,

    /// The page-wide config defaults, forwarded into `PluginTab`.
    pub config_defaults: PtrEqRc<ConfigDefaultsSlots>,

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
    pub workspace: Workspace,
}

impl PartialEq for SettingsPanelProps {
    fn eq(&self, rhs: &Self) -> bool {
        self.is_debug == rhs.is_debug
            && self.is_empty == rhs.is_empty
            && self.plugin_name == rhs.plugin_name
            && self.available_plugins == rhs.available_plugins
            && self.has_table == rhs.has_table
            && self.named_column_count == rhs.named_column_count
            && self.plugin_static_config == rhs.plugin_static_config
            && self.view_config == rhs.view_config
            && self.plugin_config == rhs.plugin_config
            && self.columns_config == rhs.columns_config
            && self.config_defaults == rhs.config_defaults
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
        let config = &props.view_config;
        props
            .open_column_settings
            .target
            .as_ref()
            .and_then(|target| match target {
                ColumnSettingsTarget::NewExpression => Some(ColumnLocator::NewExpression),
                ColumnSettingsTarget::Column(n) => {
                    let locator = classify_column(n, config, &props.metadata)?;
                    if !matches!(locator, ColumnLocator::Table(_)) {
                        return Some(locator);
                    }

                    let used = config.columns.iter().any(|maybe_col| {
                        maybe_col.as_ref().map(|col| col == n).unwrap_or_default()
                    }) || is_pivot_column(n, config)
                        || config.filter.iter().any(|col| col.column() == n)
                        || config.sort.iter().any(|col| &col.0 == n);
                    (used && props.renderer.can_render_column_styles()).then_some(locator)
                },
            })
    };

    // Empty stage: a UI-only plugin pick, shown by the selector but never
    // applied to any engine — the first panel still draws its default
    // plugin. Discarded whenever the element enters or leaves the empty
    // stage.
    let empty_pick = use_state_eq(|| None::<String>);
    {
        let empty_pick = empty_pick.clone();
        use_effect_with(props.is_empty, move |_| empty_pick.set(None));
    }

    let available_plugins = props.available_plugins.clone();
    let plugin_name = if props.is_empty {
        (*empty_pick)
            .clone()
            .or_else(|| available_plugins.first().cloned())
    } else {
        props.plugin_name.clone()
    };

    let selected = props.selected_tab;

    // Shared trap-door width across tabs. Each tab subtree measures its
    // natural width and feeds the result back through `on_auto_width`;
    // the parent keeps the running max so a tab switch never shrinks the
    // panel, and clears it on divider reset.
    let width = props.auto_width;
    let on_auto_width = props.on_auto_width.clone();

    // Dispatch callback: captures engine handles, constructs config update,
    // hands the apply+draw work to `tasks::pipeline`.
    let on_select_plugin = {
        clone!(renderer, session, presentation);
        let session_metadata = props.metadata.clone();
        let view_config = props.view_config.clone();
        let is_empty = props.is_empty;
        let empty_pick = empty_pick.clone();
        Callback::from(move |plugin_name: String| {
            // Empty stage: browse-only. Never touch the empty renderer —
            // selecting a plugin there before the real plugins register
            // pins its store to `Debug` — and there is no table whose
            // features the rollup defaults below would read.
            if is_empty {
                empty_pick.set(Some(plugin_name));
                return;
            }

            if session.is_errored() || renderer.failure().is_some() {
                return;
            }
            // Pure resolve — the swap itself is committed inside the locked
            // draw task by `update_plugin_and_render`, never staged on the
            // `Renderer` where a concurrent draw could observe it.
            let resolved_plugin =
                renderer.resolve_plugin_update(&PluginUpdate::Update(plugin_name));
            let prev_metadata = renderer.metadata();
            let plugin_config = resolved_plugin
                .as_ref()
                .map(|(_, metadata)| &**metadata)
                .unwrap_or(&*prev_metadata);
            let rollup_features = session_metadata
                .get_features()
                .map(|x| x.get_group_rollup_modes())
                .unwrap();

            let group_rollups = plugin_config.get_group_rollups(&rollup_features);
            let split_rollup_features = session_metadata
                .get_features()
                .map(|x| x.get_split_rollup_modes())
                .unwrap();

            let split_rollups = plugin_config.get_split_rollups(&split_rollup_features);
            let mut update = ViewConfigUpdate {
                group_rollup_mode: group_rollups.first().cloned(),
                split_rollup_mode: split_rollups.first().cloned(),
                ..ViewConfigUpdate::default()
            };

            update.set_update_column_defaults(
                &session_metadata,
                &view_config,
                &view_config.columns,
                plugin_config,
            );

            let plugin_idx = resolved_plugin.map(|(idx, _)| idx);
            if let Ok(task) = update_plugin_and_render(&session, &renderer, update, plugin_idx) {
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
            if props.is_empty {
                // Query/Plugin/Debug all read a panel's table, plugin
                // schema or config, none of which exist at zero panels.
                <EmptyPlaceholder />
            } else if selected == SelectedTab::Query {
                <ColumnSelector
                    on_resize={&props.on_resize}
                    {on_open_expr_panel}
                    {selected_column}
                    has_table={props.has_table.clone()}
                    named_column_count={props.named_column_count}
                    plugin_static_config={props.plugin_static_config.clone()}
                    view_config={props.view_config.clone()}
                    columns_config={props.columns_config.clone()}
                    drag_column={props.drag_column.clone()}
                    metadata={props.metadata.clone()}
                    selected_theme={props.selected_theme.clone()}
                    presentation={presentation.clone()}
                    renderer={renderer.clone()}
                    session={session.clone()}
                    workspace={props.workspace.clone()}
                    initial_width={width}
                    on_auto_width={on_auto_width.clone()}
                    on_dimensions_reset={&props.on_dimensions_reset}
                />
            } else if selected == SelectedTab::Plugin {
                <PluginTab
                    view_config={props.view_config.clone()}
                    plugin_config={props.plugin_config.clone()}
                    config_defaults={props.config_defaults.clone()}
                    presentation={presentation.clone()}
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
                    workspace={props.workspace.clone()}
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
