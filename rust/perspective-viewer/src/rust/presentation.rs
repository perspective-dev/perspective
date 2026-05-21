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

mod column_locator;
pub mod drag_helpers;
mod props;
mod sheets;

use std::cell::RefCell;
use std::collections::HashSet;
use std::ops::Deref;
use std::rc::Rc;

use async_lock::Mutex;
use perspective_js::utils::*;
use wasm_bindgen::prelude::*;
use web_sys::*;
use yew::html::ImplicitClone;
use yew::prelude::*;

pub use self::column_locator::{ColumnLocator, ColumnSettingsTab, ColumnTab, OpenColumnSettings};
use self::drag_helpers::DragTargetState;
pub use self::drag_helpers::{DragDropContainer, DragEndCallback};
pub use self::props::{DragDropProps, PresentationProps};
use crate::utils::*;

/// The available themes as detected in the browser environment or set
/// explicitly when CORS prevents detection.  Detection is expensive and
/// typically must be performed only once, when `document.styleSheets` is
/// up-to-date.
#[derive(Default)]
struct ThemeData {
    themes: Option<Vec<String>>,
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

/// Actual presentations tate struct with some fields hidden.
pub struct PresentationHandle {
    viewer_elem: HtmlElement,
    theme_data: Mutex<ThemeData>,
    is_settings_open: RefCell<bool>,
    open_column_settings: RefCell<OpenColumnSettings>,
    is_workspace: RefCell<Option<bool>>,

    /// Drag/drop in-progress state. Empty (`NoDrag`) when no user drag is
    /// active. Mutated by `notify_drag_*` / `notify_drop`; read by component
    /// CSS-class derivations (`is_dragover`, `get_drag_column`).
    drag_state: RefCell<DragState>,
    pub drop_received: PubSub<(String, DragTarget, DragEffect, usize)>,

    /// Injected callback from the root component fired after a drag begins
    /// (one frame later, to let the drag image latch). Replaces the former
    /// `dragstart_received: PubSub` field on `DragDrop`.
    pub on_dragstart: RefCell<Option<Callback<DragEffect>>>,

    /// Injected callback from the root component fired when the drag ends,
    /// regardless of drop outcome.
    pub on_dragend: RefCell<Option<Callback<()>>>,

    /// Host-level `dragend` listener closure, attached to `viewer_elem` to
    /// guarantee `dragend` fires even when virtual DOM updates remove the
    /// dragged element from the shadow tree.
    host_dragend: RefCell<Option<DragEndCallback>>,

    /// IntersectionObserver-based fallback for the drag image, kept alive for
    /// the duration of the drag.
    drag_target: RefCell<Option<DragTargetState>>,

    /// Per-element dedup cell for `perspective-config-update` event
    /// dispatch. Read+written by `crate::custom_events::dispatch_*`
    /// helpers; living here means every consumer with a `&Presentation`
    /// (subscriptions in `wire_custom_events`, `tasks::send_plugin_config`,
    /// `setSelection`) sees the same cache without separate plumbing.
    pub last_dispatched_config: RefCell<Option<crate::config::ViewerConfig>>,

    pub settings_open_changed: PubSub<bool>,

    /// Injected callback from the root component, replacing the former
    /// `is_workspace_changed: PubSub` field.
    pub on_is_workspace_changed: RefCell<Option<Callback<bool>>>,
    pub settings_before_open_changed: PubSub<bool>,
    pub column_settings_open_changed: PubSub<(bool, Option<String>)>,
    pub theme_config_updated: PubSub<(PtrEqRc<Vec<String>>, Option<usize>)>,
    pub on_eject: PubSub<()>,

    /// Fires for status-bar / main-panel pointer events that target the
    /// statusbar element. `wire_custom_events` formats the `PointerEvent`'s
    /// `type_()` into a `perspective-statusbar-{type}` `CustomEvent` name.
    pub statusbar_pointer_event: PubSub<PointerEvent>,
}

/// State object responsible for the non-persistable/gui element state,
/// including Themes, panel open state and realtive size, title, etc.
#[derive(Clone)]
pub struct Presentation(Rc<PresentationHandle>);

impl PartialEq for Presentation {
    fn eq(&self, other: &Self) -> bool {
        Rc::ptr_eq(&self.0, &other.0)
    }
}

impl Deref for Presentation {
    type Target = PresentationHandle;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl ImplicitClone for Presentation {}

impl Presentation {
    pub fn new(elem: &HtmlElement) -> Self {
        let theme = Self(Rc::new(PresentationHandle {
            viewer_elem: elem.clone(),
            theme_data: Default::default(),
            is_workspace: Default::default(),
            settings_open_changed: Default::default(),
            settings_before_open_changed: Default::default(),
            column_settings_open_changed: Default::default(),
            on_is_workspace_changed: Default::default(),
            is_settings_open: Default::default(),
            open_column_settings: Default::default(),
            theme_config_updated: PubSub::default(),
            on_eject: PubSub::default(),
            statusbar_pointer_event: PubSub::default(),
            last_dispatched_config: Default::default(),
            drag_state: Default::default(),
            drop_received: Default::default(),
            on_dragstart: Default::default(),
            on_dragend: Default::default(),
            host_dragend: Default::default(),
            drag_target: Default::default(),
        }));

        ApiFuture::spawn(theme.clone().init());
        theme
    }

