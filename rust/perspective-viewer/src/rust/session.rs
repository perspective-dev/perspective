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

use std::cell::{Ref, RefCell};
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
    pub view_created: PubSub<()>,
    pub view_config_changed: PubSub<()>,
    pub title_changed: PubSub<Option<String>>,

    /// Fires when the user clicks the status indicator while in
    /// [`StatusIconState::Normal`]. `wire_custom_events` is the only
    /// listener and fans this out as the `perspective-status-indicator-click`
    /// `CustomEvent`.
    pub status_indicator_clicked: PubSub<()>,

    /// Per-column numeric stats cache. Populated by the
    /// `fetch_column_abs_max` task and consumed by the schema-query
    /// path so plugins emit gradient defaults without
    /// per-render `View::get_min_max` round trips. Cleared
    /// synchronously inside [`Session::update_view_config`].
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
    old_config: Option<ViewConfig>,
    config: ViewConfig,
    view_sub: Option<ViewSubscription>,
    stats: Option<ViewStats>,
    is_loading: bool,
    is_clean: bool,
    is_paused: bool,
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
        self.borrow_mut().is_clean = false;
        let view = self.0.borrow_mut().view_sub.take();
        let err = self.get_error();
        self.borrow_mut().error = None;
        if options.stats {
            self.update_stats(ViewStats::default());
        }

        if options.config {
            self.borrow_mut().config.reset(options.expressions);
        }

        match options.table {
            Some(TableIntermediateState::Ejected) => {
                self.borrow_mut().is_loading = false;
                self.borrow_mut().table = None;
                self.borrow_mut().metadata = SessionMetadata::default();
            },
            Some(TableIntermediateState::Reloaded) => {
                self.borrow_mut().is_loading = true;
                self.borrow_mut().table = None;
                self.borrow_mut().metadata = SessionMetadata::default();
            },
            _ => {
                self.borrow_mut().is_loading = false;
            },
        };

        let table_unloaded = self.table_unloaded.callback();
        self.borrow_mut().is_clean = false;
        async move {
            let res = view.delete().await;
            if options.table.is_some() {
                table_unloaded.emit(true)
            }

            if let Some(err) = err { Err(err) } else { res }
        }
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
                self.borrow_mut().is_clean = false;
                sub.delete().await?;
                self.table_loaded.emit(());
                Ok(true)
            },
            Err(err) => self.set_error(false, err).await.map(|_| false),
        }
    }

    pub fn update_column_defaults(&self, config_static: &PluginStaticConfig) {
        if self.borrow().config.columns.is_empty() {
            let mut update = ViewConfigUpdate::default();
            self.set_update_column_defaults(&mut update, config_static);
            self.borrow_mut().config.apply_update(update);
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
            self.borrow_mut().metadata = SessionMetadata::default();
            self.borrow_mut().table = None;
        }

        sub.delete().await?;
        Err(err)
    }

    pub fn set_pause(&self, pause: bool) -> bool {
        self.borrow_mut().is_clean = false;
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
            self.borrow_mut().is_clean = false;
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

    /// Snapshot of the [`ViewConfig`] the currently-bound `View` was
    /// constructed from. Returns `None` if no `View` has been created
    /// yet (e.g., the post-`load`/pre-render window, or after a reset).
    ///
    /// Prefer this over [`Self::get_view_config`] when you need a
    /// value consistent with what the active plugin is rendering.
    /// `get_view_config` returns the live config, which is mutated
    /// synchronously by [`Self::update_view_config`] ahead of the next
    /// draw and so may temporarily disagree with the bound `View`.
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

    /// Update the config, setting the `columns` property to the plugin defaults
    /// if provided.
    pub fn update_view_config(&self, config_update: ViewConfigUpdate) -> ApiResult<()> {
        if let Some(x) = self.borrow().error.as_ref() {
            tracing::warn!("Errored state");

            // Load bearing return
            return Err(ApiError::new(x.0.clone()));
        }

        if self.borrow_mut().config.apply_update(config_update) && self.0.borrow().is_clean {
            self.0.borrow_mut().is_clean = false;
            // View config changed → cached stats are stale.
            self.clear_column_stats();
            self.view_config_changed.emit(());
        }

        Ok(())
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

    /// In order to create a new view in this session, the session must first be
    /// validated to create a `ValidSession<'_>` guard.
    pub async fn validate(&self) -> Result<ValidSession<'_>, ApiError> {
        let old = self.borrow_mut().old_config.take();
        let is_diff = match old.as_ref() {
            Some(old) => !old.is_equivalent(&self.borrow().config),
            None => true,
        };

        if let Err(err) = self.validate_view_config().await {
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

            if let Some(config) = old {
                self.borrow_mut().config = config;
            } else {
                self.reset(ResetOptions {
                    config: true,
                    expressions: true,
                    ..ResetOptions::default()
                })
                .await?;
            }

            return Err(err);
        } else {
            let old_config = Some(self.borrow().config.clone());
            self.borrow_mut().old_config = old_config;
        }

        Ok(ValidSession(self, is_diff))
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

    async fn validate_view_config(&self) -> ApiResult<()> {
        let mut config = self.borrow().config.clone();
        let table_columns = self.all_columns();
        let all_columns: HashSet<String> = table_columns.iter().cloned().collect();
        let mut view_columns: HashSet<&str> = HashSet::new();
        let table = self
            .borrow()
            .table
            .as_ref()
            .ok_or_else(|| apierror!(NoTableError))?
            .clone();

        let expression_names = if self.metadata().get_features().unwrap().expressions {
            let valid_recs = table
                .validate_expressions(config.expressions.clone())
                .await?;

            self.metadata_mut().update_expressions(&valid_recs)?
        } else {
            HashSet::default()
        };

        if config.columns.is_empty() {
            config.columns = table_columns.into_iter().map(Some).collect();
        }

        for column in config.columns.iter().flatten() {
            if all_columns.contains(column) || expression_names.contains(column) {
                let _existed = view_columns.insert(column);
            } else {
                return Err(apierror!(InvalidViewerConfigError(
                    "columns",
                    column.to_owned()
                )));
            }
        }

        for column in config.group_by.iter() {
            if all_columns.contains(column) || expression_names.contains(column) {
                let _existed = view_columns.insert(column);
            } else {
                return Err(apierror!(InvalidViewerConfigError(
                    "group_by",
                    column.to_owned(),
                )));
            }
        }

        for column in config.split_by.iter() {
            if all_columns.contains(column) || expression_names.contains(column) {
                let _existed = view_columns.insert(column);
            } else {
                return Err(apierror!(InvalidViewerConfigError(
                    "split_by",
                    column.to_owned(),
                )));
            }
        }

        for sort in config.sort.iter() {
            if all_columns.contains(&sort.0) || expression_names.contains(&sort.0) {
                let _existed = view_columns.insert(&sort.0);
            } else {
                return Err(apierror!(InvalidViewerConfigError(
                    "sort",
                    sort.0.to_owned(),
                )));
            }
        }

        for filter in config.filter.iter() {
            // TODO check filter op
            if all_columns.contains(filter.column()) || expression_names.contains(filter.column()) {
                let _existed = view_columns.insert(filter.column());
            } else {
                return Err(apierror!(InvalidViewerConfigError(
                    "filter",
                    filter.column().to_owned(),
                )));
            }
        }

        config
            .aggregates
            .retain(|column, _| view_columns.contains(column.as_str()));

        self.borrow_mut().config = config;
        Ok(())
    }

    fn reset_clean(&self) -> bool {
        let mut is_clean = true;
        std::mem::swap(&mut is_clean, &mut self.0.borrow_mut().is_clean);
        is_clean
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

/// A newtype wrapper which only provides `create_view()`
pub struct ValidSession<'a>(&'a Session, bool);

impl ValidSession<'_> {
    /// Set a new `View` (derived from this `Session`'s `Table`), and create the
    /// `update()` subscription, consuming this `ValidSession<'_>` and returning
    /// the original `&Session`.
    pub async fn create_view(&self) -> Result<Option<View>, ApiError> {
        if !self.0.reset_clean() && !self.0.borrow().is_paused {
            if !self.1 {
                let config = self.0.borrow().config.clone();
                if let Some(sub) = &mut self.0.borrow_mut().view_sub.as_mut() {
                    sub.update_view_config(Rc::new(config));
                    return Ok(Some(sub.get_view().clone()));
                }
            }

            let table = self
                .0
                .borrow()
                .table
                .clone()
                .ok_or("`restore()` called before `load()`")?;

            let mut view_config = self.0.borrow().config.clone();

            // Populate the aggreagtes with defaults as a courtesy to the
            // virtual server api.
            for col in view_config
                .columns
                .iter()
                .flatten()
                .chain(view_config.sort.iter().map(|x| &x.0))
            {
                if !view_config.aggregates.contains_key(col.as_str()) {
                    let agg = self
                        .0
                        .metadata()
                        .get_column_aggregates(col.as_str())
                        .and_then(|mut aggs| aggs.next())
                        .into_apierror();

                    match agg {
                        Err(_) => tracing::warn!(
                            "No default aggregate for column '{}' found, skipping",
                            col
                        ),
                        Ok(agg) => _ = view_config.aggregates.insert(col.to_string(), agg),
                    };
                }
            }

            let view = table.view(Some(view_config.into())).await?;
            let view_schema = view.schema().await?;
            self.0.metadata_mut().update_view_schema(&view_schema)?;
            let on_stats = Callback::from({
                let this = self.0.clone();
                move |stats| this.update_stats(stats)
            });

            let sub = {
                let config = self.0.borrow().config.clone();
                let on_update = self
                    .0
                    .metadata()
                    .get_features()
                    .unwrap()
                    .on_update
                    .then(|| self.0.table_updated.callback());

                ViewSubscription::new(view, config, on_stats, on_update).await?
            };

            let view = self.0.borrow_mut().view_sub.take();
            ApiFuture::spawn(view.delete());
            self.0.borrow_mut().view_sub = Some(sub);
        }

        Ok(self.0.get_view())
    }
}

impl Drop for ValidSession<'_> {
    /// `ValidSession` is a guard for listeners of the `view_created` pubsub
    /// event.
    fn drop(&mut self) {
        self.0.view_created.emit(());
    }
}
