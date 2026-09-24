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

pub(crate) mod column_defaults_update;
pub(crate) mod drag_drop_update;
mod metadata;
mod op_queue;
mod panel_state;
mod props;
pub(crate) mod replace_expression_update;
mod view_subscription;

use std::cell::{Cell, RefCell};
use std::collections::{HashMap, HashSet};
use std::future::Future;
use std::ops::Deref;
use std::rc::Rc;

use perspective_client::config::*;
use perspective_client::proto::ViewDimensionsResp;
use perspective_client::{
    Client, ClientError, DescribeError, Description, ExprValidationResult, ReconnectCallback, View,
};
use perspective_js::apierror;
use perspective_js::utils::*;
use wasm_bindgen::prelude::*;
use yew::html::ImplicitClone;
use yew::prelude::*;

use self::metadata::*;
pub use self::metadata::{MetadataRef, SessionMetadata, SessionMetadataRc};
use self::op_queue::OpQueue;
pub use self::op_queue::{EditDelta, OpCtx, OpKind, StepFuture, StepOutcome, Ticket, view_fields};
use self::panel_state::effective;
pub use self::panel_state::{Binding, OverlayClause, PanelState, PluginRef};
pub use self::props::{SessionProps, TableLoadState};
pub use self::view_subscription::ViewStats;
use self::view_subscription::*;
use crate::config::PluginStaticConfig;
use crate::utils::*;

/// Per-column numeric stats sourced from `View::get_min_max`. Keyed by
/// column name in [`SessionHandle::column_stats`]; populated lazily by
/// the `fetch_column_abs_max` task; cleared on every
/// `view_config_changed`.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct ColumnStats {
    pub abs_max: Option<f64>,
}

/// Immutable state for `Session`.
#[derive(Default)]
pub struct SessionHandle {
    session_data: RefCell<SessionData>,
    pub table_updated: PubSub<()>,
    pub table_loaded: PubSub<()>,
    pub table_unloaded: PubSub<bool>,

    /// Fires when a `View` was CREATED — literally.
    pub view_created: PubSub<()>,

    /// Fires exactly once per locked run that RECONCILED the committed
    /// config against the bound render state — on every `bind_view` exit
    /// (SKIP / REUSE / auto-PAUSED / REBUILD). This is the "a commit was
    /// applied; a `perspective-config-update` may need dispatching" signal;
    /// it does NOT imply a `View` was constructed (that is
    /// [`Self::view_created`]).
    pub commit_reconciled: PubSub<()>,

    pub view_config_changed: PubSub<()>,
    pub title_changed: PubSub<Option<String>>,

    /// Account of in-flight CONFIG-DRIVEN pipeline runs.
    pub config_runs: InFlight,

    /// Fires when the user clicks the status indicator while in
    /// [`StatusIconState::Normal`].
    pub status_indicator_clicked: PubSub<()>,

    /// Per-column numeric stats cache.
    column_stats: RefCell<HashMap<String, ColumnStats>>,

    /// Memoized snapshots used by [`Session::to_props`] to keep
    /// `PtrEqRc` identity stable across repeated `to_props()` calls
    /// when the underlying value hasn't changed.
    cached_config: RefCell<Option<PtrEqRc<ViewConfig>>>,
    cached_metadata: RefCell<Option<SessionMetadataRc>>,

    /// Dedup cell for `perspective-config-update`: the last [`ViewerConfig`]
    /// this session dispatched, so an unchanged re-fire is suppressed. Held
    /// per-`Session` (i.e. per panel) — was element-level on `Presentation`,
    /// which cross-suppressed when N panels shared one cell — so each panel
    /// dedups only against its own last dispatch. `Rc`-wrapped so the same
    /// allocation is shared with the event's lazy `getConfig()` closure without
    /// copying the config.
    pub last_dispatched_config: RefCell<Option<std::rc::Rc<crate::config::ViewerConfig>>>,

    /// Every writer of this panel's committed state, run one at a time in
    /// submit order (see [`op_queue`]).
    queue: Rc<OpQueue>,

    /// Coalesces `view_config_changed`: multiple synchronous commits in one
    /// task emit ONE event on the next microtask — the cadence the deleted
    /// `is_clean` flag provided by accident, now deliberate.
    config_event_scheduled: Cell<bool>,

    /// Account of in-flight `perspective-config-update` dispatch tasks for
    /// this panel (see [`Session::track_dispatch`]). `flush()` joins these via
    /// [`Session::settle_dispatches`], so the "config-update fires before
    /// `flush()` resolves" contract holds by construction instead of by
    /// microtask luck.
    dispatches: InFlight,

    /// Fires when [`SessionHandle::column_stats`] is updated (insert or
    /// clear). Subscribers re-render and re-query the schema with the
    /// new value.
    pub column_stats_changed: PubSub<()>,

    /// Fires when view stats are updated.
    pub stats_changed: PubSub<()>,

    /// Injected callback from the root component, driving
    /// `session_props.has_table_cells` for the active panel.
    pub on_stats_changed: RefCell<Option<Callback<()>>>,

    /// Injected callback from the root component, replacing the former
    /// `table_errored: PubSub` field.  Fires when an error is set on the
    /// session (table load failure, client disconnect, invalid config, etc.).
    pub on_table_errored: RefCell<Option<Callback<()>>>,
}

impl Deref for SessionHandle {
    type Target = RefCell<SessionData>;

    fn deref(&self) -> &Self::Target {
        &self.session_data
    }
}

/// What an un-hosted `table` name means to a bind, per the `wait_for_table`
/// option.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MissingTable {
    /// A hard error that leaves the panel as it was.
    Error,

    /// The panel waits unbound and binds when the name is hosted.
    Pend,
}

impl MissingTable {
    /// Decode the `wait_for_table` option (absent = `false` = `Error`).
    pub fn from_wait(wait_for_table: Option<bool>) -> Self {
        if wait_for_table.unwrap_or_default() {
            Self::Pend
        } else {
            Self::Error
        }
    }
}

/// Open `name` on `client`, returning `Ok(None)` when the name is not hosted
/// and `missing` is [`MissingTable::Pend`].
pub(crate) async fn probe_table(
    client: &Client,
    name: &str,
    missing: MissingTable,
) -> ApiResult<Option<perspective_client::Table>> {
    match client.open_table(name.to_owned()).await {
        Ok(table) => Ok(Some(table)),
        Err(e) => {
            let hosted = client.get_hosted_table_names().await.unwrap_or_default();
            if hosted.iter().any(|n| n == name) {
                return Err(e.into());
            }

            match missing {
                MissingTable::Pend => Ok(None),
                MissingTable::Error => Err(ApiError::new(format!("Unknown table \"{name}\""))),
            }
        },
    }
}

/// Mutable state for `Session`.
#[derive(Default)]
pub struct SessionData {
    /// This panel's committed state: ONE immutable value, replaced whole by
    /// [`SessionData::swap`].
    state: Lifecycle,

    /// What [`Session::metadata`] answers while nothing is bound, and what
    /// [`Session::metadata_mut`] scribbles on (every write is a no-op then).
    unbound_metadata: Rc<SessionMetadata>,
    view_sub: Option<ViewSubscription>,
    stats: Option<ViewStats>,
    is_paused: bool,

    /// How the last config-driven run of the committed state went.
    rendered: Rendered,
}

/// A panel's state and whether it can still be written.
enum Lifecycle {
    Live(Rc<PanelState>),

    /// Terminal: the owning panel was ejected ([`Session::dispose`]).
    Disposed {
        last: Rc<PanelState>,
        disposal: Disposal,
    },
}

impl Default for Lifecycle {
    fn default() -> Self {
        Self::Live(Rc::default())
    }
}

impl Deref for Lifecycle {
    type Target = Rc<PanelState>;

    fn deref(&self) -> &Self::Target {
        match self {
            Lifecycle::Live(state) | Lifecycle::Disposed { last: state, .. } => state,
        }
    }
}

