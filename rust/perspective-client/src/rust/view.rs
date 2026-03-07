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

use std::collections::HashMap;
use std::ops::Deref;
use std::str::FromStr;
use std::sync::Arc;

use futures::Future;
use prost::bytes::Bytes;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use self::view_on_update_req::Mode;
use crate::assert_view_api;
use crate::client::Client;
use crate::proto::request::ClientReq;
use crate::proto::response::ClientResp;
use crate::proto::*;
#[cfg(doc)]
use crate::table::Table;
pub use crate::utils::*;

/// Options for [`View::on_update`].
#[derive(Default, Debug, Deserialize, TS)]
pub struct OnUpdateOptions {
    pub mode: Option<OnUpdateMode>,
}

/// The update mode for [`View::on_update`].
///
/// `Row` mode calculates and provides the update batch new rows/columns as an
/// Apache Arrow to the callback provided to [`View::on_update`]. This allows
/// incremental updates if your callbakc can read this format, but should be
/// disabled otherwise.
#[derive(Default, Debug, Deserialize, TS)]
pub enum OnUpdateMode {
    #[default]
    #[serde(rename = "row")]
    Row,
}

impl FromStr for OnUpdateMode {
    type Err = ClientError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        if s == "row" {
            Ok(OnUpdateMode::Row)
        } else {
            Err(ClientError::Option)
        }
    }
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, TS, PartialEq)]
pub struct ColumnWindow {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_col: Option<f32>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_col: Option<f32>,
}

/// Options for serializing a window of data from a [`View`].
///
/// Some fields of [`ViewWindow`] are only applicable to specific methods of
/// [`View`].
#[derive(Clone, Debug, Default, Deserialize, Serialize, TS, PartialEq)]
pub struct ViewWindow {
    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_row: Option<f64>,

    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_col: Option<f64>,

    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_row: Option<f64>,

    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_col: Option<f64>,

    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<bool>,

    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub index: Option<bool>,

    /// Only impacts [`View::to_csv`]
    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub formatted: Option<bool>,

    /// Only impacts [`View::to_arrow`]
    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub compression: Option<String>,
}

impl From<ViewWindow> for ViewPort {
    fn from(window: ViewWindow) -> Self {
        ViewPort {
            start_row: window.start_row.map(|x| x.floor() as u32),
            start_col: window.start_col.map(|x| x.floor() as u32),
            end_row: window.end_row.map(|x| x.ceil() as u32),
            end_col: window.end_col.map(|x| x.ceil() as u32),
        }
    }
}

impl From<ViewPort> for ViewWindow {
    fn from(window: ViewPort) -> Self {
        ViewWindow {
            start_row: window.start_row.map(|x| x as f64),
            start_col: window.start_col.map(|x| x as f64),
            end_row: window.end_row.map(|x| x as f64),
            end_col: window.end_col.map(|x| x as f64),
            ..ViewWindow::default()
        }
    }
}

/// Rows updated and port ID corresponding to an update batch, provided to the
/// callback argument to [`View::on_update`] with the "rows" mode.
#[derive(TS)]
pub struct OnUpdateData(crate::proto::ViewOnUpdateResp);

