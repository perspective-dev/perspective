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

use std::cell::{Cell, RefCell};
use std::ops::Deref;
use std::rc::Rc;

use perspective_client::clone;
use wasm_bindgen::prelude::*;
use web_sys::*;
use yew::html::ImplicitClone;
use yew::prelude::*;

use crate::js::{IntersectionObserver, IntersectionObserverEntry};
use crate::utils::*;
use crate::*;

/// Value-semantic snapshot of the drag/drop state threaded through the
/// component tree for visual feedback (drag-highlight CSS classes).
#[derive(Clone, Debug, PartialEq, Default)]
pub struct DragDropProps {
    /// Column name currently being dragged, if a drag is in progress.
    pub column: Option<String>,
}

#[derive(Clone, Debug)]
struct DragFrom {
    column: String,
    effect: DragEffect,
}

#[derive(Debug)]
struct DragOver {
    target: DragTarget,
    index: usize,
}

#[derive(Debug, Default)]
enum DragState {
    #[default]
    NoDrag,
    DragInProgress(DragFrom),
    DragOverInProgress(DragFrom, DragOver),
}

impl DragState {
    const fn is_drag_in_progress(&self) -> bool {
        !matches!(self, Self::NoDrag)
    }
}

pub type DragEndCallback = Closure<dyn FnMut(DragEvent)>;

pub struct DragDropState {
    drag_state: RefCell<DragState>,
    pub drop_received: PubSub<(String, DragTarget, DragEffect, usize)>,

    /// Injected callback from the root component, replacing the former
    /// `dragstart_received: PubSub` field.
    pub on_dragstart: RefCell<Option<Callback<DragEffect>>>,

    /// Injected callback from the root component, replacing the former
    /// `dragend_received: PubSub` field.
    pub on_dragend: RefCell<Option<Callback<()>>>,

    /// The host `<perspective-viewer>` element, used to attach the fallback
    /// `dragend` listener on a stable DOM node outside the virtual DOM.
    elem: HtmlElement,

    /// Host-level `dragend` listener closure, stored so it can be removed
    /// when a new drag starts.  Attached to `elem` rather than `document`
    /// to keep the listener scoped to this component instance.
    host_dragend: RefCell<Option<DragEndCallback>>,

    drag_target: RefCell<Option<DragTargetState>>,
}

/// The `<perspective-viewer>` drag/drop service, which manages drag/drop user
/// interactions across components.  It is a component-level service, since only
/// one drag/drop action can be executed by the user at a time.
#[derive(Clone)]
pub struct DragDrop(Rc<DragDropState>);

impl DragDrop {
    pub fn new(elem: &HtmlElement) -> Self {
        Self(Rc::new(DragDropState {
            drag_state: Default::default(),
            drop_received: Default::default(),
            on_dragstart: Default::default(),
            on_dragend: Default::default(),
            elem: elem.clone(),
            host_dragend: Default::default(),
            drag_target: Default::default(),
        }))
    }
}

impl Deref for DragDrop {
    type Target = Rc<DragDropState>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl PartialEq for DragDrop {
    fn eq(&self, other: &Self) -> bool {
        Rc::ptr_eq(&self.0, &other.0)
    }
}

impl ImplicitClone for DragDrop {}

impl DragDrop {
    /// Snapshot the drag state as a [`DragDropProps`] value for threading
    /// through the component tree without PubSub subscriptions.
    pub fn to_props(&self) -> DragDropProps {
        DragDropProps {
            column: self.get_drag_column(),
        }
    }

    /// Get the column name currently being drag/dropped.
    pub fn get_drag_column(&self) -> Option<String> {
        match *self.drag_state.borrow() {
            DragState::DragInProgress(DragFrom { ref column, .. })
            | DragState::DragOverInProgress(DragFrom { ref column, .. }, _) => Some(column.clone()),
            _ => None,
        }
    }

    pub fn get_drag_target(&self) -> Option<DragTarget> {
        match *self.drag_state.borrow() {
            DragState::DragInProgress(DragFrom {
                effect: DragEffect::Move(target),
                ..
            })
            | DragState::DragOverInProgress(
                DragFrom {
                    effect: DragEffect::Move(target),
                    ..
                },
                _,
            ) => Some(target),
            _ => None,
        }
    }