impl Lifecycle {
    fn live_mut(&mut self) -> Option<&mut Rc<PanelState>> {
        match self {
            Lifecycle::Live(state) => Some(state),
            Lifecycle::Disposed { .. } => None,
        }
    }

    fn disposal(&self) -> Option<Disposal> {
        match self {
            Lifecycle::Live(_) => None,
            Lifecycle::Disposed { disposal, .. } => Some(*disposal),
        }
    }
}

/// An OWNED read guard over the committed [`ViewConfig`]: a snapshot that
/// borrows nothing.
pub struct ViewConfigRef(Rc<ViewConfig>);

impl Deref for ViewConfigRef {
    type Target = ViewConfig;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

/// The [`crate::renderer::Renderer`]'s handle on its panel's committed
/// [`PanelState`] — read the current value, or swap in the next one.
#[derive(Clone)]
pub struct PanelCell(Session);

impl PanelCell {
    /// The COMMITTED state — what a running step reads.
    pub fn state(&self) -> Rc<PanelState> {
        self.0.borrow().state.clone()
    }

    /// The theme as the UI sees it: the committed theme, or the latest pending
    /// pick.
    pub fn projected_theme(&self) -> Option<String> {
        let pending = self
            .0
            .0
            .queue
            .pending_edits()
            .into_iter()
            .filter_map(|delta| match delta {
                EditDelta::Theme(theme) => Some(theme),
                _ => None,
            })
            .next_back();

        pending.unwrap_or_else(|| self.state().chrome.theme.clone())
    }

    /// The SELECTED plugin's bucket as the UI and `save()` see it: the
    /// committed bucket with every pending style / settings edit applied, in
    /// submit order.
    pub fn projected_bucket(&self, name: &str) -> crate::renderer::PluginScopedConfig {
        let mut bucket = self.state().bucket(name);
        for delta in self.0.0.queue.pending_edits() {
            match delta {
                EditDelta::PluginField(update) => {
                    for key in &update.keys {
                        match update.value.get(key) {
                            Some(value) => {
                                bucket.plugin.insert(key.clone(), value.clone());
                            },
                            None => {
                                bucket.plugin.remove(key);
                            },
                        }
                    }
                },
                EditDelta::ColumnField { column, update } => {
                    let entry = bucket.columns.entry(column.clone()).or_default();
                    for key in &update.keys {
                        entry.remove(key);
                    }

                    for (key, value) in update.value {
                        if update.keys.contains(&key) {
                            entry.insert(key, value);
                        }
                    }

                    if entry.is_empty() {
                        bucket.columns.remove(&column);
                    }
                },
                EditDelta::PluginConfig(map) => bucket.plugin.extend(map),
                EditDelta::View(_) | EditDelta::Theme(_) | EditDelta::Title(_) => {},
            }
        }

        bucket
    }

    /// Submit a theme pick — a UI edit, committed by the drain in its turn.
    pub fn submit_theme(&self, theme: Option<String>) {
        let cell = self.clone();
        let _ticket = self.0.submit(
            OpKind::Edit {
                delta: EditDelta::Theme(theme.clone()),
                fields: None,
            },
            move |_ctx| {
                Box::pin(async move {
                    cell.swap(cell.state().with_theme(theme));
                    Ok(StepOutcome::Done)
                })
            },
        );
    }

    /// Submit an op on this panel's queue (see [`Session::submit`]).
    pub fn submit(&self, kind: OpKind, step: impl FnOnce(OpCtx) -> StepFuture + 'static) -> Ticket {
        self.0.submit(kind, step)
    }

    pub fn swap(&self, next: PanelState) {
        self.0.borrow_mut().swap(next);
    }
}

/// The outcome of the last config-driven run.
#[derive(Clone, Default)]
pub enum Rendered {
    #[default]
    Never,
    Ok,

    /// The run of THIS state failed.
    Failed(Rc<PanelState>, TableErrorState),
}

impl SessionData {
    fn error(&self) -> Option<&TableErrorState> {
        self.state.lost().or(match &self.rendered {
            Rendered::Failed(_, error) => Some(error),
            _ => None,
        })
    }

    fn clear_errors(&mut self) {
        if self.state.lost().is_some() {
            self.swap(self.state.recovered());
        }

        if matches!(self.rendered, Rendered::Failed(..)) {
            self.rendered = Rendered::Never;
        }
    }

    fn swap(&mut self, next: PanelState) {
        if let Some(state) = self.state.live_mut() {
            *state = Rc::new(next);
        }
    }

    fn table(&self) -> Option<&perspective_client::Table> {
        self.state.bound().map(|bound| &bound.table)
    }

    fn pending_table(&self) -> Option<&str> {
        self.state.awaiting()
    }

    fn metadata(&self) -> &Rc<SessionMetadata> {
        match self.state.bound() {
            Some(bound) => &bound.metadata,
            None => &self.unbound_metadata,
        }
    }

    /// Copy-on-write: a snapshot held elsewhere never observes the mutation.
    fn metadata_mut(&mut self) -> &mut SessionMetadata {
        let Some(state) = self.state.live_mut() else {
            return Rc::make_mut(&mut self.unbound_metadata);
        };

        let binding = match &mut Rc::make_mut(state).binding {
            Binding::Lost { prior, .. } => Rc::make_mut(prior),
            binding => binding,
        };

        match binding {
            Binding::Bound(bound) => Rc::make_mut(&mut Rc::make_mut(bound).metadata),
            _ => Rc::make_mut(&mut self.unbound_metadata),
        }
    }

    fn config(&self) -> &ViewConfig {
        self.state.config()
    }

    fn set_config(&mut self, config: ViewConfig) {
        self.swap(self.state.with_config(Rc::new(config)));
    }

    /// Memo for [`Session::validate_snapshot`]: the [`Description`] the server
    /// gave for the last validated effective config; an equal snapshot skips
    /// the round trip.
    fn description(&self) -> Option<&(Rc<ViewConfig>, Rc<Description>)> {
        self.state.bound()?.description.as_ref()
    }

    fn set_description(&mut self, description: Option<(Rc<ViewConfig>, Rc<Description>)>) {
        self.swap(self.state.with_description(description));
    }

    fn unbind(&mut self) {
        self.swap(self.state.unbound());
    }
}

#[derive(Clone)]
pub struct TableErrorState(ApiError, Option<ReconnectCallback>);

impl PartialEq for TableErrorState {
    fn eq(&self, other: &Self) -> bool {
        self.0.to_string() == other.0.to_string()
    }
}

impl std::fmt::Debug for TableErrorState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_tuple("TableErrorState")
            .field(&self.0.to_string())
            .finish()
    }
}

impl TableErrorState {
    pub fn message(&self) -> String {
        self.0.message()
    }

    pub fn stacktrace(&self) -> String {
        self.0.stacktrace()
    }

    pub fn kind(&self) -> &'static str {
        self.0.kind()
    }

    pub fn is_reconnect(&self) -> bool {
        self.1.is_some()
    }
}

/// How a terminal disposal reports itself to a public run still in flight on
/// the ejected panel.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Disposal {
    /// A separate call destroyed the panel, so a racing public run rejects
    /// rather than reporting a success it never achieved.
    Reject,

    /// The ejecting call reports the eviction on its own promise, so a racing
    /// public run resolves rather than surfacing it twice.
    Resolve,
}

impl From<Disposal> for ApiResult<()> {
    fn from(disposal: Disposal) -> Self {
        match disposal {
            Disposal::Reject => Err(ApiError::new("Panel disposed")),
            Disposal::Resolve => Ok(()),
        }
    }
}

#[derive(Debug, Default)]
pub enum TableIntermediateState {
    #[default]
    Ejected,
}

/// Options for [`Session::reset`]
#[derive(Default)]
pub struct ResetOptions {
    /// Reset user defined expressions
    pub expressions: bool,

    /// Reset the [`Table`]
    pub table: Option<TableIntermediateState>,

    /// Reset the [`ViewConfig`]
    pub config: bool,

    /// Manually reset the [`ViewStats`]
    pub stats: bool,
}