impl Deref for OnUpdateData {
    type Target = crate::proto::ViewOnUpdateResp;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

/// The [`View`] struct is Perspective's query and serialization interface. It
/// represents a query on the `Table`'s dataset and is always created from an
/// existing `Table` instance via the [`Table::view`] method.
///
/// [`View`]s are immutable with respect to the arguments provided to the
/// [`Table::view`] method; to change these parameters, you must create a new
/// [`View`] on the same [`Table`]. However, each [`View`] is _live_ with
/// respect to the [`Table`]'s data, and will (within a conflation window)
/// update with the latest state as its parent [`Table`] updates, including
/// incrementally recalculating all aggregates, pivots, filters, etc. [`View`]
/// query parameters are composable, in that each parameter works independently
/// _and_ in conjunction with each other, and there is no limit to the number of
/// pivots, filters, etc. which can be applied.
///
/// To construct a [`View`], call the [`Table::view`] factory method. A
/// [`Table`] can have as many [`View`]s associated with it as you need -
/// Perspective conserves memory by relying on a single [`Table`] to power
/// multiple [`View`]s concurrently.
///
/// # Examples
///
/// ```rust
/// let opts = TableInitOptions::default();
/// let data = TableData::Update(UpdateData::Csv("x,y\n1,2\n3,4".into()));
/// let table = client.table(data, opts).await?;
///
/// let view = table.view(None).await?;
/// let arrow = view.to_arrow().await?;
/// view.delete().await?;
/// ```
///
/// ```rust
/// use crate::config::*;
/// let view = table
///     .view(Some(ViewConfigUpdate {
///         columns: Some(vec![Some("Sales".into())]),
///         aggregates: Some(HashMap::from_iter(vec![("Sales".into(), "sum".into())])),
///         group_by: Some(vec!["Region".into(), "Country".into()]),
///         filter: Some(vec![Filter::new("Category", "in", &[
///             "Furniture",
///             "Technology",
///         ])]),
///         ..ViewConfigUpdate::default()
///     }))
///     .await?;
/// ```
///
///  Group By
///
/// ```rust
/// let view = table
///     .view(Some(ViewConfigUpdate {
///         group_by: Some(vec!["a".into(), "c".into()]),
///         ..ViewConfigUpdate::default()
///     }))
///     .await?;
/// ```
///
/// Split By
///
/// ```rust
/// let view = table
///     .view(Some(ViewConfigUpdate {
///         split_by: Some(vec!["a".into(), "c".into()]),
///         ..ViewConfigUpdate::default()
///     }))
///     .await?;
/// ```
///
/// In Javascript, a [`Table`] can be constructed on a [`Table::view`] instance,
/// which will return a new [`Table`] based on the [`Table::view`]'s dataset,
/// and all future updates that affect the [`Table::view`] will be forwarded to
/// the new [`Table`]. This is particularly useful for implementing a
/// [Client/Server Replicated](server.md#clientserver-replicated) design, by
/// serializing the `View` to an arrow and setting up an `on_update` callback.
///
/// ```rust
/// let opts = TableInitOptions::default();
/// let data = TableData::Update(UpdateData::Csv("x,y\n1,2\n3,4".into()));
/// let table = client.table(data, opts).await?;
/// let view = table.view(None).await?;
/// let table2 = client.table(TableData::View(view)).await?;
/// table.update(data).await?;
/// ```
#[derive(Clone, Debug)]
pub struct View {
    pub name: String,
    client: Client,
}

assert_view_api!(View);

impl View {
    pub fn new(name: String, client: Client) -> Self {
        View { name, client }
    }

    fn client_message(&self, req: ClientReq) -> Request {
        crate::proto::Request {
            msg_id: self.client.gen_id(),
            entity_id: self.name.clone(),
            client_req: Some(req),
        }
    }

    /// Returns an array of strings containing the column paths of the [`View`]
    /// without any of the source columns.
    ///
    /// A column path shows the columns that a given cell belongs to after
    /// pivots are applied.
    pub async fn column_paths(&self, window: ColumnWindow) -> ClientResult<Vec<String>> {
        let msg = self.client_message(ClientReq::ViewColumnPathsReq(ViewColumnPathsReq {
            start_col: window.start_col.map(|x| x as u32),
            end_col: window.end_col.map(|x| x as u32),
        }));

        match self.client.oneshot(&msg).await? {
            ClientResp::ViewColumnPathsResp(ViewColumnPathsResp { paths }) => {
                // Ok(paths.into_iter().map(|x| x.path).collect())
                Ok(paths)
            },
            resp => Err(resp.into()),
        }
    }

    /// Returns this [`View`]'s _dimensions_, row and column count, as well as
    /// those of the [`crate::Table`] from which it was derived.
    ///
    /// - `num_table_rows` - The number of rows in the underlying
    ///   [`crate::Table`].
    /// - `num_table_columns` - The number of columns in the underlying
    ///   [`crate::Table`] (including the `index` column if this
    ///   [`crate::Table`] was constructed with one).
    /// - `num_view_rows` - The number of rows in this [`View`]. If this
    ///   [`View`] has a `group_by` clause, `num_view_rows` will also include
    ///   aggregated rows.
    /// - `num_view_columns` - The number of columns in this [`View`]. If this
    ///   [`View`] has a `split_by` clause, `num_view_columns` will include all
    ///   _column paths_, e.g. the number of `columns` clause times the number
    ///   of `split_by` groups.
    pub async fn dimensions(&self) -> ClientResult<ViewDimensionsResp> {
        let msg = self.client_message(ClientReq::ViewDimensionsReq(ViewDimensionsReq {}));
        match self.client.oneshot(&msg).await? {
            ClientResp::ViewDimensionsResp(resp) => Ok(resp),
            resp => Err(resp.into()),
        }
    }

