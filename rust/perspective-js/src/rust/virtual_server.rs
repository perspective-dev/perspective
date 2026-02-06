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

use std::cell::UnsafeCell;
use std::future::Future;
use std::pin::Pin;
use std::rc::Rc;
use std::str::FromStr;
use std::sync::{Arc, Mutex};

use indexmap::IndexMap;
use js_sys::{Array, Date, Object, Reflect};
use perspective_client::config::ViewConfig;
use perspective_client::proto::{ColumnType, HostedTable};
use perspective_client::virtual_server::{
    Features, ResultExt, VirtualDataSlice, VirtualServer, VirtualServerHandler,
};
use serde::Serialize;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;

use crate::JsViewConfig;
use crate::utils::{ApiError, ApiFuture, *};

// Conditional type alias matching the trait definition
#[cfg(target_arch = "wasm32")]
type HandlerFuture<T> = Pin<Box<dyn Future<Output = T>>>;

#[cfg(not(target_arch = "wasm32"))]
type HandlerFuture<T> = Pin<Box<dyn Future<Output = T> + Send>>;

#[derive(Debug)]
pub struct JsError(JsValue);

impl std::fmt::Display for JsError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:?}", self.0)
    }
}

impl std::error::Error for JsError {}

impl From<JsValue> for JsError {
    fn from(value: JsValue) -> Self {
        JsError(value)
    }
}

impl From<JsError> for JsValue {
    fn from(error: JsError) -> Self {
        error.0
    }
}

impl From<serde_wasm_bindgen::Error> for JsError {
    fn from(error: serde_wasm_bindgen::Error) -> Self {
        JsError(error.into())
    }
}

// SAFETY: In WASM, we're always single-threaded, so JsError can safely be Send
// + Sync
unsafe impl Send for JsError {}
unsafe impl Sync for JsError {}

pub struct JsServerHandler(Object);

unsafe impl Send for JsServerHandler {}
unsafe impl Sync for JsServerHandler {}

impl JsServerHandler {
    fn call_method_js(&self, method: &str, args: &Array) -> Result<JsValue, JsError> {
        let func = Reflect::get(&self.0, &JsValue::from_str(method))?;
        let func = func
            .dyn_ref::<js_sys::Function>()
            .ok_or_else(|| JsError(JsValue::from_str(&format!("{} is not a function", method))))?;
        Ok(func.apply(&self.0, args)?)
    }

    async fn call_method_js_async(&self, method: &str, args: &Array) -> Result<JsValue, JsError> {
        let result = self.call_method_js(method, args)?;

        // Check if result is a Promise
        if result.is_instance_of::<js_sys::Promise>() {
            let promise = js_sys::Promise::from(result);
            JsFuture::from(promise).await.map_err(|e| JsError(e))
        } else {
            Ok(result)
        }
    }
}

impl VirtualServerHandler for JsServerHandler {
    type Error = JsError;

    fn get_features(&self) -> HandlerFuture<Result<Features<'_>, Self::Error>> {
        let has_method = Reflect::get(&self.0, &JsValue::from_str("getFeatures"))
            .map(|val| !val.is_undefined())
            .unwrap_or(false);

        if !has_method {
            return Box::pin(async { Ok(Features::default()) });
        }