/// The `Session` struct is the principal interface to the Perspective engine,
/// the `Table` and `View` objects for this viewer, and all associated state
/// including the `ViewConfig`.
#[derive(Clone)]
pub struct Session(Rc<SessionHandle>);

impl ImplicitClone for Session {}

impl Deref for Session {
    type Target = SessionHandle;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl PartialEq for Session {
    fn eq(&self, other: &Self) -> bool {
        Rc::ptr_eq(&self.0, &other.0)
    }
}

impl Session {
    /// Uses [`Self::new`] instead of [`Default`] to prevent accidental
    /// instantiation in props/etc.
    #[allow(clippy::new_without_default)]
    pub fn new() -> Self {
        Self(Rc::default())
    }

    pub(crate) fn metadata(&self) -> MetadataRef {
        MetadataRef(self.borrow().metadata().clone())
    }

    /// A handle on this panel's committed [`PanelState`] for the panel's
    /// [`crate::renderer::Renderer`], which owns none of it.
    pub fn cell(&self) -> PanelCell {
        PanelCell(self.clone())
    }

    pub(crate) fn metadata_mut(&self) -> MetadataMutRef<'_> {
        std::cell::RefMut::map(self.borrow_mut(), |x| x.metadata_mut())
    }

    /// The title as the UI and `save()` see it: the committed title, or the
    /// latest pending rename.
    pub(crate) fn get_title(&self) -> Option<String> {
        let pending = self
            .0
            .queue
            .pending_edits()
            .into_iter()
            .filter_map(|delta| match delta {
                EditDelta::Title(title) => Some(title),
                _ => None,
            })
            .next_back();

        pending.unwrap_or_else(|| self.borrow().state.chrome.title.clone())
    }

    /// Rename this panel — a UI edit, committed by the drain in its turn.
    pub fn set_title(&self, title: Option<String>) {
        let title = title.filter(|x| !x.is_empty());
        let session = self.clone();
        let _ticket = self.submit(
            OpKind::Edit {
                delta: EditDelta::Title(title.clone()),
                fields: None,
            },
            move |_ctx| {
                Box::pin(async move {
                    session.commit_title(title);
                    Ok(StepOutcome::Done)
                })
            },
        );

        self.title_changed.emit(self.get_title());
    }

    /// Write the title NOW.
    pub(crate) fn commit_title(&self, title: Option<String>) {
        let new_title = title.filter(|x| !x.is_empty());
        let next = self.borrow().state.with_title(new_title.clone());
        self.borrow_mut().swap(next);
        self.title_changed.emit(new_title);
    }

    /// Reset this (presumably shared) `Session` to its initial state, returning
    /// a bool indicating whether this `Session` had a table which was
    /// deleted. TODO Table should be an immutable constructor parameter to
    /// `Session`.
    pub fn reset(&self, options: ResetOptions) -> impl Future<Output = ApiResult<()>> + use<> {
        let view = self.0.borrow_mut().view_sub.take();
        let had_table = self.borrow().table().is_some();
        let err = self.get_error();
        self.borrow_mut().clear_errors();
        if options.stats {
            self.update_stats(ViewStats::default());
        }

        if options.config {
            let mut config = self.borrow().config().clone();
            config.reset(options.expressions);
            self.borrow_mut().set_config(config);
        }

        if options.expressions {
            self.borrow_mut().set_description(None);
        }

        match options.table {
            Some(TableIntermediateState::Ejected) => self.borrow_mut().unbind(),
            None => {},
        };

        // A config reset that KEEPS its `Table` is itself a commit, and every
        // commit normalizes (I1/I4): re-fill the emptied `columns` from the
        // table's defaults NOW, synchronously — previously this fill lived in
        // the async validate write-back and ran on the next draw, so skipping
        // it here left `save()` reporting `columns: []` after `reset()`. An
        // ejecting/reloading reset skips it (no table to fill from — `load()`
        // runs its own table-bind commit).
        if options.config && options.table.is_none() {
            self.commit_table_defaults();
        }

        let session = self.clone();
        async move {
            let res = view.delete().await;
            if options.table.is_some() && had_table {
                session.table_unloaded.emit(true)
            }

            if let Some(err) = err { Err(err) } else { res }
        }
    }

    /// Submit a writer of this panel's state.
    pub fn submit(&self, kind: OpKind, step: impl FnOnce(OpCtx) -> StepFuture + 'static) -> Ticket {
        if let Some(disposal) = self.disposal() {
            return Ticket::settled(disposal.into());
        }

        let is_edit = matches!(kind, OpKind::Edit {
            delta: EditDelta::View(_),
            ..
        });

        let guard = self.begin_config_run();
        let (ticket, start) = self.0.queue.push(kind, guard, step);
        if is_edit {
            self.notify_view_config_changed();
        }

        if start {
            let queue = self.0.queue.clone();
            let session = self.clone();
            ApiFuture::spawn_named("op-queue-drain", async move {
                queue
                    .drain(move |_exit| session.notify_view_config_changed())
                    .await;

                Ok(())
            });
        }

        ticket
    }

    /// Resolves once every op submitted to this panel has settled — its write
    /// made (or rejected) AND its render landed.
    pub async fn settle_ops(&self) {
        self.0.queue.idle().await
    }

    /// Whether a `load()` is queued or running.
    pub fn has_pending_load(&self) -> bool {
        self.0.queue.has_load()
    }

    /// The ONE `Live → Disposed` transition (this session's panel was ejected):
    /// the state is frozen as its last value, everything queued settles per
    /// `disposal`, and every later `submit` settles at once.
    pub(crate) fn dispose(&self, disposal: Disposal) {
        {
            let mut data = self.borrow_mut();
            if let Lifecycle::Live(last) = &data.state {
                data.state = Lifecycle::Disposed {
                    last: last.clone(),
                    disposal,
                };
            }
        }

        self.0.queue.reject_all(disposal.into());
    }

    pub(crate) fn is_disposed(&self) -> bool {
        self.disposal().is_some()
    }

    /// This session's disposal, if its panel was ejected.
    pub(crate) fn disposal(&self) -> Option<Disposal> {
        self.borrow().state.disposal()
    }

    pub(crate) fn has_table(&self) -> Option<TableLoadState> {
        let data = self.borrow();
        if data.table().is_some() {
            Some(TableLoadState::Loaded)
        } else if self.0.queue.has_load() {
            Some(TableLoadState::Loading)
        } else if data.pending_table().is_some() {
            Some(TableLoadState::Pending)
        } else {
            None
        }
    }

    pub fn get_table(&self) -> Option<perspective_client::Table> {
        self.borrow().table().cloned()
    }

    /// Look this panel's tables up on `client` — unbinding it from a table of
    /// any other client's.
    pub fn set_client(&self, client: Client) -> bool {
        if Some(&client) != self.get_client().as_ref() {
            let next = self.borrow().state.unbound_on(Some(client));
            self.borrow_mut().swap(next);
            true
        } else {
            false
        }
    }

    pub fn get_client(&self) -> Option<Client> {
        self.borrow().state.client()
    }

    /// The configured table name awaiting a host, if any (see
    /// [`SessionData::pending_table`]).
    pub fn pending_table(&self) -> Option<String> {
        self.borrow().pending_table().map(str::to_owned)
    }

    /// Suspend a BOUND table to PENDING: delete the `View`, drop the `Table`
    /// handle (freeing the engine name for a lazy `Table::delete` to
    /// complete), and record the name as pending — the view config is KEPT,
    /// so the reactive rebind (`tasks::table_lifecycle`) restores this panel
    /// as it was when the name is hosted again. `None` when no table is
    /// bound.
    pub fn suspend_table(&self) -> Option<impl Future<Output = ApiResult<()>> + use<>> {
        let name = self.borrow().table()?.get_name().to_owned();
        let client = self.get_client()?;
        let fut = self.reset(ResetOptions {
            table: Some(TableIntermediateState::Ejected),
            stats: true,
            ..ResetOptions::default()
        });

        let next = self.borrow().state.awaiting_table(client, name);
        self.borrow_mut().swap(next);
        Some(fut)
    }

