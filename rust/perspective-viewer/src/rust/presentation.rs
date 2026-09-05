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

use std::cell::{Cell, RefCell};
use std::collections::{BTreeMap, HashSet};
use std::ops::Deref;
use std::rc::Rc;

use async_lock::Mutex;
use perspective_js::utils::*;
use wasm_bindgen::prelude::*;
use web_sys::*;
use yew::html::ImplicitClone;
use yew::prelude::*;

pub use self::column_locator::{
    ColumnLocator, ColumnSettingsTab, ColumnSettingsTarget, ColumnTab, OpenColumnSettings,
};
pub use self::drag_helpers::{DragDropContainer, DragEndCallback};
use self::drag_helpers::{
    DragTargetState, PointerDownCallback, clear_document_selection, closest_draggable,
};
pub use self::props::{DragDropProps, PresentationProps};
use crate::config::{CssKind, NamedValue, assign_palette_names};
use crate::utils::*;

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

    /// The embedded LLM agent's shared model (runtime + chat transcript) —
    /// carried here so the settings sidebar can render the chat tab without
    /// threading a new prop chain from the element.
    #[cfg(feature = "llm-agent")]
    pub agent: crate::agent::AgentSlot,

    /// The available themes as detected in the browser environment or set
    /// explicitly when CORS prevents detection — a MEMO of a document
    /// external, not component state. `None` until first parsed (detection
    /// is expensive and must wait for `document.styleSheets`). Sync-readable
    /// (a `RefCell`, never borrowed across an await) so synchronous paths
    /// ("stamp with commit" — panel creation, theme mutation sites) can
    /// derive the registry default without awaiting registry init; derived
    /// values (e.g. the default theme = first registered) are computed from
    /// it on demand, never mirrored.
    themes: RefCell<Option<Vec<String>>>,

    /// Single-flight guard for the stylesheet parse that populates
    /// [`Self::themes`] (and exclusion against `reset_available_themes`) —
    /// concurrent `get_available_themes` calls await one parse instead of
    /// racing their own.
    theme_init: Mutex<()>,

    /// Whether the host's theme was ever EXPLICITLY chosen — authored as a
    /// `theme` attribute, or set by name through [`Self::set_theme_name`].
    ///
    /// `false` means the host merely displays the registry default, which
    /// [`Self::reset_themes`] is free to move; `true` pins the selection
    /// until it leaves the registry. The `theme` attribute alone cannot
    /// carry this, because `init` stamps it unconditionally so the document
    /// cascade has a theme to match.
    theme_selected: Cell<bool>,

    palette: RefCell<BTreeMap<String, String>>,
    is_settings_open: RefCell<bool>,
    open_column_settings: RefCell<OpenColumnSettings>,
    is_workspace: RefCell<Option<bool>>,

    collapsed_control_groups: RefCell<HashSet<String>>,

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

    /// Host-level `pointerdown` listener that clears a stale page selection
    /// before it can turn a row drag into a browser selection drag.
    host_pointerdown: RefCell<Option<PointerDownCallback>>,

    source_dragend: RefCell<Option<(web_sys::EventTarget, DragEndCallback)>>,

    /// IntersectionObserver-based fallback for the drag image, kept alive for
    /// the duration of the drag.
    drag_target: RefCell<Option<DragTargetState>>,

    /// `(open, announce)` — `announce` says this toggle is the SOLE carrier
    /// of the config change (a user gesture: toolbar, `toggleConfig`), so
    /// the element must emit `toggle-settings` + a config-update for it. An
    /// API restore's toggle is announced by its own view-config commit
    /// dispatch instead — announcing here too would double-emit, the first
    /// carrying the intermediate config (settings flipped, view fields not
    /// yet committed).
    pub settings_open_changed: PubSub<(bool, bool)>,

    /// Injected callback from the root component, replacing the former
    /// `is_workspace_changed: PubSub` field.
    pub on_is_workspace_changed: RefCell<Option<Callback<bool>>>,
    pub settings_before_open_changed: PubSub<bool>,
    pub column_settings_open_changed: PubSub<(bool, Option<String>)>,
    pub theme_config_updated: PubSub<(PtrEqRc<Vec<String>>, Option<usize>)>,
    pub on_eject: PubSub<()>,

    /// Fires for status-bar / main-panel pointer events that target the
    /// statusbar element. `wire_element_events` formats the `PointerEvent`'s
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
            #[cfg(feature = "llm-agent")]
            agent: Default::default(),
            themes: Default::default(),
            theme_init: Default::default(),
            theme_selected: Cell::new(elem.get_attribute("theme").is_some()),
            palette: Default::default(),
            is_workspace: Default::default(),
            settings_open_changed: Default::default(),
            settings_before_open_changed: Default::default(),
            column_settings_open_changed: Default::default(),
            on_is_workspace_changed: Default::default(),
            is_settings_open: Default::default(),
            open_column_settings: Default::default(),
            collapsed_control_groups: Default::default(),
            theme_config_updated: PubSub::default(),
            on_eject: PubSub::default(),
            statusbar_pointer_event: PubSub::default(),
            drag_state: Default::default(),
            drop_received: Default::default(),
            on_dragstart: Default::default(),
            on_dragend: Default::default(),
            host_dragend: Default::default(),
            host_pointerdown: Default::default(),
            source_dragend: Default::default(),
            drag_target: Default::default(),
        }));

        theme.register_host_pointerdown();
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

    /// See [`PresentationHandle::settings_open_changed`] for `announce`.
    pub fn set_settings_open(&self, open: bool, announce: bool) {
        self.settings_open_changed.emit((open, announce));
    }

    /// Sets the currently opened column settings. Emits an internal event on
    /// change. Passing None is a shorthand for setting all fields to
    /// None.
    /// The workspace palette as last restored (canonical values).
    pub fn palette(&self) -> BTreeMap<String, String> {
        self.0.palette.borrow().clone()
    }

    /// Replace the host palette: every previously-applied `--psp-user--*`
    /// inline property is removed, then `palette` is applied.
    pub fn set_palette(&self, palette: BTreeMap<String, String>) -> ApiResult<()> {
        let style = self.0.viewer_elem.style();
        for name in self.0.palette.borrow().keys() {
            style.remove_property(name)?;
        }

        for (name, value) in &palette {
            style.set_property(name, value)?;
        }

        *self.0.palette.borrow_mut() = palette;
        Ok(())
    }

    /// Pin `literal` into the restored palette, named by the same rules
    /// as the derived set and applied to the host.
    pub fn pin_style(&self, kind: CssKind, literal: &str) -> ApiResult<()> {
        let Ok(value) = kind.canonicalize(literal) else {
            return Ok(());
        };

        let current = self.palette();
        let host = self.host_named_values(kind);
        let set = assign_palette_names(&current, &host, &[(kind, value)], &|name| {
            self.resolve_css_var(name).is_some()
        });

        let style = self.0.viewer_elem.style();
        for (name, value) in &set {
            if !current.contains_key(name) {
                style.set_property(name, value)?;
            }
        }

        *self.0.palette.borrow_mut() = set;
        Ok(())
    }

    /// The host's computed value for custom property `name` (inline
    /// palette, then theme/page stylesheets), or `None` if undefined.
    pub fn resolve_css_var(&self, name: &str) -> Option<String> {
        read_custom_property(&self.0.viewer_elem, name)
    }

    /// Theme/page-authored named values of `kind` on the host, canonical,
    /// discovered by the contiguous-numbering walk `--psp-user--<kind>-1`,
    /// `-2`, … up to the first undefined name.
    pub fn host_named_values(&self, kind: CssKind) -> Vec<NamedValue> {
        let mut out = vec![];
        for n in 1.. {
            let name = format!("{}{n}", kind.var_prefix());
            let Some(raw) = self.resolve_css_var(&name) else {
                break;
            };

            if let Ok(value) = kind.canonicalize(&raw) {
                out.push(NamedValue { name, value });
            }
        }

        out
    }

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

    pub fn is_control_group_collapsed(&self, key: &str) -> bool {
        self.collapsed_control_groups.borrow().contains(key)
    }

    pub fn set_control_group_collapsed(&self, key: &str, collapsed: bool) {
        if collapsed {
            self.collapsed_control_groups
                .borrow_mut()
                .insert(key.to_owned());
        } else {
            self.collapsed_control_groups.borrow_mut().remove(key);
        }
    }

    async fn init(self) -> ApiResult<()> {
        self.set_theme_attribute(self.get_selected_theme_name().await.as_deref())
    }

    /// Get the available theme names from the browser environment by parsing
    /// readable stylesheets.  This method is memoized - the state can be
    /// flushed by calling `reset()`.
    pub async fn get_available_themes(&self) -> ApiResult<PtrEqRc<Vec<String>>> {
        let _guard = self.0.theme_init.lock().await;
        if self.0.themes.borrow().is_none() {
            await_dom_loaded().await?;
            let themes = sheets::get_theme_names(&self.0.viewer_elem)?;
            *self.0.themes.borrow_mut() = Some(themes);
        }

        Ok(self.0.themes.borrow().clone().unwrap().into())
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

        let _guard = self.0.theme_init.lock().await;
        let changed = as_set(&self.0.themes.borrow()) != as_set(&themes);
        *self.0.themes.borrow_mut() = themes;
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

    /// The theme a NEW panel is born with: the host's if it has one, else
    /// the registry default. Synchronous, because panel creation is — the
    /// registry fallback is `None` until the registry first parses, which
    /// [`crate::tasks::seed_panel_theme`] fills in.
    pub fn active_theme_name_sync(&self) -> Option<String> {
        self.0
            .viewer_elem
            .get_attribute("theme")
            .or_else(|| self.0.themes.borrow().as_ref()?.first().cloned())
    }

    /// The registry default — the FIRST registered theme, which a panel or
    /// host resolves to only when it has no theme of its own. `None` if no
    /// themes exist.
    pub async fn get_default_theme_name(&self) -> Option<String> {
        self.get_available_themes().await.ok()?.first().cloned()
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
        self.set_theme_name(None).await?;
        Ok(())
    }

    /// Adopt `themes` as the available set, KEEPING the host's theme unless
    /// it was never explicitly chosen or has left the set — the only two
    /// cases in which re-ordering the registry may move the viewer.
    ///
    /// Always re-stamps; the caller publishes ([`Self::publish_theme_config`])
    /// once its restyles have resolved, because the available list has
    /// changed even when the selection has not.
    ///
    /// @param themes the new set, or `None` to re-parse the document.
    ///
    /// # Returns
    /// The active theme after the change.
    pub async fn reset_themes(&self, themes: Option<Vec<String>>) -> ApiResult<Option<String>> {
        let selected = self
            .0
            .theme_selected
            .get()
            .then(|| self.0.viewer_elem.get_attribute("theme"))
            .flatten();

        self.reset_available_themes(themes).await;
        let available = self.get_available_themes().await?;
        let kept = selected.filter(|name| available.contains(name));
        self.0.theme_selected.set(kept.is_some());
        let active = kept.or_else(|| available.first().cloned());
        self.set_theme_attribute(active.as_deref())?;
        Ok(active)
    }

    /// Set the theme by name, or `None` for the default theme.
    ///
    /// A NAMED theme's host attribute write is SYNCHRONOUS ("stamp with
    /// commit") — no await separates the caller's config commit from the
    /// attribute the document cascade styles, so a slow theme-registry
    /// init can no longer hold the host on the former theme while e.g. an
    /// initial `restore()`'s first draw resolves. The registry-dependent
    /// tail (theme-list resolution + `theme_config_updated`) follows
    /// asynchronously. `None` (reset to the registry default) still
    /// resolves through the registry first, as the default name is not
    /// knowable synchronously on a cold cache.
    ///
    /// The attribute is stamped even when the requested name is not (yet)
    /// a registered theme — matching the prior behavior for unknown
    /// names, and additionally making an explicitly-requested name that
    /// HAPPENS to be the registry default explicit on the element (the
    /// old resolved-selection no-op left it absent).
    ///
    /// # Returns
    /// A `bool` indicating whether the internal state changed.
    pub async fn set_theme_name(&self, theme: Option<&str>) -> ApiResult<bool> {
        self.0.theme_selected.set(theme.is_some());
        if let Some(theme) = theme {
            if self.0.viewer_elem.get_attribute("theme").as_deref() == Some(theme) {
                return Ok(false);
            }

            self.set_theme_attribute(Some(theme))?;
        }

        let themes = self.get_available_themes().await?;
        if theme.is_none() {
            self.set_theme_attribute(themes.first().map(|x| x.as_str()))?;
        }

        Ok(true)
    }

    /// Publish the `theme_config_updated` snapshot — the available themes
    /// and the host's current selection — to the component tree.
    pub async fn publish_theme_config(&self) -> ApiResult<()> {
        let themes = self.get_available_themes().await?;
        let index = self
            .0
            .viewer_elem
            .get_attribute("theme")
            .and_then(|active| themes.iter().position(|x| *x == active));

        self.theme_config_updated.emit((themes, index));
        Ok(())
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

    /// Claim a `dragstart` for the column drag machinery, returning `false`
    /// (cancelling the native drag) when it did not originate on a
    /// `draggable="true"` row or installation failed.
    pub fn set_drag_image(&self, event: &DragEvent) -> bool {
        match self.try_set_drag_image(event) {
            Ok(true) => true,
            Ok(false) => {
                event.prevent_default();
                if let Err(e) = clear_document_selection() {
                    web_sys::console::warn_1(&e.into());
                }

                false
            },
            Err(e) => {
                event.prevent_default();
                web_sys::console::warn_1(&e.into());
                false
            },
        }
    }

    fn try_set_drag_image(&self, event: &DragEvent) -> ApiResult<bool> {
        event.stop_propagation();
        let Some(original) = closest_draggable(event) else {
            return Ok(false);
        };

        let is_row_drag = event
            .target()
            .and_then(|target| target.dyn_into::<Node>().ok())
            .map(|target| original.is_same_node(Some(&target)))
            .unwrap_or(false);

        if !is_row_drag {
            return Ok(false);
        }

        self.register_source_dragend(event)?;
        if let Some(dt) = event.data_transfer() {
            dt.set_drop_effect("move");
        }

        let elem: HtmlElement = original
            .children()
            .get_with_index(0)
            .into_apierror()?
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

        Ok(true)
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

        self.end_drag();
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
            self.end_drag();
        }
    }

    fn end_drag(&self) {
        self.drag_target.borrow_mut().take();
        *self.drag_state.borrow_mut() = DragState::NoDrag;
        if let Some(cb) = self.on_dragend.borrow().as_ref() {
            cb.emit(());
        }
    }

    /// Register a `dragend` listener on the host `<perspective-viewer>`
    /// element so that drag-end cleanup fires even when Yew re-renders
    /// remove the original dragged element from the shadow DOM.  The host
    /// element is outside the virtual DOM and therefore stable.
    fn register_source_dragend(&self, event: &DragEvent) -> ApiResult<()> {
        let target = event.target().into_apierror()?;
        if let Some((prev_target, prev)) = self.source_dragend.borrow_mut().take() {
            let _ = prev_target
                .remove_event_listener_with_callback("dragend", prev.as_ref().unchecked_ref());
        }

        let this = self.clone();
        let closure = Closure::wrap(Box::new(move |_event: DragEvent| {
            this.notify_drag_end();
        }) as Box<dyn FnMut(DragEvent)>);

        target.add_event_listener_with_callback("dragend", closure.as_ref().unchecked_ref())?;
        *self.source_dragend.borrow_mut() = Some((target, closure));
        Ok(())
    }

    fn register_host_pointerdown(&self) {
        let closure = Closure::wrap(Box::new(move |event: PointerEvent| {
            if closest_draggable(&event).is_some()
                && let Err(e) = clear_document_selection()
            {
                web_sys::console::warn_1(&e.into());
            }
        }) as Box<dyn FnMut(PointerEvent)>);

        self.viewer_elem
            .add_event_listener_with_callback("pointerdown", closure.as_ref().unchecked_ref())
            .unwrap();

        *self.host_pointerdown.borrow_mut() = Some(closure);
    }

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
