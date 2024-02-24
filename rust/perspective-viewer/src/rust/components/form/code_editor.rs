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

use std::cell::RefCell;
use std::rc::Rc;

use perspective_client::ExprValidationError;
use wasm_bindgen::JsCast;
use web_sys::*;
use yew::prelude::*;

use crate::components::form::highlight::highlight;
use crate::components::style::LocalStyle;
use crate::custom_elements::FunctionDropDownElement;
use crate::exprtk::{tokenize, Cursor};
use crate::utils::*;
use crate::*;

#[derive(Debug, Properties, PartialEq)]
pub struct CodeEditorProps {
    pub expr: Rc<String>,
    pub oninput: Callback<Rc<String>>,
    pub onsave: Callback<()>,
    pub disabled: bool,

    #[prop_or_default]
    pub error: Option<ExprValidationError>,
}

/// Capture the input (for re-parse) and caret position whenever the input
/// text changes.
fn on_input_callback(
    event: InputEvent,
    position: &UseStateSetter<u32>,
    oninput: &Callback<Rc<String>>,
) {
    let elem = event
        .target()
        .unwrap()
        .unchecked_into::<web_sys::HtmlTextAreaElement>();

    oninput.emit(elem.value().into());
    position.set(elem.get_caret_position().unwrap_or_default());
}

/// Overide for special non-character commands e.g. shift+enter
fn on_keydown(event: KeyboardEvent, onsave: &Callback<()>) {
    if event.shift_key() && event.key_code() == 13 {
        event.prevent_default();
        onsave.emit(())
    }
}

/// Scrolling callback
fn on_scroll(scroll: &UseStateSetter<(i32, i32)>, editable: &NodeRef) {
    let div = editable.cast::<HtmlElement>().unwrap();
    scroll.set((div.scroll_top(), div.scroll_left()));
}

/// Scrolling sync
fn scroll_sync(scroll: &UseStateHandle<(i32, i32)>, div: &NodeRef, lineno: &NodeRef) {
    if let Some(div) = div.cast::<HtmlElement>() {
        div.set_scroll_top(scroll.0);
        div.set_scroll_left(scroll.1);
    }

    if let Some(div) = lineno.cast::<HtmlElement>() {
        div.set_scroll_top(scroll.0);
    }
}

/// Autocomplete
/// TODO this should use a portal
fn autocomplete(
    filter_dropdown: &Rc<FunctionDropDownElement>,
    token: &Option<String>,
    target: &NodeRef,
) {
    if let Some(x) = token {
        let elem = target.cast::<HtmlElement>().unwrap();
        if elem.is_connected() {
            filter_dropdown
                .autocomplete(x.clone(), elem, Callback::from(|_| ()))
                .unwrap();
        } else {
            filter_dropdown.hide().unwrap();
        }
    } else {
        filter_dropdown.hide().unwrap();
    }
}

/// Set "open" state, initial text area content and caret position.
fn set_initial_state(
    textarearef: &NodeRef,
    contentref: &NodeRef,
    connect_state: &Rc<RefCell<bool>>,
    expr: &Rc<String>,
) -> ApiResult<()> {
    let elem = textarearef
        .cast::<web_sys::HtmlTextAreaElement>()
        .ok_or("Unable to get textarea!")?;
    let is_connected = elem.is_connected();
    let was_connected = connect_state.replace(is_connected);
    if elem.value() != **expr {
        elem.set_value(&format!("{}", expr));
    }

    if is_connected && !was_connected {
        elem.set_caret_position(expr.len())?;
        let content = contentref
            .cast::<HtmlElement>()
            .ok_or("Unable to get content!")?;
        content.set_scroll_top(elem.scroll_top());
        content.set_scroll_left(elem.scroll_left());
    }
    Ok(())
}

/// A syntax-highlighted text editor component.
#[function_component(CodeEditor)]
pub fn code_editor(props: &CodeEditorProps) -> Html {
    let caret_position = use_state_eq(|| props.expr.len() as u32);
    let scroll_offset = use_state_eq(|| (0, 0));
    let is_connected = use_mut_ref(|| false);
    let textarea_ref = use_node_ref().tee::<3>();
    let content_ref = use_node_ref().tee::<3>();
    let lineno_ref = use_node_ref().tee::<2>();
    let filter_dropdown = use_memo((), |_| FunctionDropDownElement::default());
    let mut cursor = Cursor::new(&props.error);
    let terms = tokenize(&props.expr)
        .into_iter()
        .map(|token| highlight(&mut cursor, token, *caret_position))
        .collect::<Html>();

    let onkeydown = use_callback(props.onsave.clone(), on_keydown);
    let oninput = use_callback(
        (caret_position.setter(), props.oninput.clone()),
        |event, deps| on_input_callback(event, &deps.0, &deps.1),
    );

    let onscroll = use_callback((scroll_offset.setter(), textarea_ref.2), |_, deps| {
        on_scroll(&deps.0, &deps.1)
    });

    use_effect({
        clone!(props.expr);
        move || {
            ApiFuture::spawn(async move {
                request_animation_frame().await;
                // This can fail to get noderefs when switching between a new expression and an
                // active column. Ignore it for now.
                let _ = set_initial_state(&textarea_ref.0, &content_ref.2, &is_connected, &expr);
                Ok(())
            })
        }
    });

    use_effect_with((scroll_offset, content_ref.0, lineno_ref.0), |deps| {
        scroll_sync(&deps.0, &deps.1, &deps.2)
    });

    use_effect_with(
        (filter_dropdown, cursor.auto.clone(), cursor.noderef.clone()),
        |deps| autocomplete(&deps.0, &deps.1, &deps.2),
    );

    let line_numbers = cursor
        .map_rows(|x| html!(<span class="line_number">{ x + 1 }</span>))
        .collect::<Html>();

    clone!(props.disabled);

    html! {
        <>
            <LocalStyle href={css!("form/code-editor")} />
            <div id="editor">
                <textarea
                    {disabled}
                    id="textarea_editable"
                    ref={textarea_ref.1}
                    spellcheck="false"
                    {oninput}
                    {onscroll}
                    {onkeydown}
                />
                <pre id="content" ref={content_ref.1}>
                    { terms }
                    { {
                        // A linebreak which pushs a textarea into scroll overflow
                        // may not necessarily do so in the `<pre>`, because there is
                        // no cursor when the last line has no content, so add
                        // some space here to make sure overlfow is in sync
                        // with the text area.
                        " "
                     } }
                </pre>
                <div id="line_numbers" ref={lineno_ref.1}>{ line_numbers }</div>
            </div>
        </>
    }
}
