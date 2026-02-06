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

//! WASM bindings for the DuckDB SQL query builder.

use std::str::FromStr;

use indexmap::IndexMap;
use js_sys::Object;
use perspective_client::config::ViewConfig;
use perspective_client::proto::{ColumnType, ViewPort};
use perspective_client::virtual_server::DuckDBSqlBuilder;
use wasm_bindgen::prelude::*;

/// JavaScript-facing DuckDB SQL query builder.
///
/// This struct wraps the Rust `DuckDBSqlBuilder` and exposes it to JavaScript
/// via wasm_bindgen.
#[wasm_bindgen]
pub struct JsDuckDBSqlBuilder {
    inner: DuckDBSqlBuilder,
}

#[wasm_bindgen]
impl JsDuckDBSqlBuilder {
    /// Creates a new `JsDuckDBSqlBuilder` instance.
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            inner: DuckDBSqlBuilder::new(),
        }
    }

    /// Returns the SQL query to list all hosted tables.
    #[wasm_bindgen(js_name = "getHostedTables")]
    pub fn get_hosted_tables(&self) -> Result<String, JsValue> {
        self.inner
            .get_hosted_tables()
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// Returns the SQL query to describe a table's schema.
    #[wasm_bindgen(js_name = "tableSchema")]
    pub fn table_schema(&self, table_id: &str) -> Result<String, JsValue> {
        self.inner
            .table_schema(table_id)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// Returns the SQL query to get the row count of a table.
    #[wasm_bindgen(js_name = "tableSize")]
    pub fn table_size(&self, table_id: &str) -> Result<String, JsValue> {
        self.inner
            .table_size(table_id)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// Returns the SQL query to get the column count of a view.
    #[wasm_bindgen(js_name = "viewColumnSize")]
    pub fn view_column_size(&self, view_id: &str) -> Result<String, JsValue> {
        self.inner
            .view_column_size(view_id)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// Returns the SQL query to validate an expression against a table.
    #[wasm_bindgen(js_name = "tableValidateExpression")]
    pub fn table_validate_expression(
        &self,
        table_id: &str,
        expression: &str,
    ) -> Result<String, JsValue> {
        self.inner
            .table_validate_expression(table_id, expression)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// Returns the SQL query to delete a view.
    #[wasm_bindgen(js_name = "viewDelete")]
    pub fn view_delete(&self, view_id: &str) -> Result<String, JsValue> {
        self.inner
            .view_delete(view_id)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// Returns the SQL query to create a view from a table with the given
    /// configuration.
    #[wasm_bindgen(js_name = "tableMakeView")]
    pub fn table_make_view(
        &self,
        table_id: &str,
        view_id: &str,
        config: JsValue,
    ) -> Result<String, JsValue> {
        let config: ViewConfig = serde_wasm_bindgen::from_value(config)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;

        self.inner
            .table_make_view(table_id, view_id, &config)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// Returns the SQL query to fetch data from a view with the given viewport.
    #[wasm_bindgen(js_name = "viewGetData")]
    pub fn view_get_data(
        &self,
        view_id: &str,
        config: JsValue,
        viewport: JsValue,
        schema: JsValue,
    ) -> Result<String, JsValue> {
        let config: ViewConfig = serde_wasm_bindgen::from_value(config)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;

        let viewport: DuckDBViewPort = serde_wasm_bindgen::from_value(viewport)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;

        let schema = self.parse_schema(schema)?;

        self.inner
            .view_get_data(view_id, &config, &viewport.into(), &schema)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// Returns the SQL query to describe a view's schema.
    #[wasm_bindgen(js_name = "viewSchema")]
    pub fn view_schema(&self, view_id: &str) -> Result<String, JsValue> {
        self.inner
            .view_schema(view_id)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// Returns the SQL query to get the row count of a view.
    #[wasm_bindgen(js_name = "viewSize")]
    pub fn view_size(&self, view_id: &str) -> Result<String, JsValue> {
        self.inner
            .view_size(view_id)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// Returns the features supported by DuckDB virtual server.
    #[wasm_bindgen(js_name = "getFeatures")]
    pub fn get_features(&self) -> Result<JsValue, JsValue> {
        let features = self.inner.get_features();
        serde_wasm_bindgen::to_value(&features).map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// Converts a DuckDB type name to a Perspective column type string.
    #[wasm_bindgen(js_name = "duckdbTypeToPsp")]
    pub fn duckdb_type_to_psp(&self, name: &str) -> Result<String, JsValue> {
        self.inner
            .duckdb_type_to_psp(name)
            .map(|ct| ct.to_string().to_lowercase())
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }
}

impl JsDuckDBSqlBuilder {
    fn parse_schema(&self, schema: JsValue) -> Result<IndexMap<String, ColumnType>, JsValue> {
        let obj = schema.dyn_ref::<Object>().ok_or_else(|| {
            JsValue::from_str("Schema must be an object mapping column names to types")
        })?;

        let mut result = IndexMap::new();
        let entries = Object::entries(obj);
        for i in 0..entries.length() {
            let entry = entries.get(i);
            let entry_array = entry
                .dyn_ref::<js_sys::Array>()
                .ok_or_else(|| JsValue::from_str("Invalid schema entry"))?;
            let key = entry_array
                .get(0)
                .as_string()
                .ok_or_else(|| JsValue::from_str("Column name must be a string"))?;
            let value = entry_array
                .get(1)
                .as_string()
                .ok_or_else(|| JsValue::from_str("Column type must be a string"))?;
            let column_type = ColumnType::from_str(&value)
                .map_err(|_| JsValue::from_str(&format!("Unknown column type: {}", value)))?;
            result.insert(key, column_type);
        }
        Ok(result)
    }
}

impl Default for JsDuckDBSqlBuilder {
    fn default() -> Self {
        Self::new()
    }
}

/// Internal viewport representation for deserialization.
#[derive(serde::Deserialize)]
struct DuckDBViewPort {
    start_row: Option<u32>,
    start_col: Option<u32>,
    end_row: Option<u32>,
    end_col: Option<u32>,
}

impl From<DuckDBViewPort> for ViewPort {
    fn from(value: DuckDBViewPort) -> Self {
        ViewPort {
            start_row: value.start_row,
            start_col: value.start_col,
            end_row: value.end_row,
            end_col: value.end_col,
        }
    }
}
