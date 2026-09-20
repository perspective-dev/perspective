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

use js_sys::Function;
use perspective_client::config::*;
use perspective_client::{
    DeleteOptions, DescribeVerdict, UpdateData, UpdateOptions, assert_table_api,
};
use wasm_bindgen::prelude::*;
use wasm_bindgen_derive::TryFromJsValue;
use wasm_bindgen_futures::spawn_local;

use crate::Client;
use crate::table_data::UpdateDataExt;
use crate::utils::{ApiFuture, ApiResult, JsValueSerdeExt, LocalPollLoop};
pub use crate::view::*;

#[derive(TryFromJsValue, Clone, PartialEq)]
#[wasm_bindgen]
pub struct Table(pub(crate) perspective_client::Table);

assert_table_api!(Table);

impl From<perspective_client::Table> for Table {
    fn from(value: perspective_client::Table) -> Self {
        Table(value)
    }
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
impl Table {
    pub fn get_table(&self) -> &'_ perspective_client::Table {
        &self.0
    }
}

#[wasm_bindgen]
extern "C" {
    // TODO Fix me
    #[wasm_bindgen(typescript_type = "\
        string | ArrayBuffer | Record<string, unknown[]> | Record<string, unknown>[] | \
                                      Record<string, ColumnType>")]
    pub type JsTableInitData;

    #[wasm_bindgen(typescript_type = "ViewConfigUpdate")]
    pub type JsViewConfig;

    #[wasm_bindgen(typescript_type = "UpdateOptions")]
    pub type JsUpdateOptions;

    #[wasm_bindgen(typescript_type = "DeleteOptions")]
    pub type JsDeleteOptions;
}

#[wasm_bindgen]
impl Table {
    /// Returns the name of the index column for the table.
    ///
    /// # JavaScript Examples
    ///
    /// ```javascript
    /// const table = await client.table("x,y\n1,2\n3,4", { index: "x" });
    /// const index = table.get_index(); // "x"
    /// ```
    #[wasm_bindgen]
    pub async fn get_index(&self) -> Option<String> {
        self.0.get_index()
    }

    /// Get a copy of the [`Client`] this [`Table`] came from.
    #[wasm_bindgen]
    pub async fn get_client(&self) -> Client {
        Client {
            close: None,
            client: self.0.get_client(),
        }
    }

    /// Returns the user-specified name for this table, or the auto-generated
    /// name if a name was not specified when the table was created.
    #[wasm_bindgen]
    pub async fn get_name(&self) -> String {
        self.0.get_name().to_owned()
    }

    /// Returns the user-specified row limit for this table.
    #[wasm_bindgen]
    pub async fn get_limit(&self) -> Option<u32> {
        self.0.get_limit()
    }

