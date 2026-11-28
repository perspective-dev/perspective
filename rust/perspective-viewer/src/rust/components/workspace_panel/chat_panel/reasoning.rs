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

use yew::prelude::*;

#[derive(Properties, PartialEq)]
pub struct ChatReasoningProps {
    pub reasoning: String,
    pub open: bool,
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
pub fn ChatReasoning(props: &ChatReasoningProps) -> Html {
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
