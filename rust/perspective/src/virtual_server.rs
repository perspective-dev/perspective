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

use std::net::SocketAddr;

use axum::extract::connect_info::ConnectInfo;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::routing::{MethodRouter, get};
use perspective_server::{VirtualServer, VirtualServerHandler};

/// A local error synonym for this module only.
type PerspectiveWSError = Box<dyn std::error::Error + Send + Sync>;

pub type PSPError = Box<dyn std::error::Error + Send + Sync>;

/// The inner message loop handles the full-duplex stream of messages
/// between the [`perspective::Client`] and [`Session`]. When this
/// funciton returns, messages are no longer processed.
async fn process_message_loop(
    socket: &mut WebSocket,
    handler: impl VirtualServerHandler,
) -> Result<(), PerspectiveWSError> {
    use Message::*;
    let mut processor = VirtualServer::new(handler);
    loop {
        match socket.recv().await {
            Some(Ok(Binary(msg))) => socket.send(Binary(processor.handle_request(msg)?)).await?,
            Some(_) | None => {
                tracing::debug!("Unexpected msg");
                break;
            },
        };
    }

    Ok(())
}

/// This handler is responsible for the beginning-to-end lifecycle of a
/// single WebSocket connection to an [`axum`] server.
///
/// Messages will come in from the [`axum::extract::ws::WebSocket`] in binary
/// form via [`Message::Binary`], where they'll be routed to
/// [`perspective::Session::handle_request`]. The server may generate
/// one or more responses, which it will then send back to
/// the [`axum::extract::ws::WebSocket::send`] method via its
/// [`SessionHandler`] impl.
pub fn custom_websocket_handler<S, T>(handler: T) -> MethodRouter<S>
where
    T: VirtualServerHandler + Clone + Send + Sync + 'static,
    S: Clone + Send + Sync + 'static,
{
    let websocket_handler_internal = async |ws: WebSocketUpgrade,
                                            ConnectInfo(addr): ConnectInfo<SocketAddr>|
           -> axum::response::Response {
        tracing::info!("{addr} Connected.");

        ws.on_upgrade(move |mut socket| async move {
            if let Err(msg) = process_message_loop(&mut socket, handler).await {
                tracing::error!("Internal error {}", msg);
            }

            tracing::info!("{addr} Disconnected.");
        })
    };

    get(websocket_handler_internal)
}
