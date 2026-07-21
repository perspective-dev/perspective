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
mod props;
pub(crate) mod replace_expression_update;
mod view_subscription;

use std::cell::{Cell, Ref, RefCell};
use std::collections::{HashMap, HashSet};
use std::future::Future;
use std::ops::Deref;
use std::rc::Rc;

use perspective_client::config::*;
use perspective_client::{Client, ClientError, ReconnectCallback, View};
use perspective_js::apierror;
use perspective_js::utils::*;
use wasm_bindgen::prelude::*;
use yew::html::ImplicitClone;
use yew::prelude::*;

use self::metadata::*;
pub use self::metadata::{MetadataRef, SessionMetadata, SessionMetadataRc};
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

    /// Fires when a `View` was CREATED — literally: `bind_view`'s REBUILD
    /// path constructed and bound a new engine `View`. Nothing else may
    /// emit this (a SKIP/REUSE/paused reconcile is [`Self::commit_reconciled`],
    /// which REBUILD also emits) — overloading it broke consumers that
    /// relied on the name's meaning (see `UPDATE_COUNT_REGRESSION_PLAN.md`).
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

    /// Count of in-flight CONFIG-DRIVEN pipeline runs (commit → run
    /// settled), incremented by [`Session::begin_config_run`] and
    /// decremented when the returned [`ConfigRunToken`] drops. Drives the
    /// `StatusIndicator` "updating" spinner via [`Self::run_state_changed`].
    /// Pure redraws (resize, activation nudges, `just_render`) do NOT
    /// count — the spinner means "a config requery is in flight".
    in_flight_config_runs: Cell<u32>,

    /// Fires with the ABSOLUTE [`Self::in_flight_config_runs`] count after
    /// every change. LEVEL-triggered by design: subscribers ASSIGN the
    /// payload rather than accumulate deltas, so a dropped or reordered
    /// notification is corrected by the next one — the delta-counting
    /// (`view_config_changed`+1 / `view_created`−1) design this replaces
    /// drifted whenever those streams weren't perfectly paired (see
    /// `UPDATE_COUNT_REGRESSION_PLAN.md`).
    pub run_state_changed: PubSub<u32>,

    /// Fires when the user clicks the status indicator while in
    /// [`StatusIconState::Normal`]. `wire_panel_events` is the only
    /// listener and fans this out as the `perspective-status-indicator-click`
    /// `CustomEvent`.
    pub status_indicator_clicked: PubSub<()>,

    /// Per-column numeric stats cache. Populated by the
    /// `fetch_column_abs_max` task and consumed by the schema-query
    /// path so plugins emit gradient defaults without
    /// per-render `View::get_min_max` round trips. Cleared
    /// synchronously inside [`Session::commit_view_config`].
    column_stats: RefCell<HashMap<String, ColumnStats>>,

    /// Memoized snapshots used by [`Session::to_props`] to keep
    /// `PtrEqRc` identity stable across repeated `to_props()` calls
    /// when the underlying value hasn't changed. Without this, every
    /// `PubSub` fire (including `column_stats_changed`) produces a
    /// fresh `Rc` for `config` / `metadata`, triggering downstream
    /// `use_effect_with(view_config, ...)` effects to spuriously
    /// refire — closing a loop with the stats fetch path.
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

    /// Monotone load counter, bumped once per `load()` call
    /// ([`Session::begin_pending_load`]). Identifies the LATEST load so a
    /// stale async classification — React binds `load` to a prop and fires it
    /// repeatedly, unawaited and out of order — no-ops instead of clobbering a
    /// newer load ([`Session::is_current_load`]).
    load_generation: Cell<u32>,

    /// Open between a `load()` call and its payload's classification as
    /// `Table`/`Client` ([`PendingLoad`]). While `Some` the payload type is
    /// unknown, so its RESET/no-RESET disposition cannot be decided yet — but
    /// the window's POSITION on the config-commit stream is fixed at the
    /// `load()` call site. During the window, config commits still apply live
    /// (so `save()` stays coherent — I1) but ALSO append their raw delta to
    /// the journal, and config-driven binds DEFER ([`Session::snapshot`]'s
    /// caller [`crate::tasks::bind_snapshot`]) — the incoming config must
    /// never draw against the still-bound outgoing table (hold the last
    /// frame). Classified as `Table` the journal replays over a reset base
    /// (`reset ∘ Δ₁ ∘ Δ₂ …`, the program-order result the old synchronous
    /// reset guaranteed); as `Client` it is dropped (no reset — live already
    /// carries every Δ). See `SESSION_CONFIG_COHERENCE_PLAN.md`.
    pending_load: RefCell<Option<PendingLoad>>,

    /// Coalesces `view_config_changed`: multiple synchronous commits in one
    /// task emit ONE event on the next microtask — the cadence the deleted
    /// `is_clean` flag provided by accident, now deliberate.
    config_event_scheduled: Cell<bool>,

    /// Count of in-flight `perspective-config-update` dispatch tasks for this
    /// panel (see [`Session::track_dispatch`]). `flush()` joins these via
    /// [`Session::settle_dispatches`], so the "config-update fires before
    /// `flush()` resolves" contract holds by construction instead of by
    /// microtask luck.
    pending_dispatches: Cell<u32>,

    /// Fires when [`SessionHandle::pending_dispatches`] returns to zero.
    dispatches_settled: PubSub<()>,

    /// Fires when [`SessionHandle::column_stats`] is updated (insert or
    /// clear). Subscribers re-render and re-query the schema with the
    /// new value.
    pub column_stats_changed: PubSub<()>,

    /// Injected callback from the root component, replacing the former
    /// `stats_changed: PubSub` field.  Fires when view stats are updated.
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