    pub fn viewer_elem(&self) -> &HtmlElement {
        &self.viewer_elem
    }

    pub fn is_visible(&self) -> bool {
        self.viewer_elem
            .offset_parent()
            .map(|x| !x.is_null())
            .unwrap_or(false)
    }

    pub fn is_active(&self, elem: &Option<Element>) -> bool {
        elem.is_some() && &self.viewer_elem.shadow_root().unwrap().active_element() == elem
    }

    pub fn reset_attached(&self) {
        *self.0.is_workspace.borrow_mut() = None;
        if let Some(cb) = self.on_is_workspace_changed.borrow().as_ref() {
            cb.emit(self.get_is_workspace());
        }
    }

    pub fn get_is_workspace(&self) -> bool {
        if self.is_workspace.borrow().is_none() {
            if !self.viewer_elem.is_connected() {
                return false;
            }

            let is_workspace = self
                .viewer_elem
                .parent_element()
                .map(|x| x.tag_name() == "PERSPECTIVE-WORKSPACE")
                .unwrap_or_default();

            *self.is_workspace.borrow_mut() = Some(is_workspace);
        }

        self.is_workspace.borrow().unwrap()
    }

    pub fn set_settings_attribute(&self, opt: bool) {
        self.viewer_elem
            .toggle_attribute_with_force("settings", opt)
            .unwrap();
    }

    pub fn is_settings_open(&self) -> bool {
        *self.is_settings_open.borrow()
    }

    pub fn set_settings_before_open(&self, open: bool) {
        if *self.is_settings_open.borrow() != open {
            *self.is_settings_open.borrow_mut() = open;
            self.set_settings_attribute(open);
            self.settings_before_open_changed.emit(open);
        }
    }

    pub fn set_settings_open(&self, open: bool) {
        self.settings_open_changed.emit(open);
    }

    /// Sets the currently opened column settings. Emits an internal event on
    /// change. Passing None is a shorthand for setting all fields to
    /// None.
    pub fn set_open_column_settings(&self, settings: Option<OpenColumnSettings>) {
        let settings = settings.unwrap_or_default();
        if *(self.open_column_settings.borrow()) != settings {
            settings.clone_into(&mut *self.open_column_settings.borrow_mut());
            self.column_settings_open_changed
                .emit((true, settings.name()));
        }
    }

    /// Gets a clone of the current OpenColumnSettings.
    pub fn get_open_column_settings(&self) -> OpenColumnSettings {
        self.open_column_settings.borrow().deref().clone()
    }

    async fn init(self) -> ApiResult<()> {
        self.set_theme_attribute(self.get_selected_theme_name().await.as_deref())
    }

    /// Get the available theme names from the browser environment by parsing
    /// readable stylesheets.  This method is memoized - the state can be
    /// flushed by calling `reset()`.
    pub async fn get_available_themes(&self) -> ApiResult<PtrEqRc<Vec<String>>> {
        let mut data = self.0.theme_data.lock().await;
        if data.themes.is_none() {
            await_dom_loaded().await?;
            let themes = sheets::get_theme_names(&self.0.viewer_elem)?;
            data.themes = Some(themes);
        }

        Ok(data.themes.clone().unwrap().into())
    }

    /// Reset the state.  `styleSheets` will be re-parsed next time
    /// `get_themes()` is called if the `themes` argument is `None`.
    ///
    /// # Returns
    /// A `bool` indicating whether the internal state changed.
    pub async fn reset_available_themes(&self, themes: Option<Vec<String>>) -> bool {
        fn as_set(x: &Option<Vec<String>>) -> HashSet<&'_ String> {
            x.as_ref()
                .map(|x| x.iter().collect::<HashSet<_>>())
                .unwrap_or_default()
        }