        let handler = self.0.clone();
        Box::pin(async move {
            let this = JsServerHandler(handler);
            let args = Array::new();
            let result = this.call_method_js_async("getFeatures", &args).await?;
            Ok(serde_wasm_bindgen::from_value(result)?)
        })
    }

    fn get_hosted_tables(&self) -> HandlerFuture<Result<Vec<HostedTable>, Self::Error>> {
        let handler = self.0.clone();
        Box::pin(async move {
            let this = JsServerHandler(handler);
            let args = Array::new();
            let result = this.call_method_js_async("getHostedTables", &args).await?;
            let array = result.dyn_ref::<Array>().ok_or_else(|| {
                JsError(JsValue::from_str("getHostedTables must return an array"))
            })?;

            let mut tables = Vec::new();
            for i in 0..array.length() {
                let item = array.get(i);
                if let Some(s) = item.as_string() {
                    tables.push(HostedTable {
                        entity_id: s,
                        index: None,
                        limit: None,
                    });
                } else if item.is_object() {
                    let name = Reflect::get(&item, &JsValue::from_str("name"))?
                        .as_string()
                        .ok_or_else(|| JsError(JsValue::from_str("name must be a string")))?;
                    let index = Reflect::get(&item, &JsValue::from_str("index"))
                        .ok()
                        .and_then(|v| v.as_string());
                    let limit = Reflect::get(&item, &JsValue::from_str("limit"))
                        .ok()
                        .and_then(|v| v.as_f64().map(|x| x as u32));
                    tables.push(HostedTable {
                        entity_id: name,
                        index,
                        limit,
                    });
                }
            }
            Ok(tables)
        })
    }

    fn table_schema(
        &self,
        table_id: &str,
    ) -> HandlerFuture<Result<IndexMap<String, ColumnType>, Self::Error>> {
        let handler = self.0.clone();
        let table_id = table_id.to_string();
        Box::pin(async move {
            let this = JsServerHandler(handler);
            let args = Array::new();
            args.push(&JsValue::from_str(&table_id));
            let result = this.call_method_js_async("tableSchema", &args).await?;
            let obj = result
                .dyn_ref::<Object>()
                .ok_or_else(|| JsError(JsValue::from_str("tableSchema must return an object")))?;

            let mut schema = IndexMap::new();
            let entries = Object::entries(obj);
            for i in 0..entries.length() {
                let entry = entries.get(i);
                let entry_array = entry.dyn_ref::<Array>().unwrap();
                let key = entry_array.get(0).as_string().unwrap();
                let value = entry_array.get(1).as_string().unwrap();
                schema.insert(key, ColumnType::from_str(&value).unwrap());
            }
            Ok(schema)
        })
    }

    fn table_size(&self, table_id: &str) -> HandlerFuture<Result<u32, Self::Error>> {
        let handler = self.0.clone();
        let table_id = table_id.to_string();
        Box::pin(async move {
            let this = JsServerHandler(handler);
            let args = Array::new();
            args.push(&JsValue::from_str(&table_id));
            let result = this.call_method_js_async("tableSize", &args).await?;
            result
                .as_f64()
                .map(|x| x as u32)
                .ok_or_else(|| JsError(JsValue::from_str("tableSize must return a number")))
        })
    }

    fn table_column_size(&self, view_id: &str) -> HandlerFuture<Result<u32, Self::Error>> {
        let has_method = Reflect::get(&self.0, &JsValue::from_str("tableColumnsSize"))
            .map(|val| !val.is_undefined())
            .unwrap_or(false);

        let handler = self.0.clone();
        let view_id = view_id.to_string();
        Box::pin(async move {
            let this = JsServerHandler(handler);
            let args = Array::new();
            args.push(&JsValue::from_str(&view_id));
            if has_method {
                let result = this.call_method_js_async("tableColumnsSize", &args).await?;
                result.as_f64().map(|x| x as u32).ok_or_else(|| {
                    JsError(JsValue::from_str(
                        "tableColumnsSize must
    return a number",
                    ))
                })
            } else {
                Ok(this.table_schema(view_id.as_str()).await?.len() as u32)
            }
        })
    }

    fn table_validate_expression(
        &self,
        table_id: &str,
        expression: &str,
    ) -> HandlerFuture<Result<ColumnType, Self::Error>> {
        // TODO Cache these inspection calls
        let has_method = Reflect::get(&self.0, &JsValue::from_str("tableValidateExpression"))
            .map(|val| !val.is_undefined())
            .unwrap_or(false);

        let handler = self.0.clone();
        let table_id = table_id.to_string();
        let expression = expression.to_string();
        Box::pin(async move {
            if !has_method {
                return Err(JsError(JsValue::from_str(
                    "feature `table_validate_expression` not implemented",
                )));
            }

            let this = JsServerHandler(handler);
            let args = Array::new();
            args.push(&JsValue::from_str(&table_id));
            args.push(&JsValue::from_str(&expression));
            let result = this
                .call_method_js_async("tableValidateExpression", &args)
                .await?;

            let type_str = result
                .as_string()
                .ok_or_else(|| JsError(JsValue::from_str("Must return a string")))?;

            Ok(ColumnType::from_str(&type_str).unwrap())
        })
    }

    fn table_make_view(
        &mut self,
        table_id: &str,
        view_id: &str,
        config: &mut perspective_client::config::ViewConfigUpdate,
    ) -> HandlerFuture<Result<String, Self::Error>> {
        let handler = self.0.clone();
        let table_id = table_id.to_string();
        let view_id = view_id.to_string();
        let config = config.clone();
        Box::pin(async move {
            let this = JsServerHandler(handler);
            let args = Array::new();
            args.push(&JsValue::from_str(&table_id));
            args.push(&JsValue::from_str(&view_id));
            args.push(&JsValue::from_serde_ext(&config)?);
            let _ = this.call_method_js_async("tableMakeView", &args).await?;
            Ok(view_id.to_string())
        })
    }

    fn view_schema(
        &self,
        view_id: &str,
        config: &perspective_client::config::ViewConfig,
    ) -> HandlerFuture<Result<IndexMap<String, ColumnType>, Self::Error>> {
        let has_view_schema = Reflect::get(&self.0, &JsValue::from_str("viewSchema"))
            .is_ok_and(|v| !v.is_undefined());

        let handler = self.0.clone();
        let view_id = view_id.to_string();
        let config_value = if has_view_schema {
            serde_wasm_bindgen::to_value(config).ok()
        } else {
            None
        };

        Box::pin(async move {
            let this = JsServerHandler(handler);
            let args = Array::new();
            args.push(&JsValue::from_str(&view_id));
            if let Some(cv) = config_value {
                args.push(&cv);
            }

            let result = this
                .call_method_js_async(
                    if has_view_schema {
                        "viewSchema"
                    } else {
                        "tableSchema"
                    },
                    &args,
                )
                .await?;

            let obj = result
                .dyn_ref::<Object>()
                .ok_or_else(|| JsError(JsValue::from_str("viewSchema must return an object")))?;

            let mut schema = IndexMap::new();
            let entries = Object::entries(obj);
            for i in 0..entries.length() {
                let entry = entries.get(i);
                let entry_array = entry.dyn_ref::<Array>().unwrap();
                let key = entry_array.get(0).as_string().unwrap();
                let value = entry_array.get(1).as_string().unwrap();
                schema.insert(key, ColumnType::from_str(&value).unwrap());
            }

            Ok(schema)
        })
    }

    fn view_size(&self, view_id: &str) -> HandlerFuture<Result<u32, Self::Error>> {
        let handler = self.0.clone();
        let view_id = view_id.to_string();
        let has_view_size =
            Reflect::get(&self.0, &JsValue::from_str("viewSize")).is_ok_and(|v| !v.is_undefined());

        Box::pin(async move {
            let this = JsServerHandler(handler);
            let args = Array::new();
            args.push(&JsValue::from_str(&view_id));
            let result = this
                .call_method_js_async(
                    if has_view_size {
                        "viewSize"
                    } else {
                        "tableSize"
                    },
                    &args,
                )
                .await?;

            result
                .as_f64()
                .map(|x| x as u32)
                .ok_or_else(|| JsError(JsValue::from_str("viewSize must return a number")))
        })
    }

    fn view_column_size(
        &self,
        view_id: &str,
        config: &perspective_client::config::ViewConfig,
    ) -> HandlerFuture<Result<u32, Self::Error>> {
        let has_method = Reflect::get(&self.0, &JsValue::from_str("viewColumnSize"))
            .map(|val| !val.is_undefined())
            .unwrap_or(false);

        let handler = self.0.clone();
        let view_id = view_id.to_string();
        let config_value = serde_wasm_bindgen::to_value(config).unwrap();
        let config = config.clone();
        Box::pin(async move {
            let this = JsServerHandler(handler);
            let args = Array::new();
            args.push(&JsValue::from_str(&view_id));
            args.push(&config_value);
            if has_method {
                let result = this.call_method_js_async("viewColumnSize", &args).await?;
                result.as_f64().map(|x| x as u32).ok_or_else(|| {
                    JsError(JsValue::from_str("viewColumnSize must return a number"))
                })
            } else {
                Ok(this.view_schema(view_id.as_str(), &config).await?.len() as u32)
            }
        })
    }

    fn view_delete(&self, view_id: &str) -> HandlerFuture<Result<(), Self::Error>> {
        let handler = self.0.clone();
        let view_id = view_id.to_string();
        Box::pin(async move {
            let this = JsServerHandler(handler);
            let args = Array::new();
            args.push(&JsValue::from_str(&view_id));
            this.call_method_js_async("viewDelete", &args).await?;
            Ok(())
        })
    }

    fn table_make_port(
        &self,
        _req: &perspective_client::proto::TableMakePortReq,
    ) -> HandlerFuture<Result<u32, Self::Error>> {
        let has_method = Reflect::get(&self.0, &JsValue::from_str("tableMakePort"))
            .map(|val| !val.is_undefined())
            .unwrap_or(false);

        if !has_method {
            return Box::pin(async { Ok(0) });
        }

        let handler = self.0.clone();
        Box::pin(async move {
            let this = JsServerHandler(handler);
            let args = Array::new();
            let result = this.call_method_js_async("tableMakePort", &args).await?;
            result
                .as_f64()
                .map(|x| x as u32)
                .ok_or_else(|| JsError(JsValue::from_str("tableMakePort must return a number")))
        })
    }

    fn make_table(
        &mut self,
        table_id: &str,
        data: &perspective_client::proto::MakeTableData,
    ) -> HandlerFuture<Result<(), Self::Error>> {
        let has_method = Reflect::get(&self.0, &JsValue::from_str("makeTable"))
            .map(|val| !val.is_undefined())
            .unwrap_or(false);

        if !has_method {
            return Box::pin(async {
                Err(JsError(JsValue::from_str("makeTable not implemented")))
            });
        }

        let handler = self.0.clone();
        let table_id = table_id.to_string();

        use perspective_client::proto::make_table_data::Data;
        let data_value = match &data.data {
            Some(Data::FromCsv(csv)) => JsValue::from_str(csv),
            Some(Data::FromArrow(arrow)) => {
                let uint8array = js_sys::Uint8Array::from(arrow.as_slice());
                JsValue::from(uint8array)
            },
            Some(Data::FromRows(rows)) => JsValue::from_str(rows),
            Some(Data::FromCols(cols)) => JsValue::from_str(cols),
            Some(Data::FromNdjson(ndjson)) => JsValue::from_str(ndjson),
            _ => JsValue::from_str(""),
        };

        Box::pin(async move {
            let this = JsServerHandler(handler);
            let args = Array::new();
            args.push(&JsValue::from_str(&table_id));
            args.push(&data_value);
            this.call_method_js_async("makeTable", &args).await?;
            Ok(())
        })
    }

    fn view_get_data(
        &self,
        view_id: &str,
        config: &perspective_client::config::ViewConfig,
        viewport: &perspective_client::proto::ViewPort,
    ) -> HandlerFuture<Result<VirtualDataSlice, Self::Error>> {
        let handler = self.0.clone();
        let view_id = view_id.to_string();
        let window: JsViewPort = viewport.clone().into();
        let config_value = serde_wasm_bindgen::to_value(config).unwrap();
        let window_value = serde_wasm_bindgen::to_value(&window).unwrap();


        Box::pin(async move {
            let this = JsServerHandler(handler);
            let data = JsVirtualDataSlice::new(config_value.clone().unchecked_into());

            {
                let args = Array::new();
                args.push(&JsValue::from_str(&view_id));
                args.push(&config_value);
                args.push(&window_value);
                args.push(&JsValue::from(data.clone()));
                this.call_method_js_async("viewGetData", &args).await?;
            }

            // Lock the mutex and take ownership of the inner data
            // We can't unwrap the Arc because the JsValue might still hold a reference
            let JsVirtualDataSlice(_obj, arc) = data;
            let slice = std::mem::take(&mut *arc.lock().unwrap()).unwrap();
            Ok(slice)
        })
    }
}

