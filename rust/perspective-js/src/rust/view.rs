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

use js_sys::{Array, ArrayBuffer, Function, Object};
use perspective_client::{
    ColumnWindow, OnUpdateData, OnUpdateOptions, ViewWindow, assert_view_api,
};
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::spawn_local;

#[cfg(doc)]
use crate::table::Table;
use crate::utils::{ApiFuture, ApiResult, JsValueSerdeExt, LocalPollLoop};

#[wasm_bindgen]
unsafe extern "C" {
    #[wasm_bindgen(typescript_type = "ViewWindow")]
    #[derive(Clone)]
    pub type JsViewWindow;

    #[wasm_bindgen(typescript_type = "ColumnWindow")]
    #[derive(Clone)]
    pub type JsColumnWindow;

    #[wasm_bindgen(method, setter, js_name = "formatted")]
    pub fn set_formatted(this: &JsViewWindow, x: bool);

    #[wasm_bindgen(typescript_type = "OnUpdateOptions")]
    pub type JsOnUpdateOptions;

}

impl From<ViewWindow> for JsViewWindow {
    fn from(value: ViewWindow) -> Self {
        JsViewWindow::from_serde_ext(&value)
            .unwrap()
            .unchecked_into()
    }
}

fn scalar_to_jsvalue(scalar: &perspective_client::config::Scalar) -> JsValue {
    match scalar {
        perspective_client::config::Scalar::Float(x) => JsValue::from_f64(*x),
        perspective_client::config::Scalar::String(x) => JsValue::from_str(x),
        perspective_client::config::Scalar::Bool(x) => JsValue::from_bool(*x),
        perspective_client::config::Scalar::Null => JsValue::NULL,
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
#[wasm_bindgen]
#[derive(Clone)]
pub struct View(pub(crate) perspective_client::View);

assert_view_api!(View);

impl From<perspective_client::View> for View {
    fn from(value: perspective_client::View) -> Self {
        View(value)
    }
}

#[wasm_bindgen]
impl View {
    #[doc(hidden)]
    pub fn __get_model(&self) -> View {
        self.clone()
    }

    /// Returns an array of strings containing the column paths of the [`View`]
    /// without any of the source columns.
    ///
    /// A column path shows the columns that a given cell belongs to after
    /// pivots are applied.
    #[wasm_bindgen]
    pub async fn column_paths(&self, window: Option<JsColumnWindow>) -> ApiResult<JsValue> {
        let window = window.into_serde_ext::<Option<ColumnWindow>>()?;
        let columns = self.0.column_paths(window.unwrap_or_default()).await?;
        Ok(JsValue::from_serde_ext(&columns)?)
    }

    /// Delete this [`View`] and clean up all resources associated with it.
    /// [`View`] objects do not stop consuming resources or processing
    /// updates when they are garbage collected - you must call this method
    /// to reclaim these.
    #[wasm_bindgen]
    pub async fn delete(self) -> ApiResult<()> {
        self.0.delete().await?;
        Ok(())
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
    #[wasm_bindgen]
    pub async fn dimensions(&self) -> ApiResult<JsValue> {
        let dimensions = self.0.dimensions().await?;
        Ok(JsValue::from_serde_ext(&dimensions)?)
    }

    /// The expression schema of this [`View`], which contains only the
    /// expressions created on this [`View`]. See [`View::schema`] for
    /// details.
    #[wasm_bindgen]
    pub async fn expression_schema(&self) -> ApiResult<JsValue> {
        let schema = self.0.expression_schema().await?;
        Ok(JsValue::from_serde_ext(&schema)?)
    }

    /// A copy of the config object passed to the [`Table::view`] method which
    /// created this [`View`].
    #[wasm_bindgen]
    pub async fn get_config(&self) -> ApiResult<JsValue> {
        let config = self.0.get_config().await?;
        Ok(JsValue::from_serde_ext(&config)?)
    }

    /// Calculates the [min, max] of the leaf nodes of a column `column_name`.
    ///
    /// # Returns
    ///
    /// A tuple of [min, max], whose types are column and aggregate dependent.
    #[wasm_bindgen]
    pub async fn get_min_max(&self, name: String) -> ApiResult<Array> {
        let result = self.0.get_min_max(name).await?;
        let arr = Array::new();
        arr.push(&scalar_to_jsvalue(&result.0));
        arr.push(&scalar_to_jsvalue(&result.1));
        Ok(arr)
    }

    /// The number of aggregated rows in this [`View`]. This is affected by the
    /// "group_by" configuration parameter supplied to this view's contructor.
    ///
    /// # Returns
    ///
    /// The number of aggregated rows.
    #[wasm_bindgen]
    pub async fn num_rows(&self) -> ApiResult<i32> {
        let size = self.0.num_rows().await?;
        Ok(size as i32)
    }

    /// The schema of this [`View`].
    ///
    /// The [`View`] schema differs from the `schema` returned by
    /// [`Table::schema`]; it may have different column names due to
    /// `expressions` or `columns` configs, or it maye have _different
    /// column types_ due to the application og `group_by` and `aggregates`
    /// config. You can think of [`Table::schema`] as the _input_ schema and
    /// [`View::schema`] as the _output_ schema of a Perspective pipeline.
    #[wasm_bindgen]
    pub async fn schema(&self) -> ApiResult<JsValue> {
        let schema = self.0.schema().await?;
        Ok(JsValue::from_serde_ext(&schema)?)
    }

    /// Serializes a [`View`] to the Apache Arrow data format.
    #[wasm_bindgen]
    pub async fn to_arrow(&self, window: Option<JsViewWindow>) -> ApiResult<ArrayBuffer> {
        let window = window.into_serde_ext::<Option<ViewWindow>>()?;
        let arrow = self.0.to_arrow(window.unwrap_or_default()).await?;
        Ok(js_sys::Uint8Array::from(&arrow[..])
            .buffer()
            .unchecked_into())
    }

    /// Serializes this [`View`] to a string of JSON data. Useful if you want to
    /// save additional round trip serialize/deserialize cycles.
    #[wasm_bindgen]
    pub async fn to_columns_string(&self, window: Option<JsViewWindow>) -> ApiResult<String> {
        let window = window.into_serde_ext::<Option<ViewWindow>>()?;
        let json = self.0.to_columns_string(window.unwrap_or_default()).await?;
        Ok(json)
    }

    /// Serializes this [`View`] to JavaScript objects in a column-oriented
    /// format.
    #[wasm_bindgen]
    pub async fn to_columns(&self, window: Option<JsViewWindow>) -> ApiResult<Object> {
        let json = self.to_columns_string(window).await?;
        Ok(js_sys::JSON::parse(&json)?.unchecked_into())
    }

    /// Render this `View` as a JSON string.
    #[wasm_bindgen]
    pub async fn to_json_string(&self, window: Option<JsViewWindow>) -> ApiResult<String> {
        let window = window.into_serde_ext::<Option<ViewWindow>>()?;
        let json = self.0.to_json_string(window.unwrap_or_default()).await?;
        Ok(json)
    }

    /// Serializes this [`View`] to JavaScript objects in a row-oriented
    /// format.
    #[wasm_bindgen]
    pub async fn to_json(&self, window: Option<JsViewWindow>) -> ApiResult<Array> {
        let json = self.to_json_string(window).await?;
        Ok(js_sys::JSON::parse(&json)?.unchecked_into())
    }

    /// Renders this [`View`] as an [NDJSON](https://github.com/ndjson/ndjson-spec)
    /// formatted [`String`].
    #[wasm_bindgen]
    pub async fn to_ndjson(&self, window: Option<JsViewWindow>) -> ApiResult<String> {
        let window = window.into_serde_ext::<Option<ViewWindow>>()?;
        let ndjson = self.0.to_ndjson(window.unwrap_or_default()).await?;
        Ok(ndjson)
    }

    /// Serializes this [`View`] to CSV data in a standard format.
    #[wasm_bindgen]
    pub async fn to_csv(&self, window: Option<JsViewWindow>) -> ApiResult<String> {
        let window = window.into_serde_ext::<Option<ViewWindow>>()?;
        Ok(self.0.to_csv(window.unwrap_or_default()).await?)
    }

    /// Fetches columns from the [`View`] in Arrow format, decodes them, and
    /// passes typed array views to `callback`. All arrays are only valid for
    /// the duration of the callback — if `callback` returns a `Promise`, it
    /// is awaited before the backing Arrow buffer is released, so async
    /// callbacks may use the views for the full duration of the awaited
    /// work (e.g. across an `await requestAnimationFrame`-backed promise).
    ///
    /// # Arguments
    ///
    /// - `window` - Optional [`TypedArrayWindow`] controlling row/column
    ///   windowing and output options (e.g., `float32` mode).
    /// - `callback` - A JS function called with `(names: string[], values:
    ///   TypedArray[], validities: (Uint8Array|null)[], dictionaries:
    ///   (string[]|null)[]) => void | Promise<void>`.
    #[wasm_bindgen]
    pub async fn with_typed_arrays(
        &self,
        window: Option<crate::typed_array::JsTypedArrayWindow>,
        callback: Function,
    ) -> ApiResult<()> {
        let opts: crate::typed_array::TypedArrayWindow = window
            .into_serde_ext::<Option<crate::typed_array::TypedArrayWindow>>()?
            .unwrap_or_default();

        let float32 = opts.float32;
        let mut view_window: ViewWindow = opts.into();
        view_window.emit_legacy_row_path_names = Some(false);
        let arrow = self.0.to_arrow(view_window).await?;
        crate::typed_array::decode_and_call(&arrow, float32, &callback).await?;
        Ok(())
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
    ///
    /// # JavaScript Examples
    ///
    /// ```javascript
    /// // Attach an `on_update` callback
    /// view.on_update((updated) => console.log(updated.port_id));
    /// ```
    ///
    /// ```javascript
    /// // `on_update` with row deltas
    /// view.on_update((updated) => console.log(updated.delta), { mode: "row" });
    /// ```
    #[wasm_bindgen]
    pub fn on_update(
        &self,
        on_update_js: Function,
        options: Option<JsOnUpdateOptions>,
    ) -> ApiFuture<u32> {
        let poll_loop = LocalPollLoop::new(move |args: OnUpdateData| {
            let js_obj = JsValue::from_serde_ext(&*args)?;
            on_update_js.call1(&JsValue::UNDEFINED, &js_obj)
        });

        let on_update = Box::new(move |msg| poll_loop.poll(msg));
        let view = self.0.clone();
        ApiFuture::new(async move {
            let on_update_opts = options
                .into_serde_ext::<Option<OnUpdateOptions>>()?
                .unwrap_or_default();

            let id = view.on_update(on_update, on_update_opts).await?;
            Ok(id)
        })
    }

    /// Unregister a previously registered update callback with this [`View`].
    ///
    /// # Arguments
    ///
    /// - `id` - A callback `id` as returned by a recipricol call to
    ///   [`View::on_update`].
    #[wasm_bindgen]
    pub async fn remove_update(&self, callback_id: u32) -> ApiResult<()> {
        Ok(self.0.remove_update(callback_id).await?)
    }

    /// Register a callback with this [`View`]. Whenever the [`View`] is
    /// deleted, this callback will be invoked.
    #[wasm_bindgen]
    pub fn on_delete(&self, on_delete: Function) -> ApiFuture<u32> {
        let view = self.clone();
        ApiFuture::new(async move {
            let emit = LocalPollLoop::new(move |()| on_delete.call0(&JsValue::UNDEFINED));
            let on_delete = Box::new(move || spawn_local(emit.poll(())));
            Ok(view.0.on_delete(on_delete).await?)
        })
    }

    /// The number of aggregated columns in this [`View`]. This is affected by
    /// the "split_by" configuration parameter supplied to this view's
    /// contructor.
    ///
    /// # Returns
    ///
    /// The number of aggregated columns.
    #[wasm_bindgen]
    pub async fn num_columns(&self) -> ApiResult<u32> {
        // TODO: This is broken because of how split by creates a
        // cartesian product of columns * unique values.
        Ok(self.0.dimensions().await?.num_view_columns)
    }

    /// Unregister a previously registered [`View::on_delete`] callback.
    #[wasm_bindgen]
    pub fn remove_delete(&self, callback_id: u32) -> ApiFuture<()> {
        let client = self.0.clone();
        ApiFuture::new(async move {
            client.remove_delete(callback_id).await?;
            Ok(())
        })
    }

    /// Collapses the `group_by` row at `row_index`.
    #[wasm_bindgen]
    pub async fn collapse(&self, row_index: u32) -> ApiResult<u32> {
        Ok(self.0.collapse(row_index).await?)
    }

    /// Expand the `group_by` row at `row_index`.
    #[wasm_bindgen]
    pub async fn expand(&self, row_index: u32) -> ApiResult<u32> {
        Ok(self.0.expand(row_index).await?)
    }

    /// Set expansion `depth` of the `group_by` tree.
    #[wasm_bindgen]
    pub async fn set_depth(&self, depth: u32) -> ApiResult<()> {
        Ok(self.0.set_depth(depth).await?)
    }
}