        let mut mutex = self.0.theme_data.lock().await;
        let changed = as_set(&mutex.themes) != as_set(&themes);
        mutex.themes = themes;
        changed
    }

    pub async fn get_selected_theme_config(
        &self,
    ) -> ApiResult<(PtrEqRc<Vec<String>>, Option<usize>)> {
        let themes = self.get_available_themes().await?;
        let name = self.0.viewer_elem.get_attribute("theme");
        let index = name
            .and_then(|x| themes.iter().position(|y| y == &x))
            .or(if !themes.is_empty() { Some(0) } else { None });

        Ok((themes, index))
    }

    /// Returns the currently applied theme, or the default theme if no theme
    /// has been set and themes are detected in the `document`, or `None` if
    /// no themes are available.
    pub async fn get_selected_theme_name(&self) -> Option<String> {
        let (themes, index) = self.get_selected_theme_config().await.ok()?;
        index.and_then(|x| themes.get(x).cloned())
    }

    fn set_theme_attribute(&self, theme: Option<&str>) -> ApiResult<()> {
        if let Some(theme) = theme {
            Ok(self.0.viewer_elem.set_attribute("theme", theme)?)
        } else {
            Ok(self.0.viewer_elem.remove_attribute("theme")?)
        }
    }

    pub async fn reset_theme(&self) -> ApiResult<()> {
        *self.0.is_workspace.borrow_mut() = None;
        let themes = self.get_available_themes().await?;
        let default_theme = themes.first().map(|x| x.as_str());
        self.set_theme_name(default_theme).await?;
        Ok(())
    }

    /// Set the theme by name, or `None` for the default theme.
    ///
    /// # Returns
    /// A `bool` indicating whether the internal state changed.
    pub async fn set_theme_name(&self, theme: Option<&str>) -> ApiResult<bool> {
        let (themes, selected) = self.get_selected_theme_config().await?;
        if let Some(x) = selected
            && themes.get(x).map(|x| x.as_str()) == theme
        {
            return Ok(false);
        }

        let index = if let Some(theme) = theme {
            self.set_theme_attribute(Some(theme))?;
            themes.iter().position(|x| x == theme)
        } else if !themes.is_empty() {
            self.set_theme_attribute(themes.first().map(|x| x.as_str()))?;
            Some(0)
        } else {
            self.set_theme_attribute(None)?;
            None
        };

        self.theme_config_updated.emit((themes, index));
        Ok(true)
    }

    /// Snapshot the drag state as a [`DragDropProps`] value for threading
    /// through the component tree without PubSub subscriptions.
    pub fn drag_drop_props(&self) -> DragDropProps {
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

        *self.drag_target.borrow_mut() = Some(DragTargetState::new(
            self.viewer_elem.clone(),
            original.clone(),
        ));

        // Drag image does not register correctly unless we wait.
        ApiFuture::spawn(async move {
            request_animation_frame().await;
            original.remove_child(&elem)?;
            Ok(())
        });

        Ok(())
    }

    /// Is the drag/drop state currently in `action`?
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
        if let Some(prev) = self.host_dragend.borrow_mut().take() {
            let _ = self
                .viewer_elem
                .remove_event_listener_with_callback("dragend", prev.as_ref().unchecked_ref());
        }

        let this = self.clone();
        let closure = Closure::wrap(Box::new(move |_event: DragEvent| {
            this.notify_drag_end();
        }) as Box<dyn FnMut(DragEvent)>);

        self.viewer_elem
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

    /// Enter the `action` zone at `index`, which must be <= the number of
    /// children in the container.
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

    /// Snapshot the current presentation state as a [`PresentationProps`]
    /// value suitable for passing as a Yew prop.  Called by the root component
    /// whenever a presentation-related PubSub event fires.
    ///
    /// `available_themes` must be provided by the caller because theme
    /// detection is async and therefore not available synchronously here.
    pub fn to_props(&self, available_themes: PtrEqRc<Vec<String>>) -> PresentationProps {
        let theme_attr = self.0.viewer_elem.get_attribute("theme");
        let selected_theme = theme_attr.as_deref().and_then(|name| {
            available_themes
                .iter()
                .find(|x| x.as_str() == name)
                .cloned()
        });

        PresentationProps {
            is_settings_open: self.is_settings_open(),
            available_themes,
            selected_theme,
            open_column_settings: self.get_open_column_settings(),
            is_workspace: self.get_is_workspace(),
        }
    }
}