    /// Removes all the rows in the [`Table`], but preserves everything else
    /// including the schema, index, and any callbacks or registered
    /// [`View`] instances.
    ///
    /// Calling [`Table::clear`], like [`Table::update`] and [`Table::remove`],
    /// will trigger an update event to any registered listeners via
    /// [`View::on_update`].
    #[wasm_bindgen]
    pub async fn clear(&self) -> ApiResult<()> {
        self.0.clear().await?;
        Ok(())
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
    /// # JavaScript Examples
    ///
    /// ```javascript
    /// const table = await client.table("x,y\n1,2\n3,4");
    ///
    /// // ...
    ///
    /// await table.delete({ lazy: true });
    /// ```
    #[wasm_bindgen]
    pub async fn delete(self, options: Option<JsDeleteOptions>) -> ApiResult<()> {
        let options = options
            .into_serde_ext::<Option<DeleteOptions>>()?
            .unwrap_or_default();

        self.0.delete(options).await?;
        Ok(())
    }

    /// Returns the number of rows in a [`Table`].
    #[wasm_bindgen]
    pub async fn size(&self) -> ApiResult<f64> {
        Ok(self.0.size().await? as f64)
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
    #[wasm_bindgen(unchecked_return_type = "Record<string, ColumnType>")]
    pub async fn schema(&self) -> ApiResult<JsValue> {
        let schema = self.0.schema().await?;
        Ok(JsValue::from_serde_ext(&schema)?)
    }

    /// Returns the column names of this [`Table`] in "natural" order (the
    /// ordering implied by the input format).
    ///  
    ///  # JavaScript Examples
    ///
    ///  ```javascript
    ///  const columns = await table.columns();
    ///  ```   
    #[wasm_bindgen]
    pub async fn columns(&self) -> ApiResult<JsValue> {
        let columns = self.0.columns().await?;
        Ok(JsValue::from_serde_ext(&columns)?)
    }

    /// Create a unique channel ID on this [`Table`], which allows
    /// `View::on_update` callback calls to be associated with the
    /// `Table::update` which caused them.
    #[wasm_bindgen]
    pub async fn make_port(&self) -> ApiResult<i32> {
        Ok(self.0.make_port().await?)
    }

    /// Register a callback which is called exactly once, when this [`Table`] is
    /// deleted with the [`Table::delete`] method.
    ///
    /// [`Table::on_delete`] resolves when the subscription message is sent, not
    /// when the _delete_ event occurs.
    #[wasm_bindgen]
    pub fn on_delete(&self, on_delete: Function) -> ApiFuture<u32> {
        let table = self.clone();
        ApiFuture::new(async move {
            let emit = LocalPollLoop::new(move |()| on_delete.call0(&JsValue::UNDEFINED));
            let on_delete = Box::new(move || spawn_local(emit.poll(())));
            Ok(table.0.on_delete(on_delete).await?)
        })
    }

    /// Removes a listener with a given ID, as returned by a previous call to
    /// [`Table::on_delete`].
    #[wasm_bindgen]
    pub fn remove_delete(&self, callback_id: u32) -> ApiFuture<()> {
        let client = self.0.clone();
        ApiFuture::new(async move {
            client.remove_delete(callback_id).await?;
            Ok(())
        })
    }

    /// Removes rows from this [`Table`] with the `index` column values
    /// supplied.
    ///
    /// # Arguments
    ///
    /// - `indices` - A list of `index` column values for rows that should be
    ///   removed.
    ///
    /// # JavaScript Examples
    ///
    /// ```javascript
    /// await table.remove([1, 2, 3]);
    /// ```
    #[wasm_bindgen]
    pub async fn remove(&self, value: &JsValue, options: Option<JsUpdateOptions>) -> ApiResult<()> {
        let options = options
            .into_serde_ext::<Option<UpdateOptions>>()?
            .unwrap_or_default();

        let input = UpdateData::from_js_value(value, options.format)?;
        self.0.remove(input).await?;
        Ok(())
    }

    /// Replace all rows in this [`Table`] with the input data, coerced to this
    /// [`Table`]'s existing [`perspective_client::Schema`], notifying any
    /// derived [`View`] and [`View::on_update`] callbacks.
    ///
    /// Calling [`Table::replace`] is an easy way to replace _all_ the data in a
    /// [`Table`] without losing any derived [`View`] instances or
    /// [`View::on_update`] callbacks. [`Table::replace`] does _not_ infer
    /// data types like [`Client::table`] does, rather it _coerces_ input
    /// data to the `Schema` like [`Table::update`]. If you need a [`Table`]
    /// with a different `Schema`, you must create a new one.
    ///
    /// # JavaScript Examples
    ///
    /// ```javascript
    /// await table.replace("x,y\n1,2");
    /// ```
    #[wasm_bindgen]
    pub async fn replace(
        &self,
        input: &JsValue,
        options: Option<JsUpdateOptions>,
    ) -> ApiResult<()> {
        let options = options
            .into_serde_ext::<Option<UpdateOptions>>()?
            .unwrap_or_default();

        let input = UpdateData::from_js_value(input, options.format)?;
        self.0.replace(input).await?;
        Ok(())
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
    /// # JavaScript Examples
    ///
    /// ```javascript
    /// await table.update("x,y\n1,2");
    /// ```
    #[wasm_bindgen]
    pub fn update(
        &self,
        input: JsTableInitData,
        options: Option<JsUpdateOptions>,
    ) -> ApiFuture<()> {
        let table = self.clone();
        ApiFuture::new(async move {
            let options = options
                .into_serde_ext::<Option<UpdateOptions>>()?
                .unwrap_or_default();

            let input = UpdateData::from_js_value(&input, options.format)?;
            Ok(table.0.update(input, options).await?)
        })
    }

    /// Create a new [`View`] from this table with a specified
    /// [`ViewConfigUpdate`].
    ///
    /// See [`View`] struct.
    ///
    /// # JavaScript Examples
    ///
    /// ```javascript
    /// const view = await table.view({
    ///     columns: ["Sales"],
    ///     aggregates: { Sales: "sum" },
    ///     group_by: ["Region", "Country"],
    ///     filter: [["Category", "in", ["Furniture", "Technology"]]],
    /// });
    /// ```
    #[wasm_bindgen]
    pub async fn view(&self, config: Option<JsViewConfig>) -> ApiResult<View> {
        let config = config
            .map(|config| js_sys::JSON::stringify(&config))
            .transpose()?
            .and_then(|x| x.as_string())
            .map(|x| serde_json::from_str(x.as_str()))
            .transpose()?;

        let view = self.0.view(config).await?;
        Ok(View(view))
    }

    /// Validate a complete view config against this table and report the
    /// schema a [`View`] built from it would have, WITHOUT creating one.
    ///
    /// # JavaScript Examples
    ///
    /// ```javascript
    /// const verdict = await table.describe({
    ///     columns: ["Sales", "margin"],
    ///     group_by: ["Region"],
    ///     expressions: { margin: '"Profit" / "Sales"' },
    /// });
    ///
    /// if ("view_schema" in verdict) {
    ///     const view = await table.view(config);
    /// }
    /// ```
    #[wasm_bindgen]
    pub async fn describe(&self, config: Option<JsViewConfig>) -> ApiResult<JsValue> {
        let config = config
            .map(|config| js_sys::JSON::stringify(&config))
            .transpose()?
            .and_then(|x| x.as_string())
            .map(|x| serde_json::from_str(x.as_str()))
            .transpose()?
            .unwrap_or_default();

        let verdict: DescribeVerdict = self.0.describe(config).await?.into();
        Ok(JsValue::from_serde_ext(&verdict)?)
    }

    /// Validates the given expressions.
    #[wasm_bindgen]
    pub async fn validate_expressions(&self, exprs: &JsValue) -> ApiResult<JsValue> {
        let exprs = JsValue::into_serde_ext::<Expressions>(exprs.clone())?;
        let columns = self.0.validate_expressions(exprs).await?;
        Ok(JsValue::from_serde_ext(&columns)?)
    }
}
