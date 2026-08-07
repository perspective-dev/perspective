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

use std::rc::Rc;

use perspective_js::utils::{ApiError, ApiResult};
use wasm_bindgen::prelude::*;

use super::client::{AgentTransport, ChatMessage, OnDelta, TurnError, run_turn};
use super::config::{AgentConfig, SystemRole};
use super::docs::DocsCell;
use super::tools::ToolCtx;
use crate::custom_elements::viewer::PerspectiveViewerElement;

/// The agent's system preamble — the ONE copy, authored as markdown and
/// embedded at compile time. This crate knows nothing of its structure:
/// [`AgentRuntime::preamble`] only chooses between this and a
/// bundle-supplied override, then appends the host's `systemPrompt`.
///
/// Its `search_docs` step is unconditional, which is why `search_docs` is
/// advertised unconditionally too (an unconfigured corpus searches EMPTY
/// rather than removing the tool) — one prompt, one tool surface, no
/// phantom-tool instructions either way.
const PREAMBLE: &str = include_str!("preamble.md");

/// The model-request budget per `prompt()` call — schema lookup + a few
/// config patches + expression iteration fit comfortably; overridable via
/// config `maxTurns`.
const DEFAULT_MAX_TURNS: usize = 16;

/// One configured agent: connection + conversation history + the tool
/// handle.
/// Owned by the element; created by `agentConfig()` and shared by every
/// `prompt()` call. The history `Mutex` serializes concurrent prompts.
pub struct AgentRuntime {
    config: AgentConfig,
    history: async_lock::Mutex<Vec<ChatMessage>>,
    elem: PerspectiveViewerElement,
    docs: Option<Rc<DocsCell>>,
}

impl AgentRuntime {
    pub fn new(config: &JsValue, elem: PerspectiveViewerElement) -> ApiResult<Self> {
        let config = AgentConfig::from_js(config)?;
        let docs = config.docs.clone().map(|x| Rc::new(DocsCell::new(x)));
        Ok(Self {
            config,
            history: async_lock::Mutex::new(vec![]),
            elem,
            docs,
        })
    }

    /// Run one conversational turn (which may span many model requests and
    /// tool calls) and return the final assistant text. History commits on
    /// success — and on turn-budget exhaustion, whose transcript is coherent
    /// and whose tool mutations persist in the viewer (see
    /// [`TurnError::Budget`]); a transport-failed or aborted turn leaves the
    /// conversation as it was.
    pub async fn prompt(&self, prompt: String, on_delta: OnDelta<'_>) -> ApiResult<String> {
        let mut history = self.history.lock().await;
        let transport = self.transport()?;

        // Resolve the docs metadata bundle BEFORE the first request so the
        // turn's tool definitions carry the generated parameter schemas
        // deterministically. A failed load does not abort the turn — the
        // error is cached and surfaces through `search_docs`.
        let bundle = match &self.docs {
            Some(docs) => Some(docs.bundle().await),
            None => None,
        };

        let ctx = ToolCtx {
            docs: self.docs.clone(),
            bundle,
            entitlements: self.config.entitlements.clone(),
        };

        // The preamble is a SYSTEM message by default, but some engines
        // reject one outright when `tools` is present because they need
        // to own the system prompt (WebLLM's Hermes function calling
        // throws `CustomSystemPromptError` on ANY system message, then
        // substitutes its own carrying the tool definitions). Those
        // configure `systemRole: "user"`, which folds the same text into
        // the conversation's opening user turn — sent once, then carried
        // by history like any other message, which is why nothing is
        // stripped on commit below.
        let preamble = self.preamble(&ctx);
        let mut messages = Vec::with_capacity(history.len() + 2);
        let preamble_len = match self.config.system_role {
            SystemRole::System => {
                messages.push(ChatMessage::System {
                    content: preamble.clone(),
                });

                1
            },
            SystemRole::User => 0,
        };

        messages.extend(history.iter().cloned());
        let content = if preamble_len == 0 && history.is_empty() {
            format!("{preamble}\n\n{prompt}")
        } else {
            prompt
        };

        messages.push(ChatMessage::User { content });
        let result = run_turn(
            &transport,
            self.config.model_name(),
            self.config.max_turns.unwrap_or(DEFAULT_MAX_TURNS),
            &self.elem,
            &ctx,
            &mut messages,
            self.config.system_role,
            on_delta,
        )
        .await;

        match result {
            Ok(text) => {
                *history = messages.split_off(preamble_len);
                Ok(text)
            },
            Err(err @ TurnError::Budget { .. }) => {
                *history = messages.split_off(preamble_len);
                Err(err.into())
            },
            Err(err) => Err(err.into()),
        }
    }

    /// Clear the conversation history.
    pub async fn reset(&self) {
        self.history.lock().await.clear();
    }

    /// Connection/model badge text, e.g. `"anthropic · claude-haiku-4-5"`.
    pub fn label(&self) -> String {
        format!(
            "{} · {}",
            self.config.label_name(),
            self.config.model_name()
        )
    }

    /// Connection fields → transport. `url` XOR `engine` was validated at
    /// configuration; `apiKey` is Bearer sugar and `headers` pass verbatim.
    fn transport(&self) -> ApiResult<AgentTransport> {
        if let Some(engine) = &self.config.engine {
            return Ok(AgentTransport::Engine(engine.clone()));
        }

        let url = self
            .config
            .url
            .clone()
            .ok_or_else(|| ApiError::from("`url` or `engine` is required"))?;

        let mut headers = self
            .config
            .headers
            .clone()
            .map(|x| x.into_iter().collect::<Vec<_>>())
            .unwrap_or_default();

        if let Some(key) = &self.config.api_key {
            headers.push(("authorization".to_owned(), format!("Bearer {key}")));
        }

        Ok(AgentTransport::Fetch { url, headers })
    }

    fn preamble(&self, ctx: &ToolCtx) -> String {
        let mut preamble = ctx
            .bundle
            .as_ref()
            .and_then(|x| x.as_ref().as_ref().ok())
            .and_then(|x| x.preamble.as_deref())
            .unwrap_or(PREAMBLE)
            .trim_end()
            .to_owned();

        if let Some(extra) = &self.config.system_prompt {
            preamble.push_str("\n\n");
            preamble.push_str(extra);
        }

        preamble
    }
}
