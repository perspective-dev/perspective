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

use perspective_js::utils::ApiFuture;
use wasm_bindgen::JsValue;
use yew::prelude::*;

use crate::js::{MimeType, copy_to_clipboard};
use crate::queries::StatusError;
use crate::ui::intl_content_style;

#[derive(Properties, PartialEq)]
pub struct ErrorDialogProps {
    pub error: StatusError,

    /// Shown as a Reconnect button beside the details toggle when `Some`.
    #[prop_or_default]
    pub on_reconnect: Option<Callback<()>>,

    #[prop_or_default]
    pub id: Option<AttrValue>,

    #[prop_or_default]
    pub class: Classes,
}

/// An error's message, with its stack behind a collapsed details toggle.
#[function_component]
pub fn ErrorDialog(props: &ErrorDialogProps) -> Html {
    let onclick = props.on_reconnect.clone().map(|on_reconnect| {
        Callback::from(move |event: MouseEvent| {
            event.prevent_default();
            on_reconnect.emit(());
        })
    });

    let error = &props.error;
    let oncopy = {
        let text = format!("{} {}\n{}", error.kind, error.message, error.stack);
        Callback::from(move |event: MouseEvent| {
            event.prevent_default();
            let text = text.clone();
            ApiFuture::spawn(copy_to_clipboard(
                async move {
                    let options = web_sys::BlobPropertyBag::new();
                    options.set_type("text/plain");
                    let parts = js_sys::Array::of1(&JsValue::from(text));
                    Ok(web_sys::Blob::new_with_str_sequence_and_options(
                        &parts, &options,
                    )?)
                },
                MimeType::TextPlain,
            ));
        })
    };

    html! {
        <div id={props.id.clone()} class={classes!("error-dialog", props.class.clone())}>
            <div class="error-dialog-message">{ format!("{} {}", error.kind, error.message) }</div>
            <details class="error-dialog-details">
                <summary>
                    <span class="ws-label" style={intl_content_style("error-details")} />
                    if let Some(onclick) = onclick {
                        <button
                            class="error-dialog-reconnect ws-label"
                            style={intl_content_style("client-reconnect")}
                            {onclick}
                        />
                    }
                    <button
                        class="error-dialog-copy ws-label"
                        style={intl_content_style("copy-button")}
                        onclick={oncopy}
                    />
                </summary>
                <div class="error-dialog-stack scrollable">{ &error.stack }</div>
            </details>
        </div>
    }
}
