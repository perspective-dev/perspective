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
use std::rc::Rc;

use serde::Deserialize;
use serde_json::Value;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;

/// One retrievable unit. `title`/`path` are optional in host-supplied
/// entries; oversized `text` is split at paragraph boundaries on ingest so
/// hosts never need to understand chunking.
#[derive(Clone, Deserialize)]
pub struct Chunk {
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub path: String,
    pub text: String,
}

const SPLIT_OVER: usize = 2500;

/// Words too common to discriminate; deliberately tiny — the caller is a
/// model that writes keyword-style queries.
const STOP_WORDS: &[&str] = &["the", "a", "an", "of", "to", "is", "in", "and", "or", "for"];

/// Lowercase alphanumeric-and-`_` tokens; identifiers containing `_` also
/// emit their parts, so `split_by` matches both the exact API token and the
/// natural-language query "split by".
fn tokenize(text: &str) -> Vec<String> {
    let mut tokens = vec![];
    for raw in text
        .to_lowercase()
        .split(|x: char| !x.is_alphanumeric() && x != '_')
    {
        if raw.is_empty() || STOP_WORDS.contains(&raw) {
            continue;
        }

        tokens.push(raw.to_owned());
        if raw.contains('_') {
            for part in raw.split('_').filter(|x| !x.is_empty()) {
                tokens.push(part.to_owned());
            }
        }
    }

    tokens
}

pub struct DocsIndex {
    chunks: Vec<Chunk>,
    postings: HashMap<String, Vec<(usize, f64)>>,
    lens: Vec<f64>,
    avg_len: f64,
}

impl DocsIndex {
    pub fn build(entries: Vec<Chunk>) -> Self {
        let chunks = normalize(entries);
        let mut postings: HashMap<String, Vec<(usize, f64)>> = HashMap::new();
        let mut lens = Vec::with_capacity(chunks.len());
        for (idx, chunk) in chunks.iter().enumerate() {
            let tokens = tokenize(&format!("{} {}", chunk.title, chunk.text));
            lens.push(tokens.len() as f64);
            let mut counts: HashMap<String, f64> = HashMap::new();
            for token in tokens {
                *counts.entry(token).or_default() += 1.0;
            }

            for (token, count) in counts {
                postings.entry(token).or_default().push((idx, count));
            }
        }

        let avg_len = (lens.iter().sum::<f64>() / lens.len().max(1) as f64).max(1.0);
        Self {
            chunks,
            postings,
            lens,
            avg_len,
        }
    }

    /// BM25 (k1 = 1.2, b = 0.75) top-`limit` chunks for a keyword query.
    pub fn search(&self, query: &str, limit: usize) -> Vec<&Chunk> {
        const K1: f64 = 1.2;
        const B: f64 = 0.75;
        let n = self.chunks.len() as f64;
        let mut terms = tokenize(query);
        terms.sort();
        terms.dedup();
        let mut scores: HashMap<usize, f64> = HashMap::new();
        for term in terms {
            let Some(posting) = self.postings.get(&term) else {
                continue;
            };

            let df = posting.len() as f64;
            let idf = ((n - df + 0.5) / (df + 0.5) + 1.0).ln();
            for (idx, tf) in posting {
                let norm = K1 * (1.0 - B + B * self.lens[*idx] / self.avg_len);
                *scores.entry(*idx).or_default() += idf * tf / (tf + norm);
            }
        }

        let mut ranked = scores.into_iter().collect::<Vec<_>>();
        ranked.sort_by(|x, y| y.1.total_cmp(&x.1).then(x.0.cmp(&y.0)));
        ranked
            .into_iter()
            .take(limit)
            .map(|(idx, _)| &self.chunks[idx])
            .collect()
    }
}

/// Default titles from a text prefix; split oversized entries at paragraph
/// boundaries (a single paragraph longer than the limit stays whole).
fn normalize(entries: Vec<Chunk>) -> Vec<Chunk> {
    let mut out = vec![];
    for mut chunk in entries {
        if chunk.title.is_empty() {
            chunk.title = chunk.text.chars().take(60).collect::<String>();
        }

        if chunk.text.len() <= SPLIT_OVER {
            out.push(chunk);
            continue;
        }

        let mut part = String::new();
        for para in chunk.text.split("\n\n") {
            if !part.is_empty() && part.len() + para.len() > SPLIT_OVER {
                out.push(Chunk {
                    text: std::mem::take(&mut part),
                    ..chunk.clone()
                });
            }

            if !part.is_empty() {
                part.push_str("\n\n");
            }

            part.push_str(para);
        }

        if !part.is_empty() {
            out.push(Chunk {
                text: part,
                ..chunk
            });
        }
    }

    out
}

