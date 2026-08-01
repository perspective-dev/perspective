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

//! `agentConfig()` parsing. There is no provider abstraction in the core —
//! the client speaks one protocol (OpenAI chat-completions) over primitive
//! connection fields (`url` + `headers` + `apiKey`, or an in-page
//! `engine`), and "providers" are plain JSON presets in the JS package
//! spread into the config (`{...providers.anthropic, apiKey}`).

use std::collections::HashMap;

use perspective_js::utils::{ApiError, ApiResult};
use serde::Deserialize;
use wasm_bindgen::prelude::*;

use super::tools::Entitlement;

/// The serde-compatible subset of the `agentConfig()` argument; the
/// `engine` and `docs` fields are live JS values (an engine object; a
/// fetch `Response`/buffer/promise or entry array) and are extracted
/// separately by reference.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentConfigFields {
    /// Cosmetic label for the chat badge (presets set this).
    name: Option<String>,

    /// Full chat-completions endpoint URL, e.g.
    /// `https://api.anthropic.com/v1/chat/completions`.
    url: Option<String>,

    /// Extra request headers sent verbatim (e.g. Anthropic's
    /// `anthropic-dangerous-direct-browser-access`).
    headers: Option<HashMap<String, String>>,

    /// Sugar for `Authorization: Bearer <apiKey>` — verified accepted by
    /// every supported OpenAI-compat endpoint (incl. Anthropic + Gemini).
    api_key: Option<String>,

    model: Option<String>,
    system_prompt: Option<String>,
    system_role: Option<SystemRole>,
    max_turns: Option<usize>,

    /// Access grants (snake_case [`Entitlement`] names); omitted ⇒ the
    /// default set (everything except `read_data`).
    entitlements: Option<Vec<String>>,
}

/// Where the preamble (plus any `systemPrompt`) is placed in a request.
///
/// Some engines refuse to accept a system message alongside `tools`
/// because they need to own the system prompt themselves — WebLLM's
/// Hermes function-calling rejects the whole request with
/// `CustomSystemPromptError`. [`SystemRole::User`] folds the same text
/// into the conversation's first USER message instead, which those
/// engines accept and which reads identically to the model.
#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SystemRole {
    #[default]
    System,
    User,
}

/// Parsed `viewer.agentConfig({...})` argument.
pub struct AgentConfig {
    pub name: Option<String>,
    pub url: Option<String>,
    pub headers: Option<HashMap<String, String>>,
    pub api_key: Option<String>,
    pub model: Option<String>,
    pub system_prompt: Option<String>,
    pub system_role: SystemRole,
    pub max_turns: Option<usize>,
    pub entitlements: Vec<Entitlement>,
    pub engine: Option<JsValue>,
    pub docs: Option<JsValue>,
}

impl AgentConfig {
    pub fn from_js(config: &JsValue) -> ApiResult<Self> {
        let fields: AgentConfigFields = serde_wasm_bindgen::from_value(config.clone())?;
        let engine = js_sys::Reflect::get(config, &JsValue::from_str("engine"))
            .ok()
            .filter(|x| !x.is_undefined() && !x.is_null());

        let docs = js_sys::Reflect::get(config, &JsValue::from_str("docs"))
            .ok()
            .filter(|x| !x.is_undefined() && !x.is_null() && x.as_bool() != Some(false));

        match (&fields.url, &engine) {
            (Some(_), Some(_)) => {
                return Err(ApiError::from("Pass either `url` or `engine`, not both"));
            },
            (None, None) => {
                return Err(ApiError::from(
                    "Either `url` (a chat-completions endpoint, e.g. a spread provider preset) or \
                     `engine` (an in-page engine object) is required",
                ));
            },
            _ => (),
        }

        let entitlements = match fields.entitlements {
            None => Entitlement::default_set(),
            Some(names) => names
                .iter()
                .map(|x| x.parse())
                .collect::<Result<Vec<_>, _>>()
                .map_err(ApiError::from)?,
        };

        Ok(Self {
            name: fields.name,
            url: fields.url,
            headers: fields.headers,
            api_key: fields.api_key,
            model: fields.model,
            system_prompt: fields.system_prompt,
            system_role: fields.system_role.unwrap_or_default(),
            max_turns: fields.max_turns,
            entitlements,
            engine,
            docs,
        })
    }

    /// The model id sent on every completion request. Local servers and
    /// in-page engines generally answer with whatever model they have
    /// loaded, so the fallback is a placeholder.
    pub fn model_name(&self) -> &str {
        self.model.as_deref().unwrap_or("default")
    }

    /// Chat-badge text: the preset `name`, else the endpoint host, else
    /// `"engine"`.
    pub fn label_name(&self) -> String {
        if let Some(name) = &self.name {
            return name.clone();
        }

        self.url
            .as_deref()
            .and_then(|x| x.split("//").nth(1))
            .and_then(|x| x.split('/').next())
            .map(str::to_owned)
            .unwrap_or_else(|| "engine".to_owned())
    }
}
