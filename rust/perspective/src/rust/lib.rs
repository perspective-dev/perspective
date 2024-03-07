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

#![warn(
    clippy::all,
    clippy::panic_in_result_fn,
    clippy::await_holding_refcell_ref
)]

pub mod utils;

use std::cell::RefCell;
use std::rc::Rc;

use extend::ext;
use futures::channel::oneshot::Sender;
use js_sys::{Array, ArrayBuffer, Function, JsString, Object, Reflect, Uint8Array, JSON};
use perspective_client::config::*;
use perspective_client::proto::*;
use perspective_client::*;
use prost::bytes::Bytes;
use prost::Message;
use utils::{ApiResult, LocalPollLoop};
use wasm_bindgen::convert::TryFromJsValue;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use wasm_bindgen_futures::spawn_local;

use crate::utils::{ApiError, ApiFuture, JsValueSerdeExt, ToApiError};

#[cfg(feature = "export-init")]
#[wasm_bindgen]
pub fn init() {
    utils::set_global_logging();
}

#[ext]
impl Vec<(String, ColumnType)> {
    fn from_js_value(value: &JsValue) -> ApiResult<Vec<(String, ColumnType)>> {
        Ok(Object::keys(value.unchecked_ref())
            .iter()
            .map(|x| -> Result<_, JsValue> {
                let key = x.as_string().into_apierror()?;
                let val = Reflect::get(value, &x)?
                    .as_string()
                    .into_apierror()?
                    .into_serde_ext()?;

                Ok((key, val))
            })
            .collect::<Result<Vec<_>, _>>()?)
    }
}

// mod internal {
//     #[wasm_bindgen::prelude::wasm_bindgen(
//         inline_js = "export {JsView as ExternalJsView} from
// '../../perspective.js';"     )]
//     extern "C" {
//         #[wasm_bindgen]
//         pub type ExternalJsView;

//         #[wasm_bindgen(method)]
//         pub fn __get_model(this: &ExternalJsView) -> super::JsView;
//     }
// }

// fn is() {
//     value.dyn_ref::<internal::ExternalJsView>().is_some()
// }

#[ext]
impl TableData {
    fn from_js_value(value: &JsValue) -> ApiResult<TableData> {
        let err_fn = || JsValue::from(format!("Failed to construct Table {:?}", value));
        if value.is_string() {
            Ok(TableData::Csv(value.as_string().into_apierror()?))
        } else if value.is_instance_of::<ArrayBuffer>() {
            let uint8array = Uint8Array::new(value);
            let slice = uint8array.to_vec();
            Ok(TableData::Arrow(slice))
        } else if value.is_instance_of::<Array>() {
            let rows = JSON::stringify(value)?.as_string().into_apierror()?;
            Ok(TableData::JsonRows(rows))
        } else if Reflect::has(value, &"__get_model".into())? {
            let val = Reflect::get(value, &"__get_model".into())?
                .dyn_into::<Function>()?
                .call0(value)?;

            let view = JsView::try_from_js_value(val)?;
            Ok(TableData::View(view.0))
        } else if value.is_instance_of::<Object>() {
            let all_strings = || {
                Object::values(value.unchecked_ref())
                    .to_vec()
                    .iter()
                    .all(|x| x.is_string())
            };
            let all_arrays = || {
                Object::values(value.unchecked_ref())
                    .to_vec()
                    .iter()
                    .all(|x| x.is_instance_of::<Array>())
            };
            if all_strings() {
                Ok(TableData::Schema(Vec::from_js_value(value)?))
            } else if all_arrays() {
                Ok(TableData::JsonColumns(
                    JSON::stringify(value)?.as_string().into_apierror()?,
                ))
            } else {
                Err(err_fn().into())
            }
        } else {
            Err(err_fn().into())
        }
    }
}

#[wasm_bindgen]
pub struct JsClient {
    handler: Rc<RefCell<Option<Sender<()>>>>,
    send: Function,
    client: Client,
}

#[wasm_bindgen]
impl JsClient {
    #[doc = include_str!("../../../perspective-client/docs/table.md")]
    #[wasm_bindgen]
    pub async fn table(&self, value: &JsValue, options: &JsValue) -> ApiResult<JsTable> {
        let args = TableData::from_js_value(value)?;
        let options = options.into_serde_ext::<TableInitOptions>().ok();
        Ok(JsTable(self.client.table(args, options).await?))
    }

    #[doc(hidden)]
    #[wasm_bindgen]
    pub async fn _init(&self, buffer: Option<ArrayBuffer>) -> Result<(), JsValue> {
        let msg = json!({
            "id": 0,
            "cmd": "init",
            "args": buffer.into_iter().collect::<Array>()
        });

        let (sender, receiver) = futures::channel::oneshot::channel();
        *self.handler.borrow_mut() = Some(sender);
        self.send.call1(&JsValue::UNDEFINED, &msg)?;
        receiver.await.unwrap();
        Ok(())
    }

