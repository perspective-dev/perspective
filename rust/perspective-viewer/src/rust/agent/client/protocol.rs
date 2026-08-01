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

//! The OpenAI chat-completions wire shapes — only the fields this client
//! produces or consumes. Unknown response fields are ignored by serde, so
//! provider-specific extras (`usage`, `finish_reason`, ids) cost nothing.
//! The format is pinned by the `test/js/agent/` specs, which assert these
//! exact shapes against a scripted fake engine.

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// One conversation message, tagged by `role`. `Assistant` doubles as the
/// response-message shape (`choices[n].message`).
#[derive(Clone, Deserialize, Serialize)]
#[serde(tag = "role", rename_all = "lowercase")]
pub enum ChatMessage {
    System {
        content: String,
    },
    User {
        content: String,
    },
    Assistant {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        content: Option<String>,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        tool_calls: Vec<ToolCall>,

        /// Reasoning-model "thinking" text, captured for DISPLAY only:
        /// `skip_serializing` is the contract that it is never replayed
        /// into a request (providers reject or mis-tokenize replayed
        /// reasoning). Two wire conventions, one field: DeepSeek-style
        /// `reasoning_content` (also LM Studio/vLLM) and OpenRouter's
        /// `reasoning`.
        #[serde(default, skip_serializing, alias = "reasoning")]
        reasoning_content: Option<String>,
    },
    Tool {
        tool_call_id: String,
        content: String,
    },
}

/// A model-emitted tool invocation, echoed back verbatim in the transcript
/// so the model can correlate `Tool` results by `id`.
#[derive(Clone, Deserialize, Serialize)]
pub struct ToolCall {
    #[serde(default)]
    pub id: String,
    #[serde(default = "function_type", rename = "type")]
    pub kind: String,
    pub function: FunctionCall,
}

/// `arguments` is a JSON-*encoded string* per the OpenAI wire format, not a
/// JSON object.
#[derive(Clone, Deserialize, Serialize)]
pub struct FunctionCall {
    pub name: String,
    #[serde(default)]
    pub arguments: String,
}

fn function_type() -> String {
    "function".to_owned()
}

/// A tool advertised to the model.
#[derive(Serialize)]
pub struct ToolDef {
    #[serde(rename = "type")]
    pub kind: &'static str,
    pub function: FunctionDef,
}

#[derive(Serialize)]
pub struct FunctionDef {
    pub name: &'static str,
    pub description: &'static str,
    pub parameters: Value,
}

#[derive(Serialize)]
pub struct ChatRequest<'a> {
    pub model: &'a str,
    pub messages: &'a [ChatMessage],
    pub tools: &'a [ToolDef],

    /// Always `true`; servers that ignore it get the buffered fallback in
    /// `transport.rs`, so streaming needs no configuration surface.
    pub stream: bool,
}

#[derive(Deserialize)]
pub struct ChatResponse {
    pub choices: Vec<ChatChoice>,
}

#[derive(Deserialize)]
pub struct ChatChoice {
    pub message: ChatMessage,
}

/// One `stream: true` SSE frame (`data: {...}`) — the delta shapes of the
/// OpenAI streaming wire format.
#[derive(Deserialize)]
pub struct ChatChunk {
    #[serde(default)]
    pub choices: Vec<ChunkChoice>,
}

#[derive(Deserialize)]
pub struct ChunkChoice {
    #[serde(default)]
    pub delta: ChunkDelta,
}

#[derive(Default, Deserialize)]
pub struct ChunkDelta {
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub reasoning_content: Option<String>,
    #[serde(default)]
    pub reasoning: Option<String>,
    #[serde(default)]
    pub tool_calls: Vec<ToolCallDelta>,
}

/// Tool-call fragments accumulate BY INDEX: `id`/`name` arrive on the
/// first fragment, `arguments` arrives as string parts across many.
#[derive(Deserialize)]
pub struct ToolCallDelta {
    #[serde(default)]
    pub index: usize,
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub function: Option<FunctionCallDelta>,
}

#[derive(Deserialize)]
pub struct FunctionCallDelta {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub arguments: Option<String>,
}

/// Folds a stream of [`ChatChunk`]s into the same
/// [`ChatMessage::Assistant`] the buffered path produces, so `turn.rs` is
/// agnostic to how the response arrived. Reasoning takes the first
/// non-empty of the two wire conventions per delta.
#[derive(Default)]
pub struct ChunkAccumulator {
    content: String,
    reasoning: String,
    tool_calls: Vec<ToolCall>,
}

