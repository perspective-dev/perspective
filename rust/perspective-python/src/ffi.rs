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

#[cxx::bridge]
mod ffi_internal {
    extern "Rust" {
        type ResponseBatch;
        fn create_response_batch() -> Box<ResponseBatch>;
        fn push_response(self: &mut ResponseBatch, resp: Vec<u8>);
    }
    unsafe extern "C++" {
        include!("server.h");
        type ProtoApiServer;
        fn new_proto_server() -> UniquePtr<ProtoApiServer>;
        fn handle_message(server: &ProtoApiServer, val: &Vec<u8>) -> Box<ResponseBatch>;
        fn poll(server: &ProtoApiServer) -> Box<ResponseBatch>;
    }
}

pub struct ResponseBatch(Vec<Vec<u8>>);

impl Deref for ResponseBatch {
    type Target = Vec<Vec<u8>>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl ResponseBatch {
    fn push_response(&mut self, resp: Vec<u8>) {
        self.0.push(resp);
    }
}

fn create_response_batch() -> Box<ResponseBatch> {
    Box::new(ResponseBatch(vec![]))
}

unsafe impl Send for ffi_internal::ProtoApiServer {}
unsafe impl Sync for ffi_internal::ProtoApiServer {}

use std::ops::Deref;

pub use ffi_internal::*;
