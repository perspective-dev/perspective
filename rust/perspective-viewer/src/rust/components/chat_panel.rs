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

//! The chat sidebar tab (feature `llm-agent`) — a pure VIEW over
//! [`AgentSlot`]: all conversation state lives on the slot so this component
//! can unmount (tab switch, settings close) without losing the transcript or
//! interrupting a running turn.

use yew::prelude::*;

use crate::agent::{AgentSlot, ChatEntry, render_markdown};
use crate::components::form::mirrored_textarea::MirroredTextarea;

#[derive(Properties, PartialEq)]
struct ChatReasoningProps {
    reasoning: String,
    open: bool,
}

/// A reasoning-model's "thinking" text: plain-text collapsible block,
/// expanded while it is streaming (the only progress signal during a long
/// think) and collapsed once real content exists.
///
/// The body is capped and scrolls (`viewer.css`), and follows its own
/// tail as deltas append — but only while the reader is AT that tail.
/// Scrolling up to read something is a deliberate act, so it wins until
/// the reader returns to the bottom, exactly like the transcript.
#[function_component]
fn ChatReasoning(props: &ChatReasoningProps) -> Html {
    let body_ref = use_node_ref();
    let scroll_pinned = use_mut_ref(|| true);
    let seen_len = use_mut_ref(|| None::<usize>);
    let onscroll = {
        let body_ref = body_ref.clone();
        let scroll_pinned = scroll_pinned.clone();
        Callback::from(move |_: Event| {
            if let Some(elem) = body_ref.cast::<web_sys::Element>() {
                let gap = elem.scroll_height() - elem.scroll_top() - elem.client_height();
                *scroll_pinned.borrow_mut() = gap < 24;
            }
        })
    };

    {
        let body_ref = body_ref.clone();
        let scroll_pinned = scroll_pinned.clone();
        let seen_len = seen_len.clone();
        let len = props.reasoning.len();
        use_effect(move || {
            let grew = seen_len.replace(Some(len)).is_some_and(|seen| len > seen);
            if grew
                && *scroll_pinned.borrow()
                && let Some(elem) = body_ref.cast::<web_sys::Element>()
            {
                elem.set_scroll_top(elem.scroll_height());
            }
        });
    }

    html! {
        <details class="chat-reasoning" open={props.open}>
            <summary />
            <div class="chat-reasoning-body scrollable" ref={body_ref} {onscroll}>
                { &props.reasoning }
            </div>
        </details>
    }
}

/// The prompt input, over the shared [`MirroredTextarea`] — so it grows
/// with its text instead of scrolling. This consumer wraps
/// (`white-space: pre-wrap` is the shared default), which confines growth
/// to the vertical axis; the expression editor's `pre` instead lets it
/// grow sideways too.
///
/// Split from [`ChatPanel`] because the mirror re-renders per keystroke:
/// the transcript re-parses markdown for every message it renders, which
/// must not happen per character.
#[derive(Properties, PartialEq)]
struct ChatInputProps {
    agent: AgentSlot,
    busy: bool,
}

#[function_component]
fn ChatInput(props: &ChatInputProps) -> Html {
    let input_ref = use_node_ref();

    // Mirrors the textarea's value. The textarea is deliberately NOT
    // value-bound — binding it fights the caret — so this is a shadow of
    // the DOM value, written on `input` and cleared with it on submit.
    let text = use_state_eq(String::new);
    let submit = {
        let agent = props.agent.clone();
        let input_ref = input_ref.clone();
        let text = text.clone();
        Callback::from(move |()| {
            if agent.is_busy() {
                return;
            }

            if let Some(elem) = input_ref.cast::<web_sys::HtmlTextAreaElement>() {
                let prompt = elem.value().trim().to_owned();
                if prompt.is_empty() {
                    return;
                }

                elem.set_value("");
                text.set(String::new());
                let agent = agent.clone();
                wasm_bindgen_futures::spawn_local(async move {
                    // Failures land in the transcript; nothing to propagate.
                    let _ = agent.run_prompt(prompt).await;
                });
            }
        })
    };

    let onkeydown = {
        let submit = submit.clone();
        Callback::from(move |event: KeyboardEvent| {
            if event.key() == "Enter" && !event.shift_key() {
                event.prevent_default();
                submit.emit(());
            }
        })
    };

    // `input` fires after the value settles and covers paste, cut and
    // Shift+Enter newlines, none of which `keydown` sees correctly.
    let oninput = {
        let input_ref = input_ref.clone();
        let text = text.clone();
        Callback::from(move |_: InputEvent| {
            if let Some(elem) = input_ref.cast::<web_sys::HtmlTextAreaElement>() {
                text.set(elem.value());
            }
        })
    };

    let onsend = submit.reform(|_: MouseEvent| ());
    let onstop = {
        let agent = props.agent.clone();
        Callback::from(move |_: MouseEvent| agent.stop())
    };

    html! {
        <div id="chat_input_row">
            <div id="chat_input_scroll" class="scrollable">
                <MirroredTextarea
                    id="chat_input"
                    class="chat-input-box"
                    mirror={html! { (*text).clone() }}
                    is_empty={text.is_empty()}
                    textarea_ref={input_ref}
                    placeholder="Ask about your data\u{2026}"
                    disabled={props.busy}
                    {onkeydown}
                    {oninput}
                />
            </div>
            if props.busy {
                <button id="chat_stop_button" onclick={onstop} />
            } else {
                <button id="chat_send_button" onclick={onsend} />
            }
        </div>
    }
}