    pub fn set_drag_image(&self, event: &DragEvent) -> ApiResult<()> {
        event.stop_propagation();
        if let Some(dt) = event.data_transfer() {
            dt.set_drop_effect("move");
            // dt.set_data("text/plain", "{}").unwrap();
        }

        let original: HtmlElement = event.target().into_apierror()?.unchecked_into();
        let elem: HtmlElement = original
            .children()
            .get_with_index(0)
            .unwrap()
            .clone_node_with_deep(true)?
            .unchecked_into();

        elem.class_list().toggle("snap-drag-image")?;
        original.append_child(&elem)?;
        event.data_transfer().into_apierror()?.set_drag_image(
            &elem,
            event.offset_x(),
            event.offset_y(),
        );

        *self.drag_target.borrow_mut() =
            Some(DragTargetState::new(self.elem.clone(), original.clone()));

        // Drag image does not register correctly unless we wait.
        ApiFuture::spawn(async move {
            request_animation_frame().await;
            original.remove_child(&elem)?;
            Ok(())
        });

        Ok(())
    }

    // Is the drag/drop state currently in `action`?
    pub fn is_dragover(&self, drag_target: DragTarget) -> Option<(usize, String)> {
        match *self.drag_state.borrow() {
            DragState::DragOverInProgress(
                DragFrom { ref column, .. },
                DragOver { target, index },
            ) if target == drag_target => Some((index, column.clone())),
            _ => None,
        }
    }

    pub fn notify_drop(&self, event: &DragEvent) {
        event.prevent_default();
        event.stop_propagation();

        let action = match &*self.drag_state.borrow() {
            DragState::DragOverInProgress(
                DragFrom { column, effect },
                DragOver { target, index },
            ) => Some((column.to_string(), *target, *effect, *index)),
            _ => None,
        };

        self.drag_target.borrow_mut().take();
        *self.drag_state.borrow_mut() = DragState::NoDrag;
        if let Some(action) = action {
            self.drop_received.emit(action);
        }
    }

    /// Start the drag/drop action with the name of the column being dragged.
    pub fn notify_drag_start(&self, column: String, effect: DragEffect) {
        *self.drag_state.borrow_mut() = DragState::DragInProgress(DragFrom { column, effect });
        self.register_host_dragend();
        let emit = self.on_dragstart.borrow().clone();
        ApiFuture::spawn(async move {
            request_animation_frame().await;
            if let Some(cb) = emit {
                cb.emit(effect);
            }

            Ok(())
        });
    }

    /// End the drag/drop action by resetting the state to default.
    pub fn notify_drag_end(&self) {
        if self.drag_state.borrow().is_drag_in_progress() {
            self.drag_target.borrow_mut().take();
            *self.drag_state.borrow_mut() = DragState::NoDrag;
            if let Some(cb) = self.on_dragend.borrow().as_ref() {
                cb.emit(());
            }
        }
    }

    /// Register a `dragend` listener on the host `<perspective-viewer>`
    /// element so that drag-end cleanup fires even when Yew re-renders
    /// remove the original dragged element from the shadow DOM.  The host
    /// element is outside the virtual DOM and therefore stable.
    fn register_host_dragend(&self) {
        // Remove any previously registered listener.
        if let Some(prev) = self.host_dragend.borrow_mut().take() {
            let _ = self
                .elem
                .remove_event_listener_with_callback("dragend", prev.as_ref().unchecked_ref());
        }

        let this = self.clone();
        let closure = Closure::wrap(Box::new(move |_event: DragEvent| {
            this.notify_drag_end();
        }) as Box<dyn FnMut(DragEvent)>);

        self.elem
            .add_event_listener_with_callback("dragend", closure.as_ref().unchecked_ref())
            .unwrap();

        *self.host_dragend.borrow_mut() = Some(closure);
    }

    /// Leave the `action` zone.
    pub fn notify_drag_leave(&self, drag_target: DragTarget) {
        let reset = match *self.drag_state.borrow() {
            DragState::DragOverInProgress(
                DragFrom { ref column, effect },
                DragOver { target, .. },
            ) if target == drag_target => Some((column.clone(), effect)),
            _ => None,
        };

        if let Some((column, effect)) = reset {
            self.notify_drag_start(column, effect);
        }
    }

    // Enter the `action` zone at `index`, which must be <= the number of children
    // in the container.
    pub fn notify_drag_enter(&self, target: DragTarget, index: usize) -> bool {
        let mut drag_state = self.drag_state.borrow_mut();
        let should_render = match &*drag_state {
            DragState::DragOverInProgress(_, drag_to) => {
                drag_to.target != target || drag_to.index != index
            },
            _ => true,
        };

        *drag_state = match &*drag_state {
            DragState::DragOverInProgress(drag_from, _) | DragState::DragInProgress(drag_from) => {
                DragState::DragOverInProgress(drag_from.clone(), DragOver { target, index })
            },
            _ => DragState::NoDrag,
        };

        should_render
    }
}

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
struct DragTargetState {
    target: HtmlElement,
    shadow_root: ShadowRoot,
    alive: Rc<Cell<bool>>,
    observer: IntersectionObserver,
}

impl DragTargetState {
    fn new(host: HtmlElement, target: HtmlElement) -> Self {
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
