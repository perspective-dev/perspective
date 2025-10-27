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

use std::borrow::Cow;
use std::collections::HashMap;
use std::error::Error;
use std::ops::{Deref, DerefMut};
use std::sync::Arc;

use ::indexmap::IndexMap;
use perspective_client::config::{Scalar, ViewConfig, ViewConfigUpdate};
use perspective_client::proto::get_features_resp::{
    AggregateArgs, AggregateOptions, ColumnTypeOptions,
};
use perspective_client::proto::response::ClientResp;
use perspective_client::proto::table_validate_expr_resp::ExprValidationError;
use perspective_client::proto::{
    ColumnType, GetFeaturesResp, GetHostedTablesResp, HostedTable, Request, Response,
    TableMakePortReq, TableMakePortResp, TableMakeViewResp, TableSchemaResp, TableSizeResp,
    TableValidateExprResp, ViewColumnPathsResp, ViewDeleteResp, ViewDimensionsResp,
    ViewExpressionSchemaResp, ViewGetConfigResp, ViewPort, ViewSchemaResp, ViewToColumnsStringResp,
};
use prost::bytes::{Bytes, BytesMut};
use prost::{DecodeError, EncodeError, Message as ProstMessage};
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Clone, Error, Debug)]
pub enum VirtualServerError<T: std::fmt::Debug> {
    #[error("External Error: {0:?}")]
    InternalError(#[from] T),

    #[error("{0}")]
    DecodeError(DecodeError),

    #[error("{0}")]
    EncodeError(EncodeError),

    #[error("Unknown view '{0}'")]
    UnknownViewId(String),

    #[error("Invalid JSON'{0}'")]
    InvalidJSON(Arc<serde_json::Error>),
}

pub trait ResultExt<X, T> {
    fn get_internal_error(self) -> Result<X, Result<T, String>>;
}

impl<X, T: std::fmt::Debug> ResultExt<X, T> for Result<X, VirtualServerError<T>> {
    fn get_internal_error(self) -> Result<X, Result<T, String>> {
        match self {
            Ok(x) => Ok(x),
            Err(VirtualServerError::InternalError(x)) => Err(Ok(x)),
            Err(x) => Err(Err(x.to_string())),
        }
    }
}

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

pub trait VirtualServerHandler {
    type Error: std::error::Error + Send + Sync + 'static;

    // Required
    fn get_hosted_tables(&self) -> Result<Vec<HostedTable>, Self::Error>;
    fn table_schema(&self, table_id: &str) -> Result<IndexMap<String, ColumnType>, Self::Error>;
    fn table_size(&self, table_id: &str) -> Result<u32, Self::Error>;
    fn table_columns_size(&self, table_id: &str, config: &ViewConfig) -> Result<u32, Self::Error>;
    fn table_make_view(
        &mut self,
        entity_id: &str,
        view_id: &str,
        config: &mut ViewConfigUpdate,
    ) -> Result<String, Self::Error>;

    fn view_size(&self, view_id: &str) -> Result<u32, Self::Error>;
    fn view_delete(&self, view_id: &str) -> Result<(), Self::Error>;
    fn view_schema(
        &self,
        entity_id: &str,
        config: &ViewConfig,
    ) -> Result<IndexMap<String, ColumnType>, Self::Error>;

    fn view_get_data(
        &self,
        view_id: &str,
        config: &ViewConfig,
        viewport: &ViewPort,
    ) -> Result<VirtualDataSlice, Self::Error>;

    // Optional
    fn table_validate_expression(
        &self,
        _table_id: &str,
        _expression: &str,
    ) -> Result<ColumnType, Self::Error> {
        Ok(ColumnType::Float)
    }

    fn get_features(&self) -> Result<Features<'_>, Self::Error> {
        Ok(Features::default())
    }

    fn table_make_port(&self, _req: &TableMakePortReq) -> Result<u32, Self::Error> {
        Ok(0)
    }
}

