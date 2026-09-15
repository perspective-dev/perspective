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

/// Lowercases `key` and folds every other character to `-`, producing the
/// middle segment of a `--psp-label--{slug}--content` intl variable name.
pub fn intl_slug(key: &str) -> String {
    key.chars()
        .map(|x| {
            if x.is_ascii_alphanumeric() {
                x.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect()
}

/// The inline `style` that routes an element's `:before` text through the intl
/// indirection.
pub fn intl_content_style(var: &str) -> String {
    format!("--psp-label--content: var(--psp-label--{var}--content)")
}

#[derive(Properties, PartialEq)]
pub struct IntlLabelProps {
    pub name: String,

    #[prop_or_default]
    pub group: bool,

    #[prop_or_default]
    pub class: Classes,
}

/// A `<label>` whose text is the intl string for a schema key.
#[function_component(IntlLabel)]
pub fn intl_label(props: &IntlLabelProps) -> Html {
    let slug = intl_slug(&props.name);
    let (id, var) = if props.group {
        (
            format!("{}-group-label", props.name),
            format!("group-{slug}"),
        )
    } else {
        (format!("{}-label", props.name), slug)
    };

    let style = intl_content_style(&var);
    let class = classes!("intl-label", props.class.clone());
    html! { <label {class} {id} {style} /> }
}