    #[doc(hidden)]
    #[wasm_bindgen]
    pub fn _receive(&self, value: &JsValue) -> ApiResult<()> {
        let uint8array = Uint8Array::new(value);
        let slice = uint8array.to_vec();
        let msg = ResponseEnvelope::decode(Bytes::from(slice))?;
        tracing::debug!("RECV {:?}", msg);
        if msg.msg_id == 0 {
            tracing::info!("Init response received, ignored");
            self.handler
                .borrow_mut()
                .take()
                .ok_or_else(|| ApiError::new("Non-init response received"))?
                .send(())
                .map_err(|()| ApiError::new("Leaked handler"))?;
        } else {
            self.client.receive(msg)?;
        }

        Ok(())
    }
}

#[wasm_bindgen]
pub fn worker(send: Function) -> JsClient {
    let send1 = send.clone();
    let emit = LocalPollLoop::new(move |mut buff: Vec<u8>| {
        let buff2 = unsafe { js_sys::Uint8Array::view_mut_raw(buff.as_mut_ptr(), buff.len()) };
        send1.call1(&JsValue::UNDEFINED, &buff2)
    });

    JsClient {
        handler: Rc::default(),
        send: send.clone(),
        client: Client::new(move |msg| {
            tracing::debug!("SEND {:?}", msg);
            Box::pin(emit.poll(msg.encode_to_vec()))
        }),
    }
}

#[derive(Clone)]
#[wasm_bindgen]
pub struct JsTable(Table);

assert_table_api!(JsTable);

impl From<Table> for JsTable {
    fn from(value: Table) -> Self {
        JsTable(value)
    }
}

impl JsTable {
    pub fn get_table(&self) -> &'_ Table {
        &self.0
    }
}

#[wasm_bindgen]
impl JsTable {
    #[doc = include_str!("../../../perspective-client/docs/table/clear.md")]
    #[wasm_bindgen]
    pub async fn clear(&self) -> ApiResult<()> {
        self.0.clear().await?;
        Ok(())
    }

    #[doc = include_str!("../../../perspective-client/docs/table/delete.md")]
    #[wasm_bindgen]
    pub async fn delete(self) -> ApiResult<()> {
        self.0.delete().await?;
        Ok(())
    }

    #[doc = include_str!("../../../perspective-client/docs/table/size.md")]
    #[wasm_bindgen]
    pub async fn size(&self) -> ApiResult<f64> {
        Ok(self.0.size().await? as f64)
    }

    #[doc = include_str!("../../../perspective-client/docs/table/schema.md")]
    #[wasm_bindgen]
    pub async fn schema(&self) -> ApiResult<JsValue> {
        let schema = self.0.schema().await?;
        Ok(JsValue::from_serde_ext(&schema)?)
    }

    #[doc = include_str!("../../../perspective-client/docs/table/columns.md")]
    #[wasm_bindgen]
    pub async fn columns(&self) -> ApiResult<JsValue> {
        let columns = self.0.columns().await?;
        Ok(JsValue::from_serde_ext(&columns)?)
    }

    #[doc = include_str!("../../../perspective-client/docs/table/make_port.md")]
    #[wasm_bindgen]
    pub async fn make_port(&self) -> ApiResult<i32> {
        Ok(self.0.make_port().await?)
    }

    #[doc = include_str!("../../../perspective-client/docs/table/on_delete.md")]
    #[wasm_bindgen]
    pub async fn on_delete(&self, on_delete: Function) -> ApiResult<u32> {
        let emit = LocalPollLoop::new(move |()| on_delete.call0(&JsValue::UNDEFINED));
        let on_delete = Box::new(move || spawn_local(emit.poll(())));
        Ok(self.0.on_delete(on_delete).await?)
    }

    #[doc = include_str!("../../../perspective-client/docs/table/remove_delete.md")]
    #[wasm_bindgen]
    pub fn remove_delete(&self, callback_id: u32) -> ApiFuture<()> {
        let client = self.0.clone();
        ApiFuture::new(async move {
            client.remove_delete(callback_id).await?;
            Ok(())
        })
    }

    #[doc = include_str!("../../../perspective-client/docs/table/replace.md")]
    #[wasm_bindgen]
    pub async fn remove(&self, value: &JsValue) -> ApiResult<()> {
        let input = TableData::from_js_value(value)?;
        self.0.remove(input).await?;
        Ok(())
    }

    #[doc = include_str!("../../../perspective-client/docs/table/replace.md")]
    #[wasm_bindgen]
    pub async fn replace(&self, input: &JsValue) -> ApiResult<()> {
        let input = TableData::from_js_value(input)?;
        self.0.replace(input).await?;
        Ok(())
    }

