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

use crate::agent::{AgentSlot, Entitlement, tool_names};

#[derive(Properties, PartialEq)]
pub struct ChatHeaderProps {
    pub agent: AgentSlot,
    pub entitlements: Vec<(Entitlement, bool)>,
    pub busy: bool,
    pub empty: bool,
}

#[function_component]
pub fn ChatHeader(props: &ChatHeaderProps) -> Html {
    let chips = props
        .entitlements
        .iter()
        .filter_map(|&(entitlement, enabled)| match entitlement {
            Entitlement::ReadView | Entitlement::ReadDocs => None,
            _ => {
                let onclick = {
                    let agent = props.agent.clone();
                    Callback::from(move |_: MouseEvent| {
                        agent.set_entitlement(entitlement, !enabled)
                    })
                };

                Some(html! {
                    <button
                        class="chat-entitlement"
                        data-entitlement={entitlement.as_str()}
                        aria-pressed={enabled.to_string()}
                        title={tool_names(entitlement).join(", ")}
                        disabled={props.busy}
                        {onclick}
                    />
                })
            },
        })
        .collect::<Html>();

    let onreset = {
        let agent = props.agent.clone();
        Callback::from(move |_: MouseEvent| {
            let agent = agent.clone();
            wasm_bindgen_futures::spawn_local(async move { agent.reset().await });
        })
    };

    html! {
        <div id="chat_header" class="sidebar-controls">
            { chips }
            <button id="chat_reset_button" disabled={props.busy || props.empty} onclick={onreset} />
        </div>
    }
}
