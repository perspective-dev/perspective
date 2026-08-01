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

//! How completion requests move: browser `fetch()` for HTTP providers, or a
//! host-supplied duck-typed engine object (WebLLM's `MLCEngine`, or the
//! scripted fake the Playwright specs inject) — the same seam either way,
//! so the offline specs exercise the identical request/response path the
//! HTTP providers use.
//!
//! Every request asks for `stream: true` and every response path degrades
//! automatically, so streaming needs no configuration surface: an HTTP
//! response that is not `text/event-stream` and an engine result that is
//! not async-iterable are both consumed as complete buffered responses.
//! Either way the caller receives ONE folded [`ChatMessage`], with
//! incremental progress reported through `on_delta`.

use perspective_js::utils::{ApiError, ApiResult};
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;

use super::protocol::{ChatChunk, ChatMessage, ChatRequest, ChatResponse, ChunkAccumulator};

/// Live progress callback: `(content_so_far, reasoning_so_far)`.
pub type OnDelta<'a> = &'a dyn Fn(&str, &str);

/// A configured connection to a completions endpoint. Static dispatch — two
/// variants don't warrant a trait object.
pub enum AgentTransport {
    /// POST to an OpenAI-compatible `/chat/completions` URL with the given
    /// extra request headers (auth etc.).
    Fetch {
        url: String,
        headers: Vec<(String, String)>,
    },

    /// An in-page object exposing `chat.completions.create(request)`.
    /// No bytes leave the page.
    Engine(JsValue),
}

impl AgentTransport {
    /// One completion request, folded to the response message. Cancellation
    /// is by dropping the returned future (see [`AbortGuard`]).
    pub async fn create(
        &self,
        request: &ChatRequest<'_>,
        on_delta: OnDelta<'_>,
    ) -> ApiResult<ChatMessage> {
        let body = serde_json::to_string(request)?;
        match self {
            Self::Fetch { url, headers } => fetch_completion(url, headers, &body, on_delta).await,
            Self::Engine(engine) => engine_completion(engine, &body, on_delta).await,
        }
    }
}

/// Parse a complete (non-streamed) chat-completions response body.
fn from_response_text(text: &str) -> ApiResult<ChatMessage> {
    let response: ChatResponse = serde_json::from_str(text)
        .map_err(|x| ApiError::from(format!("Malformed completion response: {x}")))?;

    response
        .choices
        .into_iter()
        .next()
        .map(|x| x.message)
        .ok_or_else(|| ApiError::from("Completion response has no choices"))
}

/// Aborts the in-flight browser fetch when dropped, wiring the viewer's
/// future-cancellation model (`AgentSlot`'s `Abortable`, the chat Stop
/// button) through to the network layer. The fetch `signal` also covers the
/// response body stream, so aborting mid-SSE kills the socket — no separate
/// reader cancel is needed. Aborting an already-settled fetch is a no-op,
/// so the guard needs no disarm path.
struct AbortGuard(web_sys::AbortController);

impl Drop for AbortGuard {
    fn drop(&mut self) {
        self.0.abort();
    }
}

async fn fetch_completion(
    url: &str,
    headers: &[(String, String)],
    body: &str,
    on_delta: OnDelta<'_>,
) -> ApiResult<ChatMessage> {
    let controller = web_sys::AbortController::new()?;
    let _guard = AbortGuard(controller.clone());
    let request_headers = web_sys::Headers::new()?;
    request_headers.append("content-type", "application/json")?;
    for (name, value) in headers {
        request_headers.append(name, value)?;
    }

    let init = web_sys::RequestInit::new();
    init.set_method("POST");
    init.set_body(&JsValue::from_str(body));
    init.set_headers(&request_headers);
    init.set_signal(Some(&controller.signal()));
    let request = web_sys::Request::new_with_str_and_init(url, &init)?;
    let window = web_sys::window().ok_or_else(|| ApiError::from("No `window`"))?;
    let response: web_sys::Response = JsFuture::from(window.fetch_with_request(&request))
        .await?
        .unchecked_into();

    if !response.ok() {
        let text = JsFuture::from(response.text()?)
            .await?
            .as_string()
            .unwrap_or_default();

        return Err(ApiError::from(format!(
            "HTTP {} {}: {}",
            response.status(),
            response.status_text(),
            text
        )));
    }

    let content_type = response
        .headers()
        .get("content-type")?
        .unwrap_or_default()
        .to_lowercase();

    if content_type.starts_with("text/event-stream") {
        stream_sse(&response, on_delta).await
    } else {
        // The server ignored `stream: true` — buffered fallback.
        let text = JsFuture::from(response.text()?)
            .await?
            .as_string()
            .unwrap_or_default();

        from_response_text(&text)
    }
}

