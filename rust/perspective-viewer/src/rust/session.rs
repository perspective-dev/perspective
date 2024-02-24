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

mod column_defaults_update;
mod drag_drop_update;
mod metadata;
mod replace_expression_update;
mod view;
mod view_subscription;

use std::cell::{Ref, RefCell};
use std::collections::HashSet;
use std::iter::IntoIterator;
use std::ops::Deref;
use std::rc::Rc;

use perspective::utils::*;
use perspective_client::config::*;
use perspective_client::ViewWindow;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use yew::html::ImplicitClone;
use yew::prelude::*;

use self::metadata::*;
use self::replace_expression_update::*;
use self::view::{OwnedView, PerspectiveOwned};
pub use self::view_subscription::ViewStats;
use self::view_subscription::*;
use crate::dragdrop::*;
use crate::js::plugin::*;
use crate::utils::*;

/// The `Session` struct is the principal interface to the Perspective engine,
/// the `Table` and `View` objects for this viewer, and all associated state
/// including the `ViewConfig`.
#[derive(Clone, Default)]
pub struct Session(Rc<SessionHandle>);

impl ImplicitClone for Session {}

/// Immutable state for `Session`.
#[derive(Default)]
pub struct SessionHandle {
    session_data: RefCell<SessionData>,
    pub table_updated: PubSub<()>,
    pub table_loaded: PubSub<()>,
    pub view_created: PubSub<()>,
    pub view_config_changed: PubSub<()>,
    pub stats_changed: PubSub<()>,
}

/// Mutable state for `Session`.
#[derive(Default)]
pub struct SessionData {
    table: Option<perspective_client::Table>,
    metadata: SessionMetadata,
    config: ViewConfig,
    view_sub: Option<ViewSubscription>,
    stats: Option<ViewStats>,
    is_clean: bool,
    is_paused: bool,
}

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

impl Deref for SessionHandle {
    type Target = RefCell<SessionData>;

    fn deref(&self) -> &Self::Target {
        &self.session_data
    }
}

pub type MetadataRef<'a> = std::cell::Ref<'a, SessionMetadata>;
pub type MetadataMutRef<'a> = std::cell::RefMut<'a, SessionMetadata>;