    /// Record a connection error on `client` as this panel's lost binding — for
    /// as long as `client` is the one the panel is bound through.
    async fn watch_client(&self, client: &Client) -> ApiResult<()> {
        let on_error = self.on_table_errored.borrow().clone();
        let session = self.clone();
        let watched = client.clone();
        let poll_loop = LocalPollLoop::new(move |(message, reconnect): (ApiError, _)| {
            if session.get_client().as_ref() != Some(&watched) {
                return Ok(JsValue::UNDEFINED);
            }

            let next = session
                .borrow()
                .state
                .with_lost(TableErrorState(message, reconnect));
            session.borrow_mut().swap(next);
            if let Some(cb) = &on_error {
                cb.emit(());
            }
            if let Some(sub) = session.borrow_mut().view_sub.take() {
                sub.dismiss();
            }

            Ok(JsValue::UNDEFINED)
        });

        let _callback_id = client
            .on_error(Box::new(move |message: ClientError, reconnect| {
                let poll_loop = poll_loop.clone();
                async move {
                    poll_loop.poll((message.into(), reconnect)).await;
                    Ok(())
                }
            }))
            .await?;

        Ok(())
    }

    pub async fn set_error(&self, reset_table: bool, err: ApiError) -> ApiResult<()> {
        let session = self.clone();
        let poll_loop = LocalPollLoop::new(move |()| {
            ApiFuture::spawn(session.reset(ResetOptions {
                config: true,
                expressions: true,
                ..ResetOptions::default()
            }));
            Ok(JsValue::UNDEFINED)
        });

        let error = TableErrorState(
            err.clone(),
            Some(ReconnectCallback::new(move || {
                clone!(poll_loop);
                Box::pin(async move {
                    poll_loop.poll(()).await;
                    Ok(())
                })
            })),
        );

        let next = self.borrow().state.with_lost(error);
        self.borrow_mut().swap(next);

        if let Some(cb) = self.on_table_errored.borrow().as_ref() {
            cb.emit(());
        }

        let sub = self.borrow_mut().view_sub.take();
        if reset_table {
            self.borrow_mut().unbind();
        }

        sub.delete().await?;
        Err(err)
    }

    pub fn set_pause(&self, pause: bool) -> bool {
        if pause == self.borrow().is_paused {
            false
        } else if pause {
            ApiFuture::spawn(self.borrow_mut().view_sub.take().delete());
            self.borrow_mut().is_paused = true;
            true
        } else {
            self.borrow_mut().is_paused = false;
            true
        }
    }

    pub async fn await_table(&self) -> ApiResult<()> {
        if self.js_get_table().is_none() {
            self.table_loaded.read_next().await?;
            let _ = self.js_get_table().ok_or("No table set")?;
        }

        Ok(())
    }

    pub fn js_get_table(&self) -> Option<JsValue> {
        Some(perspective_js::Table::from(self.borrow().table().cloned()?).into())
    }

    /// Whether the binding is lost OR the last run failed.
    pub(crate) fn is_errored(&self) -> bool {
        self.borrow().error().is_some()
    }

    pub(crate) fn get_error(&self) -> Option<ApiError> {
        self.borrow().error().map(|x| x.0.clone())
    }

    /// The error a config-driven run must not proceed past: a lost binding, or
    /// a failed run of EXACTLY the state now committed (re-running it would
    /// only fail again).
    pub(crate) fn blocking_error(&self) -> Option<ApiError> {
        let data = self.borrow();
        if let Some(error) = data.state.lost() {
            return Some(error.0.clone());
        }

        match &data.rendered {
            Rendered::Failed(state, error) if Rc::ptr_eq(state, &data.state) => {
                Some(error.0.clone())
            },
            _ => None,
        }
    }

    /// Record that a config-driven run of the committed state is starting (any
    /// earlier failure is stale) or has landed.
    pub(crate) fn set_rendered(&self, ok: bool) {
        self.borrow_mut().rendered = if ok { Rendered::Ok } else { Rendered::Never };
    }

    /// Recover from an error state (the overlay's button) — a writer, so an op
    /// on the queue like any other.
    pub async fn reconnect(&self) -> ApiResult<()> {
        let session = self.clone();
        self.submit(OpKind::Restore { fields: None }, move |_ctx| {
            Box::pin(async move {
                session.reconnect_step().await?;
                Ok(StepOutcome::Done)
            })
        })
        .settle()
        .await
    }

    async fn reconnect_step(&self) -> ApiResult<()> {
        let err = self.borrow().error().cloned();
        if let Some(TableErrorState(_, Some(reconnect))) = err {
            reconnect().await?;
            self.borrow_mut().clear_errors();
            self.borrow_mut().set_description(None);
            self.borrow_mut().view_sub = None;
            self.table_loaded.emit(());
        }

        Ok(())
    }

    pub fn get_view(&self) -> Option<View> {
        self.borrow()
            .view_sub
            .as_ref()
            .map(|sub| sub.get_view().clone())
    }

    /// The bound `View` together with its latest known dimensions, read under
    /// one borrow so they always belong together.
    pub fn get_view_with_dimensions(&self) -> Option<(View, Option<ViewDimensionsResp>)> {
        self.borrow()
            .view_sub
            .as_ref()
            .map(|sub| (sub.get_view().clone(), sub.dimensions()))
    }

    pub(crate) fn get_table_stats(&self) -> Option<ViewStats> {
        self.borrow().stats.clone()
    }

    /// Whether the stats snapshot carries table dimensions.
    pub(crate) fn has_table_cells(&self) -> bool {
        self.borrow()
            .stats
            .as_ref()
            .is_some_and(|s| s.num_table_cells.is_some())
    }

    /// The view config as the UI and `save()` see it: the committed config with
    /// every pending UI edit applied, in submit order.
    pub fn get_view_config(&self) -> ViewConfigRef {
        ViewConfigRef(self.projected())
    }

    /// The COMMITTED view config — what a running op must read, since the edits
    /// still queued behind it have not happened yet.
    pub fn committed_view_config(&self) -> ViewConfigRef {
        ViewConfigRef(self.borrow().state.config().clone())
    }

    fn projected(&self) -> Rc<ViewConfig> {
        let committed = self.borrow().state.config().clone();
        let edits = self
            .0
            .queue
            .pending_edits()
            .into_iter()
            .filter_map(|delta| match delta {
                EditDelta::View(delta) => Some(*delta),
                _ => None,
            })
            .collect::<Vec<_>>();

        if edits.is_empty() {
            return committed;
        }

        let mut config = (*committed).clone();
        for delta in edits {
            let mut candidate = config.clone();
            if candidate.apply_update(delta) && self.validate_names(&candidate).is_ok() {
                self.normalize_view_config(&mut candidate);
                config = candidate;
            }
        }

        Rc::new(config)
    }

    /// Whether `delta` is an edit the UI may submit: SYNCHRONOUS validation
    /// against the projection, so an invalid edit is refused at the control
    /// that made it.
    pub fn check_edit(&self, delta: &ViewConfigUpdate) -> ApiResult<()> {
        if let Some(x) = self.borrow().state.lost() {
            return Err(ApiError::new(x.0.clone()));
        }

        let mut candidate = (*self.projected()).clone();
        if candidate.apply_update(delta.clone()) {
            self.validate_names(&candidate)?;
        }

        Ok(())
    }

    /// The effective [`ViewConfig`] the `View` is built from — the one the
    /// committed description describes.
    fn effective_view_config(&self) -> Rc<ViewConfig> {
        let data = self.borrow();
        if let Some((effective, _)) = data.description() {
            return effective.clone();
        }

        let metadata = data.metadata().clone();
        let (config, _) = effective(data.config(), &data.state.overlay, &|name| {
            metadata.get_column_table_type(name)
        });

        Rc::new(config)
    }

    /// The overlay clauses this panel's table cannot honor, by index — a column
    /// it lacks, or has with another type.
    pub fn skipped_overlay(&self) -> Vec<usize> {
        let data = self.borrow();
        let metadata = data.metadata().clone();
        effective(data.config(), &data.state.overlay, &|name| {
            metadata.get_column_table_type(name)
        })
        .1
    }

