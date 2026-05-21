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

use std::error::Error;
use std::future::Future;
use std::sync::Arc;

use derivative::Derivative;
use futures::channel::oneshot;
use js_sys::{Function, Uint8Array};
#[cfg(doc)]
use perspective_client::SystemInfo;
use perspective_client::{
    ClientError, ReconnectCallback, Session, TableData, TableInitOptions, TableRef, asyncfn,
};
use wasm_bindgen::prelude::*;
use wasm_bindgen_derive::TryFromJsValue;
use wasm_bindgen_futures::{JsFuture, future_to_promise};

pub use crate::table::*;
use crate::utils::{ApiError, ApiResult, JsValueSerdeExt, LocalPollLoop};
use crate::{TableDataExt, apierror};

#[wasm_bindgen]
extern "C" {
    #[derive(Clone)]
    #[wasm_bindgen(typescript_type = "TableInitOptions")]
    pub type JsTableInitOptions;

    #[derive(Clone)]
    #[wasm_bindgen(typescript_type = "JoinOptions")]
    pub type JsJoinOptions;
}

async fn js_to_table_ref(val: &JsValue) -> ApiResult<TableRef> {
    if let Some(name) = val.as_string() {
        Ok(TableRef::from(name))
    } else {
        let get_name = js_sys::Reflect::get(val, &wasm_bindgen::intern("get_name").into())
            .map_err(|_| apierror!(TableRefError))?
            .dyn_into::<js_sys::Function>()
            .map_err(|_| apierror!(TableRefError))?;

        let promise = get_name
            .call0(val)
            .map_err(|_| apierror!(TableRefError))?
            .dyn_into::<js_sys::Promise>()
            .map_err(|_| apierror!(TableRefError))?;

        let name = wasm_bindgen_futures::JsFuture::from(promise)
            .await
            .map_err(|_| apierror!(TableRefError))?
            .as_string()
            .ok_or_else(|| apierror!(TableRefError))?;

        Ok(TableRef::from(name))
    }
}

#[wasm_bindgen]
#[derive(Clone)]
pub struct ProxySession(perspective_client::ProxySession);

#[wasm_bindgen]
impl ProxySession {
    #[wasm_bindgen(constructor)]
    pub fn new(client: &Client, on_response: &Function) -> Self {
        let poll_loop = LocalPollLoop::new({
            let on_response = on_response.clone();
            move |msg: Vec<u8>| {
                let msg = Uint8Array::from(&msg[..]);
                on_response.call1(&JsValue::UNDEFINED, &JsValue::from(msg))?;
                Ok(JsValue::null())
            }
        });
        // NB: This swallows any errors raised by the inner callback
        let on_response = Box::new(move |msg: &[u8]| {
            wasm_bindgen_futures::spawn_local(poll_loop.poll(msg.to_vec()));
            Ok(())
        });
        Self(perspective_client::ProxySession::new(
            client.client.clone(),
            on_response,
        ))
    }

    #[wasm_bindgen]
    pub async fn handle_request(&self, value: JsValue) -> ApiResult<()> {
        let uint8array = Uint8Array::new(&value);
        let slice = uint8array.to_vec();
        self.0.handle_request(&slice).await?;
        Ok(())
    }

    pub async fn close(self) {
        self.0.close().await;
    }
}

/// An instance of a [`Client`] is a connection to a single
/// `perspective_server::Server`, whether locally in-memory or remote over some
/// transport like a WebSocket.
///
/// The browser and node.js libraries both support the `websocket(url)`
/// constructor, which connects to a remote `perspective_server::Server`
/// instance over a WebSocket transport.
///
/// In the browser, the `worker()` constructor creates a new Web Worker
/// `perspective_server::Server` and returns a [`Client`] connected to it.
///
/// In node.js, a pre-instantied [`Client`] connected synhronously to a global
/// singleton `perspective_server::Server` is the default module export.
///
/// # JavaScript Examples
///
/// Create a Web Worker `perspective_server::Server` in the browser and return a
/// [`Client`] instance connected for it:
///
/// ```javascript
/// import perspective from "@perspective-dev/client";
/// const client = await perspective.worker();
/// ```
///
/// Create a WebSocket connection to a remote `perspective_server::Server`:
///
/// ```javascript
/// import perspective from "@perspective-dev/client";
/// const client = await perspective.websocket("ws://locahost:8080/ws");
/// ```
///
/// Access the synchronous client in node.js:
///
/// ```javascript
/// import { default as client } from "@perspective-dev/client";
/// ```
#[wasm_bindgen]
#[derive(TryFromJsValue, Clone)]
pub struct Client {
    pub(crate) client: perspective_client::Client,
    pub(crate) close: Option<Function>,
}

