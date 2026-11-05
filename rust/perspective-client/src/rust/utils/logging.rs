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

use prost::Message;

use crate::proto::make_table_data::Data;
use crate::proto::request::ClientReq;
use crate::proto::response::ClientResp;
use crate::proto::{
    MakeTableData, MakeTableReq, Request, Response, TableUpdateReq, ViewOnUpdateResp,
    ViewToArrowResp, ViewToColumnsStringResp, ViewToCsvResp, ViewToNdjsonStringResp,
    ViewToRowsStringResp,
};

fn replace(x: Data) -> Data {
    match x {
        Data::FromArrow(_) => Data::FromArrow("<< redacted >>".to_string().encode_to_vec()),
        Data::FromRows(_) => Data::FromRows("<< redacted >>".to_string()),
        Data::FromCols(_) => Data::FromCols("<< redacted >>".to_string()),
        Data::FromCsv(_) => Data::FromCsv("<< redacted >>".to_string()),
        x => x,
    }
}

/// `prost` generates `Debug` implementations that includes the `data` field,
/// which makes logs output unreadable. This `Display` implementation hides
/// fields that we don't want ot display in the logs.
impl std::fmt::Display for Request {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let mut msg = self.clone();
        msg = match msg {
            Request {
                client_req:
                    Some(ClientReq::MakeTableReq(MakeTableReq {
                        ref options,
                        data:
                            Some(MakeTableData {
                                data: Some(ref data),
                            }),
                    })),
                ..
            } => Request {
                client_req: Some(ClientReq::MakeTableReq(MakeTableReq {
                    options: options.clone(),
                    data: Some(MakeTableData {
                        data: Some(replace(data.clone())),
                    }),
                })),
                ..msg.clone()
            },
            Request {
                client_req:
                    Some(ClientReq::TableUpdateReq(TableUpdateReq {
                        port_id,
                        data:
                            Some(MakeTableData {
                                data: Some(ref data),
                            }),
                    })),
                ..
            } => Request {
                client_req: Some(ClientReq::TableUpdateReq(TableUpdateReq {
                    port_id,
                    data: Some(MakeTableData {
                        data: Some(replace(data.clone())),
                    }),
                })),
                ..msg.clone()
            },
            x => x,
        };

        write!(
            f,
            "{}",
            serde_json::to_string(&msg).unwrap_or("Can't deserialize".to_string())
        )
    }
}

impl std::fmt::Display for Response {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let mut msg = self.clone();
        msg = match msg {
            Response {
                client_resp: Some(ClientResp::ViewToColumnsStringResp(_)),
                ..
            } => Response {
                client_resp: Some(ClientResp::ViewToColumnsStringResp(
                    ViewToColumnsStringResp {
                        json_string: "<< redacted >>".to_owned(),
                    },
                )),
                ..msg.clone()
            },
            Response {
                client_resp: Some(ClientResp::ViewToRowsStringResp(_)),
                ..
            } => Response {
                client_resp: Some(ClientResp::ViewToRowsStringResp(ViewToRowsStringResp {
                    json_string: "<< redacted >>".to_owned(),
                })),
                ..msg.clone()
            },
            Response {
                client_resp: Some(ClientResp::ViewToNdjsonStringResp(_)),
                ..
            } => Response {
                client_resp: Some(ClientResp::ViewToNdjsonStringResp(ViewToNdjsonStringResp {
                    ndjson_string: "<< redacted >>".to_owned(),
                })),
                ..msg.clone()
            },
            Response {
                client_resp: Some(ClientResp::ViewToArrowResp(_)),
                ..
            } => Response {
                client_resp: Some(ClientResp::ViewToArrowResp(ViewToArrowResp {
                    arrow: vec![],
                })),
                ..msg.clone()
            },
            Response {
                client_resp: Some(ClientResp::ViewToCsvResp(_)),
                ..
            } => Response {
                client_resp: Some(ClientResp::ViewToCsvResp(ViewToCsvResp {
                    csv: "<< redacted >>".to_owned(),
                })),
                ..msg.clone()
            },
            Response {
                client_resp: Some(ClientResp::ViewOnUpdateResp(ref x)),
                ..
            } => Response {
                client_resp: Some(ClientResp::ViewOnUpdateResp(ViewOnUpdateResp {
                    delta: x.delta.as_ref().map(|_| vec![]),
                    port_id: x.port_id,
                    reset: x.reset,
                })),
                ..msg.clone()
            },
            x => x,
        };

        write!(f, "{}", serde_json::to_string(&msg).unwrap())
    }
}
