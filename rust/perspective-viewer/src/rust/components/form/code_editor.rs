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

use perspective_client::ExprValidationError;
use wasm_bindgen::JsCast;
use web_sys::*;
use yew::prelude::*;

use crate::components::form::highlight::highlight;
use crate::components::function_dropdown::{FunctionDropDownElement, FunctionDropDownPortal};
use crate::exprtk::{Cursor, tokenize};
use crate::utils::*;

#[derive(Properties, PartialEq)]
pub struct CodeEditorProps {
    pub expr: Rc<String>,
    pub oninput: Callback<Rc<String>>,
    pub onsave: Callback<()>,
    pub disabled: bool,

    #[prop_or_default]
    pub autofocus: bool,

    #[prop_or_default]
    pub wordwrap: bool,

    #[prop_or_default]
    pub autosuggest: bool,

    #[prop_or_default]
    pub select_all: Subscriber<()>,

    #[prop_or_default]
    pub error: Option<ExprValidationError>,

    /// Selected theme name, threaded for PortalModal consumers.
    #[prop_or_default]
    pub theme: String,
}

/// A syntax-highlighted text editor component.
#[function_component(CodeEditor)]
pub fn code_editor(props: &CodeEditorProps) -> Html {
    let select_all = use_state_eq(|| false);
    let caret_position = use_state_eq(|| 0_u32);
    let scroll_offset = use_state_eq(|| (0, 0));
    let textarea_ref = use_node_ref();
    let content_ref = use_node_ref();
    let lineno_ref = use_node_ref();
    let filter_dropdown = use_memo((), |_| FunctionDropDownElement::default());
    let mut cursor = Cursor::new(&props.error);
    let terms = tokenize(&props.expr)
        .into_iter()
        .map(|token| highlight(&mut cursor, token, *caret_position))
        .collect::<Html>();

    let onkeydown = use_callback((caret_position.setter(), props.onsave.clone()), on_keydown);
    let oninput = use_callback(props.oninput.clone(), |event, deps| {
        on_input_callback(event, deps)
    });

    let onscroll = use_callback((scroll_offset.setter(), textarea_ref.clone()), |_, deps| {
        on_scroll(&deps.0, &deps.1)
    });

    let autofocus = props.autofocus;
    use_effect_with((props.expr.clone(), textarea_ref.clone()), {
        move |(expr, textarea_ref)| {
            let elem = textarea_ref.cast::<web_sys::HtmlTextAreaElement>().unwrap();
            if autofocus {
                elem.focus().unwrap();
            }

            if **expr != elem.value() {
                elem.set_value(&format!("{expr}"));
                elem.set_scroll_top(0);
                elem.set_scroll_left(0);
                elem.set_caret_position(0).unwrap();
            }
        }
    });

    // select_all.set(props.select_all);
    use_effect_with((select_all.setter(), props.select_all.clone()), {
        move |(select_all, props_select_all)| {
            clone!(select_all);
            let sub = props_select_all.add_listener(move |()| select_all.set(true));
            move || drop(sub)
        }
    });

    // select_all.set(props.select_all);
    use_effect_with((select_all, textarea_ref.clone()), {
        move |(select_all, textarea_ref)| {
            let elem = textarea_ref.cast::<web_sys::HtmlTextAreaElement>().unwrap();
            if **select_all {
                elem.focus().unwrap();
                elem.select_all().unwrap();
            }

            select_all.set(false);
        }
    });

    // ????
    let autofocus = props.autofocus;
    use_effect_with((props.error.clone(), textarea_ref.clone()), {
        move |(_, textarea_ref)| {
            if autofocus {
                let elem = textarea_ref.cast::<web_sys::HtmlTextAreaElement>().unwrap();
                elem.focus().unwrap();
            }
        }
    });

    // Sync scrolling between textarea and formatted HTML
    use_effect_with(
        (scroll_offset, content_ref.clone(), lineno_ref.clone()),
        |deps| scroll_sync(&deps.0, &deps.1, &deps.2),
    );

    let portal_dropdown = filter_dropdown.clone();

    // Blur if this element is not in the tree
    use_effect_with(filter_dropdown.clone(), |filter_dropdown| {
        clone!(filter_dropdown);
        move || filter_dropdown.hide().unwrap()
    });

    // Show autocomplete
    use_effect_with(
        (
            props.autosuggest,
            filter_dropdown,
            cursor.auto.clone(),
            cursor.noderef.clone(),
        ),
        |deps| {
            if deps.0 {
                autocomplete(&deps.1, &deps.2, &deps.3)
            }
        },
    );

    let error_line = props.error.as_ref().map(|x| x.line);
    let line_numbers = cursor
        .map_rows(|x| html!(
            <span
                class={if Some(x) == error_line {"line_number error_highlight"} else {"line_number"}}
            >
                { x + 1 }
            </span>
        ))
        .collect::<Html>();

    let class = if props.wordwrap {
        "wordwrap scrollable"
    } else {
        "scrollable"
    };
    clone!(props.disabled);
    html! {
        <>
            <div id="editor" {class}>
                <div id="line_numbers" ref={lineno_ref}>{ line_numbers }</div>
                <div id="editor-inner" {class}>
                    <textarea
                        {disabled}
                        id="textarea_editable"
                        class="scrollable"
                        ref={textarea_ref}
                        spellcheck="false"
                        {oninput}
                        {onscroll}
                        {onkeydown}
                    />
                    <div id="editor-height-sizer" />
                    <pre id="content" ref={content_ref}>
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
                </div>
            </div>
            <FunctionDropDownPortal
                element={(*portal_dropdown).clone()}
                theme={props.theme.clone()}
            />
        </>
    }
}

/// Capture the input (for re-parse) and caret position whenever the input
/// text changes.
fn on_input_callback(
    event: InputEvent,
    // position: &UseStateSetter<u32>,
    oninput: &Callback<Rc<String>>,
) {
    let elem = event
        .target()
        .unwrap()
        .unchecked_into::<web_sys::HtmlTextAreaElement>();

    oninput.emit(elem.value().into());
    // position.set(elem.get_caret_position().unwrap_or_default());
}

/// Overide for special non-character commands e.g. shift+enter
fn on_keydown(event: KeyboardEvent, deps: &(UseStateSetter<u32>, Callback<()>)) {
    let elem = event
        .target()
        .unwrap()
        .unchecked_into::<web_sys::HtmlTextAreaElement>();

    deps.0.set(elem.get_caret_position().unwrap_or_default());
    if event.shift_key() && event.key_code() == 13 {
        event.prevent_default();
        deps.1.emit(())
    }

    // handle the tab key press
    if event.key() == "Tab" {
        event.prevent_default();

        let caret_pos = elem.selection_start().unwrap().unwrap_or_default() as usize;

        let mut initial_text = elem.value();

        initial_text.insert(caret_pos, '\t');

        elem.set_value(&initial_text);

        let input_event = web_sys::InputEvent::new("input").unwrap();
        let _ = elem.dispatch_event(&input_event).unwrap();

        // place caret after inserted tab
        let new_caret_pos = (caret_pos + 1) as u32;
        let _ = elem.set_selection_range(new_caret_pos, new_caret_pos);

        elem.focus().unwrap();
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