impl From<perspective_client::Client> for Client {
    fn from(client: perspective_client::Client) -> Self {
        Client {
            client,
            close: None,
        }
    }
}

impl PartialEq for Client {
    fn eq(&self, other: &Self) -> bool {
        self.client.get_name() == other.client.get_name()
    }
}

/// A wrapper around [`js_sys::Function`] to ease async integration for the
/// `reconnect` argument of [`Client::on_error`] callback.
#[derive(Derivative)]
#[derivative(Clone(bound = ""))]
struct JsReconnect<I>(Arc<dyn Fn(I) -> js_sys::Promise>);

// This type is not thread safe, but the JavaScript environment does not allow
// threading.
unsafe impl<I> Send for JsReconnect<I> {}
unsafe impl<I> Sync for JsReconnect<I> {}

impl<I> JsReconnect<I> {
    fn run(&self, args: I) -> js_sys::Promise {
        self.0(args)
    }

    fn run_all(
        &self,
        args: I,
    ) -> impl Future<Output = Result<(), Box<dyn Error + Send + Sync + 'static>>>
    + Send
    + Sync
    + 'static
    + use<I> {
        let (sender, receiver) = oneshot::channel::<Result<(), Box<dyn Error + Send + Sync>>>();
        let p = self.0(args);
        let _ = future_to_promise(async move {
            let result = JsFuture::from(p)
                .await
                .map(|_| ())
                .map_err(|x| format!("{x:?}").into());

            sender.send(result).unwrap();
            Ok(JsValue::UNDEFINED)
        });

        async move { receiver.await.unwrap() }
    }
}

impl<F, I> From<F> for JsReconnect<I>
where
    F: Fn(I) -> js_sys::Promise + 'static,
{
    fn from(value: F) -> Self {
        JsReconnect(Arc::new(value))
    }
}

impl Client {
    pub fn get_client(&self) -> &'_ perspective_client::Client {
        &self.client
    }
}

#[wasm_bindgen]
impl Client {
    #[wasm_bindgen(constructor)]
    pub fn new(send_request: Function, close: Option<Function>) -> ApiResult<Self> {
        let send_request = JsReconnect::from(move |mut v: Vec<u8>| {
            let buff2 = unsafe { js_sys::Uint8Array::view_mut_raw(v.as_mut_ptr(), v.len()) };
            send_request
                .call1(&JsValue::UNDEFINED, &buff2)
                .unwrap()
                .unchecked_into::<js_sys::Promise>()
        });

        let client = perspective_client::Client::new_with_callback(None, move |msg| {
            send_request.run_all(msg)
        })?;

        Ok(Client { close, client })
    }

    #[wasm_bindgen]
    pub fn new_proxy_session(&self, on_response: &Function) -> ProxySession {
        ProxySession::new(self, on_response)
    }

    #[wasm_bindgen]
    pub async fn handle_response(&self, value: &JsValue) -> ApiResult<()> {
        let uint8array = Uint8Array::new(value);
        let slice = uint8array.to_vec();
        self.client.handle_response(&slice).await?;
        Ok(())
    }

    #[wasm_bindgen]
    pub async fn handle_error(&self, error: String, reconnect: Option<Function>) -> ApiResult<()> {
        self.client
            .handle_error(
                ClientError::Unknown(error),
                reconnect.map(|reconnect| {
                    let reconnect =
                        JsReconnect::from(move |()| match reconnect.call0(&JsValue::UNDEFINED) {
                            Ok(x) => x.unchecked_into::<js_sys::Promise>(),
                            Err(e) => {
                                // This error may occur when _invoking_ the function
                                tracing::warn!("{:?}", e);
                                js_sys::Promise::reject(&format!("C {e:?}").into())
                            },
                        });

                    asyncfn!(reconnect, async move || {
                        if let Err(e) = JsFuture::from(reconnect.run(())).await {
                            if let Some(e) = e.dyn_ref::<js_sys::Object>() {
                                Err(ClientError::Unknown(e.to_string().as_string().unwrap()))
                            } else {
                                Err(ClientError::Unknown(e.as_string().unwrap()))
                            }
                        } else {
                            Ok(())
                        }
                    })
                }),
            )
            .await?;

        Ok(())
    }