    /// The element's global filter as last broadcast to this panel.
    pub(crate) fn committed_overlay(&self) -> Rc<Vec<OverlayClause>> {
        self.borrow().state.overlay.clone()
    }

    /// Snapshot of the [`ViewConfig`] the currently-bound `View` was
    /// constructed from. Returns `None` if no `View` has been created
    /// yet (e.g., the post-`load`/pre-render window, or after a reset).
    ///
    /// Prefer this over [`Self::get_view_config`] when you need a
    /// value consistent with what the active plugin is rendering.
    /// `get_view_config` returns the PROJECTED config — committed state plus
    /// pending edits — which runs ahead of the bound `View`.
    pub fn get_rendered_view_config(&self) -> Option<Rc<ViewConfig>> {
        self.borrow().view_sub.as_ref().map(|s| s.get_view_config())
    }

    pub fn set_update_column_defaults(
        &self,
        config_update: &mut ViewConfigUpdate,
        config_static: &PluginStaticConfig,
    ) {
        use self::column_defaults_update::*;
        let config = self.committed_view_config();
        config_update.set_update_column_defaults(
            &self.metadata(),
            &config,
            &config.columns,
            config_static,
        )
    }

    /// Rollup-mode-only subset of [`Self::set_update_column_defaults`], for
    /// restores that do NOT swap plugins: the plugin-advised
    /// `group_rollup_mode` must be (re-)enforced on every restore commit —
    /// a preceding `reset` may have wiped it — but the column-defaulting
    /// half must not run (it would rewrite a partial update's `columns`).
    pub fn set_update_rollup_defaults(
        &self,
        config_update: &mut ViewConfigUpdate,
        config_static: &PluginStaticConfig,
    ) {
        use self::column_defaults_update::*;
        config_update.set_update_rollup_defaults(
            &self.metadata(),
            &self.committed_view_config(),
            config_static,
        )
    }

    /// Re-normalize the config against the bound table's metadata — the
    /// default-view materialization after a config reset that keeps its table.
    fn commit_table_defaults(&self) {
        let mut candidate = self.borrow().config().clone();
        self.normalize_view_config(&mut candidate);
        if candidate != *self.borrow().config() {
            self.borrow_mut().set_config(candidate);
            self.notify_view_config_changed();
        }
    }

    /// SYNC name validation for a candidate config (I4): every referenced
    /// column must be a table column, or an expression or window column
    /// present in the candidate itself (syntactic presence — server-side
    /// compilability is a run property, not a commit property). Skipped
    /// when no table is bound yet: the config rides along until `load()`
    /// binds one, and the engine surfaces any residual error on that run.
    fn validate_names(&self, config: &ViewConfig) -> ApiResult<()> {
        Self::validate_names_with(&self.metadata(), config)
    }

    /// [`Self::validate_names`] against an explicit table's metadata — the
    /// INCOMING table's, for a restore that binds one.
    fn validate_names_with(metadata: &SessionMetadata, config: &ViewConfig) -> ApiResult<()> {
        let table_columns = Self::columns_of(metadata);
        if table_columns.is_empty() {
            return Ok(());
        }

        let mut allowed: HashSet<&str> = table_columns.iter().map(|x| x.as_str()).collect();
        allowed.extend(config.expressions.0.keys().map(|x| x.as_str()));
        allowed.extend(config.windows.keys().map(|x| x.as_str()));
        let named = config
            .columns
            .iter()
            .flatten()
            .map(|x| ("columns", x))
            .chain(config.group_by.iter().map(|x| ("group_by", x)))
            .chain(config.split_by.iter().map(|x| ("split_by", x)))
            .chain(config.sort.iter().map(|x| ("sort", &x.0)));

        for (field, column) in named {
            if !allowed.contains(column.as_str()) {
                return Err(apierror!(InvalidViewerConfigError(
                    field,
                    column.to_owned()
                )));
            }
        }

        for filter in config.filter.iter() {
            // TODO check filter op
            if !allowed.contains(filter.column()) {
                return Err(apierror!(InvalidViewerConfigError(
                    "filter",
                    filter.column().to_owned()
                )));
            }
        }

        Ok(())
    }

    /// SYNC normalization at commit time (previously the async validate's
    /// write-back): fill empty `columns` from the table, prune `aggregates`
    /// to referenced columns.
    fn normalize_view_config(&self, config: &mut ViewConfig) {
        Self::normalize_with(&self.metadata(), config)
    }

    fn normalize_with(metadata: &SessionMetadata, config: &mut ViewConfig) {
        let table_columns = Self::columns_of(metadata);
        if table_columns.is_empty() {
            return;
        }

        if config.columns.is_empty() {
            config.columns = table_columns.iter().cloned().map(Some).collect();
        }

        let view_columns: HashSet<String> = config
            .columns
            .iter()
            .flatten()
            .cloned()
            .chain(config.group_by.iter().cloned())
            .chain(config.split_by.iter().cloned())
            .chain(config.sort.iter().map(|x| x.0.clone()))
            .chain(config.filter.iter().map(|x| x.column().to_owned()))
            .collect();

        config
            .aggregates
            .retain(|column, _| view_columns.contains(column.as_str()));
    }

    /// Run `fut` as a TRACKED dispatch task: its errors are owned (logged,
    /// tagged) and its completion is joinable via
    /// [`Self::settle_dispatches`]. Used by the `perspective-config-update`
    /// dispatcher, whose landing `flush()` must be able to await.
    pub fn track_dispatch(&self, fut: impl std::future::Future<Output = ApiResult<()>> + 'static) {
        let guard = self.0.dispatches.guard();
        ApiFuture::spawn_named("config-update-dispatch", async move {
            let _guard = guard;
            if let Err(e) = fut.await {
                tracing::error!("[config-update dispatch] {}", e);
            }

            Ok(())
        });
    }

    /// Resolve once every in-flight tracked dispatch for this panel has
    /// landed. Immediate when none are pending.
    pub async fn settle_dispatches(&self) -> ApiResult<()> {
        self.0.dispatches.settle().await;
        Ok(())
    }

    /// Emit `view_config_changed` coalesced to one event per microtask batch.
    /// Stats are cleared synchronously per commit (idempotent — an
    /// already-empty cache no-ops, so rapid commit sequences fetch once).
    fn notify_view_config_changed(&self) {
        self.clear_column_stats();
        if !self.0.config_event_scheduled.replace(true) {
            let session = self.clone();
            ApiFuture::spawn(async move {
                session.0.config_event_scheduled.set(false);
                session.view_config_changed.emit(());
                Ok(())
            });
        }
    }

    /// Begin spinner accounting for ONE config-driven pipeline run: call
    /// immediately after the run's commit, and move the returned guard INTO
    /// the run future.
    pub fn begin_config_run(&self) -> InFlightGuard {
        self.0.config_runs.guard()
    }

    /// Read the cached `ColumnStats` for a column. Returns `None` if no
    /// fetch has populated this column yet (or the cache was just
    /// cleared by a view-config change).
    pub fn get_column_stats(&self, column_name: &str) -> Option<ColumnStats> {
        self.column_stats.borrow().get(column_name).copied()
    }

    /// Insert a freshly-fetched `abs_max` for a column and notify
    /// subscribers via [`SessionHandle::column_stats_changed`].
    pub fn set_column_abs_max(&self, column_name: String, abs_max: f64) {
        self.column_stats
            .borrow_mut()
            .entry(column_name)
            .or_default()
            .abs_max = Some(abs_max);
        self.column_stats_changed.emit(());
    }

    /// Drop the entire stats cache. Called when the view config changes
    /// (filter / group_by / etc.) so stats are re-fetched on next
    /// schema query.
    pub fn clear_column_stats(&self) {
        if !self.column_stats.borrow().is_empty() {
            self.column_stats.borrow_mut().clear();
            self.column_stats_changed.emit(());
        }
    }

