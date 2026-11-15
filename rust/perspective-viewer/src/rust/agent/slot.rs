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

//! [`AgentSlot`] — the shared agent model hung off `Presentation`. Holds the
//! configured [`AgentRuntime`] plus the UI-facing conversation state
//! (transcript, busy flag, abort handle) OUTSIDE the component tree, so the
//! chat panel is a pure view that can unmount (tab switch, settings close)
//! without losing the conversation or interrupting a running turn.

use std::cell::{Cell, RefCell};
use std::rc::Rc;

use futures::future::{AbortHandle, Abortable};
use perspective_js::utils::{ApiError, ApiFuture, ApiResult};
use wasm_bindgen::prelude::*;

use super::runtime::{AgentRuntime, TurnError};
use super::sandbox::AgentSandbox;
use super::tools::Entitlement;
use crate::utils::PubSub;

/// One rendered transcript entry. `Tool` entries are appended live as the
/// agent works, giving the chat UI its activity feed.
#[derive(Clone, PartialEq)]
pub enum ChatEntry {
    User(String),
    Assistant {
        text: String,

        /// Reasoning-model "thinking" captured during the turn —
        /// display-only (never part of model history).
        reasoning: Option<String>,
    },
    Tool {
        name: String,
        args: String,

        /// Set after dispatch when the tool failed; the chip renders in
        /// the theme error color with this text in its tooltip.
        error: Option<String>,
    },
    Error(String),
    Stopped,
}

/// The in-flight turn's live tail: `(content, reasoning)` accumulated so
/// far by the streaming transport. View-state only — a turn that aborts
/// mid-stream discards it, and history is written exclusively from the
/// turn's final result.
type PendingTail = (String, String);

#[derive(Clone, Default)]
pub struct AgentSlot {
    runtime: Rc<RefCell<Option<Rc<AgentRuntime>>>>,
    transcript: Rc<RefCell<Vec<ChatEntry>>>,
    pending: Rc<RefCell<Option<PendingTail>>>,
    busy: Rc<Cell<bool>>,
    abort: Rc<RefCell<Option<AbortHandle>>>,
    sandbox: Rc<AgentSandbox>,

    /// Fires on any observable change: configuration, transcript append,
    /// streaming delta, busy-flag flip.
    pub on_update: Rc<PubSub<()>>,
}

impl PartialEq for AgentSlot {
    fn eq(&self, rhs: &Self) -> bool {
        Rc::ptr_eq(&self.runtime, &rhs.runtime)
    }
}

impl AgentSlot {
    /// Install (or replace) the runtime, discarding any in-flight turn and
    /// the prior conversation.
    pub fn configure(&self, runtime: AgentRuntime) {
        self.abort_in_flight();
        *self.runtime.borrow_mut() = Some(Rc::new(runtime));
        self.transcript.borrow_mut().clear();
        *self.pending.borrow_mut() = None;
        self.on_update.emit(());
    }

    /// The scripts started by `run_script`, which outlive agent
    /// reconfiguration.
    pub fn sandbox(&self) -> Rc<AgentSandbox> {
        self.sandbox.clone()
    }

    pub fn is_configured(&self) -> bool {
        self.runtime.borrow().is_some()
    }

    pub fn is_busy(&self) -> bool {
        self.busy.get()
    }

    /// Provider/model badge text for the chat UI.
    pub fn label(&self) -> Option<String> {
        self.runtime.borrow().as_ref().map(|x| x.label())
    }

    /// The user-toggleable entitlements of the host's grant.
    pub fn entitlements(&self) -> Vec<(Entitlement, bool)> {
        self.runtime
            .borrow()
            .as_ref()
            .map(|x| x.entitlements())
            .unwrap_or_default()
    }

    /// Enable or disable a granted entitlement from the next turn on.
    pub fn set_entitlement(&self, entitlement: Entitlement, enabled: bool) {
        if let Some(runtime) = self.runtime.borrow().as_ref() {
            runtime.set_entitlement(entitlement, enabled);
        }

        self.on_update.emit(());
    }

    pub fn transcript(&self) -> Vec<ChatEntry> {
        self.transcript.borrow().clone()
    }

    /// Append a tool-activity entry (called by the tools themselves).
    pub fn record_tool(&self, name: &str, args: &serde_json::Value) {
        self.transcript.borrow_mut().push(ChatEntry::Tool {
            name: name.to_owned(),
            args: args.to_string(),
            error: None,
        });

        self.on_update.emit(());
    }