    #[wasm_bindgen]
    pub async fn on_error(&self, callback: Function) -> ApiResult<u32> {
        let callback = JsReconnect::from(
            move |(message, reconnect): (ClientError, Option<ReconnectCallback>)| {
                let cl: Closure<dyn Fn() -> js_sys::Promise> = Closure::new(move || {
                    let reconnect = reconnect.clone();
                    future_to_promise(async move {
                        if let Some(f) = reconnect {
                            (*f)().await.map_err(|e| JsValue::from(format!("A {e}")))?;
                        }

                        Ok(JsValue::UNDEFINED)
                    })
                });

                if let Err(e) = callback.call2(
                    &JsValue::UNDEFINED,
                    &JsValue::from(apierror!(ClientError(message))),
                    &cl.into_js_value(),
                ) {
                    tracing::warn!("{:?}", e);
                }

                js_sys::Promise::resolve(&JsValue::UNDEFINED)
            },
        );

        let poll_loop = LocalPollLoop::new_async(move |x| JsFuture::from(callback.run(x)));
        let id = self
            .client
            .on_error(asyncfn!(poll_loop, async move |message, reconnect| {
                poll_loop.poll((message, reconnect)).await;
                Ok(())
            }))
            .await?;

        Ok(id)
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
    /// # JavaScript Examples
    ///
    /// Load a CSV from a `string`:
    ///
    /// ```javascript
    /// const table = await client.table("x,y\n1,2\n3,4");
    /// ```
    ///
    /// Load an Arrow from an `ArrayBuffer`:
    ///
    /// ```javascript
    /// import * as fs from "node:fs/promises";
    /// const table2 = await client.table(await fs.readFile("superstore.arrow"));
    /// ```
    ///
    /// Load a CSV from a `UInt8Array` (the default for this type is Arrow)
    /// using a format override:
    ///
    /// ```javascript
    /// const enc = new TextEncoder();
    /// const table = await client.table(enc.encode("x,y\n1,2\n3,4"), {
    ///     format: "csv",
    /// });
    /// ```
    ///
    /// Create a table with an `index`:
    ///
    /// ```javascript
    /// const table = await client.table(data, { index: "Row ID" });
    /// ```
    #[wasm_bindgen]
    pub async fn table(
        &self,
        value: &JsTableInitData,
        options: Option<JsTableInitOptions>,
    ) -> ApiResult<Table> {
        let options = options
            .into_serde_ext::<Option<TableInitOptions>>()?
            .unwrap_or_default();

        let args = TableData::from_js_value(value, options.format)?;
        Ok(Table(self.client.table(args, options).await?))
    }

    /// Creates a new read-only [`Table`] by performing an INNER JOIN on two
    /// source tables. The resulting table is reactive: when either source
    /// table is updated, the join is automatically recomputed.
    ///
    /// # Arguments
    ///
    /// - `left` - The left source table (a [`Table`] instance or a table name
    ///   string).
    /// - `right` - The right source table (a [`Table`] instance or a table name
    ///   string).
    /// - `on` - The column name to join on. Must exist in both tables with the
    ///   same type.
    /// - `options` - Optional join configuration: `{ join_type?: "inner" |
    ///   "left" | "outer", name?: string }`.
    ///
    /// # JavaScript Examples
    ///
    /// ```javascript
    /// const joined = await client.join(orders_table, products_table, "Product ID", { join_type: "left" });
    /// const joined = await client.join("orders", "products", "Product ID", { join_type: "left" });
    /// ```
    #[wasm_bindgen]
    pub async fn join(
        &self,
        left: JsValue,
        right: JsValue,
        on: &str,
        options: Option<JsJoinOptions>,
    ) -> ApiResult<Table> {
        let options = options
            .into_serde_ext::<Option<perspective_client::JoinOptions>>()?
            .unwrap_or_default();

        let left_ref = js_to_table_ref(&left).await?;
        let right_ref = js_to_table_ref(&right).await?;
        Ok(Table(
            self.client.join(left_ref, right_ref, on, options).await?,
        ))
    }

    /// Terminates this [`Client`], cleaning up any [`crate::View`] handles the
    /// [`Client`] has open as well as its callbacks.
    #[wasm_bindgen]
    pub fn terminate(&self) -> ApiResult<JsValue> {
        if let Some(f) = self.close.clone() {
            Ok(f.call0(&JsValue::UNDEFINED)?)
        } else {
            Err(ApiError::new("Client type cannot be terminated"))
        }
    }

    /// Opens a [`Table`] that is hosted on the `perspective_server::Server`
    /// that is connected to this [`Client`].
    ///
    /// The `name` property of [`TableInitOptions`] is used to identify each
    /// [`Table`]. [`Table`] `name`s can be looked up for each [`Client`]
    /// via [`Client::get_hosted_table_names`].
    ///
    /// # JavaScript Examples
    ///
    /// Get a virtual [`Table`] named "table_one" from this [`Client`]
    ///
    /// ```javascript
    /// const tables = await client.open_table("table_one");
    /// ```
    #[wasm_bindgen]
    pub async fn open_table(&self, entity_id: String) -> ApiResult<Table> {
        Ok(Table(self.client.open_table(entity_id).await?))
    }

    /// Unsafely gets a [`View`] by raw ID, useful for JavaScript multi-threaded
    /// (via Web Worker) context where a standard `View` cannot otherwise be
    /// shared because its wrapper is not serializable.
    ///
    /// # Safety
    ///
    /// This method is unsafe because the lifetime of a [`View`] is bound to
    /// the [`Client`] which created it.
    ///
    /// The caller must guarantee that `entity_id` corresponds to a live
    /// [`crate::View`] on the connected server (obtained from another
    /// [`Client`]'s [`crate::View::get_name`] and forwarded across the
    /// serialization boundary).
    ///
    /// # JavaScript Examples
    ///
    /// ```javascript
    /// const view = client.__unsafe_open_view(name_from_main_thread);
    /// const cols = await view.to_columns();
    /// ```
    #[wasm_bindgen]
    pub fn __unsafe_open_view(&self, entity_id: String) -> crate::view::View {
        crate::view::View(perspective_client::View::new(
            entity_id,
            self.client.clone(),
        ))
    }

    /// Retrieves the names of all tables that this client has access to.
    ///
    /// `name` is a string identifier unique to the [`Table`] (per [`Client`]),
    /// which can be used in conjunction with [`Client::open_table`] to get
    /// a [`Table`] instance without the use of [`Client::table`]
    /// constructor directly (e.g., one created by another [`Client`]).
    ///
    /// # JavaScript Examples
    ///
    /// ```javascript
    /// const tables = await client.get_hosted_table_names();
    /// ```
    #[wasm_bindgen]
    pub async fn get_hosted_table_names(&self) -> ApiResult<Vec<String>> {
        Ok(self.client.get_hosted_table_names().await?)
    }

    /// Register a callback which is invoked whenever [`Client::table`] (on this
    /// [`Client`]) or [`Table::delete`] (on a [`Table`] belinging to this
    /// [`Client`]) are called.
    #[wasm_bindgen]
    pub async fn on_hosted_tables_update(&self, on_update_js: Function) -> ApiResult<u32> {
        let poll_loop = LocalPollLoop::new(move |_| on_update_js.call0(&JsValue::UNDEFINED));
        let on_update = Box::new(move || poll_loop.poll(()));
        let id = self.client.on_hosted_tables_update(on_update).await?;
        Ok(id)
    }

    /// Remove a callback previously registered via
    /// `Client::on_hosted_tables_update`.
    #[wasm_bindgen]
    pub async fn remove_hosted_tables_update(&self, update_id: u32) -> ApiResult<()> {
        self.client.remove_hosted_tables_update(update_id).await?;
        Ok(())
    }

    /// Provides the [`SystemInfo`] struct, implementation-specific metadata
    /// about the [`perspective_server::Server`] runtime such as Memory and
    /// CPU usage.
    ///
    /// For WebAssembly servers, this method includes the WebAssembly heap size.
    ///
    /// # JavaScript Examples
    ///
    /// ```javascript
    /// const info = await client.system_info();
    /// ```
    #[wasm_bindgen]
    pub async fn system_info(&self) -> ApiResult<JsSystemInfo> {
        let mut info = self.client.system_info().await?;

        #[cfg(feature = "trace-allocator")]
        if let perspective_client::SystemInfo {
            client_used: None,
            client_heap: None,
            ..
        } = &info
        {
            let (client_used, client_heap) = crate::utils::get_used();
            info.client_used = Some(client_used as u64);
            info.client_heap = Some(client_heap as u64);
        };

        let timestamp = web_sys::window()
            .and_then(|x| x.performance())
            .map(|x| x.now() as u64);

        info.timestamp = timestamp;
        let record = JsValue::from_serde_ext(&info.cast::<f64>())?;
        Ok(record.unchecked_into())
    }
}

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(typescript_type = "SystemInfo")]
    pub type JsSystemInfo;
}