/// Mutable state for `Session`.
#[derive(Default)]
pub struct SessionData {
    client: Option<perspective_client::Client>,
    table: Option<perspective_client::Table>,
    metadata: SessionMetadata,
    config: ViewConfig,
    global_filter: Vec<Filter>,
    view_sub: Option<ViewSubscription>,
    stats: Option<ViewStats>,
    is_loading: bool,
    is_paused: bool,

    /// Memo for [`Session::validate_snapshot`]: the expression set validated
    /// by the last successful server round trip; an equal snapshot skips the
    /// round trip. Written only under the draw lock; cleared on table
    /// (re)bind and expression reset.
    last_validated_expressions: Option<Expressions>,
    error: Option<TableErrorState>,
    title: Option<String>,
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

#[derive(Debug, Default)]
pub enum TableIntermediateState {
    #[default]
    Ejected,
    Reloaded,
}

/// The open-load window state (see [`SessionHandle::pending_load`]): the
/// generation that opened it (for supersession detection) and the raw config
/// deltas committed while it was open, in commit order, awaiting replay over a
/// reset base if the payload classifies as a `Table`.
pub struct PendingLoad {
    generation: u32,
    journal: Vec<ViewConfigUpdate>,
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

/// RAII spinner accounting for one config-driven pipeline run (see
/// [`Session::begin_config_run`] and `UPDATE_COUNT_REGRESSION_PLAN.md`):
/// created when the run is scheduled — immediately after its commit — and
/// moved INTO the run future, so `Drop` settles the count on every exit
/// path: completion, error, cancellation, and runs that never reach
/// `bind_view` (the deferred-draw restore). A stranded count is
/// unrepresentable; there is no other writer.
pub struct ConfigRunToken(Session);

impl Drop for ConfigRunToken {
    fn drop(&mut self) {
        let count = self.0.0.in_flight_config_runs.get();
        debug_assert!(count > 0, "ConfigRunToken underflow");
        let count = count.saturating_sub(1);
        self.0.0.in_flight_config_runs.set(count);
        self.0.run_state_changed.emit(count);
    }
}

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

    pub(crate) fn metadata(&self) -> MetadataRef<'_> {
        std::cell::Ref::map(self.borrow(), |x| &x.metadata)
    }