    /// The expression schema of this [`View`], which contains only the
    /// expressions created on this [`View`]. See [`View::schema`] for
    /// details.
    pub async fn expression_schema(&self) -> ClientResult<HashMap<String, ColumnType>> {
        if self.client.get_features().await?.expressions {
            let msg = self.client_message(ClientReq::ViewExpressionSchemaReq(
                ViewExpressionSchemaReq {},
            ));
            match self.client.oneshot(&msg).await? {
                ClientResp::ViewExpressionSchemaResp(ViewExpressionSchemaResp { schema }) => {
                    Ok(schema
                        .into_iter()
                        .map(|(x, y)| (x, ColumnType::try_from(y).unwrap()))
                        .collect())
                },
                resp => Err(resp.into()),
            }
        } else {
            Ok([].into_iter().collect())
        }
    }

    /// A copy of the [`ViewConfig`] object passed to the [`Table::view`] method
    /// which created this [`View`].
    pub async fn get_config(&self) -> ClientResult<crate::config::ViewConfig> {
        let msg = self.client_message(ClientReq::ViewGetConfigReq(ViewGetConfigReq {}));
        match self.client.oneshot(&msg).await? {
            ClientResp::ViewGetConfigResp(ViewGetConfigResp {
                config: Some(config),
            }) => Ok(config.into()),
            resp => Err(resp.into()),
        }
    }

    /// The number of aggregated rows in this [`View`]. This is affected by the
    /// "group_by" configuration parameter supplied to this view's contructor.
    ///
    /// # Returns
    ///
    /// The number of aggregated rows.
    pub async fn num_rows(&self) -> ClientResult<u32> {
        Ok(self.dimensions().await?.num_view_rows)
    }

    /// The schema of this [`View`].
    ///
    /// The [`View`] schema differs from the `schema` returned by
    /// [`Table::schema`]; it may have different column names due to
    /// `expressions` or `columns` configs, or it maye have _different
    /// column types_ due to the application og `group_by` and `aggregates`
    /// config. You can think of [`Table::schema`] as the _input_ schema and
    /// [`View::schema`] as the _output_ schema of a Perspective pipeline.
    pub async fn schema(&self) -> ClientResult<HashMap<String, ColumnType>> {
        let msg = self.client_message(ClientReq::ViewSchemaReq(ViewSchemaReq {}));
        match self.client.oneshot(&msg).await? {
            ClientResp::ViewSchemaResp(ViewSchemaResp { schema }) => Ok(schema
                .into_iter()
                .map(|(x, y)| (x, ColumnType::try_from(y).unwrap()))
                .collect()),
            resp => Err(resp.into()),
        }
    }

    /// Serializes a [`View`] to the Apache Arrow data format.
    pub async fn to_arrow(&self, window: ViewWindow) -> ClientResult<Bytes> {
        let msg = self.client_message(ClientReq::ViewToArrowReq(ViewToArrowReq {
            viewport: Some(window.clone().into()),
            compression: window.compression,
        }));

        match self.client.oneshot(&msg).await? {
            ClientResp::ViewToArrowResp(ViewToArrowResp { arrow }) => Ok(arrow.into()),
            resp => Err(resp.into()),
        }
    }

    /// Serializes this [`View`] to a string of JSON data. Useful if you want to
    /// save additional round trip serialize/deserialize cycles.    
    pub async fn to_columns_string(&self, window: ViewWindow) -> ClientResult<String> {
        let msg = self.client_message(ClientReq::ViewToColumnsStringReq(ViewToColumnsStringReq {
            viewport: Some(window.clone().into()),
            id: window.id,
            index: window.index,
            formatted: window.formatted,
        }));

        match self.client.oneshot(&msg).await? {
            ClientResp::ViewToColumnsStringResp(ViewToColumnsStringResp { json_string }) => {
                Ok(json_string)
            },
            resp => Err(resp.into()),
        }
    }

