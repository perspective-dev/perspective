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

use crate::agent::AgentSlot;
use crate::ui::MirroredTextarea;

/// The prompt input, over the shared [`MirroredTextarea`] — so it grows
/// with its text instead of scrolling. This consumer wraps
/// (`white-space: pre-wrap` is the shared default), which confines growth
/// to the vertical axis; the expression editor's `pre` instead lets it
/// grow sideways too.
///
/// Split from [`ChatPanel`](super::ChatPanel) because the mirror re-renders per
/// keystroke: the transcript re-parses markdown for every message it renders,
/// which must not happen per character.
#[derive(Properties, PartialEq)]
pub struct ChatInputProps {
    pub agent: AgentSlot,
    pub busy: bool,
}

#[function_component]
pub fn ChatInput(props: &ChatInputProps) -> Html {
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