// output format
#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum VirtualDataColumn {
    Boolean(Vec<Option<bool>>),
    String(Vec<Option<String>>),
    Float(Vec<Option<f64>>),
    Integer(Vec<Option<i32>>),
    Datetime(Vec<Option<i64>>),
    IntegerIndex(Vec<Option<Vec<i32>>>),
    RowPath(Vec<Vec<Scalar>>),
}

pub trait SetVirtualDataColumn {
    fn write_to(self, col: &mut VirtualDataColumn) -> Result<(), &'static str>;
    fn new_column() -> VirtualDataColumn;
    fn to_scalar(self) -> Scalar;
}

macro_rules! template_psp {
    ($t:ty, $u:ident, $v:ident, $w:ty) => {
        impl SetVirtualDataColumn for Option<$t> {
            fn write_to(self, col: &mut VirtualDataColumn) -> Result<(), &'static str> {
                if let VirtualDataColumn::$u(x) = col {
                    x.push(self);
                    Ok(())
                } else {
                    Err("Bad type")
                }
            }

            fn new_column() -> VirtualDataColumn {
                VirtualDataColumn::$u(vec![])
            }

            fn to_scalar(self) -> Scalar {
                if let Some(x) = self {
                    Scalar::$v(x as $w)
                } else {
                    Scalar::Null
                }
            }
        }
    };
}

template_psp!(String, String, String, String);
template_psp!(f64, Float, Float, f64);
template_psp!(i32, Integer, Float, f64);
// template_psp!(i, Integer);
template_psp!(i64, Datetime, Float, f64);
template_psp!(bool, Boolean, Bool, bool);

#[derive(Debug, Default, Serialize)]
pub struct VirtualDataSlice(IndexMap<String, VirtualDataColumn>);

impl Deref for VirtualDataSlice {
    type Target = IndexMap<String, VirtualDataColumn>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl DerefMut for VirtualDataSlice {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}

impl VirtualDataSlice {
    pub fn set_col<T: SetVirtualDataColumn>(
        &mut self,
        name: &str,
        group_by_index: Option<usize>,
        index: usize,
        value: T,
    ) -> Result<(), Box<dyn Error>> {
        if group_by_index.is_some() {
            let col =
                if let Some(VirtualDataColumn::RowPath(row_path)) = self.get_mut("__ROW_PATH__") {
                    row_path
                } else {
                    self.insert(
                        "__ROW_PATH__".to_owned(),
                        VirtualDataColumn::RowPath(vec![]),
                    );
                    let Some(VirtualDataColumn::RowPath(rp)) = self.get_mut("__ROW_PATH__") else {
                        panic!("Irrefutable")
                    };

                    rp
                };

            if let Some(row) = col.get_mut(index) {
                let scalar = value.to_scalar();
                row.push(scalar);
            } else {
                while col.len() < index {
                    col.push(vec![])
                }

                let scalar = value.to_scalar();
                col.push(vec![scalar]);
            }

            Ok(())
        } else {
            let col = if let Some(col) = self.get_mut(name) {
                col
            } else {
                self.insert(name.to_owned(), T::new_column());
                self.get_mut(name).unwrap()
            };

            Ok(value.write_to(col)?)
        }
    }
}

/// DTO for `GetFeaturesResp`
#[derive(Debug, Default, Deserialize)]
pub struct Features<'a> {
    #[serde(default)]
    pub group_by: bool,

    #[serde(default)]
    pub split_by: bool,

    #[serde(default)]
    pub filter_ops: IndexMap<ColumnType, Vec<Cow<'a, str>>>,

    #[serde(default)]
    pub aggregates: IndexMap<ColumnType, Vec<AggSpec<'a>>>,

    #[serde(default)]
    pub sort: bool,

    #[serde(default)]
    pub expressions: bool,

