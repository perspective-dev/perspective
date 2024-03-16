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
use std::str::FromStr;

use serde::{Deserialize, Serialize};

use self::view_on_update_req::Mode;
use crate::assert_view_api;
use crate::client::Client;
use crate::proto::request::ClientReq;
use crate::proto::response::ClientResp;
use crate::proto::*;
pub use crate::utils::*;

#[derive(Default, Deserialize)]
pub struct OnUpdateOptions {
    pub mode: Option<OnUpdateMode>,
}

#[derive(Default, Deserialize)]
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

pub type OnUpdateArgs = (Option<Vec<u8>>, u32);

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Dimensions {
    pub num_view_rows: usize,
    pub num_view_columns: usize,
    pub num_table_rows: usize,
    pub num_table_columns: usize,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct ViewWindow {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_row: Option<u32>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_col: Option<u32>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_row: Option<u32>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_col: Option<u32>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub index: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub leaves_only: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub formatted: Option<bool>,
}

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

    fn client_message(&self, req: ClientReq) -> RequestEnvelope {
        crate::proto::RequestEnvelope {
            msg_id: self.client.gen_id(),
            entity_id: self.name.clone(),
            entity_type: EntityType::View as i32,
            payload: Some(req.into()),
        }
    }

    #[doc = include_str!("../../docs/view/column_paths.md")]
    pub async fn column_paths(&self) -> ClientResult<Vec<String>> {
        let msg = self.client_message(ClientReq::ViewColumnPathsReq(ViewColumnPathsReq {}));
        match self.client.oneshot(&msg).await {
            ClientResp::ViewColumnPathsResp(ViewColumnPathsResp { paths }) => {
                // Ok(paths.into_iter().map(|x| x.path).collect())
                Ok(paths)
            },
            resp => Err(resp.into()),
        }
    }

    #[doc = include_str!("../../docs/view/col_to_js_typed_array.md")]
    pub async fn col_to_js_typed_array(&self, _column: &str) -> ClientResult<Vec<u8>> {
        Err(ClientError::NotImplemented("col_to_js_typed_array"))
        // let mut msg = self.client_message();
        // msg.method = Some("col_to_js_typed_array");
        // msg.args = Some(vec![Arg::String(column.to_string())]);
        // match self.client.oneshot(&msg).await {
        //     Some(Data::Buffer(buffer)) => Ok(buffer),
        //     _ => Err(ClientError::Unknown("g".to_string())),
        // }
    }

    #[doc = include_str!("../../docs/view/dimensions.md")]
    pub async fn dimensions(&self) -> ClientResult<ViewDimensionsResp> {
        let msg = self.client_message(ClientReq::ViewDimensionsReq(ViewDimensionsReq {}));
        match self.client.oneshot(&msg).await {
            ClientResp::ViewDimensionsResp(resp) => Ok(resp),
            resp => Err(resp.into()),
        }
    }

    #[doc = include_str!("../../docs/view/expression_schema.md")]
    pub async fn expression_schema(&self) -> ClientResult<HashMap<String, ColumnType>> {
        let msg = self.client_message(ClientReq::ViewExpressionSchemaReq(
            ViewExpressionSchemaReq {},
        ));
        match self.client.oneshot(&msg).await {
            ClientResp::ViewExpressionSchemaResp(ViewExpressionSchemaResp { schema }) => Ok(schema
                .into_iter()
                .map(|(x, y)| (x, ColumnType::try_from(y).unwrap()))
                .collect()),
            resp => Err(resp.into()),
        }
    }

    #[doc = include_str!("../../docs/view/get_config.md")]
    pub async fn get_config(&self) -> ClientResult<crate::config::ViewConfig> {
        let msg = self.client_message(ClientReq::ViewGetConfigReq(ViewGetConfigReq {}));
        match self.client.oneshot(&msg).await {
            ClientResp::ViewGetConfigResp(ViewGetConfigResp {
                config: Some(config),
            }) => Ok(config.into()),
            resp => Err(resp.into()),
        }
    }

    #[doc = include_str!("../../docs/view/num_rows.md")]
    pub async fn num_rows(&self) -> ClientResult<u32> {
        let msg = self.client_message(ClientReq::ViewNumRowsReq(ViewNumRowsReq {}));
        match self.client.oneshot(&msg).await {
            ClientResp::ViewNumRowsResp(ViewNumRowsResp { num_rows }) => Ok(num_rows),
            resp => Err(resp.into()),
        }
    }

    #[doc = include_str!("../../docs/view/schema.md")]
    pub async fn schema(&self) -> ClientResult<HashMap<String, ColumnType>> {
        let msg = self.client_message(ClientReq::ViewSchemaReq(ViewSchemaReq {}));
        match self.client.oneshot(&msg).await {
            ClientResp::ViewSchemaResp(ViewSchemaResp { schema }) => Ok(schema
                .into_iter()
                .map(|(x, y)| (x, ColumnType::try_from(y).unwrap()))
                .collect()),
            resp => Err(resp.into()),
        }
    }

    #[doc = include_str!("../../docs/view/to_arrow.md")]
    pub async fn to_arrow(&self, window: ViewWindow) -> ClientResult<Vec<u8>> {
        let viewport = ViewPort {
            start_row: window.start_row,
            start_col: window.start_col,
            end_row: window.end_row,
            end_col: window.end_col,
        };

        let msg = self.client_message(ClientReq::ViewToArrowReq(ViewToArrowReq {
            viewport: Some(viewport),
        }));

        match self.client.oneshot(&msg).await {
            ClientResp::ViewToArrowResp(ViewToArrowResp { arrow }) => Ok(arrow.into()),
            resp => Err(resp.into()),
        }
    }

    #[doc = include_str!("../../docs/view/to_columns_string.md")]
    pub async fn to_columns_string(&self, window: ViewWindow) -> ClientResult<String> {
        let viewport = ViewPort {
            start_row: window.start_row,
            start_col: window.start_col,
            end_row: window.end_row,
            end_col: window.end_col,
        };

        let msg = self.client_message(ClientReq::ViewToColumnsStringReq(ViewToColumnsStringReq {
            viewport: Some(viewport),
            id: window.id,
            index: window.index,
            formatted: window.formatted,
            leaves_only: window.leaves_only,
        }));

        match self.client.oneshot(&msg).await {
            ClientResp::ViewToColumnsStringResp(ViewToColumnsStringResp { json_string }) => {
                Ok(json_string)
            },
            resp => Err(resp.into()),
        }
    }

    #[doc = include_str!("../../docs/view/to_json_string.md")]
    pub async fn to_json_string(&self, window: ViewWindow) -> ClientResult<String> {
        let viewport = ViewPort {
            start_row: window.start_row,
            start_col: window.start_col,
            end_row: window.end_row,
            end_col: window.end_col,
        };

        let msg = self.client_message(ClientReq::ViewToRowsStringReq(ViewToRowsStringReq {
            viewport: Some(viewport),
            id: window.id,
            index: window.index,
            formatted: window.formatted,
            leaves_only: window.leaves_only,
        }));

        match self.client.oneshot(&msg).await {
            ClientResp::ViewToRowsStringResp(ViewToRowsStringResp { json_string }) => {
                Ok(json_string)
            },
            resp => Err(resp.into()),
        }
    }

    #[doc = include_str!("../../docs/view/to_csv.md")]
    pub async fn to_csv(&self, window: ViewWindow) -> ClientResult<String> {
        let viewport = ViewPort {
            start_row: window.start_row,
            start_col: window.start_col,
            end_row: window.end_row,
            end_col: window.end_col,
        };

        let msg = self.client_message(ClientReq::ViewToCsvReq(ViewToCsvReq {
            viewport: Some(viewport),
        }));

        match self.client.oneshot(&msg).await {
            ClientResp::ViewToCsvResp(ViewToCsvResp { csv }) => Ok(csv),
            resp => Err(resp.into()),
        }
    }

    #[doc = include_str!("../../docs/view/delete.md")]
    pub async fn delete(&self) -> ClientResult<()> {
        let msg = self.client_message(ClientReq::ViewDeleteReq(ViewDeleteReq {}));
        match self.client.oneshot(&msg).await {
            ClientResp::ViewDeleteResp(ViewDeleteResp {}) => Ok(()),
            resp => Err(resp.into()),
        }
    }

    #[doc = include_str!("../../docs/view/get_min_max.md")]
    pub async fn get_min_max(&self, column_name: String) -> ClientResult<(String, String)> {
        let msg = self.client_message(ClientReq::ViewGetMinMaxReq(ViewGetMinMaxReq {
            column_name,
        }));

        match self.client.oneshot(&msg).await {
            ClientResp::ViewGetMinMaxResp(ViewGetMinMaxResp { min, max }) => Ok((min, max)),
            resp => Err(resp.into()),
        }
    }

    #[doc = include_str!("../../docs/view/on_update.md")]
    pub async fn on_update(
        &self,
        on_update: Box<dyn Fn(OnUpdateArgs) + Send + Sync + 'static>,
        options: OnUpdateOptions,
    ) -> ClientResult<u32> {
        let callback = move |resp| match resp {
            ClientResp::ViewOnUpdateResp(ViewOnUpdateResp { arrow, port_id }) => {
                on_update((arrow.map(|x| x.into()), port_id));
                Ok(())
            },
            resp => Err(resp.into()),
        };

        let msg = self.client_message(ClientReq::ViewOnUpdateReq(ViewOnUpdateReq {
            mode: options.mode.map(|OnUpdateMode::Row| Mode::Row as i32),
        }));
        self.client.subscribe(&msg, Box::new(callback)).await;
        Ok(msg.msg_id)
    }

    #[doc = include_str!("../../docs/view/remove_update.md")]
    pub async fn remove_update(&self, update_id: u32) -> ClientResult<()> {
        self.client.unsubscribe(update_id)
    }

    #[doc = include_str!("../../docs/view/on_delete.md")]
    pub async fn on_delete(
        &self,
        on_delete: Box<dyn Fn() + Send + Sync + 'static>,
    ) -> ClientResult<u32> {
        let callback = move |resp| match resp {
            ClientResp::ViewOnDeleteResp(ViewOnDeleteResp {}) => {
                on_delete();
                Ok(())
            },
            resp => Err(resp.into()),
        };

        let msg = self.client_message(ClientReq::ViewOnDeleteReq(ViewOnDeleteReq {}));
        self.client.subscribe_once(&msg, Box::new(callback)).await;
        Ok(msg.msg_id)
    }

    #[doc = include_str!("../../docs/view/remove_delete.md")]
    pub async fn remove_delete(&self, callback_id: u32) -> ClientResult<()> {
        let msg = self.client_message(ClientReq::ViewRemoveDeleteReq(ViewRemoveDeleteReq {
            id: callback_id,
        }));

        match self.client.oneshot(&msg).await {
            ClientResp::ViewRemoveDeleteResp(ViewRemoveDeleteResp {}) => Ok(()),
            resp => Err(resp.into()),
        }
    }
}
