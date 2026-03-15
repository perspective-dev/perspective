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
use std::error::Error;
use std::ops::Deref;
use std::sync::Arc;

use async_lock::{Mutex, RwLock};
use futures::Future;
use futures::future::{BoxFuture, LocalBoxFuture, join_all};
use prost::Message;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::proto::request::ClientReq;
use crate::proto::response::ClientResp;
use crate::proto::{
    ColumnType, GetFeaturesReq, GetFeaturesResp, GetHostedTablesReq, GetHostedTablesResp,
    HostedTable, MakeTableReq, RemoveHostedTablesUpdateReq, Request, Response, ServerError,
    ServerSystemInfoReq,
};
use crate::table::{Table, TableInitOptions, TableOptions};
use crate::table_data::{TableData, UpdateData};
use crate::utils::*;
use crate::view::{OnUpdateData, ViewWindow};
use crate::{OnUpdateMode, OnUpdateOptions, asyncfn, clone};

/// Metadata about the engine runtime (such as total heap utilization).
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct SystemInfo<T = u64> {
    /// Total available bytes for allocation on the [`Server`].
    pub heap_size: T,

    /// Bytes allocated for use on the [`Server`].
    pub used_size: T,

    /// Wall-clock time spent processing requests on the [`Server`], in
    /// milliseconds (estimated). This does not properly account for the
    /// internal thread pool (which enables column-parallel processing of
    /// individual requests).
    pub cpu_time: u32,

    /// Milliseconds since internal CPU time accumulator was reset.
    pub cpu_time_epoch: u32,

    /// Timestamp (POSIX) this request was made. This field may be omitted
    /// for wasm due to `perspective-client` lacking a dependency on
    /// `wasm_bindgen`.
    pub timestamp: Option<T>,

    /// Total available bytes for allocation on the [`Client`]. This is only
    /// available if `trace-allocator` is enabled.
    pub client_heap: Option<T>,

    /// Bytes allocated for use on the [`Client`].  This is only
    /// available if `trace-allocator` is enabled.
    pub client_used: Option<T>,
}

impl<U: Copy + 'static> SystemInfo<U> {
    /// Convert the numeric representation for `T` to something else, which is
    /// useful for JavaScript where there is no `u64` native type.
    pub fn cast<T: Copy + 'static>(&self) -> SystemInfo<T>
    where
        U: num_traits::AsPrimitive<T>,
    {
        SystemInfo {
            heap_size: self.heap_size.as_(),
            used_size: self.used_size.as_(),
            cpu_time: self.cpu_time,
            cpu_time_epoch: self.cpu_time_epoch,
            timestamp: self.timestamp.map(|x| x.as_()),
            client_heap: self.client_heap.map(|x| x.as_()),
            client_used: self.client_used.map(|x| x.as_()),
        }
    }
}

/// Metadata about what features are supported by the `Server` to which this
/// [`Client`] connects.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Features(Arc<GetFeaturesResp>);

impl Features {
    pub fn get_group_rollup_modes(&self) -> Vec<crate::config::GroupRollupMode> {
        self.group_rollup_mode
            .iter()
            .map(|x| {
                crate::config::GroupRollupMode::from(
                    crate::proto::GroupRollupMode::try_from(*x).unwrap(),
                )
            })
            .collect::<Vec<_>>()
    }
}

impl Deref for Features {
    type Target = GetFeaturesResp;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl GetFeaturesResp {
    pub fn default_op(&self, col_type: ColumnType) -> Option<&str> {
        self.filter_ops
            .get(&(col_type as u32))?
            .options
            .first()
            .map(|x| x.as_str())
    }
}

type BoxFn<I, O> = Box<dyn Fn(I) -> O + Send + Sync + 'static>;
type Box2Fn<I, J, O> = Box<dyn Fn(I, J) -> O + Send + Sync + 'static>;

type Subscriptions<C> = Arc<RwLock<HashMap<u32, C>>>;
type OnErrorCallback =
    Box2Fn<ClientError, Option<ReconnectCallback>, BoxFuture<'static, Result<(), ClientError>>>;

type OnceCallback = Box<dyn FnOnce(Response) -> ClientResult<()> + Send + Sync + 'static>;
type SendCallback = Arc<
    dyn for<'a> Fn(&'a Request) -> BoxFuture<'a, Result<(), Box<dyn Error + Send + Sync>>>
        + Send
        + Sync
        + 'static,