    #[doc = include_str!("../../../perspective-client/docs/table/update.md")]
    #[wasm_bindgen]
    pub async fn update(&self, input: &JsValue, options: JsValue) -> ApiResult<()> {
        let input = TableData::from_js_value(input)?;
        let options = options
            .into_serde_ext::<UpdateOptions>()
            .unwrap_or_default();

        self.0.update(input, options).await?;
        Ok(())
    }

    #[doc = include_str!("../../../perspective-client/docs/table/view.md")]
    #[wasm_bindgen]
    pub async fn view(&self, config: JsValue) -> ApiResult<JsView> {
        let config = JsValue::into_serde_ext::<Option<ViewConfigUpdate>>(config)?;
        let view = self.0.view(config).await?;
        Ok(JsView(view))
    }

    #[doc = include_str!("../../../perspective-client/docs/table/validate_expressions.md")]
    #[wasm_bindgen]
    pub async fn validate_expressions(&self, exprs: &JsValue) -> ApiResult<JsValue> {
        let exprs = JsValue::into_serde_ext::<Expressions>(exprs.clone())?;
        let columns = self.0.validate_expressions(exprs).await?;
        Ok(JsValue::from_serde_ext(&columns)?)
    }

    #[allow(clippy::use_self)]
    #[doc(hidden)]
    pub fn unsafe_get_model(&self) -> *const JsTable {
        std::ptr::addr_of!(*self)
    }
}

// #[derive(TryFromJsValue)]
#[wasm_bindgen]
#[derive(Clone)]
pub struct JsView(View);

assert_view_api!(JsView);

impl From<View> for JsView {
    fn from(value: View) -> Self {
        JsView(value)
    }
}

#[wasm_bindgen]
impl JsView {
    pub fn __get_model(&self) -> JsView {
        self.clone()
    }

    #[doc = include_str!("../../../perspective-client/docs/view/column_paths.md")]
    #[wasm_bindgen]
    pub async fn column_paths(&self) -> ApiResult<JsValue> {
        let columns = self.0.column_paths().await?;
        Ok(JsValue::from_serde_ext(&columns)?)
    }

    #[doc = include_str!("../../../perspective-client/docs/view/col_to_js_typed_array.md")]
    #[wasm_bindgen]
    pub async fn col_to_js_typed_array(&self, column: &JsString) -> ApiResult<ArrayBuffer> {
        let column = column.as_string().into_apierror()?;
        let arrow = self.0.col_to_js_typed_array(column.as_str()).await?;
        Ok(js_sys::Uint8Array::from(&arrow[..])
            .buffer()
            .unchecked_into())
    }

    #[doc = include_str!("../../../perspective-client/docs/view/delete.md")]
    #[wasm_bindgen]
    pub async fn delete(self) -> ApiResult<()> {
        self.0.delete().await?;
        Ok(())
    }

    #[doc = include_str!("../../../perspective-client/docs/view/dimensions.md")]
    #[wasm_bindgen]
    pub async fn dimensions(&self) -> ApiResult<JsValue> {
        let dimensions = self.0.dimensions().await?;
        Ok(JsValue::from_serde_ext(&dimensions)?)
    }

    #[doc = include_str!("../../../perspective-client/docs/view/expression_schema.md")]
    #[wasm_bindgen]
    pub async fn expression_schema(&self) -> ApiResult<JsValue> {
        let schema = self.0.expression_schema().await?;
        Ok(JsValue::from_serde_ext(&schema)?)
    }

    #[doc = include_str!("../../../perspective-client/docs/view/get_config.md")]
    #[wasm_bindgen]
    pub async fn get_config(&self) -> ApiResult<JsValue> {
        let config = self.0.get_config().await?;
        Ok(JsValue::from_serde_ext(&config)?)
    }

    #[doc = include_str!("../../../perspective-client/docs/view/get_min_max.md")]
    #[wasm_bindgen]
    pub async fn get_min_max(&self, name: String) -> ApiResult<Array> {
        let result = self.0.get_min_max(name).await?;
        Ok([result.0, result.1]
            .iter()
            .map(|x| js_sys::JSON::parse(x))
            .collect::<Result<_, _>>()?)
    }

    #[doc = include_str!("../../../perspective-client/docs/view/num_rows.md")]
    #[wasm_bindgen]
    pub async fn num_rows(&self) -> ApiResult<i32> {
        let size = self.0.num_rows().await?;
        Ok(size as i32)
    }

    #[doc = include_str!("../../../perspective-client/docs/view/schema.md")]
    #[wasm_bindgen]
    pub async fn schema(&self) -> ApiResult<JsValue> {
        let schema = self.0.schema().await?;
        Ok(JsValue::from_serde_ext(&schema)?)
    }