#[derive(Serialize, PartialEq)]
pub struct JsViewPort {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_row: ::core::option::Option<u32>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_col: ::core::option::Option<u32>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub end_row: ::core::option::Option<u32>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub end_col: ::core::option::Option<u32>,
}

impl From<perspective_client::proto::ViewPort> for JsViewPort {
    fn from(value: perspective_client::proto::ViewPort) -> Self {
        JsViewPort {
            start_row: value.start_row,
            start_col: value.start_col,
            end_row: value.end_row,
            end_col: value.end_col,
        }
    }
}

#[wasm_bindgen]
#[derive(Clone)]
pub struct JsVirtualDataSlice(Object, Arc<Mutex<Option<VirtualDataSlice>>>);

// impl Default for JsVirtualDataSlice {
//     fn new() -> Self {
//         JsVirtualDataSlice(
//             Object::new(),
//             Arc::new(Mutex::new(VirtualDataSlice::new(config))),
//         )
//     }
// }

#[wasm_bindgen]
impl JsVirtualDataSlice {
    #[wasm_bindgen(constructor)]
    pub fn new(config: JsViewConfig) -> Self {
        JsVirtualDataSlice(
            Object::new(),
            Arc::new(Mutex::new(Some(VirtualDataSlice::new(config.into_serde_ext().unwrap())))),
        )
    }

