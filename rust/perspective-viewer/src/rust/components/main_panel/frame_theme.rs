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

//! `MainPanel::stamp_frame_themes`: mirror each panel's effective theme
//! *background* onto its `<regular-layout-frame>`.
//!
//! The frames live in the viewer's shadow DOM, so the document theme rules
//! (`perspective-viewer [theme="X"]`) can never match them — the
//! `--psp--background-color` their `::part(container)` background resolves
//! (viewer.css) inherits down from the viewer host, i.e. always the *host*
//! theme. A frame is normally covered by its slotted plugin (which paints its
//! own per-panel themed background), but while the plugin is missing — not yet
//! mounted, first draw pending, or torn down — the host-theme container shows
//! through a panel themed differently, as a visible artifact.
//!
//! There is no native cascade channel from the light-DOM plugin to the frame
//! (siblings in the flattened tree), so the value is mirrored imperatively:
//! each panel's *plugin element* — light-DOM, slotted under the panel's slot,
//! mounted eagerly at panel creation (`create_panel_model` /
//! `Renderer::mount_active_plugin`) — is where the document theme rules
//! actually resolve, so its computed `--psp--background-color` is copied onto
//! the frame's inline style, where the frame's shadow parts inherit it. The
//! plugin is the ONLY sound source element:
//!
//! - An owned hidden probe child of the viewer does NOT work: an *unslotted*
//!   light-DOM child of a shadow host is outside the flattened tree, and
//!   `getComputedStyle` returns all-empty for it even though the document rules
//!   match it syntactically (selector matching is DOM-tree; style computation
//!   is flat-tree).
//! - The `<perspective-viewer-tab>` is slotted, but stamps its own `theme` attr
//!   in `PanelTab::rendered` — an unordered sibling lifecycle relative to this
//!   pass (the theme-stamp-lag class of bug).
//! - The plugin's `theme` attr, by contrast, is stamped *synchronously at the
//!   mutation sites* (`update_theme`, `restorePanel`, …) before the events that
//!   schedule this render, so it is current when this pass reads it.
//!
//! A read is trusted ONLY when the plugin's stamped attr equals the theme
//! being mirrored: a freshly-created panel's plugin is mounted *unstamped*
//! (the attr first lands inside its first locked dispatch), and reading it
//! early would silently mirror the HOST theme's values. Trusted reads seed
//! [`MainPanel::theme_backgrounds`], the fallback for frames with no readable
//! plugin (an unregistered plugin name stays lazily unmounted; plugin-switch
//! and teardown transients). A frame with neither leaves the pass gate
//! unlatched, so it retries on subsequent renders until the dispatch stamp
//! lands (the render that follows that dispatch's `update_count` bump).
//!
//! Unlike the plugin `theme`/`active` stamps (see the NOTE in [`reconcile`]),
//! the frame is pure viewer chrome — no plugin dispatch reads it — so
//! stamping it from this async `rendered` pass cannot split a plugin draw
//! across paints, and it needs no lock.

use wasm_bindgen::prelude::*;
use yew::prelude::*;

use super::MainPanel;
use crate::utils::PtrEqRc;
use crate::workspace::PanelId;

/// The custom property mirrored onto each frame: what viewer.css's
/// `.rl-panel::part(container)` background resolves.
const BACKGROUND_VAR: &str = "--psp--background-color";

/// The inputs the frame backgrounds were last computed from; re-mirroring is
/// skipped while these are unchanged, so the forced style recalcs of
/// `getComputedStyle` don't run on every render (e.g. the per-update
/// `update_count` renders of a streaming table). `available_themes` is part of
/// the key because theme CSS registering late changes the *computed* value
/// under an unchanged theme name.
pub(super) type FrameThemeSnapshot = (
    Vec<PanelId>,
    Vec<(String, Option<String>)>,
    PtrEqRc<Vec<String>>,
);

impl MainPanel {
    /// Mirror each panel's effective theme background (its own theme, else the
    /// registry default — the same fallback the tab/menu use) onto its
    /// `<regular-layout-frame>`'s inline `--psp--background-color`, read off
    /// the panel's stamped plugin element (else the theme-keyed cache of prior
    /// reads). A panel with no resolvable theme has the property removed,
    /// falling back to the inherited host-theme value.
    pub(super) fn stamp_frame_themes(&mut self, ctx: &Context<Self>) {
        let Some(layout) = self.layout_ref.cast::<web_sys::Element>() else {
            return;
        };

        let props = ctx.props();
        let snapshot: FrameThemeSnapshot = (
            props.panel_ids.clone(),
            props.panel_themes.clone(),
            props.presentation_props.available_themes.clone(),
        );

        if self.stamped_frame_themes.as_ref() == Some(&snapshot) {
            return;
        }

        // A theme-registry change can re-value an unchanged theme name, so
        // cached reads from the previous registry are unsound.
        if let Some((_, _, prev_themes)) = &self.stamped_frame_themes
            && prev_themes != &snapshot.2
        {
            self.theme_backgrounds.clear();
        }

        let viewer = props.presentation.viewer_elem().clone();
        let default_theme = props.presentation_props.available_themes.first();
        let mut complete = true;
        let children = layout.children();
        for i in 0..children.length() {
            let Some(frame) = children.item(i) else {
                continue;
            };

            if !frame
                .tag_name()
                .eq_ignore_ascii_case("regular-layout-frame")
            {
                continue;
            }

            let Some(name) = frame.get_attribute("name") else {
                continue;
            };

            let theme = props
                .panel_themes
                .iter()
                .find(|(pid, _)| *pid == name)
                .and_then(|(_, theme)| theme.clone())
                .or_else(|| default_theme.cloned());

            let background = theme.as_ref().and_then(|theme| {
                let fresh = read_plugin_background(&viewer, &name, theme);
                if let Some(color) = &fresh {
                    self.theme_backgrounds.insert(theme.clone(), color.clone());
                }

                let value = fresh.or_else(|| self.theme_backgrounds.get(theme).cloned());
                complete &= value.is_some();
                value
            });

            let style = frame.unchecked_ref::<web_sys::HtmlElement>().style();
            match background {
                Some(color) => {
                    let _ = style.set_property(BACKGROUND_VAR, &color);
                },
                None => {
                    let _ = style.remove_property(BACKGROUND_VAR);
                },
            }
        }

        // Latch only a fully-resolved pass; an unresolved frame (unmounted or
        // not-yet-stamped plugin) retries each render until its dispatch
        // stamp lands.
        self.stamped_frame_themes = complete.then_some(snapshot);
    }
}

/// Read the computed [`BACKGROUND_VAR`] off `slot`'s plugin element — the
/// viewer light-DOM child mounted under exactly that slot name (the tab and
/// toolbar use `tab-`/`statusbar-extra-` prefixed slots). Requires the
/// plugin's `theme` attr to already equal `theme` — during a plugin switch
/// two elements briefly share the slot, and a freshly-mounted plugin is not
/// yet stamped; both are disambiguated by the attr check.
fn read_plugin_background(viewer: &web_sys::Element, slot: &str, theme: &str) -> Option<String> {
    let children = viewer.children();
    let plugin = (0..children.length())
        .filter_map(|i| children.item(i))
        .filter(|el| el.get_attribute("slot").as_deref() == Some(slot))
        .find(|el| el.get_attribute("theme").as_deref() == Some(theme))?;

    let value = web_sys::window()?
        .get_computed_style(&plugin)
        .ok()??
        .get_property_value(BACKGROUND_VAR)
        .ok()?;

    let value = value.trim();
    (!value.is_empty()).then(|| value.to_owned())
}
