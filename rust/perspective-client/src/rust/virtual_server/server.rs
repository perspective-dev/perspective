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

use indexmap::IndexMap;
use prost::Message as ProstMessage;
use prost::bytes::{Bytes, BytesMut};

use super::data::RowPathStyle;
use super::error::VirtualServerError;
use super::handler::VirtualServerHandler;
use crate::config::{ViewConfig, ViewConfigUpdate};
use crate::proto::response::ClientResp;
use crate::proto::table_validate_expr_resp::ExprValidationError;
use crate::proto::{
    ColumnType, GetFeaturesResp, GetHostedTablesResp, MakeTableResp, Request, Response,
    ServerError, TableMakePortResp, TableMakeViewResp, TableOnDeleteResp, TableRemoveDeleteResp,
    TableSchemaResp, TableSizeResp, TableValidateExprResp, ViewColumnPathsResp, ViewDeleteResp,
    ViewDimensionsResp, ViewExpressionSchemaResp, ViewGetConfigResp, ViewGetMinMaxResp,
    ViewOnDeleteResp, ViewOnUpdateResp, ViewRemoveDeleteResp, ViewRemoveOnUpdateResp,
    ViewSchemaResp, ViewToArrowResp, ViewToColumnsStringResp, ViewToCsvResp,
    ViewToNdjsonStringResp, ViewToRowsStringResp,
};

macro_rules! respond {
    ($msg:ident, $name:ident { $($rest:tt)* }) => {{
        let mut resp = BytesMut::new();
        let resp2 = ClientResp::$name($name {
            $($rest)*
        });

        Response {
            msg_id: $msg.msg_id,
            entity_id: $msg.entity_id,
            client_resp: Some(resp2),
        }.encode(&mut resp).map_err(VirtualServerError::EncodeError)?;

        resp.freeze()
    }};
}

/// A virtual server that processes Perspective protocol messages.
///
/// `VirtualServer` acts as a bridge between the Perspective protocol and a
/// custom data backend. It handles protocol decoding/encoding and delegates
/// actual data operations to the provided [`VirtualServerHandler`].
pub struct VirtualServer<T: VirtualServerHandler> {
    handler: T,
    view_to_table: IndexMap<String, String>,
    view_configs: IndexMap<String, ViewConfig>,
    view_schemas: IndexMap<String, IndexMap<String, ColumnType>>,
}

impl<T: VirtualServerHandler> VirtualServer<T> {
    /// Creates a new virtual server with the given handler.
    pub fn new(handler: T) -> Self {
        Self {
            handler,
            view_configs: IndexMap::default(),
            view_to_table: IndexMap::default(),
            view_schemas: IndexMap::default(),
        }
    }

    /// Processes a Perspective protocol request and returns the response.
    ///
    /// Decodes the incoming protobuf message, dispatches to the appropriate
    /// handler method, and encodes the response.
    pub async fn handle_request(
        &mut self,
        bytes: Bytes,
    ) -> Result<Bytes, VirtualServerError<T::Error>> {
        let msg = Request::decode(bytes).map_err(VirtualServerError::DecodeError)?;
        tracing::debug!(
            "Handling request: entity_id={}, req={:?}",
            msg.entity_id,
            msg.client_req
        );

        match self.internal_handle_request(msg.clone()).await {
            Ok(resp) => Ok(resp),
            Err(err) => {
                tracing::error!("{}", err);
                Ok(respond!(msg, ServerError {
                    message: err.to_string(),
                    status_code: 0
                }))
            },
        }
    }

    async fn get_cached_view_schema(
        &mut self,
        entity_id: &str,
        to_psp_format: bool,
    ) -> Result<IndexMap<String, ColumnType>, VirtualServerError<T::Error>> {
        if !self.view_schemas.contains_key(entity_id) {
            self.view_schemas.insert(
                entity_id.to_string(),
                self.handler
                    .view_schema(entity_id, self.view_configs.get(entity_id).unwrap())
                    .await?,
            );
        }

        if to_psp_format {
            Ok(self
                .view_schemas
                .get(entity_id)
                .unwrap()
                .iter()
                .map(|(k, v)| {
                    (
                        k.split("_").collect::<Vec<_>>().last().unwrap().to_string(),
                        *v,
                    )
                })
                .collect())
        } else {
            Ok(self.view_schemas.get(entity_id).cloned().unwrap())
        }
    }

