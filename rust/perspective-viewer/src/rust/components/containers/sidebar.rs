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

use perspective_client::clone;
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::Closure;
use web_sys::HtmlElement;
use yew::{
    Callback, Children, Html, Properties, function_component, html, use_effect_with, use_mut_ref,
    use_node_ref,
};

use crate::components::containers::sidebar_close_button::SidebarCloseButton;
use crate::components::editable_header::{EditableHeader, EditableHeaderProps};
use crate::js::{ResizeObserver, ResizeObserverEntry};

#[derive(PartialEq, Clone, Properties)]
pub struct SidebarProps {
    /// The component's children.
    pub children: Children,

    /// When this callback is called, the sidebar will close
    pub on_close: Callback<()>,
    pub id_prefix: String,
    pub width_override: Option<i32>,
    pub selected_tab: Option<usize>,
    pub header_props: EditableHeaderProps,

    /// Trap-door width shared across this sidebar's tabs: the lifted
    /// running max of the widths this component reports through
    /// `on_auto_width`. Held by the parent (ultimately
    /// `PerspectiveViewer`'s geometry state, like the settings panel's
    /// Query/Plugin/Debug trap-door) so it survives tab switches AND
    /// sidebar re-mounts, and clears on divider reset.
    #[prop_or_default]
    pub auto_width: f64,

    /// Fires with the sidebar's rendered width after each render; the
    /// owner keeps the running max threaded back as `auto_width`.
    #[prop_or_default]
    pub on_auto_width: Callback<f64>,

    /// Pinned state for the header's pin toggle; the button renders only
    /// when `on_toggle_pin` is provided.
    #[prop_or_default]
    pub is_pinned: bool,

    #[prop_or_default]
    pub on_toggle_pin: Option<Callback<()>>,
}

/// Sidebars are designed to live in a
/// [`super::split_panel::SplitPanel`]
#[function_component]
pub fn Sidebar(p: &SidebarProps) -> Html {
    let id = &p.id_prefix;
    let noderef = use_node_ref();

    // The trap-door reports the sidebar's rendered width to its owner via
    // a `ResizeObserver` on the sidebar element, NOT a render effect:
    // width changes are driven by DOM mutations anywhere in the tab
    // subtree (e.g. the window editor staging a long column name into a
    // slot), which need not re-render this component at all. The observer
    // sees every one. `contentRect` (not the border box) is load-bearing:
    // the sizer below is a content child, so ratcheting the border box
    // would feed any sidebar padding back into unbounded growth. A manual
    // divider drag (`width_override`) disables the ratchet until the
    // divider resets.
    let live_props = use_mut_ref(|| (Callback::<f64>::default(), None::<i32>));
    *live_props.borrow_mut() = (p.on_auto_width.clone(), p.width_override);
    use_effect_with((), {
        clone!(noderef, live_props);
        move |_| {
            let closure =
                Closure::<dyn FnMut(js_sys::Array)>::new(move |entries: js_sys::Array| {
                    let (on_auto_width, width_override) = live_props.borrow().clone();
                    if width_override.is_none() {
                        for entry in entries.iter() {
                            let entry: ResizeObserverEntry = entry.unchecked_into();
                            on_auto_width.emit(entry.content_rect().width());
                        }
                    }
                });

            let observer = ResizeObserver::new(closure.as_ref().unchecked_ref());
            let elem = noderef.cast::<HtmlElement>();
            if let Some(elem) = &elem {
                observer.observe(elem);
            }

            move || {
                if let Some(elem) = &elem {
                    observer.unobserve(elem);
                }

                drop(closure);
            }
        }
    });

    let auto_width = if p.width_override.is_none() {
        p.auto_width
    } else {
        0.0
    };

    let width_style = format!("min-width: 200px; width: {}px", auto_width);
    let pin_button = p.on_toggle_pin.as_ref().map(|cb| {
        let onclick = {
            let cb = cb.clone();
            Callback::from(move |_: web_sys::MouseEvent| cb.emit(()))
        };

        let mut class = yew::classes!("sidebar_pin_button");
        if p.is_pinned {
            class.push("is-pinned");
        }

        html! {
            <span
                id={format!("{id}_pin_button")}
                {class}
                title={if p.is_pinned { "Unpin" } else { "Pin" }}
                {onclick}
            />
        }
    });

    html! {
        <>
            <SidebarCloseButton id={format!("{id}_close_button")} on_close_sidebar={&p.on_close} />
            <div class="sidebar_column" id={format!("{id}_sidebar")} ref={noderef}>
                <div class="sidebar_header">
                    <EditableHeader ..p.header_props.clone() />
                    { pin_button }
                </div>
                <div class="sidebar_border" id={format!("{id}_border")} />
                { p.children.iter().collect::<Html>() }
                <div class="sidebar-auto-width" style={width_style} />
            </div>
        </>
    }
}