    /// Immutable input for one pipeline run (invariant I2): the persisted
    /// config and its EFFECTIVE companion (global-filter overlay appended),
    /// captured at the same synchronous instant. Requires the
    /// [`RenderGuard`] witness — snapshots exist only inside a locked run,
    /// so run *N+1*'s snapshot is provably at least as fresh as every commit
    /// that preceded run *N*'s completion (invariant I3).
    pub fn snapshot(&self, _guard: &RenderGuard) -> ConfigSnapshot {
        ConfigSnapshot {
            config: self.borrow().state.config().clone(),
            effective: self.effective_view_config(),
        }
    }

    /// Validate a snapshot against the server with `Table::describe`, failing
    /// this run and never the committed config.
    pub async fn validate_snapshot(
        &self,
        _guard: &RenderGuard,
        snap: ConfigSnapshot,
    ) -> ApiResult<ValidatedSnapshot> {
        let (description, fresh) = self.describe_effective(&snap.effective).await?;
        if fresh {
            tracing::warn!("Rendering a commit that was not described");
            Self::record_description(&mut self.metadata_mut(), &snap.effective, &description)?;
            self.borrow_mut()
                .set_description(Some((snap.effective.clone(), description.clone())));
        }

        Ok(ValidatedSnapshot { snap })
    }

    /// The server's [`Description`] of `effective`, and whether it took a round
    /// trip (`false` when the memo already held it).
    async fn describe_effective(
        &self,
        effective: &Rc<ViewConfig>,
    ) -> ApiResult<(Rc<Description>, bool)> {
        let memo = self
            .borrow()
            .description()
            .cloned()
            .filter(|(key, _)| **key == **effective)
            .map(|(_, description)| description);

        if let Some(description) = memo {
            return Ok((description, false));
        }

        let table = self
            .borrow()
            .table()
            .cloned()
            .ok_or_else(|| apierror!(NoTableError))?;

        Self::describe_with(&table, &self.metadata(), effective)
            .await
            .map(|description| (description, true))
    }

    /// `table`'s [`Description`] of `effective`, with validation failures as
    /// the errors a `restore()` rejects with.
    async fn describe_with(
        table: &perspective_client::Table,
        metadata: &SessionMetadata,
        effective: &Rc<ViewConfig>,
    ) -> ApiResult<Rc<Description>> {
        let engine_config = Self::with_default_aggregates_of(metadata, effective);
        match table.describe(engine_config.into()).await? {
            Ok(description) => Ok(Rc::new(description)),
            Err(DescribeError::Expressions {
                expression_schema,
                errors,
            }) => Err(apierror!(InvalidViewerConfigExpressionsError(Rc::new(
                ExprValidationResult {
                    expression_schema,
                    errors,
                    expression_alias: effective.expressions.0.clone(),
                }
            )))),
            Err(DescribeError::Config(msg)) => Err(ApiError::new(msg)),
        }
    }

    /// The PREPARE half of a transactional restore's view of the panel: the
    /// binding `plan` resolved, and the config it leaves — the committed one (a
    /// default one, for a plan that resets) with `update` applied —
    /// name-checked, normalized and DESCRIBED by the table it will be bound to.
    pub(crate) async fn prepare_view(
        &self,
        plan: BindPlan,
        mut update: ViewConfigUpdate,
        defaults: ViewDefaults<'_>,
        overlay: Option<Rc<Vec<OverlayClause>>>,
    ) -> ApiResult<PreparedView> {
        if self.is_disposed() {
            return Err(ApiError::new("Panel disposed"));
        }

        if matches!(plan, BindPlan::Keep)
            && let Some(error) = self.borrow().state.lost()
        {
            return Err(error.0.clone());
        }

        let committed = self.borrow().state.config().clone();
        let base = match &plan {
            BindPlan::Bind { reset: true, .. } | BindPlan::Pend { reset: true, .. } => {
                Rc::new(ViewConfig::default())
            },
            _ => committed.clone(),
        };

        let (binding, checked) = match plan {
            BindPlan::Keep => {
                let bound = self.borrow().state.bound().cloned();
                (
                    PreparedBinding::Keep,
                    bound.map(|bound| (bound.table.clone(), bound.metadata.clone())),
                )
            },
            BindPlan::Bind { client, table, .. } => {
                let metadata = Rc::new(SessionMetadata::from_table(&table).await?);
                let binding = PreparedBinding::Bind {
                    client,
                    table: table.clone(),
                    metadata: metadata.clone(),
                };

                (binding, Some((*table, metadata)))
            },
            BindPlan::Pend { client, name, .. } => (PreparedBinding::Pend { client, name }, None),
        };

        {
            use self::column_defaults_update::*;
            let metadata = match &checked {
                Some((_, metadata)) => metadata.clone(),
                None => self.borrow().metadata().clone(),
            };

            match defaults {
                ViewDefaults::Swap(plugin) => {
                    update.set_update_column_defaults(&metadata, &base, &base.columns, plugin)
                },
                ViewDefaults::Rollup(plugin) => {
                    update.set_update_rollup_defaults(&metadata, &base, plugin)
                },
                ViewDefaults::AsGiven => {},
            }
        }

        let mut candidate = (*base).clone();
        candidate.apply_update(update);
        if let Some((_, metadata)) = &checked {
            Self::validate_names_with(metadata, &candidate)?;
            Self::normalize_with(metadata, &mut candidate);
        }

        let config = if candidate == *committed {
            committed.clone()
        } else {
            Rc::new(candidate)
        };

        let changed = !Rc::ptr_eq(&config, &committed);
        let clauses = overlay
            .clone()
            .unwrap_or_else(|| self.borrow().state.overlay.clone());

        let (effective, description) = match &checked {
            None => (config.clone(), None),
            Some((table, metadata)) => {
                let on_expression = clauses
                    .iter()
                    .any(|x| config.expressions.0.contains_key(x.filter.column()));

                let bare = if on_expression {
                    Some(Self::describe_with(table, metadata, &config).await?)
                } else {
                    None
                };

                let (effective, _) = effective(&config, &clauses, &|name| {
                    metadata.get_table_schema_type(name).or_else(|| {
                        bare.as_ref()
                            .and_then(|x| x.expression_schema.get(name).copied())
                    })
                });

                let effective = if effective == *config {
                    config.clone()
                } else {
                    Rc::new(effective)
                };

                let description = match (&binding, bare) {
                    (_, Some(bare)) if Rc::ptr_eq(&effective, &config) => bare,
                    (PreparedBinding::Keep, _) => self.describe_effective(&effective).await?.0,
                    _ => Self::describe_with(table, metadata, &effective).await?,
                };

                (effective, Some(description))
            },
        };

        Ok(PreparedView {
            binding,
            overlay,
            config,
            effective,
            description,
            changed,
            announce: true,
        })
    }

    /// The COMMIT half of [`Self::prepare_view`], as ONE swap: `state` with the
    /// prepared binding, config, description and expression metadata, then
    /// whatever else of the panel `rest` replaces.
    pub(crate) fn commit_view(
        &self,
        view: PreparedView,
        rest: impl FnOnce(PanelState) -> PanelState,
    ) -> BindingEffects {
        let state = self.borrow().state.clone();
        let title_before = state.chrome.title.clone();
        let had_table = state.bound().is_some();
        let (rebound, watch) = match view.binding {
            PreparedBinding::Keep => (None, None),
            PreparedBinding::Bind {
                client,
                table,
                metadata,
            } => (
                Some(state.bound_to(*table, (*metadata).clone())),
                Some(client),
            ),
            PreparedBinding::Pend { client, name } => {
                (Some(state.awaiting_table(client, name)), None)
            },
        };

        let rebinds = rebound.is_some();
        let mut next = rebound.unwrap_or_else(|| (*state).clone());
        next = next.with_config(view.config.clone());
        if let Some(overlay) = view.overlay {
            next = next.with_overlay(overlay);
        }

        if let Some(description) = view.description {
            if let Some(bound) = next.bound() {
                let mut metadata = (*bound.metadata).clone();
                if Self::record_description(&mut metadata, &view.effective, &description).is_ok() {
                    next = next.with_metadata(Rc::new(metadata));
                }
            }

            next = next.with_description(Some((view.effective, description)));
        }

        let next = rest(next);
        let title_after = next.chrome.title.clone();
        let bound = next.bound().is_some();
        self.borrow_mut().swap(next);
        let outgoing = if rebinds {
            let mut data = self.borrow_mut();
            data.rendered = Rendered::Never;
            data.view_sub.take()
        } else {
            None
        };

        if rebinds {
            self.update_stats(ViewStats::default());
        }

        if (view.changed && view.announce) || rebinds {
            self.notify_view_config_changed();
        }

        if title_before != title_after {
            self.title_changed.emit(title_after);
        }

        BindingEffects {
            rebinds,
            outgoing,
            unloaded: rebinds && had_table,
            loaded: rebinds && bound,
            watch,
        }
    }