impl Session {
    pub fn metadata(&self) -> MetadataRef<'_> {
        std::cell::Ref::map(self.borrow(), |x| &x.metadata)
    }

    pub fn metadata_mut(&self) -> MetadataMutRef<'_> {
        std::cell::RefMut::map(self.borrow_mut(), |x| &mut x.metadata)
    }

    /// Reset this `Session`'s `View` state, but preserve the `Table`.
    ///
    /// # Arguments
    /// - `reset_expressions` Whether to reset the `expressions` property.
    pub fn reset(&self, reset_expressions: bool) {
        self.borrow_mut().is_clean = false;
        self.borrow_mut().view_sub = None;
        self.borrow_mut().config.reset(reset_expressions);
    }

    /// Reset this (presumably shared) `Session` to its initial state, returning
    /// a bool indicating whether this `Session` had a table which was
    /// deleted. TODO Table should be an immutable constructor parameter to
    /// `Session`.
    pub fn delete(&self) -> bool {
        self.reset(false);
        self.borrow_mut().metadata = SessionMetadata::default();
        self.borrow_mut().table = None;
        false
    }

    pub fn has_table(&self) -> bool {
        self.borrow().table.is_some()
    }

    pub fn get_table(&self) -> Option<perspective_client::Table> {
        self.borrow().table.clone()
    }

    /// Reset this `Session`'s state with a new `Table`.  Implicitly clears the
    /// `ViewSubscription`, which will need to be re-initialized later via
    /// `create_view()`.
    pub async fn set_table(&self, table: perspective_client::Table) -> ApiResult<JsValue> {
        let metadata = SessionMetadata::from_table(&table).await?;
        self.borrow_mut().view_sub = None;
        self.borrow_mut().metadata = metadata;
        self.borrow_mut().table = Some(table);
        self.table_loaded.emit(());
        Ok(JsValue::UNDEFINED)
    }

    pub fn set_pause(&self, pause: bool) -> bool {
        self.borrow_mut().is_clean = false;
        if pause == self.borrow().is_paused {
            false
        } else if pause {
            self.borrow_mut().view_sub = None;
            self.borrow_mut().is_paused = true;
            true
        } else {
            self.borrow_mut().is_paused = false;
            true
        }
    }

    pub async fn await_table(&self) -> ApiResult<()> {
        if self.js_get_table().is_none() {
            self.table_loaded.listen_once().await?;
            let _ = self.js_get_table().ok_or("No table set")?;
        }

        Ok(())
    }

    pub fn js_get_table(&self) -> Option<JsValue> {
        Some(perspective::JsTable::from(self.borrow().table.clone()?).into())
    }

    pub fn js_get_view(&self) -> Option<JsValue> {
        Some(self.borrow().view_sub.as_ref()?.get_view().as_jsvalue())
    }

    pub fn is_column_expression_in_use(&self, name: &str) -> bool {
        self.borrow().config.is_column_expression_in_use(name)
    }

    pub fn is_column_active(&self, name: &str) -> bool {
        self.borrow().config.columns.iter().any(|maybe_col| {
            maybe_col
                .as_ref()
                .map(|col| col == name)
                .unwrap_or_default()
        })
    }

    pub fn create_drag_drop_update(
        &self,
        column: String,
        index: usize,
        drop: DragTarget,
        drag: DragEffect,
        requirements: &ViewConfigRequirements,
    ) -> ViewConfigUpdate {
        use self::drag_drop_update::*;
        self.get_view_config()
            .create_drag_drop_update(column, index, drop, drag, requirements)
    }

    /// An async task which replaces a `column` aliased expression with another.
    pub async fn create_replace_expression_update(
        &self,
        old_expr_name: &str,
        new_expr: &Expression<'static>,
    ) -> ViewConfigUpdate {
        let old_expr_val = self
            .metadata()
            .get_expression_by_alias(old_expr_name)
            .unwrap();

        let old_expr = Expression::new(Some(old_expr_name.into()), old_expr_val.into());

        use self::replace_expression_update::*;
        self.get_view_config()
            .create_replace_expression_update(&old_expr, new_expr)
    }

    pub async fn create_rename_expression_update(
        &self,
        old_expr_name: String,
        new_expr_name: Option<String>,
    ) -> ViewConfigUpdate {
        let old_expr_val = self
            .metadata()
            .get_expression_by_alias(&old_expr_name)
            .expect_throw(&format!("Unable to get expr with name {old_expr_name}"));
        let old_expr = Expression::new(Some(old_expr_name.into()), old_expr_val.clone().into());
        let new_expr = Expression::new(new_expr_name.map(|n| n.into()), old_expr_val.into());
        self.get_view_config()
            .create_replace_expression_update(&old_expr, &new_expr)
    }

    /// Validate an expression strin and marshall the results.
    pub async fn validate_expr(
        &self,
        expr: &str,
    ) -> Result<Option<perspective_client::ExprValidationError>, ApiError> {
        // let arr = HashMap::from_iter([("_".to_string(), expr.to_string())]);
        let table = self.borrow().table.as_ref().unwrap().clone();
        let errors = table
            .validate_expressions(ExpressionsDeserde::Array(vec![expr.to_string()]).into())
            .await?
            .errors;

        Ok(errors.get("_").cloned())
    }

    pub async fn arrow_as_vec(&self, flat: bool) -> Result<Vec<u8>, ApiError> {
        Ok(self
            .flat_view(flat)
            .await?
            .to_arrow(ViewWindow::default())
            .await?)
    }

    pub async fn arrow_as_jsvalue(self, flat: bool) -> Result<js_sys::ArrayBuffer, ApiError> {
        let arrow = self
            .flat_view(flat)
            .await?
            .to_arrow(ViewWindow::default())
            .await?;

        Ok(js_sys::Uint8Array::from(&arrow[..])
            .buffer()
            .unchecked_into())
    }

    pub async fn json_as_jsvalue(self, flat: bool) -> Result<js_sys::Object, ApiError> {
        let json = self
            .flat_view(flat)
            .await?
            .to_columns_string(ViewWindow::default())
            .await?;

        Ok(js_sys::JSON::parse(&json)?.unchecked_into())
    }

    pub async fn csv_as_jsvalue(&self, flat: bool) -> Result<js_sys::JsString, ApiError> {
        let opts = ViewWindow {
            formatted: Some(true),
            ..ViewWindow::default()
        };

        let csv = self.flat_view(flat).await?.to_csv(opts).await;
        Ok(csv.map(js_sys::JsString::from)?)
    }

    pub fn get_view(&self) -> Option<OwnedView> {
        self.borrow()
            .view_sub
            .as_ref()
            .map(|sub| sub.get_view().clone())
    }

    pub fn get_table_stats(&self) -> Option<ViewStats> {
        self.borrow().stats.clone()
    }

    pub fn get_view_config(&self) -> Ref<ViewConfig> {
        Ref::map(self.borrow(), |x| &x.config)
    }

    /// Get all unique column values for a given column name.
    ///
    /// Use the `.to_csv()` method, as I suspected copying this large string
    /// once was more efficient than copying many smaller strings, and
    /// string copying shows up frequently when doing performance analysis.
    ///
    /// TODO Does not work with expressions yet.
    ///
    /// # Arguments
    /// - `column` The name of the column (or expression).
    pub async fn get_column_values(&self, column: String) -> Result<Vec<String>, ApiError> {
        let expressions = Some(self.borrow().config.expressions.clone());
        let config = ViewConfigUpdate {
            group_by: Some(vec![column]),
            columns: Some(vec![]),
            expressions,
            ..ViewConfigUpdate::default()
        };

        let table = self.borrow().table.clone().unwrap();
        let view = table.view(Some(config.clone())).await?;
        let csv = view.to_csv(ViewWindow::default()).await?;

        ApiFuture::spawn(async move {
            view.delete().await?;
            Ok(())
        });

        let res = csv
            .lines()
            .map(|val| {
                if val.starts_with('\"') && val.ends_with('\"') {
                    (val[1..val.len() - 1]).to_owned()
                } else {
                    val.to_owned()
                }
            })
            .skip(2)
            .collect::<Vec<String>>();
        Ok(res)
    }

    pub fn set_update_column_defaults(
        &self,
        config_update: &mut ViewConfigUpdate,
        requirements: &ViewConfigRequirements,
    ) {
        use self::column_defaults_update::*;
        config_update.set_update_column_defaults(
            &self.metadata(),
            &self.borrow().config.columns,
            requirements,
        )
    }

    /// Update the config, setting the `columns` property to the plugin defaults
    /// if provided.
    pub fn update_view_config(&self, config_update: ViewConfigUpdate) {
        if self.borrow_mut().config.apply_update(config_update) {
            self.borrow_mut().view_sub = None;
            self.0.borrow_mut().is_clean = false;
            self.view_config_changed.emit(());
        }
    }

    pub fn reset_stats(&self) {
        self.update_stats(ViewStats::default());
    }

    #[cfg(test)]
    pub fn set_stats(&self, stats: ViewStats) {
        self.update_stats(stats)
    }

    /// In order to create a new view in this session, the session must first be
    /// validated to create a `ValidSession<'_>` guard.
    pub async fn validate(&self) -> Result<ValidSession<'_>, JsValue> {
        if let Err(err) = self.validate_view_config().await {
            web_sys::console::error_3(
                &"Invalid config, resetting to default".into(),
                &JsValue::from_serde_ext(&self.borrow().config).unwrap(),
                &err.into(),
            );

            self.reset(true);
            self.validate_view_config().await?;
        }

        Ok(ValidSession(self))
    }

    async fn flat_view(&self, flat: bool) -> ApiResult<OwnedView> {
        if flat {
            let table = self.borrow().table.clone().into_apierror()?;
            Ok(table.view(None).await.map(PerspectiveOwned::new)?)
        } else {
            self.borrow()
                .view_sub
                .as_ref()
                .map(|x| x.get_view().clone())
                .into_apierror()
        }
    }

    fn update_stats(&self, stats: ViewStats) {
        self.borrow_mut().stats = Some(stats);
        self.stats_changed.emit(());
    }

    async fn validate_view_config(&self) -> ApiResult<()> {
        let config = self.borrow().config.clone();
        let table_columns = self
            .metadata()
            .get_table_columns()
            .into_iter()
            .flatten()
            .cloned()
            .collect::<Vec<String>>();

        let all_columns: HashSet<String> = table_columns.iter().cloned().collect();

        let mut view_columns: HashSet<&str> = HashSet::new();

        let table = self
            .borrow()
            .table
            .as_ref()
            .ok_or("`restore()` called before `load()`")?
            .clone();

        let valid_recs = table.validate_expressions(config.expressions).await?;
        let expression_names = self.metadata_mut().update_expressions(&valid_recs)?;

        // re-fetch config after `await`; `expressions` and `all_columns` are ok,
        // but `config` may have changed as it is unlocked.
        let mut config = self.borrow().config.clone();

        if config.columns.is_empty() {
            config.columns = table_columns.into_iter().map(Some).collect();
        }

        for column in config.columns.iter().flatten() {
            if all_columns.contains(column) || expression_names.contains(column) {
                let _existed = view_columns.insert(column);
            } else {
                return Err(format!("Unknown \"{}\" in `columns`", column).into());
            }
        }

        for column in config.group_by.iter() {
            if all_columns.contains(column) || expression_names.contains(column) {
                let _existed = view_columns.insert(column);
            } else {
                return Err(format!("Unknown \"{}\" in `group_by`", column).into());
            }
        }

        for column in config.split_by.iter() {
            if all_columns.contains(column) || expression_names.contains(column) {
                let _existed = view_columns.insert(column);
            } else {
                return Err(format!("Unknown \"{}\" in `split_by`", column).into());
            }
        }

        for sort in config.sort.iter() {
            if all_columns.contains(&sort.0) || expression_names.contains(&sort.0) {
                let _existed = view_columns.insert(&sort.0);
            } else {
                return Err(format!("Unknown \"{}\" in `sort`", sort.0).into());
            }
        }

        for filter in config.filter.iter() {
            if all_columns.contains(&filter.0) || expression_names.contains(&filter.0) {
                let _existed = view_columns.insert(&filter.0);
            } else {
                return Err(format!("Unknown \"{}\" in `filter`", &filter.0).into());
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
}

/// A newtype wrapper which only provides `create_view()`
pub struct ValidSession<'a>(&'a Session);

impl<'a> ValidSession<'a> {
    /// Set a new `View` (derived from this `Session`'s `Table`), and create the
    /// `update()` subscription, consuming this `ValidSession<'_>` and returning
    /// the original `&Session`.
    pub async fn create_view(&self) -> Result<&'a Session, ApiError> {
        if !self.0.reset_clean() && !self.0.borrow().is_paused {
            let table = self
                .0
                .borrow()
                .table
                .clone()
                .ok_or("`restore()` called before `load()`")?;

            let view_config = self.0.borrow().config.clone();
            let view = table.view(Some(view_config.into())).await?;
            let view_schema = view.schema().await?;
            self.0.metadata_mut().update_view_schema(&view_schema)?;

            let on_stats = Callback::from({
                let this = self.0.clone();
                move |stats| this.update_stats(stats)
            });

            let sub = {
                let config = self.0.borrow().config.clone();
                let on_update = self.0.table_updated.callback();
                ViewSubscription::new(view, config, on_stats, on_update)
            };

            self.0.borrow_mut().view_sub = Some(sub);
        }

        Ok(self.0)
    }
}

impl<'a> Drop for ValidSession<'a> {
    /// `ValidSession` is a guard for listeners of the `view_created` pubsub
    /// event.
    fn drop(&mut self) {
        self.0.view_created.emit(());
    }
}
