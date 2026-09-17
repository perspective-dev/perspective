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

//! The root component's message protocol. One flat enum — the `update()` match
//! in `viewer.rs` is its dispatch table; handler bodies live in the sibling
//! domain modules ([`super::panels`], [`super::settings`], [`super::filters`],
//! [`super::snapshots`]).

use futures::channel::oneshot::Sender;
use perspective_client::config::Filter;
use perspective_js::utils::ApiResult;
use wasm_bindgen::JsValue;

use crate::components::settings_panel::SelectedTab;
use crate::config::*;
use crate::presentation::{
    ColumnSettingsTab, ColumnSettingsTarget, DragDropProps, PresentationProps,
};
use crate::renderer::RendererProps;
use crate::session::{SessionProps, TableLoadState};
use crate::utils::Completion;

/// The filter-bearing payload of a master panel's selection or click event
/// (`MasterContribution`), as decoded by the host listeners in
/// [`super::wiring`].
#[derive(Debug)]
pub struct MasterSelection {
    /// The event's filter clauses (`insertFilters` for the select-detail
    /// family, `config.filter` for clicks) — BEFORE the master's own stored
    /// filters are subtracted (see `on_master_contribution`).
    pub filters: Vec<Filter>,

    /// A synthesized clicked-cell `[column, "==", value]` clause, used when
    /// `filters` derives to nothing — e.g. a FLAT (un-grouped) datagrid
    /// master, whose clicks carry no group-by path to filter on.
    pub cell_fallback: Option<Filter>,