    #[serde(default)]
    pub on_update: bool,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub enum AggSpec<'a> {
    Single(Cow<'a, str>),
    Multiple(Cow<'a, str>, Vec<ColumnType>),
}

impl<'a> From<Features<'a>> for perspective_client::proto::GetFeaturesResp {
    fn from(value: Features<'a>) -> perspective_client::proto::GetFeaturesResp {
        GetFeaturesResp {
            group_by: value.group_by,
            split_by: value.split_by,
            expressions: value.expressions,
            on_update: value.on_update,
            sort: value.sort,
            aggregates: value
                .aggregates
                .iter()
                .map(|(dtype, aggs)| {
                    (*dtype as u32, AggregateOptions {
                        aggregates: aggs
                            .iter()
                            .map(|agg| match agg {
                                AggSpec::Single(cow) => AggregateArgs {
                                    name: cow.to_string(),
                                    args: vec![],
                                },
                                AggSpec::Multiple(cow, column_types) => AggregateArgs {
                                    name: cow.to_string(),
                                    args: column_types.iter().map(|x| *x as i32).collect(),
                                },
                            })
                            .collect(),
                    })
                })
                .collect(),
            filter_ops: value
                .filter_ops
                .iter()
                .map(|(ty, options)| {
                    (*ty as u32, ColumnTypeOptions {
                        options: options.iter().map(|x| (*x).to_string()).collect(),
                    })
                })
                .collect(),
        }
    }
}

pub struct VirtualServer<T: VirtualServerHandler> {
    handler: T,
    view_to_table: IndexMap<String, String>,
    view_configs: IndexMap<String, ViewConfig>,
}

impl<T: VirtualServerHandler> VirtualServer<T> {
    pub fn new(handler: T) -> Self {
        Self {
            handler,
            view_configs: IndexMap::default(),
            view_to_table: IndexMap::default(),
        }
    }

    pub fn handle_request(&mut self, bytes: Bytes) -> Result<Bytes, VirtualServerError<T::Error>> {
        use perspective_client::proto::request::ClientReq::*;

        let msg = Request::decode(bytes).map_err(VirtualServerError::DecodeError)?;
        let resp = match msg.client_req.unwrap() {
            GetFeaturesReq(_) => {
                tracing::debug!("GetFeaturesReq");
                let features = self.handler.get_features()?;
                respond!(msg, GetFeaturesResp { ..features.into() })
            },
            GetHostedTablesReq(_) => {
                tracing::debug!("GetHostedTablesReq");
                respond!(msg, GetHostedTablesResp {
                    table_infos: self.handler.get_hosted_tables()?
                })
            },
            TableSchemaReq(_) => {
                tracing::debug!("TableSchemaReq");
                respond!(msg, TableSchemaResp {
                    schema: self
                        .handler
                        .table_schema(msg.entity_id.as_str())
                        .ok()
                        .map(|value| perspective_client::proto::Schema {
                            schema: value
                                .iter()
                                .map(|x| perspective_client::proto::schema::KeyTypePair {
                                    name: x.0.to_string(),
                                    r#type: *x.1 as i32,
                                })
                                .collect(),
                        })
                })
            },
            TableMakePortReq(req) => {
                tracing::debug!("TableMakePortReq");
                respond!(msg, TableMakePortResp {
                    port_id: self.handler.table_make_port(&req)?
                })
            },
            TableMakeViewReq(req) => {
                tracing::debug!("TableMakeViewReq");
                self.view_to_table
                    .insert(req.view_id.clone(), msg.entity_id.clone());

                let mut config: ViewConfigUpdate = req.config.clone().unwrap_or_default().into();
                let bytes = respond!(msg, TableMakeViewResp {
                    view_id: self.handler.table_make_view(
                        msg.entity_id.as_str(),
                        req.view_id.as_str(),
                        &mut config
                    )?
                });

                self.view_configs.insert(req.view_id.clone(), config.into());
                bytes
            },
            TableSizeReq(_) => {
                tracing::debug!("TableSizeReq");
                respond!(msg, TableSizeResp {
                    size: self.handler.table_size(msg.entity_id.as_str())?
                })
            },
            TableValidateExprReq(req) => {
                tracing::debug!("TableValidateExprReq");
                let mut expression_schema = HashMap::<String, i32>::default();
                let mut expression_alias = HashMap::<String, String>::default();
                let mut errors = HashMap::<String, ExprValidationError>::default();
                for (name, ex) in req.column_to_expr.iter() {
                    let _ = expression_alias.insert(name.clone(), ex.clone());
                    match self
                        .handler
                        .table_validate_expression(&msg.entity_id, ex.as_str())
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
                tracing::debug!("ViewSchemaReq");
                respond!(msg, ViewSchemaResp {
                    schema: self
                        .handler
                        .view_schema(
                            msg.entity_id.as_str(),
                            self.view_configs.get(&msg.entity_id).unwrap()
                        )?
                        .into_iter()
                        .map(|(x, y)| (x, y as i32))
                        .collect()
                })
            },
            ViewDimensionsReq(_) => {
                tracing::debug!("ViewDimensionsReq");
                let view_id = &msg.entity_id;
                let table_id = self
                    .view_to_table
                    .get(view_id)
                    .ok_or_else(|| VirtualServerError::UnknownViewId(view_id.to_string()))?;

                let num_table_rows = self.handler.table_size(table_id)?;
                let num_table_columns = self.handler.table_schema(table_id)?.len() as u32;
                let config = self.view_configs.get(view_id).unwrap();
                let num_view_columns = self.handler.table_columns_size(view_id, config)?;
                let num_view_rows = self.handler.view_size(view_id)?;
                let resp = ViewDimensionsResp {
                    num_table_columns,
                    num_table_rows,
                    num_view_columns,
                    num_view_rows,
                };

                respond!(msg, ViewDimensionsResp { ..resp })
            },
            ViewGetConfigReq(_) => {
                tracing::debug!("ViewGetConfigReq");

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
                tracing::debug!("ViewGetConfigReq");
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
                    {
                        Ok(dtype) => {
                            let _ = schema.insert(name.clone(), dtype as i32);
                        },
                        Err(_e) => todo!(),
                    }
                }

                let resp = ViewExpressionSchemaResp { schema };
                respond!(msg, ViewExpressionSchemaResp { ..resp })
            },
            ViewColumnPathsReq(_) => {
                tracing::debug!("ViewColumnPathsReq");
                respond!(msg, ViewColumnPathsResp {
                    paths: self
                        .handler
                        .view_schema(
                            msg.entity_id.as_str(),
                            self.view_configs.get(&msg.entity_id).unwrap()
                        )?
                        .keys()
                        .cloned()
                        .collect()
                })
            },
            ViewToColumnsStringReq(view_to_columns_string_req) => {
                tracing::debug!("ViewToColumnsStringReq");
                let viewport = view_to_columns_string_req.viewport.unwrap();
                let config = self.view_configs.get(&msg.entity_id).unwrap();
                let cols = self
                    .handler
                    .view_get_data(msg.entity_id.as_str(), config, &viewport)?;
                let json_string = serde_json::to_string(&cols)
                    .map_err(|e| VirtualServerError::InvalidJSON(Arc::new(e)))?;
                respond!(msg, ViewToColumnsStringResp { json_string })
            },
            ViewDeleteReq(_) => {
                tracing::debug!("ViewDeleteReq");
                self.handler.view_delete(msg.entity_id.as_str())?;
                self.view_to_table.shift_remove(&msg.entity_id);
                self.view_configs.shift_remove(&msg.entity_id);
                respond!(msg, ViewDeleteResp {})
            },

            x => {
                tracing::error!("Not handled {:?}", x);
                Bytes::new()
            },
        };

        Ok(resp)
    }
}