    #[wasm_bindgen(js_name = "setCol")]
    pub fn set_col(
        &self,
        dtype: &str,
        name: &str,
        index: u32,
        val: JsValue,
        group_by_index: Option<usize>,
    ) -> Result<(), JsValue> {
        match dtype {
            "string" => self.set_string_col(name, index, val, group_by_index),
            "integer" => self.set_integer_col(name, index, val, group_by_index),
            "float" => self.set_float_col(name, index, val, group_by_index),
            "date" => self.set_datetime_col(name, index, val, group_by_index),
            "datetime" => self.set_datetime_col(name, index, val, group_by_index),
            "boolean" => self.set_boolean_col(name, index, val, group_by_index),
            _ => Err(JsValue::from_str("Unknown type")),
        }
    }

    #[wasm_bindgen(js_name = "setStringCol")]
    pub fn set_string_col(
        &self,
        name: &str,
        index: u32,
        val: JsValue,
        group_by_index: Option<usize>,
    ) -> Result<(), JsValue> {
        if val.is_null() || val.is_undefined() {
            self.1
                .lock()
                .unwrap()
                .as_mut()
                .unwrap()
                .set_col(name, group_by_index, index as usize, None as Option<String>)
                .unwrap();
        } else if let Some(s) = val.as_string() {
            self.1
                .lock()
                .unwrap().as_mut()
                .unwrap()
                .set_col(name, group_by_index, index as usize, Some(s))
                .unwrap();
        } else {
            tracing::error!("Unhandled string value");
        }
        Ok(())
    }