    /// Everything the metadata derives from a [`Description`] of `effective`:
    /// the expression types, the types the `View` will have, and the window
    /// columns.
    fn record_description(
        metadata: &mut SessionMetadata,
        effective: &ViewConfig,
        description: &Description,
    ) -> ApiResult<()> {
        metadata.update_expressions(&ExprValidationResult {
            expression_schema: description.expression_schema.clone(),
            errors: HashMap::new(),
            expression_alias: effective.expressions.0.clone(),
        })?;

        metadata.update_view_schema(&description.view_schema)?;
        metadata.update_windows(&effective.windows)?;
        Ok(())
    }

    /// Finish a committed rebind: dispose of the outgoing `View`, announce the
    /// table change, and watch the incoming client for errors.
    pub(crate) async fn finish_binding(&self, effects: BindingEffects) -> ApiResult<()> {
        let BindingEffects {
            outgoing,
            unloaded,
            loaded,
            watch,
            ..
        } = effects;

        let deleted = outgoing.delete().await;
        if unloaded {
            self.table_unloaded.emit(true);
        }

        if let Some(client) = watch {
            self.watch_client(&client).await?;
        }

        if loaded {
            self.table_loaded.emit(());
        }

        deleted
    }

    /// Bind the engine `View` for a validated snapshot: SKIP
    /// ([`BindDisposition::Unchanged`]) when the bound view was built from
    /// an equal effective config, REUSE ([`BindDisposition::Adopted`],
    /// in-place snapshot adoption) when engine-equivalent modulo
    /// `None`-column placeholders, else REBUILD
    /// ([`BindDisposition::Rebuilt`]) from the snapshot. The decision
    /// compares two immutable values owned by this run — there are no
    /// consumable flags for a concurrent run to steal — and the returned
    /// disposition is the ONLY source of `plugin.draw` eligibility (its
    /// `Rebuilt` arm mints the [`FreshView`] witness).
    pub async fn bind_view(
        &self,
        _guard: &RenderGuard,
        validated: ValidatedSnapshot,
    ) -> ApiResult<BindDisposition> {
        // Whichever way a bound `View` was reconciled without construction,
        // classify it `Unchanged` (repaint-eligible, never full-draw); a
        // session with nothing bound is `Deferred`.
        fn unchanged_or_deferred(session: &Session) -> BindDisposition {
            match session.get_view() {
                Some(view) => BindDisposition::Unchanged(view),
                None => BindDisposition::Deferred,
            }
        }

        let ValidatedSnapshot {
            snap: ConfigSnapshot { config, effective },
        } = validated;
        if self.borrow().is_paused {
            // A paused bind still RECONCILES the committed config (no `View`
            // is constructed — `view_created` stays silent). Without this
            // emit, a commit landing while auto-paused (e.g. `load()` on a
            // disconnected element, once the IntersectionObserver's initial
            // not-intersecting entry wins the race to this check) never
            // announces its `config-update`: the dispatcher only ever runs
            // from `commit_reconciled`, so the event — which `flush()` joins
            // via the tracked-dispatch counter — would be deferred to the
            // unpause render. The unpause render's own dispatch is deduped
            // (`last_dispatched_config`), so this emit cannot double-fire.
            self.commit_reconciled.emit(());
            return Ok(unchanged_or_deferred(self));
        }

        {
            let bound = self.borrow().view_sub.as_ref().map(|x| x.build_config());
            if let Some(bound) = bound {
                if *bound == *effective {
                    // SKIP: the bound `View` already satisfies the commit.
                    self.commit_reconciled.emit(());
                    return Ok(unchanged_or_deferred(self));
                } else if bound.is_equivalent(&effective) {
                    if let Some(sub) = self.borrow_mut().view_sub.as_mut() {
                        sub.set_configs(config.clone(), effective.clone());
                    }

                    // REUSE: snapshot adoption, no `View` constructed.
                    self.commit_reconciled.emit(());
                    return match self.get_view() {
                        Some(view) => Ok(BindDisposition::Adopted(view)),
                        None => Ok(BindDisposition::Deferred),
                    };
                }
            }
        }

        let table = self
            .borrow()
            .table()
            .cloned()
            .ok_or("`restore()` called before `load()`")?;

        let view_config = self.with_default_aggregates(&effective);
        let view = table.view(Some(view_config.into())).await?;
        let on_stats = Callback::from({
            let this = self.clone();
            move |stats| this.update_stats(stats)
        });

        let sub = {
            let on_update = self
                .metadata()
                .get_features()
                .unwrap()
                .on_update
                .then(|| self.table_updated.callback());

            ViewSubscription::new(view, config, effective, on_stats, on_update).await?
        };

        let old = self.borrow_mut().view_sub.take();
        ApiFuture::spawn(old.delete());
        self.borrow_mut().view_sub = Some(sub);
        self.view_created.emit(());
        self.commit_reconciled.emit(());
        match self.get_view() {
            Some(view) => Ok(BindDisposition::Rebuilt(FreshView::assert_fresh(view))),
            None => Ok(BindDisposition::Deferred),
        }
    }

    /// The engine config for a `View` built from `effective`, per-column
    /// default aggregates filled in as a courtesy to the virtual server API.
    fn with_default_aggregates(&self, effective: &ViewConfig) -> ViewConfig {
        Self::with_default_aggregates_of(&self.metadata(), effective)
    }

    fn with_default_aggregates_of(
        metadata: &SessionMetadata,
        effective: &ViewConfig,
    ) -> ViewConfig {
        let mut view_config = effective.clone();
        for col in view_config
            .columns
            .iter()
            .flatten()
            .chain(view_config.sort.iter().map(|x| &x.0))
        {
            if !view_config.aggregates.contains_key(col.as_str()) {
                let agg = metadata
                    .get_column_aggregates(col.as_str())
                    .and_then(|mut aggs| aggs.next())
                    .into_apierror();

                match agg {
                    Err(_) => {
                        tracing::warn!("No default aggregate for column '{}' found, skipping", col)
                    },
                    Ok(agg) => _ = view_config.aggregates.insert(col.to_string(), agg),
                };
            }
        }

        view_config
    }

    /// Build a caller-owned `View` from the effective config outside the
    /// render pipeline, with no subscription and no interaction with pause.
    pub async fn create_detached_view(&self) -> ApiResult<View> {
        let table = self.borrow().table().cloned().ok_or("No `Table` set")?;
        let view_config = self.with_default_aggregates(&self.effective_view_config());
        Ok(table.view(Some(view_config.into())).await?)
    }

    /// Record a failed pipeline run: error state plus a reconnect affordance
    /// that resets the config (the error screen's reset button). Replaces
    /// the old `validate()` error path — the committed config is NOT rolled
    /// back (I4: it holds exactly what the caller committed; the failure
    /// belongs to the run).
    pub async fn set_run_error(&self, err: ApiError) -> ApiResult<()> {
        let session = self.clone();
        let poll_loop = LocalPollLoop::new(move |()| {
            ApiFuture::spawn(session.reset(ResetOptions {
                config: true,
                expressions: true,
                ..ResetOptions::default()
            }));
            Ok(JsValue::UNDEFINED)
        });

        let error = TableErrorState(
            err.clone(),
            Some(ReconnectCallback::new(move || {
                clone!(poll_loop);
                Box::pin(async move {
                    poll_loop.poll(()).await;
                    Ok(())
                })
            })),
        );

        let state = self.borrow().state.clone();
        self.borrow_mut().rendered = Rendered::Failed(state, error);

        if let Some(cb) = self.on_table_errored.borrow().as_ref() {
            cb.emit(());
        }

        Err(err)
    }

