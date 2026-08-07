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

//! The agentic loop: model request → dispatch any tool calls → repeat, until
//! the model answers in text or the turn budget runs out.

use perspective_js::utils::ApiError;
use serde_json::json;

use super::protocol::{ChatMessage, ChatRequest};
use super::transport::{AgentTransport, OnDelta};
use crate::agent::config::SystemRole;
use crate::agent::tools::{ToolCtx, tool_definitions, tool_dispatch};
use crate::custom_elements::viewer::PerspectiveViewerElement;

/// How a turn ended without a final assistant answer. The distinction
/// matters to the caller's commit decision: on [`TurnError::Budget`] the
/// transcript is *coherent* (every dispatched tool call has its result) and
/// the dispatched tools may have mutated the viewer, so the transcript must
/// be COMMITTED — discarding it would leave the next prompt blind to
/// mutations that persist on screen (e.g. re-adding a panel the model does
/// not know it created). [`TurnError::Api`] (transport/protocol failure)
/// leaves the transcript mid-request and is discarded as before.
pub enum TurnError {
    Budget { max_turns: usize },
    Api(ApiError),
}

impl From<ApiError> for TurnError {
    fn from(err: ApiError) -> Self {
        Self::Api(err)
    }
}

impl From<TurnError> for ApiError {
    fn from(err: TurnError) -> Self {
        match err {
            TurnError::Budget { max_turns } => ApiError::from(format!(
                "Turn budget exhausted after {max_turns} model requests (see `maxTurns`)"
            )),
            TurnError::Api(err) => err,
        }
    }
}

/// Appended (transiently — never committed to the durable transcript) to
/// the turn's final budgeted request, so the model answers instead of
/// starting tool work it cannot finish.
const BUDGET_NUDGE: &str = "This is the final model request of this turn's budget. Do not call \
                            more tools - answer now with a short summary of what was done and \
                            what, if anything, remains.";

/// Run one conversational turn, mutating `messages` (system prompt at index
/// 0, then transcript) in place with everything the model and tools said.
/// Tool *failures* are fed back to the model as error tool-results so it can
/// self-correct; transport and protocol failures abort the turn mid-request,
/// while turn-budget exhaustion ends it with a coherent transcript — see
/// [`TurnError`] for the commit consequences.
#[allow(clippy::too_many_arguments)]
pub async fn run_turn(
    transport: &AgentTransport,
    model: &str,
    max_turns: usize,
    elem: &PerspectiveViewerElement,
    ctx: &ToolCtx,
    messages: &mut Vec<ChatMessage>,
    system_role: SystemRole,
    on_delta: OnDelta<'_>,
) -> Result<String, TurnError> {
    let defs = tool_definitions(ctx);
    for turn in 0..max_turns {
        // Each model request streams into a fresh tail — reset the live
        // view so a prior request's partial text does not linger across
        // tool rounds.
        on_delta("", "");
        let nudged;
        let request_messages: &[ChatMessage] = if turn + 1 == max_turns && max_turns > 1 {
            let mut with_nudge = messages.clone();

            // Follows the preamble's placement: an engine that rejects a
            // system message alongside `tools` rejects THIS one too, and
            // it is appended to the very request that most needs to
            // succeed.
            with_nudge.push(match system_role {
                SystemRole::System => ChatMessage::System {
                    content: BUDGET_NUDGE.to_owned(),
                },
                SystemRole::User => ChatMessage::User {
                    content: BUDGET_NUDGE.to_owned(),
                },
            });

            nudged = with_nudge;
            &nudged
        } else {
            messages
        };

        let request = ChatRequest {
            model,
            messages: request_messages,
            tools: &defs,
            stream: true,
        };

        let message = transport.create(&request, on_delta).await?;
        let ChatMessage::Assistant {
            content,
            tool_calls,
            reasoning_content,
        } = message
        else {
            return Err(
                ApiError::from("Completion response message role is not `assistant`").into(),
            );
        };

        if tool_calls.is_empty() {
            let text = content.unwrap_or_default();

            // The buffered fallback never fired `on_delta` — surface the
            // final text (and any reasoning) so the live view converges on
            // what history records regardless of transport path.
            on_delta(&text, reasoning_content.as_deref().unwrap_or_default());
            messages.push(ChatMessage::Assistant {
                content: Some(text.clone()),
                tool_calls: vec![],
                reasoning_content,
            });

            return Ok(text);
        }

        messages.push(ChatMessage::Assistant {
            content,
            tool_calls: tool_calls.clone(),
            reasoning_content,
        });

        // TODO: There is deliberately no duplicate-call breaker here: a
        // tool call identical (name + arguments) to one already made this
        // turn is re-dispatched verbatim, so a model stuck at a fixed
        // point burns budget until the nudge/exhaustion path ends the
        // turn (observed in the field: qwen looping `validate_expression`
        // to `maxTurns`). If nudge + budget prove insufficient, the
        // breaker is: synthesize an error result ("already called with
        // identical arguments; the result will not change") without
        // dispatching.
        for call in tool_calls {
            let content =
                match tool_dispatch(elem, ctx, &call.function.name, &call.function.arguments).await
                {
                    Ok(value) => value.to_string(),
                    Err(err) => json!({ "error": format!("{err}") }).to_string(),
                };

            messages.push(ChatMessage::Tool {
                tool_call_id: call.id,
                content,
            });
        }
    }

    Err(TurnError::Budget { max_turns })
}