    /// Render this `View` as a JSON string.
    pub async fn to_json_string(&self, window: ViewWindow) -> ClientResult<String> {
        let viewport = ViewPort::from(window.clone());
        let msg = self.client_message(ClientReq::ViewToRowsStringReq(ViewToRowsStringReq {
            viewport: Some(viewport),
            id: window.id,
            index: window.index,
            formatted: window.formatted,
        }));

        match self.client.oneshot(&msg).await? {
            ClientResp::ViewToRowsStringResp(ViewToRowsStringResp { json_string }) => {
                Ok(json_string)
            },
            resp => Err(resp.into()),
        }
    }

    /// Renders this [`View`] as an [NDJSON](https://github.com/ndjson/ndjson-spec)
    /// formatted [`String`].
    pub async fn to_ndjson(&self, window: ViewWindow) -> ClientResult<String> {
        let viewport = ViewPort::from(window.clone());
        let msg = self.client_message(ClientReq::ViewToNdjsonStringReq(ViewToNdjsonStringReq {
            viewport: Some(viewport),
            id: window.id,
            index: window.index,
            formatted: window.formatted,
        }));

        match self.client.oneshot(&msg).await? {
            ClientResp::ViewToNdjsonStringResp(ViewToNdjsonStringResp { ndjson_string }) => {
                Ok(ndjson_string)
            },
            resp => Err(resp.into()),
        }
    }

    /// Serializes this [`View`] to CSV data in a standard format.
    pub async fn to_csv(&self, window: ViewWindow) -> ClientResult<String> {
        let msg = self.client_message(ClientReq::ViewToCsvReq(ViewToCsvReq {
            viewport: Some(window.into()),
        }));

        match self.client.oneshot(&msg).await? {
            ClientResp::ViewToCsvResp(ViewToCsvResp { csv }) => Ok(csv),
            resp => Err(resp.into()),
        }
    }

    /// Delete this [`View`] and clean up all resources associated with it.
    /// [`View`] objects do not stop consuming resources or processing
    /// updates when they are garbage collected - you must call this method
    /// to reclaim these.
    pub async fn delete(&self) -> ClientResult<()> {
        let msg = self.client_message(ClientReq::ViewDeleteReq(ViewDeleteReq {}));
        match self.client.oneshot(&msg).await? {
            ClientResp::ViewDeleteResp(_) => Ok(()),
            resp => Err(resp.into()),
        }
    }

    /// Calculates the [min, max] of the leaf nodes of a column `column_name`.
    ///
    /// # Returns
    ///
    /// A tuple of [min, max], whose types are column and aggregate dependent.
    pub async fn get_min_max(&self, column_name: String) -> ClientResult<(String, String)> {
        let msg = self.client_message(ClientReq::ViewGetMinMaxReq(ViewGetMinMaxReq {
            column_name,
        }));

        match self.client.oneshot(&msg).await? {
            ClientResp::ViewGetMinMaxResp(ViewGetMinMaxResp { min, max }) => Ok((min, max)),
            resp => Err(resp.into()),
        }
    }

    /// Register a callback with this [`View`]. Whenever the view's underlying
    /// table emits an update, this callback will be invoked with an object
    /// containing `port_id`, indicating which port the update fired on, and
    /// optionally `delta`, which is the new data that was updated for each
    /// cell or each row.
    ///
    /// # Arguments
    ///
    /// - `on_update` - A callback function invoked on update, which receives an
    ///   object with two keys: `port_id`, indicating which port the update was
    ///   triggered on, and `delta`, whose value is dependent on the mode
    ///   parameter.
    /// - `options` - If this is provided as `OnUpdateOptions { mode:
    ///   Some(OnUpdateMode::Row) }`, then `delta` is an Arrow of the updated
    ///   rows. Otherwise `delta` will be [`Option::None`].
    pub async fn on_update<T, U>(&self, on_update: T, options: OnUpdateOptions) -> ClientResult<u32>
    where
        T: Fn(OnUpdateData) -> U + Send + Sync + 'static,
        U: Future<Output = ()> + Send + 'static,
    {
        let on_update = Arc::new(on_update);
        let callback = move |resp: Response| {
            let on_update = on_update.clone();
            async move {
                match resp.client_resp {
                    Some(ClientResp::ViewOnUpdateResp(resp)) => {
                        on_update(OnUpdateData(resp)).await;
                        Ok(())
                    },
                    resp => Err(resp.into()),
                }
            }
        };

        let msg = self.client_message(ClientReq::ViewOnUpdateReq(ViewOnUpdateReq {
            mode: options.mode.map(|OnUpdateMode::Row| Mode::Row as i32),
        }));

        self.client.subscribe(&msg, callback).await?;
        Ok(msg.msg_id)
    }

