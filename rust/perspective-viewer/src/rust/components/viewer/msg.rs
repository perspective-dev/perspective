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
use crate::presentation::{ColumnLocator, ColumnSettingsTab, DragDropProps, PresentationProps};
use crate::renderer::RendererProps;
use crate::session::{SessionProps, TableLoadState, ViewStats};
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
}

#[derive(Debug)]
pub enum PerspectiveViewerMsg {
    ColumnSettingsPanelSizeUpdate(Option<i32>),
    ColumnSettingsTabChanged(ColumnSettingsTab),
    OpenColumnSettings {
        locator: Option<ColumnLocator>,
        sender: Option<Sender<()>>,
        toggle: bool,
    },
    PreloadFontsUpdate,

    /// Element-level reset (the public `reset()` API): reset EVERY panel and
    /// clear the cross-filter overlay, symmetric with whole-element
    /// `save`/`restore`. The `bool` also clears expressions/column settings.
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

    /// The named panel's frame was closed (removed from the layout); remove it
    /// from the workspace and dispose its engines. The `Completion` resolves
    /// `removePanel()` after the eject's teardown run completes (invariant
    /// I6) — carrying any teardown error, which was previously dropped.
    ClosePanel(String, Option<Completion>),

    /// Whole-element `restore` finished replacing the panel set in the
    /// `Workspace` (new models inserted, old panels ejected, layout staged):
    /// activate the named panel, re-subscribe the per-panel wiring, and
    /// re-render — the SINGLE visible commit of the whole restore.
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
    SettingsPanelSizeUpdate(Option<i32>),

    /// The settings-pane divider proposed a new pane width (per pointermove,
    /// from the *deferred* `SplitPanel` — it has NOT been applied). Feeds the
    /// latest-wins presize pump (`PRESIZE_EVERYWHERE_PLAN.md` P1): geometry
    /// commits only after every visible panel has rendered at its target.
    SettingsDividerMove(i32),

    /// Run one pump iteration: presize all visible panels at the newest
    /// proposed pane width, then commit it.
    SettingsDividerPump,

    /// Presize for this pane width completed — commit it (the deferred
    /// `SplitPanel`'s controlled `size`), then pump again if a newer target
    /// arrived meanwhile.
    SettingsDividerCommit(i32),

    /// Divider drag ended: reactively finalize every visible panel at its
    /// exact settled cell (debounced no-op when the presizes were exact).
    SettingsDividerFinish,
    SettingsPanelTabChanged(SelectedTab),
    SettingsPanelAutoWidth(f64),
    ToggleDebug,
    ToggleSettingsComplete(SettingsUpdate, Sender<()>),
    ToggleSettingsInit(Option<SettingsUpdate>, Option<Sender<ApiResult<JsValue>>>),
    UpdateSession(Box<SessionProps>),
    UpdateRenderer(Box<RendererProps>),
    UpdatePresentation(Box<PresentationProps>),

    /// Update only `is_settings_open` in the presentation snapshot without
    /// touching `available_themes` (which requires async data).
    UpdateSettingsOpen(bool),
    UpdateIsWorkspace(bool),

    /// Update only `open_column_settings` in the presentation snapshot.
    UpdateColumnSettings(Box<crate::presentation::OpenColumnSettings>),
    UpdateDragDrop(Box<DragDropProps>),

    /// Update only stats-related fields of `session_props` without touching
    /// `config`.  This prevents `stats_changed` events (e.g. from `reset()`)
    /// from propagating a freshly-cleared config to the column selector.
    UpdateSessionStats(Option<ViewStats>, Option<TableLoadState>),

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
