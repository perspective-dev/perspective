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

use yew::{Callback, Html, Properties, function_component, html};

use crate::utils::left_click;

#[derive(Properties, PartialEq, Clone)]
pub struct SaveSettingsProps {
    pub save_enabled: bool,
    pub reset_enabled: bool,
    pub on_reset: Callback<()>,
    pub on_save: Callback<()>,
    pub on_delete: Callback<()>,
    pub show_danger_zone: bool,
    pub disable_delete: bool,
    pub is_save: bool,
}

#[function_component(SaveSettings)]
pub fn save_settings(props: &SaveSettingsProps) -> Html {
    let reset = left_click(props.on_reset.reform(|_| ()));
    let save = left_click(props.on_save.reform(|_| ()));
    let delete = left_click(props.on_delete.reform(|_| ()));
    html! {
        <div id="save-settings-wrapper">
            if props.show_danger_zone {
                <div id="danger-zone">
                    <button
                        id="psp-expression-editor-button-delete"
                        class="psp-expression-editor__button"
                        onmousedown={delete}
                        disabled={props.disable_delete}
                    >
                        { "Delete Column" }
                    </button>
                </div>
            }
            <div
                id="save-settings"
            >
                if props.is_save {
                    <button
                        id="psp-expression-editor-button-reset"
                        class="psp-expression-editor__button"
                        onmousedown={reset}
                        disabled={!props.reset_enabled}
                    >
                        { "Reset" }
                    </button>
                }
                <button
                    id="psp-expression-editor-button-save"
                    class="psp-expression-editor__button"
                    onmousedown={save}
                    disabled={!props.save_enabled}
                >
                    { if props.is_save { "Save" } else { "Create" } }
                </button>
            </div>
        </div>
    }
}