#[derive(Properties, PartialEq)]
pub struct ChatPanelProps {
    pub agent: AgentSlot,
}

#[function_component]
pub fn ChatPanel(props: &ChatPanelProps) -> Html {
    let update = use_force_update();
    {
        let agent = props.agent.clone();
        use_effect_with((), move |_| {
            let sub = agent
                .on_update
                .add_notify_listener(&Callback::from(move |_| update.force_update()));

            move || drop(sub)
        });
    }

    // Autoscroll only while the user is pinned at the bottom — reading
    // scrolled-back transcript must survive incoming streaming deltas.
    // `onscroll` fires for programmatic scrolls too, so scrolling to the
    // bottom re-pins consistently.
    let log_ref = use_node_ref();
    let scroll_pinned = use_mut_ref(|| true);
    let onscroll = {
        let log_ref = log_ref.clone();
        let scroll_pinned = scroll_pinned.clone();
        Callback::from(move |_: Event| {
            if let Some(elem) = log_ref.cast::<web_sys::Element>() {
                let gap = elem.scroll_height() - elem.scroll_top() - elem.client_height();
                *scroll_pinned.borrow_mut() = gap < 30;
            }
        })
    };

    {
        let log_ref = log_ref.clone();
        let scroll_pinned = scroll_pinned.clone();
        use_effect(move || {
            if let Some(elem) = log_ref.cast::<web_sys::Element>()
                && *scroll_pinned.borrow()
            {
                elem.set_scroll_top(elem.scroll_height());
            }
        });
    }

    let busy = props.agent.is_busy();
    let entries = props
        .agent
        .transcript()
        .into_iter()
        .map(|entry| match entry {
            ChatEntry::User(text) => html! {
                <div class="chat-message chat-user">{ text.trim() }</div>
            },
            ChatEntry::Assistant { text, reasoning } => html! {
                <div class="chat-message chat-assistant">
                    if let Some(reasoning) = reasoning { <ChatReasoning {reasoning} open=false /> }
                    { render_markdown(&text) }
                </div>
            },
            ChatEntry::Tool { name, args, error } => {
                let class = if error.is_some() {
                    "chat-tool-chip chat-tool-chip-error"
                } else {
                    "chat-tool-chip"
                };

                let title = match &error {
                    Some(err) => format!("{err}\n\n{args}"),
                    None => args.clone(),
                };

                html! { <div {class} {title}>{ name }</div> }
            },
            ChatEntry::Error(text) => html! { <div class="chat-message chat-error">{ text }</div> },
        })
        .collect::<Html>();

    // The in-flight turn's streaming tail: reasoning renders auto-OPEN
    // while it is the only signal, collapsing once answer text starts;
    // no deltas yet (or between tool rounds) shows the typing dots.
    let pending = props.agent.pending();
    let tail = match &pending {
        Some((text, reasoning)) if !text.is_empty() || !reasoning.is_empty() => html! {
            <div class="chat-message chat-assistant chat-streaming">
                if !reasoning.is_empty() {
                    <ChatReasoning reasoning={reasoning.clone()} open={text.is_empty()} />
                }
                if !text.is_empty() {
                    { render_markdown(text) }
                }
            </div>
        },
        _ if busy => html! {
            <div class="chat-message chat-assistant chat-pending"><span /><span /><span /></div>
        },
        _ => html! {},
    };

    html! {
        <div id="chat_panel">
            <div id="chat_log" class="scrollable" ref={log_ref} {onscroll}>{ entries }{ tail }</div>
            <ChatInput agent={props.agent.clone()} {busy} />
            <div id="chat_badge">{ props.agent.label().unwrap_or_default() }</div>
        </div>
    }
}