    pub(crate) fn metadata_mut(&self) -> MetadataMutRef<'_> {
        std::cell::RefMut::map(self.borrow_mut(), |x| &mut x.metadata)
    }

    pub(crate) fn get_title(&self) -> Option<String> {
        self.borrow().title.clone()
    }

    pub fn set_title(&self, title: Option<String>) {
        let new_title = title.filter(|x| !x.is_empty());
        self.borrow_mut().title.clone_from(&new_title);
        self.title_changed.emit(new_title);
    }

    /// Reset this (presumably shared) `Session` to its initial state, returning
    /// a bool indicating whether this `Session` had a table which was
    /// deleted. TODO Table should be an immutable constructor parameter to
    /// `Session`.
    pub fn reset(&self, options: ResetOptions) -> impl Future<Output = ApiResult<()>> + use<> {
        let view = self.0.borrow_mut().view_sub.take();
        let err = self.get_error();
        self.borrow_mut().error = None;
        if options.stats {
            self.update_stats(ViewStats::default());
        }

        if options.config {
            self.borrow_mut().config.reset(options.expressions);
        }

        if options.expressions {
            self.borrow_mut().last_validated_expressions = None;
        }

        match options.table {
            Some(TableIntermediateState::Ejected) => {
                self.borrow_mut().is_loading = false;
                self.borrow_mut().table = None;
            },
            Some(TableIntermediateState::Reloaded) => {
                self.borrow_mut().is_loading = true;
                self.borrow_mut().table = None;
            },
            _ => {
                self.borrow_mut().is_loading = false;
            },
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
            if options.table.is_some() {
                session.table_unloaded.emit(true)
            }

            if let Some(err) = err { Err(err) } else { res }
        }
    }

    /// Open a pending-load window (see [`SessionHandle::pending_load`]) at the
    /// `load()` call site. Bumps the load generation and returns it — the
    /// caller carries it into the async classification to detect supersession
    /// by a later `load()`. Sets `is_loading` so a FRESH panel shows the
    /// spinner while a slow payload resolves (a RELOAD keeps its bound table,
    /// hence [`TableLoadState::Loaded`], throughout — no spinner flicker).
    pub fn begin_pending_load(&self) -> u32 {
        let generation = self.0.load_generation.get() + 1;
        self.0.load_generation.set(generation);
        *self.0.pending_load.borrow_mut() = Some(PendingLoad {
            generation,
            journal: Vec::new(),
        });
        self.borrow_mut().is_loading = true;
        generation
    }

    /// Whether a `load()` payload is still awaiting classification. A `true`
    /// value makes every config-driven bind DEFER
    /// ([`crate::tasks::bind_snapshot`]) — the incoming config must never draw
    /// against the outgoing table.
    pub fn has_pending_load(&self) -> bool {
        self.0.pending_load.borrow().is_some()
    }

    /// Close the pending-load window for `generation`, returning its journal
    /// (the raw deltas committed while it was open, in order) for replay.
    /// Returns `None` when a later `load()` already superseded this one (or it
    /// was already closed), which the caller treats as "abandon this
    /// classification, hold the frame". Clears `is_loading` — the
    /// classification that follows sets the real table state.
    pub fn take_pending_load(&self, generation: u32) -> Option<Vec<ViewConfigUpdate>> {
        let mut slot = self.0.pending_load.borrow_mut();
        if slot.as_ref().map(|p| p.generation) != Some(generation) {
            return None;
        }

        let journal = slot.take().map(|p| p.journal);
        drop(slot);
        self.borrow_mut().is_loading = false;
        journal
    }

    pub(crate) fn has_table(&self) -> Option<TableLoadState> {
        let data = self.borrow();
        if data.table.is_some() {
            Some(TableLoadState::Loaded)
        } else if data.is_loading {
            Some(TableLoadState::Loading)
        } else {
            None
        }
    }

    pub fn get_table(&self) -> Option<perspective_client::Table> {
        self.borrow().table.clone()
    }

    pub fn set_client(&self, client: Client) -> bool {
        if Some(&client) != self.borrow().client.as_ref() {
            self.borrow_mut().client = Some(client);
            self.borrow_mut().table = None;
            true
        } else {
            false
        }
    }

    pub fn get_client(&self) -> Option<Client> {
        self.borrow().client.clone()
    }

    /// Reset this `Session`'s state with a new `Table`.  Implicitly clears the
    /// `ViewSubscription`, which will need to be re-initialized later via
    /// `create_view()`.
    ///
    /// # Arguments
    ///
    /// - `table_name` The name of the `Table` to load, which must exist on the
    ///   loaded `Client`.
    ///
    /// # Returns
    ///
    /// `table_name` is unique per `Client`, so if this value has not changed,
    /// `Session::set_table` does nothing and returns `Ok(false)`.
    pub async fn set_table(&self, table_name: String) -> ApiResult<bool> {
        if Some(table_name.as_str()) == self.0.borrow().table.as_ref().map(|x| x.get_name()) {
            return Ok(false);
        }

        let client = self.0.borrow().client.clone().into_apierror()?;
        let table = client.open_table(table_name.clone()).await?;
        match SessionMetadata::from_table(&table).await {
            Ok(metadata) => {
                let client = table.get_client();
                let on_error = self.on_table_errored.borrow().clone();
                let session = self.clone();
                let poll_loop = LocalPollLoop::new(move |(message, reconnect): (ApiError, _)| {
                    session.borrow_mut().error = Some(TableErrorState(message, reconnect));
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

                let sub = self.borrow_mut().view_sub.take();
                self.borrow_mut().metadata = metadata;
                self.borrow_mut().table = Some(table);
                self.borrow_mut().is_loading = false;
                self.borrow_mut().last_validated_expressions = None;
                sub.delete().await?;
                self.table_loaded.emit(());
                Ok(true)
            },
            Err(err) => self.set_error(false, err).await.map(|_| false),
        }
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

        self.borrow_mut().error = Some(TableErrorState(
            err.clone(),
            Some(ReconnectCallback::new(move || {
                clone!(poll_loop);
                Box::pin(async move {
                    poll_loop.poll(()).await;
                    Ok(())
                })
            })),
        ));

        if let Some(cb) = self.on_table_errored.borrow().as_ref() {
            cb.emit(());
        }

        let sub = self.borrow_mut().view_sub.take();
        if reset_table {
            self.borrow_mut().table = None;
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
        Some(perspective_js::Table::from(self.borrow().table.clone()?).into())
    }

    pub(crate) fn is_errored(&self) -> bool {
        self.borrow().error.is_some()
    }

    pub(crate) fn get_error(&self) -> Option<ApiError> {
        self.borrow().error.as_ref().map(|x| x.0.clone())
    }

    pub async fn reconnect(&self) -> ApiResult<()> {
        let err = self.borrow().error.clone();
        if let Some(TableErrorState(_, Some(reconnect))) = err {
            reconnect().await?;
            self.borrow_mut().is_loading = false;
            self.borrow_mut().error = None;
            self.borrow_mut().last_validated_expressions = None;
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

    pub(crate) fn get_table_stats(&self) -> Option<ViewStats> {
        self.borrow().stats.clone()
    }

    pub fn get_view_config(&'_ self) -> Ref<'_, ViewConfig> {
        Ref::map(self.borrow(), |x| &x.config)
    }

    /// The effective [`ViewConfig`] the `View` is built from: the stored config
    /// with the transient element-level [`SessionData::global_filter`] clauses
    /// appended. Used at view-creation only; the stored `config` (hence
    /// `savePanel`/the settings UI) is unaffected.
    fn effective_view_config(&self) -> ViewConfig {
        let data = self.borrow();
        if data.global_filter.is_empty() {
            return data.config.clone();
        }

        let mut config = data.config.clone();
        config.filter.extend(data.global_filter.iter().cloned());
        config
    }

    /// Replace the transient element-level global filters and re-render the
    /// view (no-op if unchanged). These are applied on top of the panel's
    /// own config at view-creation but never persisted into it.
    pub fn set_global_filter(&self, filter: Vec<Filter>) -> bool {
        if self.borrow().global_filter != filter {
            self.borrow_mut().global_filter = filter;
            self.notify_view_config_changed();
            true
        } else {
            false
        }
    }

    /// Snapshot of the [`ViewConfig`] the currently-bound `View` was
    /// constructed from. Returns `None` if no `View` has been created
    /// yet (e.g., the post-`load`/pre-render window, or after a reset).
    ///
    /// Prefer this over [`Self::get_view_config`] when you need a
    /// value consistent with what the active plugin is rendering.
    /// `get_view_config` returns the live config, which is mutated
    /// synchronously by [`Self::commit_view_config`] ahead of the next
    /// queued run and so may temporarily disagree with the bound `View`.
    pub fn get_rendered_view_config(&self) -> Option<Rc<ViewConfig>> {
        self.borrow().view_sub.as_ref().map(|s| s.get_view_config())
    }

    pub fn set_update_column_defaults(
        &self,
        config_update: &mut ViewConfigUpdate,
        config_static: &PluginStaticConfig,
    ) {
        use self::column_defaults_update::*;
        config_update.set_update_column_defaults(
            &self.metadata(),
            &self.get_view_config().columns,
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
        config_update.set_update_rollup_defaults(&self.metadata(), config_static)
    }

    /// Apply a `ViewConfigUpdate` to the live config — the ONLY view-config
    /// mutator (invariant I1: synchronous and total; no `await` separates any
    /// read of the config from this write, so a lost update is
    /// unrepresentable).
    ///
    /// Validation is SYNCHRONOUS and happens before anything is applied: an
    /// update naming an unknown column is rejected with `Err` and the config
    /// is untouched (I4 — invalid state is never entered, so no rollback
    /// path exists). Server-side expression compilation is deliberately NOT
    /// checked here; it is a property of a pipeline run
    /// ([`Self::validate_snapshot`]) and fails that run, never the commit.
    pub fn commit_view_config(&self, config_update: ViewConfigUpdate) -> ApiResult<()> {
        if let Some(x) = self.borrow().error.as_ref() {
            tracing::warn!("Errored state");

            // Load bearing return
            return Err(ApiError::new(x.0.clone()));
        }

        // A `load()` is classifying its payload (see
        // [`SessionHandle::pending_load`]): record the RAW delta so a `Table`
        // classification can replay it over the reset base, validated against
        // the INCOMING table's schema. The live apply below is a best-effort
        // preview (kept for `save()` coherence, I1) that SKIPS name validation
        // — the delta may legitimately name the incoming table's columns,
        // absent from the outgoing one — mirroring the "no table bound yet"
        // leniency already in `validate_names`. Authoritative validation is
        // deferred to the replay.
        let pending = self.has_pending_load();
        let mut candidate = self.borrow().config.clone();
        let journal_entry = pending.then(|| config_update.clone());
        if !candidate.apply_update(config_update) {
            return Ok(());
        }

        if let Some(entry) = journal_entry
            && let Some(p) = self.0.pending_load.borrow_mut().as_mut()
        {
            p.journal.push(entry);
        }

        if !pending {
            self.validate_names(&candidate)?;
        }

        self.normalize_view_config(&mut candidate);
        self.borrow_mut().config = candidate;
        self.notify_view_config_changed();
        Ok(())
    }

    /// Table-bind commit: normalize the (possibly empty) config against the
    /// newly-bound table's metadata — the default-view materialization that
    /// previously happened inside the async validate write-back. SYNC;
    /// called immediately after `set_table().await` inside the binding run,
    /// so it is ordered like any other commit.
    pub fn commit_table_defaults(&self) {
        let mut candidate = self.borrow().config.clone();
        self.normalize_view_config(&mut candidate);
        if candidate != self.borrow().config {
            self.borrow_mut().config = candidate;
            self.notify_view_config_changed();
        }
    }

    /// SYNC name validation for a candidate config (I4): every referenced
    /// column must be a table column or an expression present in the
    /// candidate itself (syntactic presence — server-side compilability is a
    /// run property, not a commit property). Skipped when no table is bound
    /// yet: the config rides along until `load()` binds one, and the engine
    /// surfaces any residual error on that run.
    fn validate_names(&self, config: &ViewConfig) -> ApiResult<()> {
        let table_columns = self.all_columns();
        if table_columns.is_empty() {
            return Ok(());
        }

        let mut allowed: HashSet<&str> = table_columns.iter().map(|x| x.as_str()).collect();
        allowed.extend(config.expressions.0.keys().map(|x| x.as_str()));
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
        let table_columns = self.all_columns();
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
        self.0
            .pending_dispatches
            .set(self.0.pending_dispatches.get() + 1);
        let session = self.clone();
        ApiFuture::spawn(async move {
            let result = fut.await;
            let remaining = session.0.pending_dispatches.get() - 1;
            session.0.pending_dispatches.set(remaining);
            if remaining == 0 {
                session.0.dispatches_settled.emit(());
            }

            if let Err(e) = result {
                tracing::error!("[config-update dispatch] {}", e);
            }

            Ok(())
        });
    }

    /// Resolve once every in-flight tracked dispatch for this panel has
    /// landed. Immediate when none are pending.
    pub async fn settle_dispatches(&self) -> ApiResult<()> {
        while self.0.pending_dispatches.get() > 0 {
            self.0.dispatches_settled.read_next().await?;
        }

        Ok(())
    }

    /// Emit `view_config_changed` coalesced to one event per microtask batch.
    /// Stats are cleared synchronously per commit (idempotent — an
    /// already-empty cache no-ops, so rapid commit sequences fetch once).
    ///
    /// CONTRACT: this channel is COALESCED and DEFERRED — N same-batch
    /// commits produce ONE emission, on a microtask AFTER the mutation.
    /// Subscribers must be batch-tolerant snapshot refreshers (they re-read
    /// live state; today: the root `SessionProps` snapshot and the debug
    /// panel). It is NOT suitable for per-commit accounting — pairing its
    /// edges against any other event stream WILL drift (the stuck-spinner
    /// regression, `UPDATE_COUNT_REGRESSION_PLAN.md`); run accounting is
    /// [`Self::begin_config_run`]'s RAII token instead.
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
    /// immediately after the run's commit, and move the returned token INTO
    /// the run future. `Drop` settles it on every exit — completion, error,
    /// cancellation, and runs that never reach `bind_view` (the
    /// deferred-draw restore) — so, unlike edge-counting PubSub pairs, the
    /// count cannot strand by construction.
    /// [`SessionHandle::run_state_changed`] broadcasts the ABSOLUTE count
    /// on both edges.
    pub fn begin_config_run(&self) -> ConfigRunToken {
        let count = self.0.in_flight_config_runs.get() + 1;
        self.0.in_flight_config_runs.set(count);
        self.run_state_changed.emit(count);
        ConfigRunToken(self.clone())
    }

    /// The number of config-driven pipeline runs currently in flight (see
    /// [`Self::begin_config_run`]). Read directly when (re)targeting a
    /// panel — level-triggered consumers initialize from this and then
    /// track [`SessionHandle::run_state_changed`].
    pub fn in_flight_config_runs(&self) -> u32 {
        self.0.in_flight_config_runs.get()
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
            config: Rc::new(self.borrow().config.clone()),
            effective: Rc::new(self.effective_view_config()),
        }
    }

    /// Validate a snapshot's expressions against the server (the only
    /// inherently-async validation), updating the metadata expression
    /// schema. Reads nothing from — and writes nothing to — the live
    /// config; a failure fails this RUN, never the committed config (I4).
    ///
    /// Memoized: when the snapshot's expressions equal the last successfully
    /// validated set, the round trip is skipped entirely — safe because the
    /// memo key is an immutable snapshot field and the recorded set is
    /// written only under the draw lock.
    pub async fn validate_snapshot(
        &self,
        _guard: &RenderGuard,
        snap: ConfigSnapshot,
    ) -> ApiResult<ValidatedSnapshot> {
        let memo_hit =
            self.borrow().last_validated_expressions.as_ref() == Some(&snap.effective.expressions);
        if !memo_hit {
            let supports_expressions = self
                .metadata()
                .get_features()
                .map(|x| x.expressions)
                .unwrap_or_default();

            if supports_expressions {
                let table = self
                    .borrow()
                    .table
                    .as_ref()
                    .ok_or_else(|| apierror!(NoTableError))?
                    .clone();

                let valid_recs = table
                    .validate_expressions(snap.effective.expressions.clone())
                    .await?;

                self.metadata_mut().update_expressions(&valid_recs)?;
            }

            self.borrow_mut().last_validated_expressions = Some(snap.effective.expressions.clone());
        }

        Ok(ValidatedSnapshot(snap))
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

        let ConfigSnapshot { config, effective } = validated.0;
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

        let needs_schema = !self.metadata().has_view_schema();
        if !needs_schema {
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
            .table
            .clone()
            .ok_or("`restore()` called before `load()`")?;

        // Populate the aggregates with defaults as a courtesy to the
        // virtual server api. Snapshot-local — never written back.
        let mut view_config = (*effective).clone();
        for col in view_config
            .columns
            .iter()
            .flatten()
            .chain(view_config.sort.iter().map(|x| &x.0))
        {
            if !view_config.aggregates.contains_key(col.as_str()) {
                let agg = self
                    .metadata()
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

        let view = table.view(Some(view_config.into())).await?;
        let view_schema = view.schema().await?;
        self.metadata_mut().update_view_schema(&view_schema)?;
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
        // REBUILD: a `View` was genuinely constructed and bound — the one
        // place `view_created` may fire, and the one place the `FreshView`
        // full-draw witness is minted from a rebuild.
        self.view_created.emit(());
        self.commit_reconciled.emit(());
        match self.get_view() {
            Some(view) => Ok(BindDisposition::Rebuilt(FreshView::assert_fresh(view))),
            None => Ok(BindDisposition::Deferred),
        }
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

        self.borrow_mut().error = Some(TableErrorState(
            err.clone(),
            Some(ReconnectCallback::new(move || {
                clone!(poll_loop);
                Box::pin(async move {
                    poll_loop.poll(()).await;
                    Ok(())
                })
            })),
        ));

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
    }

    fn all_columns(&self) -> Vec<String> {
        self.metadata()
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
        let data = self.borrow();

        // Reuse memoized snapshots when the underlying value hasn't
        // changed. PtrEq identity must be stable across `to_props()`
        // calls triggered by *unrelated* pubsubs (e.g. our own
        // `column_stats_changed`), or downstream effects keyed on
        // these `PtrEqRc`s will spuriously refire.
        let config = {
            let mut cached = self.cached_config.borrow_mut();
            if !matches!(&*cached, Some(c) if **c == data.config) {
                *cached = Some(PtrEqRc::new(data.config.clone()));
            }
            cached.clone().unwrap()
        };
        let metadata = {
            let mut cached = self.cached_metadata.borrow_mut();
            if !matches!(&*cached, Some(m) if **m == data.metadata) {
                *cached = Some(PtrEqRc::new(data.metadata.clone()));
            }
            cached.clone().unwrap()
        };

        SessionProps {
            config,
            stats: data.stats.clone(),
            has_table: if data.table.is_some() {
                Some(TableLoadState::Loaded)
            } else if data.is_loading {
                Some(TableLoadState::Loading)
            } else {
                None
            },
            error: data.error.clone(),
            title: data.title.clone(),
            metadata,
            column_stats,
        }
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

/// Type-state token: proof this snapshot's expressions were validated by
/// [`Session::validate_snapshot`]. [`Session::bind_view`] accepts only this
/// token, so a `View` can never be built from an unvalidated snapshot.
pub struct ValidatedSnapshot(ConfigSnapshot);

/// Type-state witness that a `View` is NEW for the plugin about to render
/// it — `plugin.draw()`'s contract (see `PLUGIN_DRAW_INVARIANT_PLAN.md`:
/// `draw` fires iff there is a new `View`, never otherwise). Minted in
/// exactly two places: [`Session::bind_view`]'s REBUILD arm (a new engine
/// `View` was constructed) and
/// [`crate::renderer::Renderer::promote_first_paint`] (a freshly-selected
/// plugin owes its first paint of the bound `View`). Do NOT construct it
/// anywhere else — `Renderer::draw_fresh` is the only consumer, and this
/// witness is what makes "full draw without a new `View`" (the stacked-chart
/// activation regression) uncompilable.
pub struct FreshView(View);

impl FreshView {
    /// See the type docs — two minting sites only.
    pub(crate) fn assert_fresh(view: View) -> Self {
        Self(view)
    }

    pub fn view(&self) -> &View {
        &self.0
    }

    pub fn into_view(self) -> View {
        self.0
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