/// One resolved `docs` source: tool-parameter schemas, the searchable
/// corpus index, and an optional host preamble override.
pub struct DocsBundle {
    pub schemas: HashMap<String, Value>,
    pub index: DocsIndex,
    pub preamble: Option<String>,
}

/// The two accepted source shapes: a bare entry array (host inline
/// entries), or the metadata-bundle object.
#[derive(Deserialize)]
#[serde(untagged)]
enum RawDocs {
    Entries(Vec<Chunk>),
    Bundle {
        #[serde(default)]
        schemas: HashMap<String, Value>,

        #[serde(default)]
        chunks: Vec<Chunk>,

        #[serde(default)]
        preamble: Option<String>,
    },
}

/// The lazily-resolved, cached bundle for one configured `docs` source.
/// Owned by `AgentRuntime` (so it persists across `prompt()` calls) and
/// shared with each turn's `ToolCtx`.
pub struct DocsCell {
    source: JsValue,
    cache: async_lock::Mutex<Option<Rc<Result<DocsBundle, String>>>>,
}

impl DocsCell {
    pub fn new(source: JsValue) -> Self {
        Self {
            source,
            cache: async_lock::Mutex::new(None),
        }
    }

    pub async fn bundle(&self) -> Rc<Result<DocsBundle, String>> {
        let mut cache = self.cache.lock().await;
        if let Some(cached) = &*cache {
            return cached.clone();
        }

        let result = Rc::new(resolve(&self.source).await.map(|raw| {
            let (schemas, chunks, preamble) = match raw {
                RawDocs::Entries(chunks) => (HashMap::new(), chunks, None),
                RawDocs::Bundle {
                    schemas,
                    chunks,
                    preamble,
                } => (schemas, chunks, preamble),
            };

            DocsBundle {
                schemas,
                index: DocsIndex::build(chunks),
                preamble,
            }
        }));

        *cache = Some(result.clone());
        result
    }
}

fn js_error(err: JsValue) -> String {
    err.as_string()
        .or_else(|| {
            js_sys::Reflect::get(&err, &JsValue::from_str("message"))
                .ok()
                .and_then(|x| x.as_string())
        })
        .unwrap_or_else(|| format!("{err:?}"))
}

/// Resolve the `docs` source union to a parsed raw bundle.
async fn resolve(source: &JsValue) -> Result<RawDocs, String> {
    let value = JsFuture::from(js_sys::Promise::resolve(source))
        .await
        .map_err(js_error)?;

    let text = if js_sys::Array::is_array(&value) {
        js_sys::JSON::stringify(&value)
            .map_err(js_error)?
            .as_string()
            .ok_or_else(|| "Unserializable `docs` array".to_owned())?
    } else if let Some(text) = value.as_string() {
        text
    } else if value.is_instance_of::<web_sys::Response>() {
        let response: web_sys::Response = value.unchecked_into();
        if !response.ok() {
            return Err(format!(
                "HTTP {} {}",
                response.status(),
                response.status_text()
            ));
        }

        JsFuture::from(response.text().map_err(js_error)?)
            .await
            .map_err(js_error)?
            .as_string()
            .unwrap_or_default()
    } else if value.is_instance_of::<js_sys::Uint8Array>()
        || value.is_instance_of::<js_sys::ArrayBuffer>()
    {
        let bytes = js_sys::Uint8Array::new(&value).to_vec();
        String::from_utf8(bytes).map_err(|x| format!("Docs source is not UTF-8: {x}"))?
    } else if value.is_object() {
        js_sys::JSON::stringify(&value)
            .map_err(js_error)?
            .as_string()
            .ok_or_else(|| "Unserializable `docs` object".to_owned())?
    } else {
        return Err("Unsupported `docs` type".to_owned());
    };

    serde_json::from_str(&text).map_err(|x| format!("Invalid docs JSON: {x}"))
}
