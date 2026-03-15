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
use std::fmt::Display;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::assert_table_api;
use crate::client::{Client, Features};
use crate::config::{Expressions, ViewConfigUpdate};
use crate::proto::make_table_req::MakeTableOptions;
use crate::proto::make_table_req::make_table_options::MakeTableType;
use crate::proto::request::ClientReq;
use crate::proto::response::ClientResp;
use crate::proto::*;
use crate::table_data::UpdateData;
use crate::utils::*;
use crate::view::View;

pub type Schema = HashMap<String, ColumnType>;

/// The format to interpret data preovided to [`Client::table`].
///
/// When serialized, these values are `"csv"`, `"json"`, `"columns"`, `"arrow"`
/// and `"ndjson"`.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, TS)]
pub enum TableReadFormat {
    #[serde(rename = "csv")]
    Csv,

    #[serde(rename = "json")]
    JsonString,

    #[serde(rename = "columns")]
    ColumnsString,

    #[serde(rename = "arrow")]
    Arrow,

    #[serde(rename = "ndjson")]
    Ndjson,
}

impl TableReadFormat {
    pub fn parse(value: Option<String>) -> Result<Option<Self>, String> {
        Ok(match value.as_deref() {
            Some("csv") => Some(TableReadFormat::Csv),
            Some("json") => Some(TableReadFormat::JsonString),
            Some("columns") => Some(TableReadFormat::ColumnsString),
            Some("arrow") => Some(TableReadFormat::Arrow),
            Some("ndjson") => Some(TableReadFormat::Ndjson),
            None => None,
            Some(x) => return Err(format!("Unknown format \"{x}\"")),
        })
    }
}

/// Options which impact the behavior of [`Client::table`], as well as
/// subsequent calls to [`Table::update`].
#[derive(Clone, Debug, Default, Serialize, Deserialize, TS)]
pub struct TableInitOptions {
    #[serde(default)]
    #[ts(optional)]
    pub name: Option<String>,

    #[serde(default)]
    #[ts(optional)]
    pub format: Option<TableReadFormat>,

    /// This [`Table`] should use the column named by the `index` parameter as
    /// the `index`, which causes [`Table::update`] and [`Client::table`] input
    /// to either insert or update existing rows based on `index` column
    /// value equality.
    #[serde(default)]
    #[ts(optional)]
    pub index: Option<String>,

    /// This [`Table`] should be limited to `limit` rows, after which the
    /// _earliest_ rows will be overwritten (where _earliest_ is defined as
    /// relative to insertion order).
    #[serde(default)]
    #[ts(optional)]
    pub limit: Option<u32>,
}

impl TableInitOptions {
    pub fn set_name<D: Display>(&mut self, name: D) {
        self.name = Some(format!("{name}"))
    }
}

impl TryFrom<TableOptions> for MakeTableOptions {
    type Error = ClientError;

    fn try_from(value: TableOptions) -> Result<Self, Self::Error> {
        Ok(MakeTableOptions {
            make_table_type: match value {
                TableOptions {
                    index: Some(_),
                    limit: Some(_),
                } => Err(ClientError::BadTableOptions)?,
                TableOptions {
                    index: Some(index), ..
                } => Some(MakeTableType::MakeIndexTable(index)),
                TableOptions {
                    limit: Some(limit), ..
                } => Some(MakeTableType::MakeLimitTable(limit)),
                _ => None,
            },
        })
    }
}

#[derive(Clone, Debug)]
pub(crate) struct TableOptions {
    pub index: Option<String>,
    pub limit: Option<u32>,
}

impl From<TableInitOptions> for TableOptions {
    fn from(value: TableInitOptions) -> Self {
        TableOptions {
            index: value.index,
            limit: value.limit,
        }
    }
}

/// Options for [`Table::delete`].
#[derive(Clone, Debug, Default, Deserialize, TS)]
pub struct DeleteOptions {
    pub lazy: bool,
}

/// Options for [`Table::update`].
#[derive(Clone, Debug, Default, Deserialize, Serialize, TS)]
pub struct UpdateOptions {
    pub port_id: Option<u32>,
    pub format: Option<TableReadFormat>,
}

/// Result of a call to [`Table::validate_expressions`], containing a schema
/// for valid expressions and error messages for invalid ones.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ExprValidationResult {
    pub expression_schema: Schema,
    pub errors: HashMap<String, table_validate_expr_resp::ExprValidationError>,
    pub expression_alias: HashMap<String, String>,
}