    #[wasm_bindgen(js_name = "setIntegerCol")]
    pub fn set_integer_col(
        &self,
        name: &str,
        index: u32,
        val: JsValue,
        group_by_index: Option<usize>,
    ) -> Result<(), JsValue> {
        if val.is_null() || val.is_undefined() {
            self.1
                .lock()
                .unwrap().as_mut()
                .unwrap()
                .set_col(name, group_by_index, index as usize, None as Option<i32>)
                .unwrap();
        } else if let Some(n) = val.as_f64() {
            self.1
                .lock()
                .unwrap().as_mut()
                .unwrap()
                .set_col(name, group_by_index, index as usize, Some(n as i32))
                .unwrap();
        } else {
            tracing::error!("Unhandled integer value");
        }
        Ok(())
    }

    #[wasm_bindgen(js_name = "setFloatCol")]
    pub fn set_float_col(
        &self,
        name: &str,
        index: u32,
        val: JsValue,
        group_by_index: Option<usize>,
    ) -> Result<(), JsValue> {
        if val.is_null() || val.is_undefined() {
            self.1
                .lock()
                .unwrap().as_mut().unwrap()
                .set_col(name, group_by_index, index as usize, None as Option<f64>)
                .unwrap();
        } else if let Some(n) = val.as_f64() {
            self.1
                .lock()
                .unwrap().as_mut().unwrap()
                .set_col(name, group_by_index, index as usize, Some(n))
                .unwrap();
        } else {
            tracing::error!("Unhandled float value");
        }
        Ok(())
    }

