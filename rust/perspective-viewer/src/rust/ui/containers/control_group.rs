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

use wasm_bindgen::JsCast;
use web_sys::{Event, MouseEvent};
use yew::{
    Callback, Classes, Html, Properties, classes, function_component, html, use_callback,
    use_effect_with, use_mut_ref, use_node_ref,
};

use crate::ui::form::intl_label::IntlLabel;

#[derive(Properties, PartialEq)]
pub struct ControlGroupProps {
    pub group_key: String,

    pub open: bool,

    #[prop_or_default]
    pub on_toggle: Callback<(String, bool)>,

    /// The summary content, in place of the `group_key` intl label.
    #[prop_or_default]
    pub summary: Option<Html>,

    #[prop_or_default]
    pub class: Classes,

    pub children: Html,
}

#[function_component]
pub fn ControlGroup(props: &ControlGroupProps) -> Html {
    let ontoggle = use_callback(
        (props.group_key.clone(), props.on_toggle.clone()),
        |event: Event, (group_key, on_toggle)| {
            if let Some(el) = event
                .target()
                .and_then(|x| x.dyn_into::<web_sys::Element>().ok())
            {
                on_toggle.emit((group_key.clone(), el.has_attribute("open")));
            }
        },
    );

    let onclick = use_callback((), |event: MouseEvent, _| {
        if !event.shift_key() {
            return;
        }

        event.prevent_default();
        let Some(details) = event
            .target()
            .and_then(|x| x.dyn_into::<web_sys::Element>().ok())
            .and_then(|x| x.closest("details.control-group").ok().flatten())
        else {
            return;
        };

        let Some(scope) = details
            .closest(".tab-section")
            .ok()
            .flatten()
            .or_else(|| details.parent_element())
        else {
            return;
        };

        let expand = !details.has_attribute("open");
        let Ok(groups) = scope.query_selector_all("details.control-group") else {
            return;
        };

        for i in 0..groups.length() {
            let Some(el) = groups
                .item(i)
                .and_then(|x| x.dyn_into::<web_sys::Element>().ok())
            else {
                continue;
            };

            if expand {
                let _ = el.set_attribute("open", "");
            } else {
                let _ = el.remove_attribute("open");
            }
        }
    });

    let details_ref = use_node_ref();
    {
        let details_ref = details_ref.clone();
        use_effect_with(
            (props.group_key.clone(), props.on_toggle.clone()),
            move |(group_key, on_toggle)| {
                let group_key = group_key.clone();
                let on_toggle = on_toggle.clone();
                move || {
                    if let Some(el) = details_ref.cast::<web_sys::Element>() {
                        on_toggle.emit((group_key, el.has_attribute("open")));
                    }
                }
            },
        );
    }

    let open = *use_mut_ref(|| props.open).borrow();
    let class = classes!("control-group", props.class.clone());
    let summary = props.summary.clone().unwrap_or_else(|| {
        html! { <IntlLabel name={props.group_key.clone()} group=true /> }
    });

    html! {
        <details ref={details_ref} {class} {open} {ontoggle}>
            <summary {onclick}>
                <span class="control-group-chevron shift-alt-icon" />
                { summary }
            </summary>
            { props.children.clone() }
        </details>
    }
}
