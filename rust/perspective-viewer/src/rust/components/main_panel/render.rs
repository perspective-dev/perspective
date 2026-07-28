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

//! `MainPanel::view`: the shared status bar, the `<regular-layout>` cells (one
//! forwarding `<slot>` wrapper per panel), the per-panel `<PanelTab>`s, and the
//! cursor-anchored `<PanelMenu>`.

use wasm_bindgen::prelude::*;
use yew::prelude::*;

use super::{MainPanel, MainPanelMsg, MainPanelProps};
use crate::components::panel_menu::PanelMenu;
use crate::components::panel_tab::PanelTab;
use crate::components::render_warning::RenderWarning;
use crate::components::status_bar::StatusBar;
use crate::js::RegularLayout;
use crate::tasks::dismiss_render_warning_callback;
use crate::workspace::PanelId;

/// Format a string as a CSS string literal (double-quoted, with `\` and `"`
/// escaped) — for use as a `--regular-layout-<id>--title` custom-property
/// value.
fn css_string(s: &str) -> String {
    let escaped = s.replace('\\', "\\\\").replace('"', "\\\"");
    format!("\"{escaped}\"")
}

impl MainPanel {
    pub(super) fn render(&self, ctx: &Context<Self>) -> Html {
        let MainPanelProps {
            presentation,
            renderer,
            session,
            ..
        } = ctx.props();

        let is_settings_open = ctx.props().is_settings_open;
        let mut class = classes!();
        if !is_settings_open {
            class.push("settings-closed");
        }

        if ctx.props().is_title() {
            class.push("titled");
        }

        let pointerdown = ctx.link().callback(MainPanelMsg::PointerEvent);
        let on_dismiss_warning = dismiss_render_warning_callback(session, renderer);

        // Each panel's plugin is mounted in the viewer's light DOM under its
        // panel-id slot (see `renderer::activate`). Render one `<regular-layout>`
        // cell per panel: a concrete `<div name=…>` wrapper (which
        // `regular-layout` grid-places via its `::slotted([name])` rule — that
        // only matches *direct*, non-`<slot>` children, hence the wrapper) whose
        // inner forwarding `<slot>` projects the light-DOM plugin into the placed
        // cell. The `<regular-layout>` element is ALWAYS rendered — at zero
        // panels it is merely empty (its tree collapses to a childless split,
        // and it paints nothing of its own), which keeps the stage CSS
        // (viewer.css keys the stage background + inset bleed on the element)
        // and the attached listeners alive across empty↔populated transitions.
        let plugin_area = {
            // The active panel (whose engines the status bar/settings target) is
            // the one the active renderer is bound to.
            let active_slot = renderer.slot_name();
            // Panel-count chrome (`single`/`multi`, closable, draggable)
            let placed_count = ctx.props().workspace.placed_count();
            let cells = ctx
                .props()
                .panel_ids
                .iter()
                .filter(|id| !ctx.props().workspace.is_staged(id))
                .map(|id| {
                    let name = id.as_str().to_owned();
                    let mut class = classes!("rl-panel");
                    if placed_count > 1 {
                        if active_slot.as_deref() == Some(name.as_str()) {
                            class.push("active");
                        }
                    } else {
                        // Lone panel: can't be closed to zero — hide the close button
                        // (see viewer.css) and skip the active outline.
                        class.push("single");
                    }

                    // Activate this panel on pointerdown anywhere in it (body or
                    // titlebar), so *working* in a panel — not only clicking its tab
                    // — targets it with the shared settings/toolbar. regular-layout
                    // emits `regular-layout-select` on tab clicks only, which left
                    // body interaction unable to change the active panel. Tab clicks
                    // still also fire `-select`, but that dispatch is async (after
                    // `restore`) so it lands after this synchronous handler — within a
                    // stack, switching tabs still resolves to the clicked panel.
                    // Re-activating the already-active panel is a no-op upstream.
                    let on_activate = ctx.props().on_activate_panel.clone();
                    let activate_name = name.clone();
                    let onpointerdown = Callback::from(move |_: web_sys::PointerEvent| {
                        on_activate.emit(activate_name.clone());
                    });

                    // Right-click anywhere in the panel opens the context menu. This
                    // is handled by the imperative `contextmenu` listener on the
                    // panel container (see `_contextmenu_listener`), NOT a Yew
                    // `oncontextmenu` here: the plugin body is light-DOM attached by
                    // the renderer, so Yew's delegated handler — which walks the vdom
                    // — never matches a right-click on it, leaving the native menu.

                    // `<regular-layout-frame>` gives each panel a titlebar (its
                    // `slot="tab"`) and a `::part(container)`. Two forwarding `<slot>`s
                    // project our light-DOM nodes in: `name` → the plugin (into the
                    // container), and `tab-<name>` (with `slot="tab"`) → this panel's
                    // `<PanelTab>` (into the titlebar). Both targets live in the
                    // viewer's light DOM, so the slots — being in the viewer's shadow —
                    // collect them and forward them one level deeper into the frame.
                    //
                    // The frame no longer carries the theme: the per-panel theme is
                    // applied directly to the light-DOM plugin + tab (each stamped with
                    // a `theme` attribute) via the `perspective-viewer [theme="X"]`
                    // document rules, so it themes through the native cascade instead
                    // of a scraped/inlined `--psp-*` block.
                    html! {
                        <regular-layout-frame
                            name={name.clone()}
                            key={name.clone()}
                            {class}
                            {onpointerdown}
                        >
                            <slot name={name.clone()} />
                            <slot name={format!("tab-{name}")} slot="tab" />
                        </regular-layout-frame>
                    }
                });

            // Per-panel tab titles: regular-layout's tabs render their label from
            // a `--regular-layout-<id>--title` custom property (a CSS string). We
            // set one per titled panel on the `<regular-layout>` host; they
            // inherit into each frame/tab's shadow.
            let title_style = ctx
                .props()
                .panel_titles
                .iter()
                .filter_map(|(id, title)| {
                    title
                        .as_ref()
                        .map(|t| format!("--regular-layout-{id}--title:{};", css_string(t)))
                })
                .collect::<String>();

            // One `<PanelTab>` per panel, mounted in the viewer's light DOM and
            // forwarded into its frame's titlebar by the `tab-<id>` slot above.
            // Rendered as siblings of `<regular-layout>` (their DOM placement is
            // irrelevant — each portals itself onto the viewer host). `on_select`
            // drives regular-layout's own `select` (the `regular-layout-select`
            // listener picks up activation).
            let viewer_elem = ctx.props().presentation.viewer_elem().clone();
            // A lone panel can't be closed to zero, and has nowhere to be
            // dragged — so it's neither closable nor draggable; its tab also
            // carries the `single` panel-count class (which e.g. hides the
            // caret).
            let closable = placed_count > 1;
            let draggable = closable;
            let single = !closable;
            let on_select = {
                let layout_ref = self.layout_ref.clone();
                Callback::from(move |id: String| {
                    if let Some(el) = layout_ref.cast::<web_sys::HtmlElement>() {
                        let _ = el.unchecked_ref::<RegularLayout>().select(&id);
                    }
                })
            };
            // Close routes through the root `ClosePanel` (the same channel the
            // context-menu "Close" uses), NOT `RegularLayout::remove_panel`.
            // Closing is an APP-initiated state change, so it must mutate the
            // `Workspace` (the source of truth) FIRST and dispose the panel
            // synchronously; `MainPanel`'s reconcile then removes the cell from
            // `regular-layout` on the re-render. Driving the layout first — and
            // discovering the close via the `regular-layout-update` DOM event —
            // ran the layout-update resize fan-out over a still-present-but-
            // doomed panel, spawning an (uncancellable) draw that then raced its
            // disposal ("restore() called before load()").
            let on_close = ctx.props().on_close_panel.clone();
            // Commit an in-tab title edit to that panel's own session — the same
            // `title_changed` → `TitlesChanged` refresh loop that used to be
            // driven by the status bar re-renders the tab with the new title.
            let on_rename = {
                let workspace = ctx.props().workspace.clone();
                Callback::from(move |(id, title): (String, Option<String>)| {
                    if let Some(panel) = workspace.panel(&PanelId::from(id.as_str())) {
                        panel.session.set_title(title);
                    }
                })
            };
            // The tab's open-settings button (the ONLY open-settings
            // affordance — the status bar's button is gone): select the panel
            // in the layout, activate it, then toggle the sidebar open. All
            // three are synchronous root-message sends, so activation lands
            // before the toggle and the sidebar binds the clicked panel's
            // engines.
            let on_open_settings = {
                let on_select = on_select.clone();
                let on_activate = ctx.props().on_activate_panel.clone();
                let on_settings = ctx.props().on_settings.clone();
                Callback::from(move |id: String| {
                    on_select.emit(id.clone());
                    on_activate.emit(id);
                    on_settings.emit(());
                })
            };
            let tabs = ctx
                .props()
                .panel_ids
                .iter()
                .filter(|id| !ctx.props().workspace.is_staged(id))
                .map(|id| {
                    let name = id.as_str().to_owned();
                    let title = ctx
                        .props()
                        .panel_titles
                        .iter()
                        .find(|(pid, _)| pid == &name)
                        .and_then(|(_, t)| t.clone());
                    let active = active_slot.as_deref() == Some(name.as_str());
                    let visible = !self.hidden_tabs.contains(name.as_str());
                    let is_master = ctx.props().panel_masters.contains(id);
                    let theme = ctx.props().effective_panel_theme(&name);

                    html! {
                        <PanelTab
                            key={name.clone()}
                            viewer={viewer_elem.clone()}
                            panel_id={name.clone()}
                            {title}
                            {theme}
                            {active}
                            {visible}
                            {is_master}
                            {single}
                            {closable}
                            {is_settings_open}
                            {draggable}
                            on_select={on_select.clone()}
                            on_close={on_close.clone()}
                            on_open_settings={on_open_settings.clone()}
                            on_context_menu={ctx.link().callback(|(id, x, y): (String, f64, f64)| MainPanelMsg::ContextMenu(Some(id), x, y))}
                            on_rename={on_rename.clone()}
                        />
                    }
                })
                .collect::<Vec<_>>();

            // STAGED panels: the plugin `<slot>` is delivered OUTSIDE the
            // layout into a hidden wrapper, sized to the predicted
            // post-insert cell by `size_staging_wrappers`. `visibility:
            // hidden` (not `display: none`) so the plugin keeps a real box
            // and a non-null `offsetParent` — first draws, redraw
            // subscriptions and every observer (the host-level
            // `AutoPauseHandle`/`ResizeObserverHandle` gates, the drag
            // `ResizeObserver`s) see it exactly as they would a visible
            // panel. No tab is rendered while staged.
            let staging = ctx
                .props()
                .panel_ids
                .iter()
                .filter(|id| ctx.props().workspace.is_staged(id))
                .map(|id| {
                    let name = id.as_str().to_owned();
                    html! {
                        <div
                            class="psp-staging"
                            data-panel={name.clone()}
                            key={format!("staging-{name}")}
                        >
                            <slot {name} />
                        </div>
                    }
                });

            // ONE flat FULLY-KEYED list: `<regular-layout>` + tabs + staging
            // wrappers. Keying every sibling (the layout element included)
            // routes Yew's list diff through `apply_keyed`, which matches by
            // key — the layout element is REUSED across renders regardless of
            // how the tab/staging population shifts around it. The prior
            // shape (`<regular-layout>` + nested `{tabs}`/`{staging}` lists,
            // layout unkeyed) took `apply_unkeyed`, whose back-to-front
            // positional pairing REPLACED the layout element whenever the
            // trailing lists changed length — orphaning its committed tree
            // and attached listeners, and silently re-booting the layout
            // from `EMPTY_PANEL` (see `listener_target`).
            std::iter::once(html! {
                <regular-layout
                    key="__regular_layout__"
                    ref={self.layout_ref.clone()}
                    style={title_style}
                >
                    { for cells }
                </regular-layout>
            })
            .chain(tabs)
            .chain(staging)
            .collect::<Html>()
        };

        // The cursor-anchored panel command menu — a body-mounted
        // `PortalModal` (like the Export/Copy pickers it spawns), so its
        // placement in this subtree is irrelevant. Themed by the TARGET
        // panel's effective theme — its own, else the registry default —
        // not the active/host theme (the target-less stage menu also takes
        // the registry default). Maximize/Restore are handled locally;
        // other commands forward to the root.
        let panel_menu = self
            .context_menu
            .as_ref()
            .map(|(x, y, id)| {
                let theme = match id {
                    Some(id) => ctx.props().effective_panel_theme(id),
                    None => ctx
                        .props()
                        .presentation_props
                        .available_themes
                        .first()
                        .cloned(),
                };

                let maximized = id
                    .as_deref()
                    .is_some_and(|id| self.maximized.as_deref() == Some(id));

                html! {
                    <PanelMenu
                        x={*x}
                        y={*y}
                        panel_id={id.clone()}
                        workspace={ctx.props().workspace.clone()}
                        presentation={ctx.props().presentation.clone()}
                        {theme}
                        {maximized}
                        on_command={ctx.link().callback(MainPanelMsg::Command)}
                        on_close={ctx.link().callback(|_| MainPanelMsg::CloseContextMenu)}
                    />
                }
            })
            .unwrap_or_default();

        html! {
            <div id="main_column">
                <StatusBar
                    id="status_bar"
                    on_reset={ctx.props().on_reset.clone()}
                    session_props={ctx.props().session_props.clone()}
                    presentation_props={ctx.props().presentation_props.clone()}
                    is_settings_open={ctx.props().is_settings_open}
                    update_count={ctx.props().update_count}
                    global_filters={ctx.props().global_filters.clone()}
                    on_remove_global_filter={ctx.props().on_remove_global_filter.clone()}
                    on_clear_global_filters={ctx.props().on_clear_global_filters.clone()}
                    {presentation}
                    {renderer}
                    {session}
                    workspace={ctx.props().workspace.clone()}
                />
                <div
                    id="main_panel_container"
                    ref={self.main_panel_ref.clone()}
                    {class}
                    onpointerdown={pointerdown}
                >
                    <RenderWarning
                        on_dismiss={on_dismiss_warning}
                        dimensions={ctx.props().renderer_props.render_limits}
                    />
                    { plugin_area }
                </div>
                { panel_menu }
            </div>
        }
    }
}