    /// Whether an event deriving no clause and carrying no `cell_fallback`
    /// clears the panel's contribution rather than leaving it untouched.
    pub clear_if_underivable: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Divider {
    Settings,
    ColumnSettings,
}

impl Divider {
    /// The shadow-DOM selector of the divider's resizable pane (pane 0 of
    /// its `SplitPanel`; the flex-fill pane renders bare).
    pub fn pane_selector(self) -> &'static str {
        match self {
            Self::Settings => "#app_panel > .split-panel-child",
            Self::ColumnSettings => "#modal_panel > .split-panel-child",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PaneTarget {
    Width(i32),
    Natural,
}

#[derive(Debug)]
pub enum PerspectiveViewerMsg {
    ColumnSettingsPanelAutoWidth(f64),
    ToggleColumnSettingsPin,
    ToggleColumnSettingsPinComplete(Sender<()>),
    ColumnSettingsTabChanged(ColumnSettingsTab),
    OpenColumnSettings {
        target: Option<ColumnSettingsTarget>,
        sender: Option<Sender<()>>,
        toggle: bool,
    },
    PreloadFontsUpdate,

    /// Element-level reset (the public `reset()` API): reset EVERY panel and
    /// clear the cross-filter overlay, symmetric with
    /// `saveWorkspace`/`restoreWorkspace`. The `bool` also clears
    /// expressions/column settings.
    Reset(bool, Option<Completion>),

    /// Reset ONLY the named panel — or the active panel when `None` — to its
    /// default `ViewerConfig` (the toolbar Reset button, the context menu's
    /// "Reset" command, and the public `resetPanel()` API). The `bool` is
    /// `Reset`'s expressions flag (toolbar shift-click); the `Completion`
    /// resolves the `resetPanel()` promise after the reset's run completes
    /// (invariant I6).
    ResetPanel(Option<String>, bool, Option<Completion>),
    Resize,

    /// The set of layout panels changed (added/removed); re-render so the
    /// layout host reconciles its `<regular-layout>` cells.
    LayoutChanged,

    /// Make the named panel active: re-target the settings panel + status bar
    /// (and the root's session/renderer subscriptions) to its engines. The
    /// `Completion` resolves `setActivePanel()` after the activation-chrome
    /// nudge runs complete (invariant I6).
    SetActivePanel(String, Option<Completion>),

    /// Close the named panel: remove it from the workspace now but keep its
    /// engines parked until [`Self::PanelClosed`] reports the layout commit
    /// that reclaims its cell. The `Completion` resolves `removePanel()`
    /// after the eject's teardown run completes (invariant I6) — carrying
    /// any teardown error.
    ClosePanel(String, Option<Completion>),

    /// `MainPanel` saw the named panel leave the `regular-layout` tree, so
    /// dispose its parked panel, or close outright one the workspace still
    /// holds.
    PanelClosed(String),

    /// `restoreWorkspace` finished replacing the panel set in the
    /// `Workspace` (new models inserted, old panels ejected, layout staged):
    /// activate the named panel, re-subscribe the per-panel wiring, and
    /// re-render — the SINGLE visible commit of the restore.
    CommitWorkspaceRestore(String),

    /// Duplicate the named panel: snapshot its config into a new independent
    /// panel appended to the layout.
    DuplicatePanel(String),

    /// New panel: a fresh (default-config) panel bound to the named panel's
    /// table (from the default client).
    NewPanel(String),

    /// New panel bound to the named `Table` on the named `Client` (the
    /// context menu's "New" sub-menu). The `Client` is resolved by name from
    /// the `Workspace` loaded-clients registry.
    NewPanelFrom {
        client: String,
        table: String,
    },

    /// Toggle the named panel's master/detail (filter-source) role.
    ToggleMaster(String),

    /// A master panel's selection state, from EITHER host listener
    /// (`perspective-global-filter` select/deselect or `perspective-click`):
    /// `Some` REPLACES that panel's global-filter contribution, `None`
    /// (deselect) clears it. Non-master sources are ignored by the handler.
    MasterContribution(String, Option<MasterSelection>),

    /// Remove the global filter at this index (GlobalFilterBar chip ×).
    RemoveGlobalFilter(usize),

    /// Clear all global filters (GlobalFilterBar "Clear").
    ClearGlobalFilters,

    /// Some panel's title changed (any panel, via `_title_subscriptions`);
    /// re-render so the tab titles refresh.
    TitlesChanged,
    DividerMove(Divider, PaneTarget),
    DividerPump(Divider),
    DividerCommit(Divider, PaneTarget),
    DividerFinish(Divider),
    SettingsPanelTabChanged(SelectedTab),
    SettingsPanelAutoWidth(f64),
    ToggleDebug,

    /// The toggle choreography's INTERNAL completion leaf: flip the pane
    /// and resolve on the render commit. Never send this to toggle
    /// settings from outside `settings.rs` — it skips the presize/resize
    /// sweep (the pane's `SplitPanel` emits no `before-resize` and the
    /// host box is unchanged, so nothing else resizes the plugins), which
    /// leaves canvas plugins CSS-stretched at their old backing size. API
    /// entry points send [`Self::ToggleSettingsInit`].
    ToggleSettingsComplete(SettingsUpdate, Sender<()>),

    /// Toggle (or force) the settings pane with the FULL choreography:
    /// presize every visible plugin to its post-toggle box, commit the
    /// pane, then the exactness-finalizer resize. The `Sender` resolves
    /// after the sweep. The one settings-toggle entry point for both the
    /// toolbar and the element API (`toggleConfig`, `restore({settings})`,
    /// `restoreWorkspace`).
    ///
    /// The `bool` is `announce`: `true` when this toggle is the SOLE
    /// carrier of the config change (a user gesture — toolbar,
    /// `toggleConfig`), which emits `toggle-settings` + one
    /// `perspective-config-update`; `false` for the `restore` family,
    /// whose own view-config commit dispatch announces the settings field
    /// — one API call, one config-update.
    ToggleSettingsInit(
        Option<SettingsUpdate>,
        bool,
        Option<Sender<ApiResult<JsValue>>>,
    ),
    UpdateSession(Box<SessionProps>),
    UpdateRenderer(Box<RendererProps>),
    UpdatePresentation(Box<PresentationProps>),

    /// Update only `is_settings_open` in the presentation snapshot without
    /// touching `available_themes` (which requires async data).
    UpdateSettingsOpen(bool),
    UpdateIsWorkspace(bool),

    /// Update only `open_column_settings` in the presentation snapshot.
    /// Handled in `settings.rs` (not `snapshots.rs`): a docked-drawer
    /// mount/unmount defers the snapshot behind a presize sweep.
    UpdateColumnSettings(Box<crate::presentation::OpenColumnSettings>),

    /// Every visible panel has rendered at its post-transition box — NOW
    /// apply the newest deferred `open_column_settings` target (the
    /// latest-wins slot, not a copy captured at sweep spawn); the `Sender`
    /// resolves on the render commit so the staged presents reveal in the
    /// same paint (mirrors `ToggleSettingsComplete`).
    UpdateColumnSettingsCommit(Sender<()>),
    UpdateDragDrop(Box<DragDropProps>),

    /// Update only the stats-derived fields of `session_props`
    /// (`has_table_cells`, `has_table`) without touching `config`.  This
    /// prevents `stats_changed` events (e.g. from `reset()`) from propagating
    /// a freshly-cleared config to the column selector.
    UpdateSessionStats(bool, Option<TableLoadState>),

    /// Refresh the root's render snapshot of the `Workspace`-owned global
    /// filter set (dispatched by its `filters_changed` PubSub).
    UpdateGlobalFilters,

    /// The active panel's in-flight config-run count changed. LEVEL-
    /// triggered: the payload is the ABSOLUTE count (RAII-settled — see
    /// `Session::begin_config_run`), which the handler ASSIGNS to
    /// `update_count`; there is no delta arithmetic to drift. Threaded to
    /// `StatusIndicator` as the "updating" spinner.
    UpdateInFlight(u32),
}
