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
use std::pin::Pin;
use std::sync::atomic::AtomicU32;
use std::sync::Arc;

use async_lock::RwLock;
use futures::Future;
use nanoid::*;
use serde::{Deserialize, Serialize};

use crate::proto::make_table_options::MakeTableType;
use crate::proto::request::ClientReq;
use crate::proto::response::ClientResp;
use crate::proto::*;
use crate::utils::*;
use crate::view::View;
use crate::{proto, Table, TableInitOptions};

/// The possible formats of input data which [`Client::table`] and
/// [`Table::update`] may take as an argument. The latter method will not work
/// with [`TableData::View`] and [`TableData::Schema`] variants, and attempts to
/// call [`Table::update`] with these variants will error.
#[derive(Debug)]
pub enum TableData {
    Schema(Vec<(String, ColumnType)>),
    Csv(String),
    Arrow(Vec<u8>),
    JsonRows(String),
    JsonColumns(String),
    View(View),
}

impl From<TableData> for proto::make_table_data::Data {
    fn from(value: TableData) -> Self {
        match value {
            TableData::Csv(x) => make_table_data::Data::FromCsv(x),
            TableData::Arrow(x) => make_table_data::Data::FromArrow(x.into()),
            TableData::JsonRows(x) => make_table_data::Data::FromRows(x),
            TableData::JsonColumns(x) => make_table_data::Data::FromCols(x),
            TableData::View(view) => make_table_data::Data::FromView(view.name),
            TableData::Schema(x) => make_table_data::Data::FromSchema(proto::Schema {
                schema: x
                    .into_iter()
                    .map(|(name, r#type)| KeyTypePair {
                        name,
                        r#type: r#type as i32,
                    })
                    .collect(),
            }),
        }
    }
}

#[derive(Clone)]
#[doc = include_str!("../../docs/client.md")]
pub struct Client {
    send: SendCallback,
    id_gen: Arc<AtomicU32>,
    subscriptions_once: Subscriptions<OnceCallback>,
    subscriptions_many: Subscriptions<ManyCallback>,
}

type Subscriptions<C> = Arc<RwLock<HashMap<u32, C>>>;
type ManyCallback = Box<dyn Fn(ClientResp) -> Result<(), ClientError> + Send + Sync + 'static>;
type OnceCallback = Box<dyn FnOnce(ClientResp) -> Result<(), ClientError> + Send + Sync + 'static>;

type SendFuture = Pin<Box<dyn Future<Output = ()> + Send + Sync + 'static>>;
type SendCallback = Arc<dyn Fn(&RequestEnvelope) -> SendFuture + Send + Sync + 'static>;

impl std::fmt::Debug for Client {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Client")
            .field("id_gen", &self.id_gen)
            .finish()
    }
}

impl Client {
    /// Create a new client instance with a closure over an external message
    /// queue's `push()`.
    #[doc(hidden)]
    pub fn new<T>(send: T) -> Self
    where
        T: Fn(&RequestEnvelope) -> Pin<Box<dyn Future<Output = ()> + Send + Sync + 'static>>
            + Send
            + Sync
            + 'static,
    {
        Client {
            id_gen: Arc::new(AtomicU32::new(1)),
            subscriptions_once: Arc::default(),
            subscriptions_many: Subscriptions::default(),
            send: Arc::new(move |msg| send(msg)),
        }
    }

    /// Handle a message from the external message queue.
    #[doc(hidden)]
    pub fn receive(&self, msg: ResponseEnvelope) -> Result<(), ClientError> {
        let payload = msg
            .payload
            .clone()
            .ok_or(ClientError::Option)?
            .client_resp
            .ok_or(ClientError::Option)?;

        let mut wr = self.subscriptions_once.try_write().unwrap();
        if let Some(handler) = (*wr).remove(&msg.msg_id) {
            handler(payload)?;
        } else if let Some(handler) = self.subscriptions_many.try_read().unwrap().get(&msg.msg_id) {
            handler(payload)?;
        } else {
            tracing::warn!("Received unsolicited server message {:?}", msg);
        }

        Ok(())
    }

    #[doc = include_str!("../../docs/client/table.md")]
    pub async fn table(
        &self,
        input: TableData,
        options: Option<TableInitOptions>,
    ) -> ClientResult<Table> {
        let name = nanoid!();
        let msg = RequestEnvelope {
            msg_id: self.gen_id(),
            entity_id: name.clone(),
            entity_type: EntityType::Table as i32,
            payload: Some(Request {
                client_req: Some(ClientReq::MakeTableReq(MakeTableReq {
                    data: Some(MakeTableData {
                        data: Some(input.into()),
                    }),
                    options: options.as_ref().map(|x| x.clone().into()),
                })),
            }),
        };

        let client = self.clone();
        match self.oneshot(&msg).await {
            ClientResp::MakeTableResp(_) => Ok(Table::new(name, client, options)),
            resp => Err(resp.into()),
        }
    }

    /// Generate a message ID unique to this client.
    pub(crate) fn gen_id(&self) -> u32 {
        self.id_gen
            .fetch_add(1, std::sync::atomic::Ordering::Acquire)
    }

    pub(crate) fn unsubscribe(&self, update_id: u32) -> ClientResult<()> {
        let callback = self
            .subscriptions_many
            .try_write()
            .unwrap()
            .remove(&update_id)
            .ok_or(ClientError::Unknown("remove_update".to_string()))?;

        drop(callback);
        Ok(())
    }

    /// Register a callback which is expected to respond exactly once.
    pub(crate) async fn subscribe_once(
        &self,
        msg: &RequestEnvelope,
        on_update: Box<dyn FnOnce(ClientResp) -> ClientResult<()> + Send + Sync + 'static>,
    ) {
        self.subscriptions_once
            .try_write()
            .unwrap()
            .insert(msg.msg_id, on_update);

        (self.send)(msg).await;
    }

    /// Register a callback which is expected to respond many times.
    pub(crate) async fn subscribe(
        &self,
        msg: &RequestEnvelope,
        on_update: Box<dyn Fn(ClientResp) -> ClientResult<()> + Send + Sync + 'static>,
    ) {
        self.subscriptions_many
            .try_write()
            .unwrap()
            .insert(msg.msg_id, on_update);

        (self.send)(msg).await;
    }

    /// Send a `ClientReq` and await both the successful completion of the
    /// `send`, _and_ the `ClientResp` which is returned.
    pub(crate) async fn oneshot(&self, msg: &RequestEnvelope) -> ClientResp {
        let (sender, receiver) = futures::channel::oneshot::channel::<ClientResp>();
        let callback = Box::new(move |msg| sender.send(msg).map_err(|x| x.into()));
        self.subscriptions_once
            .try_write()
            .unwrap()
            .insert(msg.msg_id, callback);

        (self.send)(msg).await;
        receiver.await.unwrap()
    }
}