    #[wasm_bindgen(js_name = "setBooleanCol")]
    pub fn set_boolean_col(
        &self,
        name: &str,
        index: u32,
        val: JsValue,
        group_by_index: Option<usize>,
    ) -> Result<(), JsValue> {
        if val.is_null() || val.is_undefined() {
            self.1
                .lock()
                .unwrap().as_mut().unwrap()
                .set_col(name, group_by_index, index as usize, None as Option<bool>)
                .unwrap();
        } else if let Some(b) = val.as_bool() {
            self.1
                .lock()
                .unwrap().as_mut().unwrap()
                .set_col(name, group_by_index, index as usize, Some(b))
                .unwrap();
        } else {
            tracing::error!("Unhandled boolean value");
        }
        Ok(())
    }

    #[wasm_bindgen(js_name = "setDatetimeCol")]
    pub fn set_datetime_col(
        &self,
        name: &str,
        index: u32,
        val: JsValue,
        group_by_index: Option<usize>,
    ) -> Result<(), JsValue> {
        if val.is_null() || val.is_undefined() {
            self.1
                .lock()
                .unwrap().as_mut().unwrap()
                .set_col(name, group_by_index, index as usize, None as Option<i64>)
                .unwrap();
        } else if let Some(date) = val.dyn_ref::<Date>() {
            let timestamp = date.get_time() as i64;
            self.1
                .lock()
                .unwrap().as_mut().unwrap()
                .set_col(name, group_by_index, index as usize, Some(timestamp))
                .unwrap();
        } else if let Some(n) = val.as_f64() {
            self.1
                .lock()
                .unwrap().as_mut().unwrap()
                .set_col(name, group_by_index, index as usize, Some(n as i64))
                .unwrap();
        } else {
            tracing::error!("Unhandled datetime value");
        }
        Ok(())
    }
}

#[wasm_bindgen]
pub struct JsVirtualServer(Rc<UnsafeCell<VirtualServer<JsServerHandler>>>);

#[wasm_bindgen]
impl JsVirtualServer {
    #[wasm_bindgen(constructor)]
    pub fn new(handler: Object) -> Result<JsVirtualServer, JsValue> {
        Ok(JsVirtualServer(Rc::new(UnsafeCell::new(
            VirtualServer::new(JsServerHandler(handler)),
        ))))
    }

    #[wasm_bindgen(js_name = "handleRequest")]
    pub fn handle_request(&self, bytes: &[u8]) -> ApiFuture<Vec<u8>> {
        let bytes = bytes.to_vec();
        let server = self.0.clone();

        ApiFuture::new(async move {
            // SAFETY:
            // - WASM is single-threaded
            // - JS re-entrancy is allowed by design
            // - VirtualServer must tolerate re-entrant mutation
            let result = unsafe {
                (&mut *server.as_ref().get())
                    .handle_request(bytes::Bytes::from(bytes))
                    .await
            };

            match result.get_internal_error() {
                Ok(x) => Ok(x.to_vec()),
                Err(Ok(x)) => Err(ApiError::from(JsValue::from(x))),
                Err(Err(x)) => Err(ApiError::from(JsValue::from_str(&x))),
            }
        })
    }
}
