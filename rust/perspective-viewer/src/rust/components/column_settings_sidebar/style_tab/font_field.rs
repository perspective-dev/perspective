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

use std::rc::Rc;

use serde_json::Value;
use web_sys::{HtmlInputElement, InputEvent, MouseEvent};
use yew::prelude::*;

use super::primitive_field::emit;
use crate::config::{ColumnConfigFieldUpdate, FontSize, FontToggle};
use crate::ui::{OptionalField, Select, SelectItem};
use crate::utils::{
    LocalFontsAccess, font_family_options, local_fonts_access, on_local_fonts_changed,
    probe_local_fonts_access, read_intl_string, request_local_fonts_access,
};

#[derive(Properties, PartialEq)]
pub struct FontFieldProps {
    pub field_key: String,
    pub default: String,
    pub current: Option<String>,

    /// The size input's key, default and bounds, when the spec declares
    /// one, and the stored value for that key.
    #[prop_or_default]
    pub size: Option<FontSize>,

    #[prop_or_default]
    pub size_current: Option<f64>,

    /// The bold toggle's key and default, when the spec declares one, and
    /// the stored value for that key.
    #[prop_or_default]
    pub bold: Option<FontToggle>,

    #[prop_or_default]
    pub bold_current: Option<bool>,

    #[prop_or_default]
    pub italic: Option<FontToggle>,

    #[prop_or_default]
    pub italic_current: Option<bool>,
    pub on_change: Callback<ColumnConfigFieldUpdate>,
}

/// The `ControlSpec::Font` widget: a family `<select>`, the optional size
/// input and bold / italic toggles, and a "Local Fonts" action while the
/// `local-fonts` permission is promptable.
#[function_component]
pub fn FontField(props: &FontFieldProps) -> Html {
    let force_update = use_force_update();
    use_effect_with((), move |_| {
        let sub = on_local_fonts_changed(Callback::from(move |()| force_update.force_update()));
        probe_local_fonts_access();
        move || drop(sub)
    });

    let selected = props
        .current
        .clone()
        .unwrap_or_else(|| props.default.clone());

    let toggle_state = |toggle: &Option<FontToggle>, current: Option<bool>| {
        toggle
            .as_ref()
            .map(|t| (t.clone(), current.unwrap_or(t.default)))
    };

    let bold = toggle_state(&props.bold, props.bold_current);
    let italic = toggle_state(&props.italic, props.italic_current);
    let family_checked = selected != props.default;
    let style_checked = props
        .size
        .as_ref()
        .is_some_and(|s| props.size_current.is_some_and(|v| v != s.default))
        || bold.as_ref().is_some_and(|(t, on)| *on != t.default)
        || italic.as_ref().is_some_and(|(t, on)| *on != t.default);

    let values: Rc<Vec<SelectItem<String>>> = Rc::new(
        font_family_options(&selected)
            .into_iter()
            .map(SelectItem::Option)
            .collect(),
    );

    let on_select = use_callback(
        (
            props.field_key.clone(),
            props.default.clone(),
            props.on_change.clone(),
        ),
        |value: String, (key, default, on_change)| {
            if value == *default {
                emit(on_change, key, None);
            } else {
                emit(on_change, key, Some(Value::String(value)));
            }
        },
    );

    let on_reset_style = use_callback(
        (
            props.size.clone(),
            props.bold.clone(),
            props.italic.clone(),
            props.field_key.clone(),
            props.on_change.clone(),
        ),
        |_: MouseEvent, (size, bold, italic, key, on_change)| {
            let keys = [
                size.as_ref().map(|s| s.key.clone()),
                bold.as_ref().map(|t| t.key.clone()),
                italic.as_ref().map(|t| t.key.clone()),
                Some(key.clone()),
            ]
            .into_iter()
            .flatten()
            .collect();

            on_change.emit(ColumnConfigFieldUpdate {
                keys,
                value: serde_json::Map::new(),
            });
        },
    );

    let size_input = props.size.as_ref().map(|size| {
        let on_input = {
            let on_change = props.on_change.clone();
            let size = size.clone();
            Callback::from(move |event: InputEvent| {
                let value = event
                    .target_unchecked_into::<HtmlInputElement>()
                    .value_as_number();
                let value = (value.is_finite() && value != size.default)
                    .then(|| serde_json::Number::from_f64(value).map(Value::Number))
                    .flatten();

                emit(&on_change, &size.key, value);
            })
        };

        html! {
            <input
                type="number"
                class="parameter font-size"
                id={format!("{}-input", size.key)}
                min={size.min.map(|v| v.to_string())}
                max={size.max.map(|v| v.to_string())}
                step={size.step.map(|v| v.to_string())}
                value={props.size_current.unwrap_or(size.default).to_string()}
                oninput={on_input}
            />
        }
    });

    let toggle_button = |class: &'static str, state: &Option<(FontToggle, bool)>| {
        let Some((toggle, on)) = state else {
            return html! {};
        };

        let next = !*on;
        let on_toggle = {
            let on_change = props.on_change.clone();
            let toggle = toggle.clone();
            Callback::from(move |_: MouseEvent| {
                let value = (next != toggle.default).then_some(Value::Bool(next));
                emit(&on_change, &toggle.key, value);
            })
        };

        html! {
            <span
                class={classes!("font-style-toggle", class)}
                id={format!("{}-toggle", toggle.key)}
                role="button"
                aria-pressed={on.to_string()}
                onclick={on_toggle}
            />
        }
    };

    let access = local_fonts_access();
    let action_ref = use_node_ref();
    use_effect_with((action_ref.clone(), access), |(action_ref, access)| {
        let Some(elem) = action_ref.cast::<web_sys::Element>() else {
            return;
        };

        let (slug, fallback) = match access {
            Some(LocalFontsAccess::Denied) => (
                "local-fonts-blocked-title",
                "Access to local fonts is blocked for this site. Allow it in the browser's site \
                 settings to list them here.",
            ),
            _ => (
                "request-local-fonts-title",
                "Allow access to the fonts installed on this device",
            ),
        };

        let title = read_intl_string(&elem, slug).unwrap_or_else(|| fallback.to_owned());
        let _ = elem.set_attribute("title", &title);
    });

    let local_fonts = match access {
        Some(LocalFontsAccess::Prompt) => {
            let on_request = Callback::from(|_: MouseEvent| request_local_fonts_access());
            html! {
                <div class="local-fonts-controls">
                    <span
                        ref={action_ref}
                        class="local-fonts-request"
                        id="request-local-fonts"
                        onclick={on_request}
                    />
                </div>
            }
        },
        Some(LocalFontsAccess::Denied) => html! {
            <div class="local-fonts-controls">
                <span
                    ref={action_ref}
                    class="local-fonts-request blocked"
                    id="request-local-fonts"
                />
            </div>
        },
        _ => html! {},
    };

    html! {
        <>
            <div class="row">
                { local_fonts }
                <OptionalField
                    label={props.field_key.clone()}
                    on_check={on_reset_style}
                    checked={family_checked || style_checked}
                >
                    <div class="font-group">
                        <Select<String>
                            wrapper_class="font-group-family"
                            {values}
                            {selected}
                            {on_select}
                        />
                        { size_input }
                        { toggle_button("bold", &bold) }
                        { toggle_button("italic", &italic) }
                    </div>
                </OptionalField>
            </div>
        </>
    }
}
