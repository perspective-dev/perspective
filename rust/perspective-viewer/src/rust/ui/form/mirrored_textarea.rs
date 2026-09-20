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

use yew::html::IntoPropValue;
use yew::prelude::*;

#[derive(Clone)]
pub struct Mirror(pub Html);

impl PartialEq for Mirror {
    fn eq(&self, _other: &Self) -> bool {
        false
    }
}

impl IntoPropValue<Mirror> for Html {
    fn into_prop_value(self) -> Mirror {
        Mirror(self)
    }
}

#[derive(Properties, PartialEq)]
pub struct MirroredTextareaProps {
    pub id: AttrValue,

    pub mirror: Mirror,

    #[prop_or_default]
    pub mirror_id: Option<AttrValue>,

    #[prop_or_default]
    pub class: Classes,

    #[prop_or_default]
    pub textarea_ref: NodeRef,

    #[prop_or_default]
    pub mirror_ref: NodeRef,

    #[prop_or_default]
    pub placeholder: AttrValue,

    #[prop_or_default]
    pub is_empty: bool,

    #[prop_or_default]
    pub disabled: bool,

    #[prop_or_default]
    pub oninput: Callback<InputEvent>,

    #[prop_or_default]
    pub onkeydown: Callback<KeyboardEvent>,

    #[prop_or_default]
    pub onscroll: Callback<Event>,

    #[prop_or_default]
    pub children: Children,
}

#[function_component]
pub fn MirroredTextarea(props: &MirroredTextareaProps) -> Html {
    html! {
        <div class={classes!("mirrored-textarea", props.class.clone())}>
            <textarea
                id={props.id.clone()}
                ref={props.textarea_ref.clone()}
                class="mirrored-textarea-input scrollable"
                spellcheck="false"
                placeholder={props.placeholder.clone()}
                disabled={props.disabled}
                oninput={props.oninput.clone()}
                onkeydown={props.onkeydown.clone()}
                onscroll={props.onscroll.clone()}
            />
            { props.children.iter().collect::<Html>() }
            <pre
                id={props.mirror_id.clone()}
                ref={props.mirror_ref.clone()}
                class={classes!(
                    "mirrored-textarea-mirror",
                    props.is_empty.then_some("is-empty"),
                )}
            >
                { props.mirror.0.clone() }
                { " " }
            </pre>
        </div>
    }
}