    /// Mark the most recent tool entry failed (called by the dispatcher
    /// after the tool body settles — dispatch is sequential, so the last
    /// `Tool` entry is the one that just ran).
    pub fn record_tool_error(&self, message: &str) {
        if let Some(ChatEntry::Tool { error, .. }) = self
            .transcript
            .borrow_mut()
            .iter_mut()
            .rev()
            .find(|x| matches!(x, ChatEntry::Tool { .. }))
        {
            *error = Some(message.to_owned());
        }

        self.on_update.emit(());
    }

    /// The in-flight turn's streamed `(content, reasoning)`, if any.
    pub fn pending(&self) -> Option<(String, String)> {
        self.pending.borrow().clone()
    }

    /// Run one agent turn with transcript bookkeeping — the single execution
    /// path shared by the chat UI and the headless `viewer.agentPrompt()`.
    /// Errors (including cancellation via [`Self::stop`]) land in the
    /// transcript AND propagate to the caller. Rejects if a turn is already
    /// running.
    pub async fn run_prompt(&self, prompt: String) -> ApiResult<String> {
        self.run(Some(prompt)).await
    }

    /// Retry the failed turn from its committed messages.
    pub async fn retry(&self) -> ApiResult<String> {
        self.run(None).await
    }

    async fn run(&self, prompt: Option<String>) -> ApiResult<String> {
        let runtime = self
            .runtime
            .borrow()
            .clone()
            .ok_or_else(|| ApiError::from("`agentConfig()` has not been called"))?;

        if self.busy.replace(true) {
            return Err(ApiError::from("A prompt is already running"));
        }

        let (handle, registration) = AbortHandle::new_pair();
        *self.abort.borrow_mut() = Some(handle);
        {
            let mut transcript = self.transcript.borrow_mut();
            match &prompt {
                Some(prompt) => transcript.push(ChatEntry::User(prompt.clone())),
                None if matches!(transcript.last(), Some(ChatEntry::Error(_))) => {
                    transcript.pop();
                },
                None => {},
            }
        }

        self.on_update.emit(());
        let on_delta = {
            let pending = self.pending.clone();
            let on_update = self.on_update.clone();
            move |text: &str, reasoning: &str| {
                *pending.borrow_mut() = Some((text.to_owned(), reasoning.to_owned()));
                on_update.emit(());
            }
        };

        let result = Abortable::new(runtime.prompt(prompt, &on_delta), registration).await;
        *self.abort.borrow_mut() = None;
        self.busy.set(false);

        // The tail is view-state; the final entry is written from the
        // turn's RESULT, keeping only the tail's reasoning (which has no
        // other channel to the transcript).
        let reasoning = self
            .pending
            .borrow_mut()
            .take()
            .map(|(_, x)| x)
            .filter(|x| !x.is_empty());

        let result = match result {
            Ok(Ok(text)) => {
                self.transcript.borrow_mut().push(ChatEntry::Assistant {
                    text: text.clone(),
                    reasoning,
                });

                Ok(text)
            },
            Ok(Err(TurnError::Settled)) => Err(ApiError::from("No failed agent turn to retry")),
            Ok(Err(TurnError::Failed(err))) => {
                self.transcript
                    .borrow_mut()
                    .push(ChatEntry::Error(format!("{err}")));

                Err(self.with_retry(err))
            },
            Err(futures::future::Aborted) => {
                self.transcript.borrow_mut().push(ChatEntry::Stopped);
                Err(ApiError::from("Stopped"))
            },
        };

        self.on_update.emit(());
        result
    }

    fn with_retry(&self, err: ApiError) -> ApiError {
        let slot = self.clone();
        let retry = Closure::<dyn Fn() -> js_sys::Promise>::new(move || {
            let slot = slot.clone();
            js_sys::Promise::from(ApiFuture::new(async move {
                Ok(JsValue::from(slot.retry().await?))
            }))
        });

        let _ = js_sys::Reflect::set(
            &JsValue::from(err.clone()),
            &JsValue::from_str("retry"),
            &retry.into_js_value(),
        );

        err
    }

    /// Cancel the in-flight turn (no-op when idle).
    pub fn stop(&self) {
        self.abort_in_flight();
    }

    /// Clear the conversation (model history + transcript), keeping the
    /// configuration.
    pub async fn reset(&self) {
        self.abort_in_flight();
        let runtime = self.runtime.borrow().clone();
        if let Some(runtime) = runtime {
            runtime.reset().await;
        }

        self.transcript.borrow_mut().clear();
        *self.pending.borrow_mut() = None;
        self.on_update.emit(());
    }

    fn abort_in_flight(&self) {
        if let Some(handle) = self.abort.borrow_mut().take() {
            handle.abort();
        }
    }
}