    #[doc = include_str!("../../../perspective-client/docs/view/to_arrow.md")]
    #[wasm_bindgen]
    pub async fn to_arrow(&self, window: &JsValue) -> ApiResult<ArrayBuffer> {
        let window = JsValue::into_serde_ext::<Option<ViewWindow>>(window.clone())?;
        let arrow = self.0.to_arrow(window.unwrap_or_default()).await?;
        Ok(js_sys::Uint8Array::from(&arrow[..])
            .buffer()
            .unchecked_into())
    }

    #[doc = include_str!("../../../perspective-client/docs/view/to_columns_string.md")]
    #[wasm_bindgen]
    pub async fn to_columns_string(&self, window: &JsValue) -> ApiResult<String> {
        let window = JsValue::into_serde_ext::<Option<ViewWindow>>(window.clone())?;
        let json = self.0.to_columns_string(window.unwrap_or_default()).await?;
        Ok(json)
    }

    #[doc = include_str!("../../../perspective-client/docs/view/to_columns.md")]
    #[wasm_bindgen]
    pub async fn to_columns(&self, window: &JsValue) -> ApiResult<Object> {
        let json = self.to_columns_string(window).await?;
        Ok(js_sys::JSON::parse(&json)?.unchecked_into())
    }

    #[doc = include_str!("../../../perspective-client/docs/view/to_json_string.md")]
    #[wasm_bindgen]
    pub async fn to_json_string(&self, window: &JsValue) -> ApiResult<String> {
        let window = JsValue::into_serde_ext::<Option<ViewWindow>>(window.clone())?;
        let json = self.0.to_json_string(window.unwrap_or_default()).await?;
        Ok(json)
    }

    #[doc = include_str!("../../../perspective-client/docs/view/to_json.md")]
    #[wasm_bindgen]
    pub async fn to_json(&self, window: &JsValue) -> ApiResult<Object> {
        let json = self.to_json_string(window).await?;
        Ok(js_sys::JSON::parse(&json)?.unchecked_into())
    }

    #[doc = include_str!("../../../perspective-client/docs/view/to_csv.md")]
    #[wasm_bindgen]
    pub async fn to_csv(&self, window: &JsValue) -> ApiResult<JsString> {
        let window = JsValue::into_serde_ext::<Option<ViewWindow>>(window.clone())?;
        let csv = self.0.to_csv(window.unwrap_or_default()).await?;
        Ok(JsString::from(csv))
    }

    #[doc = include_str!("../../../perspective-client/docs/view/on_update.md")]
    #[wasm_bindgen]
    pub async fn on_update(&self, on_update: Function, options: &JsValue) -> ApiResult<u32> {
        let emit = LocalPollLoop::new(move |(arrow, port_id): (Option<Vec<u8>>, u32)| {
            let js_obj = js_sys::Object::new();
            if let Some(arrow) = arrow {
                if let Err(err) = js_sys::Reflect::set(
                    &js_obj,
                    &"delta".into(),
                    &js_sys::Uint8Array::from(&arrow[..]).buffer(),
                ) {
                    tracing::error!("Failed to set data: {:?}", err);
                }
            }
            if let Err(err) = js_sys::Reflect::set(&js_obj, &"port_id".into(), &port_id.into()) {
                tracing::error!(
                    "Failed to set port_id:
            {:?}",
                    err
                );
            }
            on_update.call1(&JsValue::UNDEFINED, &js_obj)
        });
        let on_update = Box::new(move |msg| spawn_local(emit.poll(msg)));
        let on_update_opts = options
            .into_serde_ext::<OnUpdateOptions>()
            .ok()
            .unwrap_or_default();
        Ok(self.0.on_update(on_update, on_update_opts).await?)
    }

    #[doc = include_str!("../../../perspective-client/docs/view/remove_update.md")]
    #[wasm_bindgen]
    pub async fn remove_update(
        &self,
        _on_update: Function,
        _options: &JsValue,
    ) -> Result<(), JsValue> {
        Ok(())
    }

    #[doc = include_str!("../../../perspective-client/docs/view/on_delete.md")]
    #[wasm_bindgen]
    pub async fn on_delete(&self, on_delete: Function) -> ApiResult<u32> {
        let emit = LocalPollLoop::new(move |()| on_delete.call0(&JsValue::UNDEFINED));
        let on_delete = Box::new(move || spawn_local(emit.poll(())));
        Ok(self.0.on_delete(on_delete).await?)
    }

    #[doc = include_str!("../../../perspective-client/docs/view/remove_delete.md")]
    #[wasm_bindgen]
    pub fn remove_delete(&self, callback_id: u32) -> ApiFuture<()> {
        let client = self.0.clone();
        ApiFuture::new(async move {
            client.remove_delete(callback_id).await?;
            Ok(())
        })
    }
}