impl ChunkAccumulator {
    pub fn push(&mut self, chunk: ChatChunk) {
        for choice in chunk.choices {
            let delta = choice.delta;
            if let Some(content) = delta.content {
                self.content.push_str(&content);
            }

            if let Some(reasoning) = delta
                .reasoning_content
                .into_iter()
                .chain(delta.reasoning)
                .find(|x| !x.is_empty())
            {
                self.reasoning.push_str(&reasoning);
            }

            for fragment in delta.tool_calls {
                if self.tool_calls.len() <= fragment.index {
                    self.tool_calls
                        .resize_with(fragment.index + 1, || ToolCall {
                            id: String::new(),
                            kind: function_type(),
                            function: FunctionCall {
                                name: String::new(),
                                arguments: String::new(),
                            },
                        });
                }

                let call = &mut self.tool_calls[fragment.index];
                if let Some(id) = fragment.id {
                    call.id = id;
                }

                if let Some(function) = fragment.function {
                    if let Some(name) = function.name {
                        call.function.name = name;
                    }

                    if let Some(arguments) = function.arguments {
                        call.function.arguments.push_str(&arguments);
                    }
                }
            }
        }
    }

    /// Accumulated text/reasoning so far, for live-render callbacks.
    pub fn progress(&self) -> (&str, &str) {
        (&self.content, &self.reasoning)
    }

    pub fn finish(self) -> ChatMessage {
        ChatMessage::Assistant {
            content: (!self.content.is_empty()).then_some(self.content),
            tool_calls: self.tool_calls,
            reasoning_content: (!self.reasoning.is_empty()).then_some(self.reasoning),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chunk(json: &str) -> ChatChunk {
        serde_json::from_str(json).unwrap()
    }

    #[test]
    fn content_and_both_reasoning_conventions_fold() {
        let mut acc = ChunkAccumulator::default();
        acc.push(chunk(r#"{"choices":[{"delta":{"role":"assistant"}}]}"#));
        acc.push(chunk(
            r#"{"choices":[{"delta":{"reasoning_content":"th"}}]}"#,
        ));
        acc.push(chunk(r#"{"choices":[{"delta":{"reasoning":"ink"}}]}"#));
        acc.push(chunk(r#"{"choices":[{"delta":{"content":"Hel"}}]}"#));
        acc.push(chunk(
            r#"{"choices":[{"delta":{"content":"lo","reasoning":""}}]}"#,
        ));
        assert_eq!(acc.progress(), ("Hello", "think"));
        let ChatMessage::Assistant {
            content,
            tool_calls,
            reasoning_content,
        } = acc.finish()
        else {
            panic!("not assistant");
        };

        assert_eq!(content.as_deref(), Some("Hello"));
        assert!(tool_calls.is_empty());
        assert_eq!(reasoning_content.as_deref(), Some("think"));
    }

    #[test]
    fn fragmented_tool_arguments_accumulate_by_index() {
        let mut acc = ChunkAccumulator::default();
        acc.push(chunk(
            r#"{"choices":[{"delta":{"tool_calls":[
                {"index":0,"id":"c0","function":{"name":"get_schema","arguments":""}}]}}]}"#,
        ));

        // Index 1 opens before index 0 finishes; both argument streams
        // interleave.
        acc.push(chunk(
            r#"{"choices":[{"delta":{"tool_calls":[
                {"index":1,"id":"c1","function":{"name":"set_view_config","arguments":"{\"con"}}]}}]}"#,
        ));

        acc.push(chunk(
            r#"{"choices":[{"delta":{"tool_calls":[
                {"index":1,"function":{"arguments":"fig\":{}}"}}]}}]}"#,
        ));

        let ChatMessage::Assistant { tool_calls, .. } = acc.finish() else {
            panic!("not assistant");
        };

        assert_eq!(tool_calls.len(), 2);
        assert_eq!(tool_calls[0].id, "c0");
        assert_eq!(tool_calls[0].function.name, "get_schema");
        assert_eq!(tool_calls[1].function.arguments, "{\"config\":{}}");
        assert_eq!(tool_calls[1].kind, "function");
    }

    /// The display-only contract: reasoning deserializes from EITHER wire
    /// field but NEVER serializes back into a request.
    #[test]
    fn assistant_reasoning_reads_both_aliases_and_never_serializes() {
        for field in ["reasoning_content", "reasoning"] {
            let message: ChatMessage = serde_json::from_str(&format!(
                r#"{{"role":"assistant","content":"hi","{field}":"secret"}}"#
            ))
            .unwrap();

            let ChatMessage::Assistant {
                reasoning_content, ..
            } = &message
            else {
                panic!("not assistant");
            };

            assert_eq!(reasoning_content.as_deref(), Some("secret"));
            assert!(!serde_json::to_string(&message).unwrap().contains("secret"));
        }
    }
}