    fn update_stats(&self, stats: ViewStats) {
        self.borrow_mut().stats = Some(stats);
        if let Some(cb) = self.on_stats_changed.borrow().as_ref() {
            cb.emit(());
        }

        self.stats_changed.emit(());
    }

    fn columns_of(metadata: &SessionMetadata) -> Vec<String> {
        metadata
            .get_table_columns()
            .into_iter()
            .flatten()
            .cloned()
            .collect()
    }

    /// Snapshot the current session state as a [`SessionProps`] value suitable
    /// for passing as a Yew prop.  Called by the root component whenever a
    /// session-related PubSub event fires.
    pub fn to_props(&self) -> SessionProps {
        let column_stats = PtrEqRc::new(self.column_stats.borrow().clone());
        let projected = self.projected();
        let title = self.get_title();
        let data = self.borrow();

        // Reuse memoized snapshots when the underlying value hasn't
        // changed. PtrEq identity must be stable across `to_props()`
        // calls triggered by *unrelated* pubsubs (e.g. our own
        // `column_stats_changed`), or downstream effects keyed on
        // these `PtrEqRc`s will spuriously refire.
        let config = {
            let mut cached = self.cached_config.borrow_mut();
            if !matches!(&*cached, Some(c) if **c == *projected) {
                *cached = Some(PtrEqRc::new((*projected).clone()));
            }
            cached.clone().unwrap()
        };
        let metadata = {
            let mut cached = self.cached_metadata.borrow_mut();
            if !matches!(&*cached, Some(m) if **m == **data.metadata()) {
                *cached = Some(PtrEqRc::new((**data.metadata()).clone()));
            }
            cached.clone().unwrap()
        };

        SessionProps {
            config,
            has_table_cells: data
                .stats
                .as_ref()
                .is_some_and(|s| s.num_table_cells.is_some()),
            has_table: if data.table().is_some() {
                Some(TableLoadState::Loaded)
            } else if self.0.queue.has_load() {
                Some(TableLoadState::Loading)
            } else if data.pending_table().is_some() {
                Some(TableLoadState::Pending)
            } else {
                None
            },
            error: data.error().cloned(),
            title,
            metadata,
            column_stats,
        }
    }
}

/// A view-config change that has passed every check — names, normalization and
/// the server's `describe` — and only awaits [`Session::commit_view`].
pub(crate) struct PreparedView {
    binding: PreparedBinding,

    /// A new overlay to commit, when the op broadcasts one.
    overlay: Option<Rc<Vec<OverlayClause>>>,
    config: Rc<ViewConfig>,
    effective: Rc<ViewConfig>,
    description: Option<Rc<Description>>,
    changed: bool,

    /// `false` for a projected UI edit, whose SUBMIT already announced it.
    announce: bool,
}

/// The plugin whose advice fills in what a restore's view config leaves unsaid
/// — computed against the table and config the restore LANDS on.
pub(crate) enum ViewDefaults<'a> {
    /// The restore swaps to this plugin: default its columns and rollup mode.
    Swap(&'a PluginStaticConfig),

    /// The restore stays on this plugin: re-enforce its rollup mode only.
    Rollup(&'a PluginStaticConfig),

    /// The update is complete as given (a UI edit, whose control applied the
    /// plugin's advice when it made it).
    AsGiven,
}

/// What a restore does to the panel's table binding — decided by its caller
/// from the restore's `table` and the panel it lands on, with the incoming
/// table already probed.
pub(crate) enum BindPlan {
    /// The binding stands: bound, awaiting or unbound, as it is.
    Keep,

    /// Bind `table`.
    ///
    /// Boxed: `Table` is a value handle several times the size of every other
    /// variant here.
    Bind {
        client: Client,
        table: Box<perspective_client::Table>,
        reset: bool,
    },

    /// Await a host for `name`.
    Pend {
        client: Client,
        name: String,
        reset: bool,
    },
}

enum PreparedBinding {
    Keep,
    Bind {
        client: Client,
        table: Box<perspective_client::Table>,
        metadata: Rc<SessionMetadata>,
    },
    Pend {
        client: Client,
        name: String,
    },
}

/// What [`Session::commit_view`] leaves for [`Session::finish_binding`].
#[must_use]
pub(crate) struct BindingEffects {
    rebinds: bool,
    outgoing: Option<ViewSubscription>,
    unloaded: bool,
    loaded: bool,
    watch: Option<Client>,
}

impl BindingEffects {
    /// Whether the commit replaced the panel's table binding.
    pub fn rebound(&self) -> bool {
        self.rebinds
    }

    /// Discard the effects of a commit that kept its binding (there are none).
    pub fn forget(self) {}
}

impl PreparedView {
    /// Mark this as a projected UI edit: the UI has shown it since it was
    /// submitted, so committing it announces nothing.
    pub fn projected(mut self) -> Self {
        self.announce = false;
        self
    }

    pub fn config(&self) -> &ViewConfig {
        &self.config
    }

    /// The type each column will have in the `View` this config builds.
    pub fn view_schema(&self) -> Option<&HashMap<String, perspective_client::proto::ColumnType>> {
        self.description.as_ref().map(|x| &x.view_schema)
    }
}

/// One pipeline run's frozen input (invariant I2): the persisted
/// [`ViewConfig`] and its EFFECTIVE companion (global-filter overlay
/// appended), captured at the same synchronous instant inside the draw
/// lock by [`Session::snapshot`].
#[derive(Clone)]
pub struct ConfigSnapshot {
    pub config: Rc<ViewConfig>,
    pub effective: Rc<ViewConfig>,
}

/// Type-state token: proof this snapshot was validated by
/// [`Session::validate_snapshot`], carrying the server's [`Description`] of it.
pub struct ValidatedSnapshot {
    snap: ConfigSnapshot,
}

/// Type-state witness that a `View` is NEW for the plugin about to render
/// it.
pub struct FreshView(View);

impl FreshView {
    /// See the type docs — two minting sites only.
    pub(crate) fn assert_fresh(view: View) -> Self {
        Self(view)
    }

    pub fn view(&self) -> &View {
        &self.0
    }
}

/// How [`Session::bind_view`] reconciled a validated snapshot against the
/// bound render state. Only the `Rebuilt` arm carries a [`FreshView`] — the
/// witness `Renderer::draw_fresh` (the sole `plugin.draw` dispatch)
/// requires — so which runs may FULL-draw is decided here, by type, not by
/// call-site convention.
pub enum BindDisposition {
    /// A new engine `View` was constructed and bound (`view_created`).
    Rebuilt(FreshView),

    /// REUSE: an engine-equivalent snapshot (placeholder-only diff) was
    /// adopted in place — the plugin-visible config changed, the `View`
    /// did not. Repaint via `plugin.update`.
    Adopted(View),

    /// SKIP (or paused-with-a-bound-`View`): the bound `View` already
    /// satisfies the commit. Repaint via `plugin.update` if the caller has
    /// a reason to repaint (today: always, preserving the no-op-commit
    /// repaint idioms — indicator click, toggle-debug, warning-dismiss).
    Unchanged(View),

    /// Nothing to render: paused or deferred-draw (no table yet) with no
    /// bound `View`.
    Deferred,
}

impl BindDisposition {
    /// The bound `View`, whichever way it was reconciled (`None` for
    /// [`Self::Deferred`]) — for building the run's `RenderContext`.
    pub fn view(&self) -> Option<&View> {
        match self {
            Self::Rebuilt(fresh) => Some(fresh.view()),
            Self::Adopted(view) | Self::Unchanged(view) => Some(view),
            Self::Deferred => None,
        }
    }
}
