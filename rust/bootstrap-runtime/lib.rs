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

//! `perspective-bootstrap` is a self-extracting `zlib` compressed binary.
//! The _best_ way to distribute Perspective's `.wasm` components is to
//! compress them on disk, then configure your web server to apply the
//! `Content-Encoding: gzip` header _without_ zipping the content, then use
//! the browser's `WebAssembly.instantiateStreaming()` to compile the result.
//! However, _no one_ in practice does this. While the self-extracing method
//! is certainly slower, larger and more complicated, it works without any
//! special configuration, and the load performance penalty is small for
//! Perspective's payload size.
//!
//! In the interest of being small, this library does not rely on `wasm_bindgen`
//! so the API is quite low-level - the caller must independently get the size
//! and offset of the uncompressed WASM and `slice()`` this from the process'
//! `WebAssembly.Memory` externally. Afterwards, the compiled wasm archive
//! is garbage-collected by the JavaScript runtime (just like any JS object),
//! freeing the uncompressed memory from the archive.

use std::io::Read;

/// The target executable is provided from the environment at compile time, but
/// this is hidden behind a feature flag so `rust-analyzer` does not freak out.
#[cfg(not(feature = "env_target"))]
const COMPRESSED_BYTES: &[u8] = &[];

#[cfg(feature = "env_target")]
const COMPRESSED_BYTES: &[u8] = include_bytes!(env!("TARGET"));

static DECOMPRESSED_BYTES: std::sync::OnceLock<Vec<u8>> = std::sync::OnceLock::new();

#[no_mangle]
pub fn size() -> usize {
    DECOMPRESSED_BYTES.get_or_init(init).len()
}

#[no_mangle]
pub fn offset() -> *const u8 {
    DECOMPRESSED_BYTES.get_or_init(init).as_ptr()
}

fn init() -> Vec<u8> {
    let mut decoder = flate2::read::ZlibDecoder::new(COMPRESSED_BYTES);
    let mut y = vec![];
    decoder.read_to_end(&mut y).unwrap();
    y
}