>;

/// The client-side representation of a connection to a `Server`.
pub trait ClientHandler: Clone + Send + Sync + 'static {
    fn send_request(
        &self,
        msg: Vec<u8>,
    ) -> impl Future<Output = Result<(), Box<dyn Error + Send + Sync>>> + Send;
}

mod name_registry {
    use std::collections::HashSet;
    use std::sync::{Arc, LazyLock, Mutex};

    use crate::ClientError;
    use crate::view::ClientResult;

    static CLIENT_ID_GEN: LazyLock<Arc<Mutex<u32>>> = LazyLock::new(Arc::default);
    static REGISTERED_CLIENTS: LazyLock<Arc<Mutex<HashSet<String>>>> = LazyLock::new(Arc::default);

    pub(crate) fn generate_name(name: Option<&str>) -> ClientResult<String> {
        if let Some(name) = name {
            if let Some(name) = REGISTERED_CLIENTS
                .lock()
                .map_err(ClientError::from)?
                .get(name)
            {
                Err(ClientError::DuplicateNameError(name.to_owned()))
            } else {
                Ok(name.to_owned())
            }
        } else {
            let mut guard = CLIENT_ID_GEN.lock()?;
            *guard += 1;
            Ok(format!("client-{guard}"))
        }
    }
}

/// The type of the `reconnect` parameter passed to [`Client::handle_error`},
/// and to the callback closure of [`Client::on_error`].
///
/// Calling this function from a [`Client::on_error`] closure should run the
/// (implementation specific) client reconnect logic, e.g. rebindign a
/// websocket.
#[derive(Clone)]
#[allow(clippy::type_complexity)]
pub struct ReconnectCallback(
    Arc<dyn Fn() -> LocalBoxFuture<'static, Result<(), Box<dyn Error>>> + Send + Sync>,
);

impl Deref for ReconnectCallback {
    type Target = dyn Fn() -> LocalBoxFuture<'static, Result<(), Box<dyn Error>>> + Send + Sync;

    fn deref(&self) -> &Self::Target {
        &*self.0
    }
}

impl ReconnectCallback {
    pub fn new(
        f: impl Fn() -> LocalBoxFuture<'static, Result<(), Box<dyn Error>>> + Send + Sync + 'static,
    ) -> Self {
        ReconnectCallback(Arc::new(f))
    }
}

/// An instance of a [`Client`] is a connection to a single
/// `perspective_server::Server`, whether locally in-memory or remote over some
/// transport like a WebSocket.
///
/// # Examples
///
/// Create a `perspective_server::Server` and a synchronous [`Client`] via the
/// `perspective` crate:
///
/// ```rust
/// use perspective::LocalClient;
/// use perspective::server::Server;
///
/// let server = Server::default();
/// let client = perspective::LocalClient::new(&server);
/// ```
#[derive(Clone)]
pub struct Client {
    name: Arc<String>,
    features: Arc<Mutex<Option<Features>>>,
    send: SendCallback,
    id_gen: IDGen,
    subscriptions_errors: Subscriptions<OnErrorCallback>,
    subscriptions_once: Subscriptions<OnceCallback>,
    subscriptions: Subscriptions<BoxFn<Response, BoxFuture<'static, Result<(), ClientError>>>>,
}

impl PartialEq for Client {
    fn eq(&self, other: &Self) -> bool {
        self.name == other.name
    }
}

impl std::fmt::Debug for Client {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Client").finish()
    }
}

impl Client {
    /// Create a new client instance with a closure that handles message
    /// dispatch. See [`Client::new`] for details.
    pub fn new_with_callback<T, U>(name: Option<&str>, send_request: T) -> ClientResult<Self>
    where
        T: Fn(Vec<u8>) -> U + 'static + Sync + Send,
        U: Future<Output = Result<(), Box<dyn Error + Send + Sync>>> + Send + 'static,
    {
        let name = name_registry::generate_name(name)?;
        let send_request = Arc::new(send_request);
        let send: SendCallback = Arc::new(move |req| {
            let mut bytes: Vec<u8> = Vec::new();
            req.encode(&mut bytes).unwrap();
            let send_request = send_request.clone();
            Box::pin(async move { send_request(bytes).await })
        });

        Ok(Client {
            name: Arc::new(name),
            features: Arc::default(),
            id_gen: IDGen::default(),
            send,
            subscriptions: Subscriptions::default(),
            subscriptions_errors: Arc::default(),
            subscriptions_once: Arc::default(),
        })
    }

