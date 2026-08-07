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

//! A `<textarea>` whose box is sized by its own text.
//!
//! A textarea cannot grow with its content — it scrolls at whatever height
//! it was given. The technique here, shared by [`CodeEditor`] and the chat
//! prompt, is to make the textarea a purely functional layer: it takes the
//! keystrokes, the selection and the caret, but paints no glyphs
//! (`color: transparent`). Underneath sits a `<pre>` mirror of the same
//! characters which IS painted and IS in flow, so the ordinary layout
//! engine sizes the box.
//!
//! This is deliberately not a JS measure-and-resize loop
//! (`scrollHeight` → inline `height`): that re-measures on a reflow it
//! just forced, drifts whenever font-size or the loaded font changes
//! without an `input` event to re-trigger it, and jitters at fractional
//! line heights. Here the two layers share their text metrics, so growth
//! is exact by construction and free at runtime.
//!
//! Consumers decide the AXES: the mirror's `white-space` governs growth,
//! so `pre-wrap` grows only downward (the chat prompt) while `pre` also
//! grows sideways (the expression editor). They also own the box —
//! padding, borders, min/max size — with `mirrored-textarea.css` fixing
//! only what MUST agree between the two layers.
//!
//! [`CodeEditor`]: super::code_editor::CodeEditor

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
    /// `id` of the `<textarea>` itself — consumer CSS and tests key on it.
    pub id: AttrValue,

    /// The mirror's content: the same characters the textarea holds,
    /// as plain text, or marked up (`CodeEditor` passes highlighted
    /// spans). A stale mirror means a caret that drifts from the glyphs,
    /// so this is re-rendered unconditionally — see [`Mirror`].
    pub mirror: Mirror,

    /// `id` of the mirror `<pre>`, for consumers that style it directly.
    #[prop_or_default]
    pub mirror_id: Option<AttrValue>,

    /// Extra classes for the positioned container.
    #[prop_or_default]
    pub class: Classes,

    #[prop_or_default]
    pub textarea_ref: NodeRef,

    #[prop_or_default]
    pub mirror_ref: NodeRef,

    /// The `placeholder` ATTRIBUTE, which exists for assistive tech: it
    /// is painted transparent, because a CSS-`content` label cannot be
    /// written into an attribute and so cannot be localized. The text a
    /// sighted user reads comes from the mirror instead — see
    /// [`Self::is_empty`].
    #[prop_or_default]
    pub placeholder: AttrValue,

    /// Whether [`Self::mirror`] is empty, which the component cannot see
    /// for itself (the mirror is opaque `Html`). Tags the mirror with
    /// `is-empty` so a consumer's stylesheet can supply placeholder text
    /// through `content`, and therefore through the intl label
    /// mechanism, rather than through the untranslatable attribute.
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

    /// Extra nodes inside the positioned container, e.g. `CodeEditor`'s
    /// minimum-height sizer.
    #[prop_or_default]
    pub children: Children,
}

#[function_component]
pub fn MirroredTextarea(props: &MirroredTextareaProps) -> Html {
    html! {
        <div class={classes!("mirrored-textarea", props.class.clone())}>
            // `scrollable` is the viewer's webkit scrollbar styling: the
            // input layer scrolls wherever a consumer lets it (the
            // expression editor syncs its `scrollTop` to the mirror and
            // line numbers), and is inert where it does not (the chat
            // prompt, whose wrapper scrolls instead).
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
                // A trailing newline opens a line box in the textarea but
                // not in the `<pre>` (which has no caret to place there),
                // so the mirror would come up one line short exactly when
                // the text is about to overflow. The space forces it.
                { " " }
            </pre>
        </div>
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mirror_never_compares_equal() {
        let mirror = Mirror(Html::default());
        assert!(mirror != mirror.clone());
        assert!(Mirror(Html::default()) != Mirror(Html::default()));
    }
}