    /// Unregister a previously registered update callback with this [`View`].
    ///
    /// # Arguments
    ///
    /// - `id` - A callback `id` as returned by a recipricol call to
    ///   [`View::on_update`].
    ///
    /// # Examples
    ///
    /// ```rust
    /// let callback = |_| async { print!("Updated!") };
    /// let cid = view.on_update(callback, OnUpdateOptions::default()).await?;
    /// view.remove_update(cid).await?;
    /// ```
    pub async fn remove_update(&self, update_id: u32) -> ClientResult<()> {
        let msg = self.client_message(ClientReq::ViewRemoveOnUpdateReq(ViewRemoveOnUpdateReq {
            id: update_id,
        }));

        self.client.unsubscribe(update_id).await?;
        match self.client.oneshot(&msg).await? {
            ClientResp::ViewRemoveOnUpdateResp(_) => Ok(()),
            resp => Err(resp.into()),
        }
    }

    /// Register a callback with this [`View`]. Whenever the [`View`] is
    /// deleted, this callback will be invoked.
    pub async fn on_delete(
        &self,
        on_delete: Box<dyn Fn() + Send + Sync + 'static>,
    ) -> ClientResult<u32> {
        let callback = move |resp: Response| match resp.client_resp.unwrap() {
            ClientResp::ViewOnDeleteResp(_) => {
                on_delete();
                Ok(())
            },
            resp => Err(resp.into()),
        };

        let msg = self.client_message(ClientReq::ViewOnDeleteReq(ViewOnDeleteReq {}));
        self.client.subscribe_once(&msg, Box::new(callback)).await?;
        Ok(msg.msg_id)
    }

    /// Unregister a previously registered [`View::on_delete`] callback.
    pub async fn remove_delete(&self, callback_id: u32) -> ClientResult<()> {
        let msg = self.client_message(ClientReq::ViewRemoveDeleteReq(ViewRemoveDeleteReq {
            id: callback_id,
        }));

        match self.client.oneshot(&msg).await? {
            ClientResp::ViewRemoveDeleteResp(ViewRemoveDeleteResp {}) => Ok(()),
            resp => Err(resp.into()),
        }
    }

    /// Collapses the `group_by` row at `row_index`.
    pub async fn collapse(&self, row_index: u32) -> ClientResult<u32> {
        let msg = self.client_message(ClientReq::ViewCollapseReq(ViewCollapseReq { row_index }));
        match self.client.oneshot(&msg).await? {
            ClientResp::ViewCollapseResp(ViewCollapseResp { num_changed }) => Ok(num_changed),
            resp => Err(resp.into()),
        }
    }

    /// Expand the `group_by` row at `row_index`.
    pub async fn expand(&self, row_index: u32) -> ClientResult<u32> {
        let msg = self.client_message(ClientReq::ViewExpandReq(ViewExpandReq { row_index }));
        match self.client.oneshot(&msg).await? {
            ClientResp::ViewExpandResp(ViewExpandResp { num_changed }) => Ok(num_changed),
            resp => Err(resp.into()),
        }
    }

    /// Set expansion `depth` of the `group_by` tree.
    pub async fn set_depth(&self, depth: u32) -> ClientResult<()> {
        let msg = self.client_message(ClientReq::ViewSetDepthReq(ViewSetDepthReq { depth }));
        match self.client.oneshot(&msg).await? {
            ClientResp::ViewSetDepthResp(_) => Ok(()),
            resp => Err(resp.into()),
        }
    }
}