/// [`Table`] is Perspective's columnar data frame, analogous to a Pandas/Polars
/// `DataFrame` or Apache Arrow, supporting append & in-place updates, removal
/// by index, and update notifications.
///
/// A [`Table`] contains columns, each of which have a unique name, are strongly
/// and consistently typed, and contains rows of data conforming to the column's
/// type. Each column in a [`Table`] must have the same number of rows, though
/// not every row must contain data; null-values are used to indicate missing
/// values in the dataset. The schema of a [`Table`] is _immutable after
/// creation_, which means the column names and data types cannot be changed
/// after the [`Table`] has been created. Columns cannot be added or deleted
/// after creation either, but a [`View`] can be used to select an arbitrary set
/// of columns from the [`Table`].
#[derive(Clone)]
pub struct Table {
    name: String,
    client: Client,
    options: TableOptions,

    /// If this table is constructed from a View, the view's on_update callback
    /// is wired into this table. So, we store the token to clean it up properly
    /// on destruction.
    pub(crate) view_update_token: Option<u32>,
}

assert_table_api!(Table);

impl PartialEq for Table {
    fn eq(&self, other: &Self) -> bool {
        self.name == other.name && self.client == other.client
    }
}

impl Table {
    pub(crate) fn new(name: String, client: Client, options: TableOptions) -> Self {
        Table {
            name,
            client,
            options,
            view_update_token: None,
        }
    }

    fn client_message(&self, req: ClientReq) -> Request {
        Request {
            msg_id: self.client.gen_id(),
            entity_id: self.name.clone(),
            client_req: Some(req),
        }
    }

    /// Get a copy of the [`Client`] this [`Table`] came from.
    pub fn get_client(&self) -> Client {
        self.client.clone()
    }

    /// Get a metadata dictionary of the `perspective_server::Server`'s
    /// features, which is (currently) implementation specific, but there is
    /// only one implementation.
    pub async fn get_features(&self) -> ClientResult<Features> {
        self.client.get_features().await
    }

    /// Returns the name of the index column for the table.
    ///
    /// # Examples
    ///
    /// ```rust
    /// let options = TableInitOptions {
    ///     index: Some("x".to_string()),
    ///     ..default()
    /// };
    /// let table = client.table("x,y\n1,2\n3,4", options).await;
    /// let index = table.get_index()
    /// ```
    pub fn get_index(&self) -> Option<String> {
        self.options.index.as_ref().map(|index| index.to_owned())
    }

    /// Returns the user-specified row limit for this table.
    pub fn get_limit(&self) -> Option<u32> {
        self.options.limit.as_ref().map(|limit| *limit)
    }

    /// Returns the user-specified name for this table, or the auto-generated
    /// name if a name was not specified when the table was created.
    pub fn get_name(&self) -> &str {
        self.name.as_str()
    }

    /// Removes all the rows in the [`Table`], but preserves everything else
    /// including the schema, index, and any callbacks or registered
    /// [`View`] instances.
    ///
    /// Calling [`Table::clear`], like [`Table::update`] and [`Table::remove`],
    /// will trigger an update event to any registered listeners via
    /// [`View::on_update`].
    pub async fn clear(&self) -> ClientResult<()> {
        self.replace(UpdateData::JsonRows("[]".to_owned())).await
    }

    /// Delete this [`Table`] and cleans up associated resources.
    ///
    /// [`Table`]s do not stop consuming resources or processing updates when
    /// they are garbage collected in their host language - you must call
    /// this method to reclaim these.
    ///
    /// # Arguments
    ///
    /// - `options` An options dictionary.
    ///     - `lazy` Whether to delete this [`Table`] _lazily_. When false (the
    ///       default), the delete will occur immediately, assuming it has no
    ///       [`View`] instances registered to it (which must be deleted first,
    ///       otherwise this method will throw an error). When true, the
    ///       [`Table`] will only be marked for deltion once its [`View`]
    ///       dependency count reaches 0.
    ///
    /// # Examples
    ///
    /// ```rust
    /// let opts = TableInitOptions::default();
    /// let data = TableData::Update(UpdateData::Csv("x,y\n1,2\n3,4".into()));
    /// let table = client.table(data, opts).await?;
    ///
    /// // ...
    ///
    /// table.delete(DeleteOptions::default()).await?;
    /// ```
    pub async fn delete(&self, options: DeleteOptions) -> ClientResult<()> {
        let msg = self.client_message(ClientReq::TableDeleteReq(TableDeleteReq {
            is_immediate: !options.lazy,
        }));

        match self.client.oneshot(&msg).await? {
            ClientResp::TableDeleteResp(_) => Ok(()),
            resp => Err(resp.into()),
        }
    }

