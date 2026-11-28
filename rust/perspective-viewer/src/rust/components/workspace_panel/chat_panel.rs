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

mod header;
mod input;
mod reasoning;

use yew::prelude::*;

use self::header::ChatHeader;
use self::input::ChatInput;
use self::reasoning::ChatReasoning;
use crate::agent::{AgentSlot, ChatEntry, render_markdown};

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
    let transcript = props.agent.transcript();
    let empty = transcript.is_empty();
    let retryable = matches!(transcript.last(), Some(ChatEntry::Error(_)));
    let onretry = {
        let agent = props.agent.clone();
        Callback::from(move |_: MouseEvent| {
            let agent = agent.clone();
            wasm_bindgen_futures::spawn_local(async move {
                let _ = agent.retry().await;
            });
        })
    };

    let entries = transcript
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
            ChatEntry::Stopped => {
                html! { <div class="chat-message chat-error">{ "Stopped" }</div> }
            },
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
        _ if retryable => html! { <button id="chat_retry_button" onclick={onretry} /> },
        _ => html! {},
    };

    html! {
        <div id="chat_panel">
            <ChatHeader
                agent={props.agent.clone()}
                entitlements={props.agent.entitlements()}
                {busy}
                {empty}
            />
            <div id="chat_log" class="scrollable" ref={log_ref} {onscroll}>{ entries }{ tail }</div>
            <ChatInput agent={props.agent.clone()} {busy} />
            <div id="chat_badge">
                <span id="chat_badge_label">{ props.agent.label().unwrap_or_default() }</span>
                <span id="chat_docs_status" data-loaded={props.agent.docs_loaded().to_string()} />
            </div>
        </div>
    }
}
