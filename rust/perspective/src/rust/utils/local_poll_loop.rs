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

use futures::channel::mpsc::{unbounded, UnboundedSender};
use futures::{Future, SinkExt, StreamExt};
use wasm_bindgen::JsValue;
use wasm_bindgen_futures::spawn_local;

/// A useful abstraction for connecting `!Sync + !Send` callbacks (like
/// `js_sys::Function`) to `Send + Sync` contexts (like the client loop).
pub struct LocalPollLoop<R: Send + Sync + Clone + 'static>(UnboundedSender<R>);

impl<R: Send + Sync + Clone + 'static> LocalPollLoop<R> {
    /// Create a new loop which accepts a `R: Send + Sync` intermediate state
    /// argument and calls the `!Send + !Sync` callback.
    pub fn new<F: Fn(R) -> Result<JsValue, JsValue> + 'static>(send: F) -> Self {
        let (emit, mut receive) = unbounded::<R>();
        spawn_local(async move {
            while let Some(resp) = receive.next().await {
                let resp = send(resp);
                if let Err(err) = resp {
                    web_sys::console::error_2(&"Failed to serialize".into(), &err);
                }
            }
        });

        Self(emit)
    }

    /// Send a new `R` to the poll loop.
    pub fn poll(&self, msg: R) -> impl Future<Output = ()> + Send + Sync + 'static {
        let mut emit = self.0.clone();
        async move { emit.send(msg).await.unwrap() }
    }
}