/// Consume a `text/event-stream` response body, folding each `data:` chunk.
async fn stream_sse(response: &web_sys::Response, on_delta: OnDelta<'_>) -> ApiResult<ChatMessage> {
    let stream = response
        .body()
        .ok_or_else(|| ApiError::from("Streaming response has no body"))?;

    let reader: web_sys::ReadableStreamDefaultReader = stream.get_reader().unchecked_into();
    let decoder = web_sys::TextDecoder::new()?;
    let options = web_sys::TextDecodeOptions::new();
    options.set_stream(true);
    let mut buf = String::new();
    let mut acc = ChunkAccumulator::default();
    'read: loop {
        let result = JsFuture::from(reader.read()).await?;
        let done = js_sys::Reflect::get(&result, &JsValue::from_str("done"))?
            .as_bool()
            .unwrap_or(true);

        if done {
            break;
        }

        let value: js_sys::Uint8Array =
            js_sys::Reflect::get(&result, &JsValue::from_str("value"))?.unchecked_into();

        buf.push_str(&decoder.decode_with_u8_array_and_options(&value.to_vec(), &options)?);
        for payload in drain_sse_data(&mut buf) {
            if payload == "[DONE]" {
                break 'read;
            }

            let chunk: ChatChunk = serde_json::from_str(&payload)
                .map_err(|x| ApiError::from(format!("Malformed completion chunk: {x}")))?;

            acc.push(chunk);
            let (content, reasoning) = acc.progress();
            on_delta(content, reasoning);
        }
    }

    Ok(acc.finish())
}

/// Drain complete SSE frames from `buf`, returning each frame's joined
/// `data:` payload (multi-`data:` frames join with `\n` per the SSE spec);
/// the incomplete tail stays in `buf`. Comment lines and other fields are
/// ignored; CRLF is normalized — a `\r`/`\n` pair split across reads
/// reunites in `buf` before the next drain sees it.
fn drain_sse_data(buf: &mut String) -> Vec<String> {
    if buf.contains("\r\n") {
        *buf = buf.replace("\r\n", "\n");
    }

    let mut out = vec![];
    while let Some(pos) = buf.find("\n\n") {
        let frame: String = buf.drain(..pos + 2).collect();
        let mut payload = String::new();
        for line in frame.lines() {
            if let Some(rest) = line.strip_prefix("data:") {
                if !payload.is_empty() {
                    payload.push('\n');
                }

                payload.push_str(rest.strip_prefix(' ').unwrap_or(rest));
            }
        }

        if !payload.is_empty() {
            out.push(payload);
        }
    }

    out
}

/// JSON round-trip through `JSON.parse`/`JSON.stringify` so the engine sees
/// plain JS objects (what WebLLM and the spec fakes expect) and replies
/// deserialize through the same serde path as HTTP responses. A result
/// bearing `Symbol.asyncIterator` (WebLLM's `stream: true` shape) is
/// iterated as chunks; anything else is one complete response.
async fn engine_completion(
    engine: &JsValue,
    body: &str,
    on_delta: OnDelta<'_>,
) -> ApiResult<ChatMessage> {
    let request = js_sys::JSON::parse(body)?;
    let chat = js_sys::Reflect::get(engine, &JsValue::from_str("chat"))?;
    let completions = js_sys::Reflect::get(&chat, &JsValue::from_str("completions"))?;
    let create: js_sys::Function =
        js_sys::Reflect::get(&completions, &JsValue::from_str("create"))?
            .dyn_into()
            .map_err(|_| ApiError::from("`engine.chat.completions.create` is not a function"))?;

    let result = create.call1(&completions, &request)?;
    let result = JsFuture::from(js_sys::Promise::resolve(&result)).await?;
    let iterator_fn = js_sys::Reflect::get(&result, js_sys::Symbol::async_iterator().as_ref())?;
    if !iterator_fn.is_function() {
        let text = js_sys::JSON::stringify(&result)?
            .as_string()
            .ok_or_else(|| ApiError::from("Engine returned an unserializable response"))?;

        return from_response_text(&text);
    }

    let iterator = iterator_fn
        .unchecked_into::<js_sys::Function>()
        .call0(&result)?;
    let next: js_sys::Function = js_sys::Reflect::get(&iterator, &JsValue::from_str("next"))?
        .dyn_into()
        .map_err(|_| ApiError::from("Engine stream iterator has no `next`"))?;

    let mut acc = ChunkAccumulator::default();
    loop {
        let step = JsFuture::from(js_sys::Promise::resolve(&next.call0(&iterator)?)).await?;
        let done = js_sys::Reflect::get(&step, &JsValue::from_str("done"))?
            .as_bool()
            .unwrap_or(true);

        if done {
            break;
        }

        let value = js_sys::Reflect::get(&step, &JsValue::from_str("value"))?;
        let text = js_sys::JSON::stringify(&value)?
            .as_string()
            .ok_or_else(|| ApiError::from("Engine returned an unserializable chunk"))?;

        let chunk: ChatChunk = serde_json::from_str(&text)
            .map_err(|x| ApiError::from(format!("Malformed completion chunk: {x}")))?;

        acc.push(chunk);
        let (content, reasoning) = acc.progress();
        on_delta(content, reasoning);
    }

    Ok(acc.finish())
}