    /// Returns the column names of this [`Table`] in "natural" order (the
    /// ordering implied by the input format).
    ///  
    /// # Examples
    ///
    /// ```rust
    /// let columns = table.columns().await;
    /// ```
    pub async fn columns(&self) -> ClientResult<Vec<String>> {
        let msg = self.client_message(ClientReq::TableSchemaReq(TableSchemaReq {}));
        match self.client.oneshot(&msg).await? {
            ClientResp::TableSchemaResp(TableSchemaResp { schema }) => Ok(schema
                .map(|x| x.schema.into_iter().map(|x| x.name.to_owned()).collect())
                .unwrap()),
            resp => Err(resp.into()),
        }
    }

    /// Returns the number of rows in a [`Table`].
    pub async fn size(&self) -> ClientResult<usize> {
        let msg = self.client_message(ClientReq::TableSizeReq(TableSizeReq {}));
        match self.client.oneshot(&msg).await? {
            ClientResp::TableSizeResp(TableSizeResp { size }) => Ok(size as usize),
            resp => Err(resp.into()),
        }
    }

    /// Returns a table's [`Schema`], a mapping of column names to column types.
    ///
    /// The mapping of a [`Table`]'s column names to data types is referred to
    /// as a [`Schema`]. Each column has a unique name and a data type, one
    /// of:
    ///
    /// - `"boolean"` - A boolean type
    /// - `"date"` - A timesonze-agnostic date type (month/day/year)
    /// - `"datetime"` - A millisecond-precision datetime type in the UTC
    ///   timezone
    /// - `"float"` - A 64 bit float
    /// - `"integer"` - A signed 32 bit integer (the integer type supported by
    ///   JavaScript)
    /// - `"string"` - A [`String`] data type (encoded internally as a
    ///   _dictionary_)
    ///
    /// Note that all [`Table`] columns are _nullable_, regardless of the data
    /// type.
    pub async fn schema(&self) -> ClientResult<Schema> {
        let msg = self.client_message(ClientReq::TableSchemaReq(TableSchemaReq {}));
        match self.client.oneshot(&msg).await? {
            ClientResp::TableSchemaResp(TableSchemaResp { schema }) => Ok(schema
                .map(|x| {
                    x.schema
                        .into_iter()
                        .map(|x| (x.name, ColumnType::try_from(x.r#type).unwrap()))
                        .collect()
                })
                .unwrap()),
            resp => Err(resp.into()),
        }
    }

    /// Create a unique channel ID on this [`Table`], which allows
    /// `View::on_update` callback calls to be associated with the
    /// `Table::update` which caused them.
    pub async fn make_port(&self) -> ClientResult<i32> {
        let msg = self.client_message(ClientReq::TableMakePortReq(TableMakePortReq {}));
        match self.client.oneshot(&msg).await? {
            ClientResp::TableMakePortResp(TableMakePortResp { port_id }) => Ok(port_id as i32),
            _ => Err(ClientError::Unknown("make_port".to_string())),
        }
    }

    /// Register a callback which is called exactly once, when this [`Table`] is
    /// deleted with the [`Table::delete`] method.
    ///
    /// [`Table::on_delete`] resolves when the subscription message is sent, not
    /// when the _delete_ event occurs.
    pub async fn on_delete(
        &self,
        on_delete: Box<dyn Fn() + Send + Sync + 'static>,
    ) -> ClientResult<u32> {
        let callback = move |resp: Response| match resp.client_resp {
            Some(ClientResp::TableOnDeleteResp(_)) => {
                on_delete();
                Ok(())
            },
            resp => Err(resp.into()),
        };

        let msg = self.client_message(ClientReq::TableOnDeleteReq(TableOnDeleteReq {}));
        self.client.subscribe_once(&msg, Box::new(callback)).await?;
        Ok(msg.msg_id)
    }

    /// Removes a listener with a given ID, as returned by a previous call to
    /// [`Table::on_delete`].
    pub async fn remove_delete(&self, callback_id: u32) -> ClientResult<()> {
        let msg = self.client_message(ClientReq::TableRemoveDeleteReq(TableRemoveDeleteReq {
            id: callback_id,
        }));

        match self.client.oneshot(&msg).await? {
            ClientResp::TableRemoveDeleteResp(_) => Ok(()),
            resp => Err(resp.into()),
        }
    }

    /// Removes rows from this [`Table`] with the `index` column values
    /// supplied.
    ///
    /// # Arguments
    ///
    /// - `indices` - A list of `index` column values for rows that should be
    ///   removed.
    ///
    /// # Examples
    ///
    /// ```rust
    /// table.remove(UpdateData::Csv("index\n1\n2\n3")).await?;
    /// ```
    pub async fn remove(&self, input: UpdateData) -> ClientResult<()> {
        let msg = self.client_message(ClientReq::TableRemoveReq(TableRemoveReq {
            data: Some(input.into()),
        }));

        match self.client.oneshot(&msg).await? {
            ClientResp::TableRemoveResp(_) => Ok(()),
            resp => Err(resp.into()),
        }
    }

    /// Replace all rows in this [`Table`] with the input data, coerced to this
    /// [`Table`]'s existing [`Schema`], notifying any derived [`View`] and
    /// [`View::on_update`] callbacks.
    ///
    /// Calling [`Table::replace`] is an easy way to replace _all_ the data in a
    /// [`Table`] without losing any derived [`View`] instances or
    /// [`View::on_update`] callbacks. [`Table::replace`] does _not_ infer
    /// data types like [`Client::table`] does, rather it _coerces_ input
    /// data to the `Schema` like [`Table::update`]. If you need a [`Table`]
    /// with a different `Schema`, you must create a new one.
    ///
    /// # Examples
    ///
    /// ```rust
    /// let data = UpdateData::Csv("x,y\n1,2".into());
    /// let opts = UpdateOptions::default();
    /// table.replace(data, opts).await?;
    /// ```
    pub async fn replace(&self, input: UpdateData) -> ClientResult<()> {
        let msg = self.client_message(ClientReq::TableReplaceReq(TableReplaceReq {
            data: Some(input.into()),
        }));

        match self.client.oneshot(&msg).await? {
            ClientResp::TableReplaceResp(_) => Ok(()),
            resp => Err(resp.into()),
        }
    }

    /// Updates the rows of this table and any derived [`View`] instances.
    ///
    /// Calling [`Table::update`] will trigger the [`View::on_update`] callbacks
    /// register to derived [`View`], and the call itself will not resolve until
    /// _all_ derived [`View`]'s are notified.
    ///
    /// When updating a [`Table`] with an `index`, [`Table::update`] supports
    /// partial updates, by omitting columns from the update data.
    ///
    /// # Arguments
    ///
    /// - `input` - The input data for this [`Table`]. The schema of a [`Table`]
    ///   is immutable after creation, so this method cannot be called with a
    ///   schema.
    /// - `options` - Options for this update step - see [`UpdateOptions`].
    ///
    /// # Examples
    ///
    /// ```rust
    /// let data = UpdateData::Csv("x,y\n1,2".into());
    /// let opts = UpdateOptions::default();
    /// table.update(data, opts).await?;
    /// ```  
    pub async fn update(&self, input: UpdateData, options: UpdateOptions) -> ClientResult<()> {
        let msg = self.client_message(ClientReq::TableUpdateReq(TableUpdateReq {
            data: Some(input.into()),
            port_id: options.port_id.unwrap_or(0),
        }));

        match self.client.oneshot(&msg).await? {
            ClientResp::TableUpdateResp(_) => Ok(()),
            resp => Err(resp.into()),
        }
    }

    /// Validates the given expressions.
    pub async fn validate_expressions(
        &self,
        expressions: Expressions,
    ) -> ClientResult<ExprValidationResult> {
        let msg = self.client_message(ClientReq::TableValidateExprReq(TableValidateExprReq {
            column_to_expr: expressions.0,
        }));

        match self.client.oneshot(&msg).await? {
            ClientResp::TableValidateExprResp(result) => Ok(ExprValidationResult {
                errors: result.errors,
                expression_alias: result.expression_alias,
                expression_schema: result
                    .expression_schema
                    .into_iter()
                    .map(|(x, y)| (x, ColumnType::try_from(y).unwrap()))
                    .collect(),
            }),
            resp => Err(resp.into()),
        }
    }

    /// Create a new [`View`] from this table with a specified
    /// [`ViewConfigUpdate`].
    ///
    /// See [`View`] struct.
    ///
    /// # Examples
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
    pub async fn view(&self, config: Option<ViewConfigUpdate>) -> ClientResult<View> {
        let view_name = randid();
        let msg = Request {
            msg_id: self.client.gen_id(),
            entity_id: self.name.clone(),
            client_req: ClientReq::TableMakeViewReq(TableMakeViewReq {
                view_id: view_name.clone(),
                config: config.map(|x| x.into()),
            })
            .into(),
        };

        match self.client.oneshot(&msg).await? {
            ClientResp::TableMakeViewResp(TableMakeViewResp { view_id })
                if view_id == view_name =>
            {
                Ok(View::new(view_name, self.client.clone()))
            },
            resp => Err(resp.into()),
        }
    }
}