    /// Create a new [`Client`] instance with [`ClientHandler`].
    pub fn new<T>(name: Option<&str>, client_handler: T) -> ClientResult<Self>
    where
        T: ClientHandler + 'static + Sync + Send,
    {
        Self::new_with_callback(
            name,
            asyncfn!(client_handler, async move |req| {
                client_handler.send_request(req).await
            }),
        )
    }

    pub fn get_name(&self) -> &'_ str {
        self.name.as_str()
    }

    /// Handle a message from the external message queue.
    /// [`Client::handle_response`] is part of the low-level message-handling
    /// API necessary to implement new transports for a [`Client`]
    /// connection to a local-or-remote `perspective_server::Server`, and
    /// doesn't generally need to be called directly by "users" of a
    /// [`Client`] once connected.
    pub async fn handle_response<'a>(&'a self, msg: &'a [u8]) -> ClientResult<bool> {
        let msg = Response::decode(msg)?;
        tracing::debug!("RECV {}", msg);
        let mut wr = self.subscriptions_once.write().await;
        if let Some(handler) = (*wr).remove(&msg.msg_id) {
            drop(wr);
            handler(msg)?;
            return Ok(true);
        } else if let Some(handler) = self.subscriptions.try_read().unwrap().get(&msg.msg_id) {
            drop(wr);
            handler(msg).await?;
            return Ok(true);
        }

        if let Response {
            client_resp: Some(ClientResp::ServerError(ServerError { message, .. })),
            ..
        } = &msg
        {
            tracing::error!("{}", message);
        } else {
            tracing::debug!("Received unsolicited server response: {}", msg);
        }

        Ok(false)
    }

    /// Handle an exception from the underlying transport.
    pub async fn handle_error<T, U>(
        &self,
        message: ClientError,
        reconnect: Option<T>,
    ) -> ClientResult<()>
    where
        T: Fn() -> U + Clone + Send + Sync + 'static,
        U: Future<Output = ClientResult<()>>,
    {
        let subs = self.subscriptions_errors.read().await;
        let tasks = join_all(subs.values().map(|callback| {
            callback(
                message.clone(),
                reconnect.clone().map(move |f| {
                    ReconnectCallback(Arc::new(move || {
                        clone!(f);
                        Box::pin(async move { Ok(f().await?) }) as LocalBoxFuture<'static, _>
                    }))
                }),
            )
        }));

        tasks.await.into_iter().collect::<Result<(), _>>()?;
        self.close_and_error_subscriptions(&message).await
    }

    /// TODO Synthesize an error to provide to the caller, since the
    /// server did not respond and the other option is to just drop the call
    /// which results in a non-descript error message. It would be nice to
    /// have client-side failures be a native part of the Client API.
    async fn close_and_error_subscriptions(&self, message: &ClientError) -> ClientResult<()> {
        let synthetic_error = |msg_id| Response {
            msg_id,
            entity_id: "".to_string(),
            client_resp: Some(ClientResp::ServerError(ServerError {
                message: format!("{message}"),
                status_code: 2,
            })),
        };

        self.subscriptions.write().await.clear();
        let callbacks_once = self
            .subscriptions_once
            .write()
            .await
            .drain()
            .collect::<Vec<_>>();

        callbacks_once
            .into_iter()
            .try_for_each(|(msg_id, f)| f(synthetic_error(msg_id)))
    }

    pub async fn on_error<T, U, V>(&self, on_error: T) -> ClientResult<u32>
    where
        T: Fn(ClientError, Option<ReconnectCallback>) -> U + Clone + Send + Sync + 'static,
        U: Future<Output = V> + Send + 'static,
        V: Into<Result<(), ClientError>> + Sync + 'static,
    {
        let id = self.gen_id();
        let callback = asyncfn!(on_error, async move |x, y| on_error(x, y).await.into());
        self.subscriptions_errors
            .write()
            .await
            .insert(id, Box::new(move |x, y| Box::pin(callback(x, y))));

        Ok(id)
    }

    /// Generate a message ID unique to this client.
    pub(crate) fn gen_id(&self) -> u32 {
        self.id_gen.next()
    }

    pub(crate) async fn unsubscribe(&self, update_id: u32) -> ClientResult<()> {
        let callback = self
            .subscriptions
            .write()
            .await
            .remove(&update_id)
            .ok_or(ClientError::Unknown("remove_update".to_string()))?;

        drop(callback);
        Ok(())
    }

    /// Register a callback which is expected to respond exactly once.
    pub(crate) async fn subscribe_once(
        &self,
        msg: &Request,
        on_update: Box<dyn FnOnce(Response) -> ClientResult<()> + Send + Sync + 'static>,
    ) -> ClientResult<()> {
        self.subscriptions_once
            .write()
            .await
            .insert(msg.msg_id, on_update);

        tracing::debug!("SEND {}", msg);
        if let Err(e) = (self.send)(msg).await {
            self.subscriptions_once.write().await.remove(&msg.msg_id);
            Err(ClientError::Unknown(e.to_string()))
        } else {
            Ok(())
        }
    }

    pub(crate) async fn subscribe<T, U>(&self, msg: &Request, on_update: T) -> ClientResult<()>
    where
        T: Fn(Response) -> U + Send + Sync + 'static,
        U: Future<Output = Result<(), ClientError>> + Send + 'static,
    {
        self.subscriptions
            .write()
            .await
            .insert(msg.msg_id, Box::new(move |x| Box::pin(on_update(x))));

        tracing::debug!("SEND {}", msg);
        if let Err(e) = (self.send)(msg).await {
            self.subscriptions.write().await.remove(&msg.msg_id);
            Err(ClientError::Unknown(e.to_string()))
        } else {
            Ok(())
        }
    }

    /// Send a `ClientReq` and await both the successful completion of the
    /// `send`, _and_ the `ClientResp` which is returned.
    pub(crate) async fn oneshot(&self, req: &Request) -> ClientResult<ClientResp> {
        let (sender, receiver) = futures::channel::oneshot::channel::<ClientResp>();
        let on_update = Box::new(move |res: Response| {
            sender.send(res.client_resp.unwrap()).map_err(|x| x.into())
        });

        self.subscribe_once(req, on_update).await?;
        receiver
            .await
            .map_err(|_| ClientError::Unknown(format!("Internal error for req {req}")))
    }

    pub(crate) async fn get_features(&self) -> ClientResult<Features> {
        let mut guard = self.features.lock().await;
        let features = if let Some(features) = &*guard {
            features.clone()
        } else {
            let msg = Request {
                msg_id: self.gen_id(),
                entity_id: "".to_owned(),
                client_req: Some(ClientReq::GetFeaturesReq(GetFeaturesReq {})),
            };

            let features = Features(Arc::new(match self.oneshot(&msg).await? {
                ClientResp::GetFeaturesResp(features) => Ok(features),
                resp => Err(resp),
            }?));

            *guard = Some(features.clone());
            features
        };

        Ok(features)
    }

    /// Creates a new [`Table`] from either a _schema_ or _data_.
    ///
    /// The [`Client::table`] factory function can be initialized with either a
    /// _schema_ (see [`Table::schema`]), or data in one of these formats:
    ///
    /// - Apache Arrow
    /// - CSV
    /// - JSON row-oriented
    /// - JSON column-oriented
    /// - NDJSON
    ///
    /// When instantiated with _data_, the schema is inferred from this data.
    /// While this is convenient, inferrence is sometimes imperfect e.g.
    /// when the input is empty, null or ambiguous. For these cases,
    /// [`Client::table`] can first be instantiated with a explicit schema.
    ///
    /// When instantiated with a _schema_, the resulting [`Table`] is empty but
    /// with known column names and column types. When subsqeuently
    /// populated with [`Table::update`], these columns will be _coerced_ to
    /// the schema's type. This behavior can be useful when
    /// [`Client::table`]'s column type inferences doesn't work.
    ///
    /// The resulting [`Table`] is _virtual_, and invoking its methods
    /// dispatches events to the `perspective_server::Server` this
    /// [`Client`] connects to, where the data is stored and all calculation
    /// occurs.
    ///
    /// # Arguments
    ///
    /// - `arg` - Either _schema_ or initialization _data_.
    /// - `options` - Optional configuration which provides one of:
    ///     - `limit` - The max number of rows the resulting [`Table`] can
    ///       store.
    ///     - `index` - The column name to use as an _index_ column. If this
    ///       `Table` is being instantiated by _data_, this column name must be
    ///       present in the data.
    ///     - `name` - The name of the table. This will be generated if it is
    ///       not provided.
    ///     - `format` - The explicit format of the input data, can be one of
    ///       `"json"`, `"columns"`, `"csv"` or `"arrow"`. This overrides
    ///       language-specific type dispatch behavior, which allows stringified
    ///       and byte array alternative inputs.
    ///
    /// # Examples
    ///
    /// Load a CSV from a `String`:
    ///
    /// ```rust
    /// let opts = TableInitOptions::default();
    /// let data = TableData::Update(UpdateData::Csv("x,y\n1,2\n3,4".into()));
    /// let table = client.table(data, opts).await?;
    /// ```
    pub async fn table(&self, input: TableData, options: TableInitOptions) -> ClientResult<Table> {
        let entity_id = match options.name.clone() {
            Some(x) => x.to_owned(),
            None => randid(),
        };

        if let TableData::View(view) = &input {
            let window = ViewWindow::default();
            let arrow = view.to_arrow(window).await?;
            let mut table = self
                .crate_table_inner(UpdateData::Arrow(arrow).into(), options.into(), entity_id)
                .await?;

            let table_ = table.clone();
            let callback = asyncfn!(table_, update, async move |update: OnUpdateData| {
                let update = UpdateData::Arrow(update.delta.expect("Malformed message").into());
                let options = crate::UpdateOptions::default();
                table_.update(update, options).await.unwrap_or_log();
            });

            let options = OnUpdateOptions {
                mode: Some(OnUpdateMode::Row),
            };

            let on_update_token = view.on_update(callback, options).await?;
            table.view_update_token = Some(on_update_token);
            Ok(table)
        } else {
            self.crate_table_inner(input, options.into(), entity_id)
                .await
        }
    }

    async fn crate_table_inner(
        &self,
        input: TableData,
        options: TableOptions,
        entity_id: String,
    ) -> ClientResult<Table> {
        let msg = Request {
            msg_id: self.gen_id(),
            entity_id: entity_id.clone(),
            client_req: Some(ClientReq::MakeTableReq(MakeTableReq {
                data: Some(input.into()),
                options: Some(options.clone().try_into()?),
            })),
        };

        let client = self.clone();
        match self.oneshot(&msg).await? {
            ClientResp::MakeTableResp(_) => Ok(Table::new(entity_id, client, options)),
            resp => Err(resp.into()),
        }
    }

    async fn get_table_infos(&self) -> ClientResult<Vec<HostedTable>> {
        let msg = Request {
            msg_id: self.gen_id(),
            entity_id: "".to_owned(),
            client_req: Some(ClientReq::GetHostedTablesReq(GetHostedTablesReq {
                subscribe: false,
            })),
        };

        match self.oneshot(&msg).await? {
            ClientResp::GetHostedTablesResp(GetHostedTablesResp { table_infos }) => Ok(table_infos),
            resp => Err(resp.into()),
        }
    }

    /// Opens a [`Table`] that is hosted on the `perspective_server::Server`
    /// that is connected to this [`Client`].
    ///
    /// The `name` property of [`TableInitOptions`] is used to identify each
    /// [`Table`]. [`Table`] `name`s can be looked up for each [`Client`]
    /// via [`Client::get_hosted_table_names`].
    ///
    /// # Examples
    ///
    /// ```rust
    /// let tables = client.open_table("table_one").await;
    /// ```  
    pub async fn open_table(&self, entity_id: String) -> ClientResult<Table> {
        let infos = self.get_table_infos().await?;

        // TODO fix this - name is repeated 2x
        if let Some(info) = infos.into_iter().find(|i| i.entity_id == entity_id) {
            let options = TableOptions {
                index: info.index,
                limit: info.limit,
            };

            let client = self.clone();
            Ok(Table::new(entity_id, client, options))
        } else {
            Err(ClientError::Unknown(format!(
                "Unknown table \"{}\"",
                entity_id
            )))
        }
    }

    /// Retrieves the names of all tables that this client has access to.
    ///
    /// `name` is a string identifier unique to the [`Table`] (per [`Client`]),
    /// which can be used in conjunction with [`Client::open_table`] to get
    /// a [`Table`] instance without the use of [`Client::table`]
    /// constructor directly (e.g., one created by another [`Client`]).
    ///
    /// # Examples
    ///
    /// ```rust
    /// let tables = client.get_hosted_table_names().await;
    /// ```
    pub async fn get_hosted_table_names(&self) -> ClientResult<Vec<String>> {
        let msg = Request {
            msg_id: self.gen_id(),
            entity_id: "".to_owned(),
            client_req: Some(ClientReq::GetHostedTablesReq(GetHostedTablesReq {
                subscribe: false,
            })),
        };

        match self.oneshot(&msg).await? {
            ClientResp::GetHostedTablesResp(GetHostedTablesResp { table_infos }) => {
                Ok(table_infos.into_iter().map(|i| i.entity_id).collect())
            },
            resp => Err(resp.into()),
        }
    }

    /// Register a callback which is invoked whenever [`Client::table`] (on this
    /// [`Client`]) or [`Table::delete`] (on a [`Table`] belinging to this
    /// [`Client`]) are called.
    pub async fn on_hosted_tables_update<T, U>(&self, on_update: T) -> ClientResult<u32>
    where
        T: Fn() -> U + Send + Sync + 'static,
        U: Future<Output = ()> + Send + 'static,
    {
        let on_update = Arc::new(on_update);
        let callback = asyncfn!(on_update, async move |resp: Response| {
            match resp.client_resp {
                Some(ClientResp::GetHostedTablesResp(_)) | None => {
                    on_update().await;
                    Ok(())
                },
                resp => Err(resp.into()),
            }
        });

        let msg = Request {
            msg_id: self.gen_id(),
            entity_id: "".to_owned(),
            client_req: Some(ClientReq::GetHostedTablesReq(GetHostedTablesReq {
                subscribe: true,
            })),
        };

        self.subscribe(&msg, callback).await?;
        Ok(msg.msg_id)
    }

    /// Remove a callback previously registered via
    /// `Client::on_hosted_tables_update`.
    pub async fn remove_hosted_tables_update(&self, update_id: u32) -> ClientResult<()> {
        let msg = Request {
            msg_id: self.gen_id(),
            entity_id: "".to_owned(),
            client_req: Some(ClientReq::RemoveHostedTablesUpdateReq(
                RemoveHostedTablesUpdateReq { id: update_id },
            )),
        };

        self.unsubscribe(update_id).await?;
        match self.oneshot(&msg).await? {
            ClientResp::RemoveHostedTablesUpdateResp(_) => Ok(()),
            resp => Err(resp.into()),
        }
    }

    /// Provides the [`SystemInfo`] struct, implementation-specific metadata
    /// about the [`perspective_server::Server`] runtime such as Memory and
    /// CPU usage.
    pub async fn system_info(&self) -> ClientResult<SystemInfo> {
        let msg = Request {
            msg_id: self.gen_id(),
            entity_id: "".to_string(),
            client_req: Some(ClientReq::ServerSystemInfoReq(ServerSystemInfoReq {})),
        };

        match self.oneshot(&msg).await? {
            ClientResp::ServerSystemInfoResp(resp) => {
                #[cfg(not(target_family = "wasm"))]
                let timestamp = Some(
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)?
                        .as_millis() as u64,
                );

                #[cfg(target_family = "wasm")]
                let timestamp = None;

                #[cfg(feature = "talc-allocator")]
                let (client_used, client_heap) = {
                    let (client_used, client_heap) = crate::utils::get_used();
                    (Some(client_used as u64), Some(client_heap as u64))
                };

                #[cfg(not(feature = "talc-allocator"))]
                let (client_used, client_heap) = (None, None);

                let info = SystemInfo {
                    heap_size: resp.heap_size,
                    used_size: resp.used_size,
                    cpu_time: resp.cpu_time,
                    cpu_time_epoch: resp.cpu_time_epoch,
                    timestamp,
                    client_heap,
                    client_used,
                };

                Ok(info)
            },
            resp => Err(resp.into()),
        }
    }
}
