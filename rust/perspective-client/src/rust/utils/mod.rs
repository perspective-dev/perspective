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

//! Utility functions that are common to the `perspective` crates.

mod clone;
mod logging;
mod rand_sequence;

#[cfg(feature = "talc-allocator")]
mod talc_allocator;

#[cfg(test)]
mod tests;

use std::sync::Arc;
use std::time::SystemTimeError;

use rand::prelude::*;
use rand::rngs::StdRng;
#[cfg(feature = "talc-allocator")]
pub(crate) use talc_allocator::get_used;
use thiserror::*;

use crate::proto;
use crate::utils::rand_sequence::RandomSequence;

#[derive(Clone, Error, Debug)]
pub enum ClientError {
    #[error("View not found")]
    ViewNotFound,

    #[error("Abort(): {0}")]
    Internal(String),

    #[error("Transport error: {0}")]
    TransportError(String),

    #[error("Client not yet initialized")]
    NotInitialized,

    #[error("Unknown error: {0}")]
    Unknown(String),

    #[error("Unwrapped option")]
    Option,

    #[error("Bad string")]
    Utf8(#[from] std::str::Utf8Error),

    #[error("Undecipherable server message {0:?}")]
    DecodeError(#[from] prost::DecodeError),

    #[error("Response aborted")]
    ResponseAborted,

    #[error("Unexpected response {0:?}")]
    ResponseFailed(Box<proto::response::ClientResp>),

    #[error("Not yet implemented {0:?}")]
    NotImplemented(&'static str),

    #[error("Can't use both `limit` and `index` arguments")]
    BadTableOptions,

    #[error("External error: {0}")]
    ExternalError(Arc<Box<dyn std::error::Error + Send + Sync>>),

    #[error("Undecipherable proto message")]
    ProtoError(#[from] prost::EncodeError),

    #[error("Duplicate name {0}")]
    DuplicateNameError(String),

    #[error("{0}")]
    TimeError(#[from] SystemTimeError),

    #[error("{0}")]
    TypedArrayError(String),
}

pub type ClientResult<T> = Result<T, ClientError>;

impl From<Box<dyn std::error::Error + Send + Sync>> for ClientError {
    fn from(value: Box<dyn std::error::Error + Send + Sync>) -> Self {
        ClientError::ExternalError(Arc::new(value))
    }
}

impl<'a, A> From<std::sync::PoisonError<std::sync::MutexGuard<'a, A>>> for ClientError {
    fn from(_: std::sync::PoisonError<std::sync::MutexGuard<'a, A>>) -> Self {
        ClientError::Internal("Lock Error".to_owned())
    }
}

impl From<Option<proto::response::ClientResp>> for ClientError {
    fn from(value: Option<proto::response::ClientResp>) -> Self {
        match value {
            Some(proto::response::ClientResp::ServerError(x)) => match x.status_code() {
                proto::StatusCode::ServerError => ClientError::Internal(x.message),
                proto::StatusCode::ViewNotFound => ClientError::ViewNotFound,
                proto::StatusCode::TransportError => ClientError::TransportError(x.message),
            },
            Some(x) => ClientError::ResponseFailed(Box::new(x)),
            None => ClientError::ResponseAborted,
        }
    }
}

impl From<proto::response::ClientResp> for ClientError {
    fn from(value: proto::response::ClientResp) -> Self {
        match value {
            proto::response::ClientResp::ServerError(x) => match x.status_code() {
                proto::StatusCode::ServerError => ClientError::Internal(x.message),
                proto::StatusCode::ViewNotFound => ClientError::ViewNotFound,
                proto::StatusCode::TransportError => ClientError::TransportError(x.message),
            },
            x => ClientError::ResponseFailed(Box::new(x)),
        }
    }
}

pub trait PerspectiveResultExt {
    fn unwrap_or_log(&self);
}

impl<T, E> PerspectiveResultExt for Result<T, E>
where
    E: std::error::Error,
{
    fn unwrap_or_log(&self) {
        if let Err(e) = self {
            tracing::warn!("{}", e);
        }
    }
}

/// Generate a sequence of IDs
#[derive(Clone)]
pub struct IDGen(Arc<std::sync::Mutex<RandomSequence>>);

impl Default for IDGen {
    fn default() -> Self {
        Self(Arc::new(std::sync::Mutex::new(Self::new_seq())))
    }
}

impl IDGen {
    fn new_seq() -> RandomSequence {
        let mut rng = rand::rngs::ThreadRng::default();
        let config = RandomSequence::new(rng.next_u32(), rng.next_u32());
        config.into_iter()
    }

    pub fn next(&self) -> u32 {
        let mut idgen = self.0.lock().unwrap();
        if let Some(x) = idgen.next() {
            x
        } else {
            *idgen = Self::new_seq();
            idgen.next().unwrap()
        }
    }
}

const SIZE: usize = 21;

const CHARACTERS: [char; 52] = [
    'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's',
    't', 'u', 'v', 'w', 'x', 'y', 'z', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L',
    'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
];

/// Generate a random identifier `String`
pub fn randid() -> String {
    let mask = CHARACTERS.len().next_power_of_two() - 1;
    let step: usize = 8 * SIZE / 5;
    let mut id = String::with_capacity(SIZE);
    loop {
        let mut rng = rand::rngs::ThreadRng::default();
        let mut random = StdRng::from_rng(&mut rng);
        let mut bytes: Vec<u8> = vec![0; step];
        random.fill(&mut bytes[..]);
        for &byte in &bytes {
            let byte = byte as usize & mask;
            if CHARACTERS.len() > byte {
                id.push(CHARACTERS[byte]);
                if id.len() == SIZE {
                    return id;
                }
            }
        }
    }
}