    async fn internal_handle_request(
        &mut self,
        msg: Request,
    ) -> Result<Bytes, VirtualServerError<T::Error>> {
        use crate::proto::request::ClientReq::*;
        let resp = match msg.client_req.unwrap() {
            GetFeaturesReq(_) => {
                let features = self.handler.get_features().await?;
                respond!(msg, GetFeaturesResp { ..features.into() })
            },
            GetHostedTablesReq(_) => {
                respond!(msg, GetHostedTablesResp {
                    table_infos: self.handler.get_hosted_tables().await?
                })
            },
            TableSchemaReq(_) => {
                respond!(msg, TableSchemaResp {
                    schema: Some(crate::proto::Schema {
                        schema: self
                            .handler
                            .table_schema(msg.entity_id.as_str())
                            .await?
                            .iter()
                            .map(|x| crate::proto::schema::KeyTypePair {
                                name: x.0.to_string(),
                                r#type: *x.1 as i32,
                            })
                            .collect()
                    })
                })
            },
            TableMakePortReq(req) => {
                respond!(msg, TableMakePortResp {
                    port_id: self.handler.table_make_port(&req).await?
                })
            },
            TableMakeViewReq(req) => {
                self.view_to_table
                    .insert(req.view_id.clone(), msg.entity_id.clone());

                let mut config: ViewConfigUpdate = req.config.clone().unwrap_or_default().into();
                let bytes = respond!(msg, TableMakeViewResp {
                    view_id: self
                        .handler
                        .table_make_view(msg.entity_id.as_str(), req.view_id.as_str(), &mut config)
                        .await?
                });

                self.view_configs.insert(req.view_id.clone(), config.into());
                bytes
            },
            TableSizeReq(_) => {
                respond!(msg, TableSizeResp {
                    size: self.handler.table_size(msg.entity_id.as_str()).await?
                })
            },
            TableValidateExprReq(req) => {
                let mut expression_schema = HashMap::<String, i32>::default();
                let mut expression_alias = HashMap::<String, String>::default();
                let mut errors = HashMap::<String, ExprValidationError>::default();
                for (name, ex) in req.column_to_expr.iter() {
                    let _ = expression_alias.insert(name.clone(), ex.clone());
                    match self
                        .handler
                        .table_validate_expression(&msg.entity_id, ex.as_str())
                        .await
                    {
                        Ok(dtype) => {
                            let _ = expression_schema.insert(name.clone(), dtype as i32);
                        },
                        Err(e) => {
                            let _ = errors.insert(name.clone(), ExprValidationError {
                                error_message: format!("{}", e),
                                line: 0,
                                column: 0,
                            });
                        },
                    }
                }

                respond!(msg, TableValidateExprResp {
                    expression_schema,
                    errors,
                    expression_alias,
                })
            },
            ViewSchemaReq(_) => {
                respond!(msg, ViewSchemaResp {
                    schema: self
                        .get_cached_view_schema(&msg.entity_id, true)
                        .await?
                        .into_iter()
                        .map(|(x, y)| (x.to_string(), y as i32))
                        .collect()
                })
            },
            ViewDimensionsReq(_) => {
                let view_id = &msg.entity_id;
                let table_id = self
                    .view_to_table
                    .get(view_id)
                    .ok_or_else(|| VirtualServerError::UnknownViewId(view_id.to_string()))?;

                let num_table_rows = self.handler.table_size(table_id).await?;
                let num_table_columns = self.handler.table_column_size(table_id).await? as u32;
                let config = self.view_configs.get(view_id).unwrap();
                let num_view_columns = self.handler.view_column_size(view_id, config).await? as u32;
                let num_view_rows = self.handler.view_size(view_id).await?;
                let resp = ViewDimensionsResp {
                    num_table_columns,
                    num_table_rows,
                    num_view_columns,
                    num_view_rows,
                };

                respond!(msg, ViewDimensionsResp { ..resp })
            },
            ViewGetConfigReq(_) => {
                respond!(msg, ViewGetConfigResp {
                    config: Some(
                        ViewConfigUpdate::from(
                            self.view_configs.get(&msg.entity_id).unwrap().clone()
                        )
                        .into()
                    )
                })
            },
            ViewExpressionSchemaReq(_) => {
                let mut schema = HashMap::<String, i32>::default();
                let table_id = self.view_to_table.get(&msg.entity_id);
                for (name, ex) in self
                    .view_configs
                    .get(&msg.entity_id)
                    .unwrap()
                    .expressions
                    .iter()
                {
                    match self
                        .handler
                        .table_validate_expression(table_id.unwrap(), ex.as_str())
                        .await
                    {
                        Ok(dtype) => {
                            let _ = schema.insert(name.clone(), dtype as i32);
                        },
                        Err(_e) => {
                            // TODO: handle error
                        },
                    }
                }

                let resp = ViewExpressionSchemaResp { schema };
                respond!(msg, ViewExpressionSchemaResp { ..resp })
            },
            ViewColumnPathsReq(_) => {
                respond!(msg, ViewColumnPathsResp {
                    paths: self
                        .handler
                        .view_schema(
                            msg.entity_id.as_str(),
                            self.view_configs.get(&msg.entity_id).unwrap()
                        )
                        .await?
                        .keys()
                        .cloned()
                        .collect()
                })
            },
            ViewToArrowReq(view_to_arrow_req) => {
                let viewport = view_to_arrow_req.viewport.unwrap();
                let schema = self.get_cached_view_schema(&msg.entity_id, false).await?;
                let config = self.view_configs.get(&msg.entity_id).unwrap();
                let mut cols = self
                    .handler
                    .view_get_data(msg.entity_id.as_str(), config, &schema, &viewport)
                    .await?;

                let arrow = cols
                    .render_to_arrow_ipc()
                    .map_err(|e| VirtualServerError::Other(e.to_string()))?;

                respond!(msg, ViewToArrowResp { arrow })
            },
            ViewToCsvReq(view_to_csv_req) => {
                let viewport = view_to_csv_req.viewport.unwrap();
                let schema = self.get_cached_view_schema(&msg.entity_id, false).await?;
                let config = self.view_configs.get(&msg.entity_id).unwrap();
                let mut cols = self
                    .handler
                    .view_get_data(msg.entity_id.as_str(), config, &schema, &viewport)
                    .await?;

                let rows = cols.render_to_rows(RowPathStyle::PerLevel);
                let mut csv = String::new();
                if let Some(first_row) = rows.first() {
                    let headers: Vec<&str> = first_row.keys().map(|k| k.as_str()).collect();
                    csv.push_str(&headers.join(","));
                    csv.push('\n');
                }

                for row in &rows {
                    let values: Vec<String> = row
                        .values()
                        .map(|cell| serde_json::to_string(cell).unwrap_or_default())
                        .collect();
                    csv.push_str(&values.join(","));
                    csv.push('\n');
                }

                respond!(msg, ViewToCsvResp { csv })
            },
            ViewToNdjsonStringReq(view_to_ndjson_req) => {
                let viewport = view_to_ndjson_req.viewport.unwrap();
                let schema = self.get_cached_view_schema(&msg.entity_id, false).await?;
                let config = self.view_configs.get(&msg.entity_id).unwrap();
                let mut cols = self
                    .handler
                    .view_get_data(msg.entity_id.as_str(), config, &schema, &viewport)
                    .await?;

                let rows = cols.render_to_rows(RowPathStyle::PerLevel);
                let ndjson_string = rows
                    .iter()
                    .map(serde_json::to_string)
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(|e| VirtualServerError::InvalidJSON(std::sync::Arc::new(e)))?
                    .join("\n");

                respond!(msg, ViewToNdjsonStringResp { ndjson_string })
            },
            ViewToRowsStringReq(view_to_rows_string_req) => {
                let viewport = view_to_rows_string_req.viewport.unwrap();
                let schema = self.get_cached_view_schema(&msg.entity_id, false).await?;
                let config = self.view_configs.get(&msg.entity_id).unwrap();
                let mut cols = self
                    .handler
                    .view_get_data(msg.entity_id.as_str(), config, &schema, &viewport)
                    .await?;

                let rows = cols.render_to_rows(RowPathStyle::Sidecar);
                let json_string = serde_json::to_string(&rows)
                    .map_err(|e| VirtualServerError::InvalidJSON(std::sync::Arc::new(e)))?;

                respond!(msg, ViewToRowsStringResp { json_string })
            },
            ViewToColumnsStringReq(view_to_columns_string_req) => {
                let viewport = view_to_columns_string_req.viewport.unwrap();
                let schema = self.get_cached_view_schema(&msg.entity_id, false).await?;
                let config = self.view_configs.get(&msg.entity_id).unwrap();
                let mut cols = self
                    .handler
                    .view_get_data(msg.entity_id.as_str(), config, &schema, &viewport)
                    .await?;

                let json_string = cols
                    .render_to_columns_json(RowPathStyle::Sidecar)
                    .map_err(|e| VirtualServerError::Other(e.to_string()))?;

                respond!(msg, ViewToColumnsStringResp { json_string })
            },
            ViewDeleteReq(_) => {
                self.handler.view_delete(msg.entity_id.as_str()).await?;
                self.view_to_table.shift_remove(&msg.entity_id);
                self.view_configs.shift_remove(&msg.entity_id);
                respond!(msg, ViewDeleteResp {})
            },
            MakeTableReq(req) => {
                self.handler
                    .make_table(&msg.entity_id, req.data.as_ref().unwrap())
                    .await?;
                respond!(msg, MakeTableResp {})
            },
            ViewGetMinMaxReq(req) => {
                let config = self.view_configs.get(&msg.entity_id).unwrap();
                let (min, max) = self
                    .handler
                    .view_get_min_max(&msg.entity_id, &req.column_name, config)
                    .await?;
                respond!(msg, ViewGetMinMaxResp {
                    min: Some(min.into()),
                    max: Some(max.into()),
                })
            },

            // Stub implementations for callback/update requests that VirtualServer doesn't support
            TableOnDeleteReq(_) => {
                respond!(msg, TableOnDeleteResp {})
            },
            ViewOnUpdateReq(_) => {
                respond!(msg, ViewOnUpdateResp {
                    delta: None,
                    port_id: 0
                })
            },
            ViewOnDeleteReq(_) => {
                respond!(msg, ViewOnDeleteResp {})
            },
            ViewRemoveOnUpdateReq(_) => {
                respond!(msg, ViewRemoveOnUpdateResp {})
            },
            TableRemoveDeleteReq(_) => {
                respond!(msg, TableRemoveDeleteResp {})
            },
            ViewRemoveDeleteReq(_) => {
                respond!(msg, ViewRemoveDeleteResp {})
            },
            x => {
                // Return an error response instead of empty bytes
                return Err(VirtualServerError::Other(format!(
                    "Unhandled request: {:?}",
                    x
                )));
            },
        };

        Ok(resp)
    }
}
