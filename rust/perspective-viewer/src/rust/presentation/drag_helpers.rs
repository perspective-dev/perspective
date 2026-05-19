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

use std::cell::Cell;
use std::rc::Rc;

use perspective_client::clone;
use perspective_js::utils::*;
use wasm_bindgen::prelude::*;
use web_sys::*;
use yew::prelude::*;

use crate::js::{IntersectionObserver, IntersectionObserverEntry};

pub type DragEndCallback = Closure<dyn FnMut(DragEvent)>;

/// Safari does not set `relatedTarget` on `"dragleave"`, which makes it
/// impossible to determine whether a logical drag leave has happened with just
/// this event, so use function on `"dragenter"` to capture the `relatedTarget`.
pub fn dragenter_helper(callback: impl Fn() + 'static, target: NodeRef) -> Callback<DragEvent> {
    Callback::from({
        move |event: DragEvent| {
            let r = (|| -> ApiResult<()> {
                event.stop_propagation();
                event.prevent_default();
                if event.related_target().is_none() {
                    target
                        .cast::<HtmlElement>()
                        .into_apierror()?
                        .dataset()
                        .set("safaridragleave", "true")?;
                }
                Ok(())
            })();

            if let Err(e) = r {
                web_sys::console::warn_1(&e.into());
            }

            callback();
        }
    })
}

/// HTML drag/drop will fire a bubbling `dragleave` event over all children of a
/// `dragleave`-listened-to element, so we need to filter out the events from
/// the children elements with this esoteric DOM arcana.
pub fn dragleave_helper(callback: impl Fn() + 'static, drag_ref: NodeRef) -> Callback<DragEvent> {
    Callback::from({
        clone!(drag_ref);
        move |event: DragEvent| {
            let r = (|| -> ApiResult<()> {
                event.stop_propagation();
                event.prevent_default();

                let mut related_target = event
                    .related_target()
                    .or_else(|| Some(JsValue::UNDEFINED.unchecked_into::<EventTarget>()))
                    .and_then(|x| x.dyn_into::<Element>().ok());

                // This is a wild chrome bug. `dragleave` can fire with the `relatedTarget`
                // property set to an element inside the closed `ShadowRoot` hosted by a
                // browser-native `<select>` tag, which fails the `.contains()` check
                // below.  This mystery `ShadowRoot` has a structure that looks like this
                // (tested in Chrome 92), which we try to detect as best we can below.
                //
                // ```html
                // <div aria-hidden="true">Selected Text Here</siv>
                // <slot name="user-agent-custom-assign-slot"></slot>
                // ```
                //
                // This is pretty course though, since there is no guarantee this structure
                // will be maintained in future Chrome versions; the `.expect()` in this
                // method chain should at least warn us if this regresses.
                //
                // Wait - you don't believe me?  Throw a debugger statement inside this
                // conditional and drag a column over a pivot-mode active columns list.
                if related_target
                    .as_ref()
                    .map(|x| x.has_attribute("aria-hidden"))
                    .unwrap_or_default()
                {
                    related_target = Some(
                        related_target
                            .into_apierror()?
                            .parent_node()
                            .into_apierror()?
                            .dyn_ref::<ShadowRoot>()
                            .ok_or_else(|| JsValue::from("Chrome drag/drop bug detection failed"))?
                            .host()
                            .unchecked_into::<Element>(),
                    )
                }

                let current_target = drag_ref.cast::<HtmlElement>().unwrap();
                match related_target {
                    Some(ref related) => {
                        // Due to virtual dom these events sometimes fire after
                        // the node is removed ...
                        if !current_target.contains(Some(related))
                            && related.parent_element().is_some()
                        {
                            callback();
                        }
                    },
                    None => {
                        // Safari (OSX and iOS) don't set `relatedTarget`, so we need to
                        // read a memoized value from the `"dragenter"` event.
                        let dataset = current_target.dataset();
                        if dataset.get("safaridragleave").is_some() {
                            dataset.delete("safaridragleave");
                        } else {
                            callback();
                        }
                    },
                };
                Ok(())
            })();

            if let Err(e) = r {
                web_sys::console::warn_1(&e.into());
            }
        }
    })
}

#[derive(Clone)]
pub struct DragDropContainer {
    pub noderef: NodeRef,
    pub dragenter: Callback<DragEvent>,
    pub dragleave: Callback<DragEvent>,
}

impl DragDropContainer {
    pub fn new<F: Fn() + 'static, G: Fn() + 'static>(ondragenter: F, ondragleave: G) -> Self {
        let noderef = NodeRef::default();
        Self {
            dragenter: dragenter_helper(ondragenter, noderef.clone()),
            dragleave: dragleave_helper(ondragleave, noderef.clone()),
            noderef,
        }
    }
}

/// A really, really unfortunate hack that is needed to guarantee that `dragend`
/// is called even under aggressive DOM mutation after `dragstart` is fired.
pub(super) struct DragTargetState {
    target: HtmlElement,
    shadow_root: ShadowRoot,
    alive: Rc<Cell<bool>>,
    observer: IntersectionObserver,
}

impl DragTargetState {
    pub(super) fn new(host: HtmlElement, target: HtmlElement) -> Self {
        let shadow_root = host.shadow_root().unwrap();
        let alive = Rc::new(Cell::new(true));
        let observer = IntersectionObserver::new(
            &Closure::<dyn FnMut(js_sys::Array)>::new({
                clone!(target, shadow_root, alive);
                move |records: js_sys::Array| {
                    if !alive.get() {
                        return;
                    }

                    for record in records.iter() {
                        let record: IntersectionObserverEntry = record.unchecked_into();
                        if !record.is_intersecting() {
                            shadow_root.append_child(&target).unwrap();
                            return;
                        }
                    }
                }
            })
            .into_js_value()
            .unchecked_into(),
        );

        observer.observe(target.as_ref());
        Self {
            target,
            shadow_root,
            alive,
            observer,
        }
    }
}

impl Drop for DragTargetState {
    fn drop(&mut self) {
        self.alive.set(false);
        self.observer.unobserve(&self.target);
        if self.target.is_connected() {
            let _ = self.shadow_root.remove_child(&self.target);
        }
    }
}
