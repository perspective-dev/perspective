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

use futures::channel::oneshot::*;
use perspective_js::utils::*;
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;
use web_sys::{FocusEvent, KeyboardEvent};
use yew::prelude::*;

use super::containers::split_panel::SplitPanel;
use super::font_loader::{FontLoader, FontLoaderProps, FontLoaderStatus};
use super::style::{LocalStyle, StyleProvider};
use crate::components::column_settings_sidebar::ColumnSettingsPanel;
use crate::components::main_panel::MainPanel;
use crate::components::settings_panel::{SelectedTab, SettingsPanel};
use crate::config::*;
use crate::css;
use crate::js::JsPerspectiveViewerPlugin;
use crate::presentation::{
    ColumnLocator, ColumnSettingsTab, DragDropProps, Presentation, PresentationProps,
};
use crate::queries::*;
use crate::renderer::{RendererProps, *};
use crate::session::{SessionProps, *};
use crate::tasks::*;
use crate::utils::*;

#[derive(Clone, Properties)]
pub struct PerspectiveViewerProps {
    /// The light DOM element this component will render to.
    pub elem: web_sys::HtmlElement,

    /// State
    pub session: Session,
    pub renderer: Renderer,
    pub presentation: Presentation,
}

impl PartialEq for PerspectiveViewerProps {
    fn eq(&self, _rhs: &Self) -> bool {
        false
    }
}

#[derive(Debug)]
pub enum PerspectiveViewerMsg {
    ColumnSettingsPanelSizeUpdate(Option<i32>),
    ColumnSettingsTabChanged(ColumnSettingsTab),
    OpenColumnSettings {
        locator: Option<ColumnLocator>,
        sender: Option<Sender<()>>,
        toggle: bool,
    },
    PreloadFontsUpdate,
    Reset(bool, Option<Sender<()>>),
    Resize,
    SettingsPanelSizeUpdate(Option<i32>),
    SettingsPanelTabChanged(SelectedTab),
    SettingsPanelAutoWidth(f64),
    ToggleDebug,
    ToggleSettingsComplete(SettingsUpdate, Sender<()>),
    ToggleSettingsInit(Option<SettingsUpdate>, Option<Sender<ApiResult<JsValue>>>),
    UpdateSession(Box<SessionProps>),
    UpdateRenderer(Box<RendererProps>),
    UpdatePresentation(Box<PresentationProps>),

    /// Update only `is_settings_open` in the presentation snapshot without
    /// touching `available_themes` (which requires async data).
    UpdateSettingsOpen(bool),
    UpdateIsWorkspace(bool),

    /// Update only `open_column_settings` in the presentation snapshot.
    UpdateColumnSettings(Box<crate::presentation::OpenColumnSettings>),
    UpdateDragDrop(Box<DragDropProps>),

    /// Update only stats-related fields of `session_props` without touching
    /// `config`.  This prevents `stats_changed` events (e.g. from `reset()`)
    /// from propagating a freshly-cleared config to the column selector.
    UpdateSessionStats(Option<ViewStats>, Option<TableLoadState>),

    /// Increment/decrement the in-flight render counter threaded to
    /// `StatusIndicator` so it can show the "updating" spinner.
    IncrementUpdateCount,
    DecrementUpdateCount,
}

use PerspectiveViewerMsg::*;

pub struct PerspectiveViewer {
    _subscriptions: Vec<Subscription>,
    column_settings_panel_width_override: Option<i32>,
    debug_open: bool,
    fonts: FontLoaderProps,
    on_close_column_settings: Callback<()>,
    on_rendered: Option<Sender<()>>,
    on_resize: Rc<PubSub<()>>,
    on_settings_panel_dimensions_reset: Rc<PubSub<()>>,
    settings_open: bool,
    settings_panel_width_override: Option<i32>,
    settings_panel_selected_tab: SelectedTab,
    settings_panel_auto_width: f64,

    /// Value-semantic state snapshots (Step 4 scaffold).
    /// Populated by `UpdateSession` / `UpdateRenderer` / `UpdatePresentation` /
    /// `UpdateDragDrop` messages dispatched from async engine tasks.
    session_props: SessionProps,
    renderer_props: RendererProps,
    presentation_props: PresentationProps,
    dragdrop_props: DragDropProps,

    /// Counts in-flight renders (incremented on `view_config_changed`,
    /// decremented on `view_created`). Threaded to `StatusIndicator`.
    update_count: u32,

    /// Window listeners that toggle the `.shift-active` class on the host
    /// element while the Shift key is held, making Shift-modified affordances
    /// (e.g. inactive column add, active column remove, status-bar reset)
    /// visually discoverable. Stored so the closures outlive `create`.
    _shift_listeners: ShiftListeners,
}

struct ShiftListeners {
    elem: web_sys::HtmlElement,
    keydown: Closure<dyn FnMut(KeyboardEvent)>,
    keyup: Closure<dyn FnMut(KeyboardEvent)>,
    blur: Closure<dyn FnMut(FocusEvent)>,
}

impl Drop for ShiftListeners {
    fn drop(&mut self) {
        let win = global::window();
        let _ = win
            .remove_event_listener_with_callback("keydown", self.keydown.as_ref().unchecked_ref());
        let _ =
            win.remove_event_listener_with_callback("keyup", self.keyup.as_ref().unchecked_ref());
        let _ = win.remove_event_listener_with_callback("blur", self.blur.as_ref().unchecked_ref());
        let _ = self.elem.class_list().remove_1("shift-active");
    }
}

fn install_shift_listeners(elem: web_sys::HtmlElement) -> ShiftListeners {
    let keydown = {
        let elem = elem.clone();
        Closure::wrap(Box::new(move |event: KeyboardEvent| {
            if event.key() == "Shift" {
                let _ = elem.class_list().add_1("shift-active");
            }
        }) as Box<dyn FnMut(KeyboardEvent)>)
    };

    let keyup = {
        let elem = elem.clone();
        Closure::wrap(Box::new(move |event: KeyboardEvent| {
            if event.key() == "Shift" {
                let _ = elem.class_list().remove_1("shift-active");
            }
        }) as Box<dyn FnMut(KeyboardEvent)>)
    };

    let blur = {
        let elem = elem.clone();
        Closure::wrap(Box::new(move |_: FocusEvent| {
            let _ = elem.class_list().remove_1("shift-active");
        }) as Box<dyn FnMut(FocusEvent)>)
    };

    let win = global::window();
    let _ = win.add_event_listener_with_callback("keydown", keydown.as_ref().unchecked_ref());
    let _ = win.add_event_listener_with_callback("keyup", keyup.as_ref().unchecked_ref());
    let _ = win.add_event_listener_with_callback("blur", blur.as_ref().unchecked_ref());

    ShiftListeners {
        elem,
        keydown,
        keyup,
        blur,
    }
}

impl Component for PerspectiveViewer {
    type Message = PerspectiveViewerMsg;
    type Properties = PerspectiveViewerProps;

    fn create(ctx: &Context<Self>) -> Self {
        let elem = ctx.props().elem.clone();
        let fonts = FontLoaderProps::new(&elem, ctx.link().callback(|()| PreloadFontsUpdate));
        inject_engine_callbacks(ctx);
        let subscriptions = create_subscriptions(ctx);
        let session_props = ctx.props().session.to_props();
        let renderer_props = ctx.props().renderer.to_props(None);
        let presentation_props = ctx.props().presentation.to_props(PtrEqRc::new(vec![]));

        // Memoized callback for column settings drawer
        let on_close_column_settings = ctx.link().callback(|_| OpenColumnSettings {
            locator: None,
            sender: None,
            toggle: false,
        });

        // Kick off an initial async theme fetch so that `available_themes` is
        // populated even if `theme_config_updated` fires before the PubSub
        // subscription is registered.
        {
            let presentation = ctx.props().presentation.clone();
            let cb = ctx.link().callback(move |themes: PtrEqRc<Vec<String>>| {
                UpdatePresentation(Box::new(presentation.to_props(themes)))
            });

            let presentation = ctx.props().presentation.clone();
            ApiFuture::spawn(async move {
                let themes = presentation.get_available_themes().await?;
                cb.emit(themes);
                Ok(())
            });
        }

        let shift_listeners = install_shift_listeners(elem);

        Self {
            _subscriptions: subscriptions,
            column_settings_panel_width_override: None,
            debug_open: false,
            fonts,
            on_close_column_settings,
            on_rendered: None,
            on_resize: Default::default(),
            on_settings_panel_dimensions_reset: Default::default(),
            settings_open: false,
            settings_panel_width_override: None,
            settings_panel_selected_tab: SelectedTab::default(),
            settings_panel_auto_width: 0.0,
            session_props,
            renderer_props,
            presentation_props,
            dragdrop_props: DragDropProps::default(),
            update_count: 0,
            _shift_listeners: shift_listeners,
        }
    }

    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            PreloadFontsUpdate => true,
            Resize => {
                self.on_resize.emit(());
                false
            },
            Reset(all, sender) => {
                reset_all(
                    &ctx.props().session,
                    &ctx.props().renderer,
                    &ctx.props().presentation,
                    all,
                    sender,
                );
                false
            },
            ToggleSettingsInit(Some(SettingsUpdate::Missing), None) => false,
            ToggleSettingsInit(Some(SettingsUpdate::Missing), Some(resolve)) => {
                resolve.send(Ok(JsValue::UNDEFINED)).unwrap();
                false
            },
            ToggleSettingsInit(Some(SettingsUpdate::SetDefault), resolve) => {
                self.init_toggle_settings_task(ctx, Some(false), resolve);
                false
            },
            ToggleSettingsInit(Some(SettingsUpdate::Update(force)), resolve) => {
                self.init_toggle_settings_task(ctx, Some(force), resolve);
                false
            },
            ToggleSettingsInit(None, resolve) => {
                self.init_toggle_settings_task(ctx, None, resolve);
                false
            },
            ToggleSettingsComplete(SettingsUpdate::SetDefault, resolve) if self.settings_open => {
                ctx.props().presentation.set_open_column_settings(None);
                self.settings_open = false;
                self.on_rendered = Some(resolve);
                true
            },
            ToggleSettingsComplete(SettingsUpdate::Update(force), resolve)
                if force != self.settings_open =>
            {
                ctx.props().presentation.set_open_column_settings(None);
                self.settings_open = force;
                self.on_rendered = Some(resolve);
                true
            },
            ToggleSettingsComplete(_, resolve)
                if matches!(self.fonts.get_status(), FontLoaderStatus::Finished) =>
            {
                if let Err(e) = resolve.send(()) {
                    tracing::error!("toggle settings failed {:?}", e);
                }

                false
            },
            ToggleSettingsComplete(_, resolve) => {
                ctx.props().presentation.set_open_column_settings(None);
                self.on_rendered = Some(resolve);
                true
            },
            OpenColumnSettings {
                locator,
                sender,
                toggle,
            } => {
                let mut open_column_settings = ctx.props().presentation.get_open_column_settings();
                if locator == open_column_settings.locator {
                    if toggle {
                        ctx.props().presentation.set_open_column_settings(None);
                    }
                } else {
                    open_column_settings.locator.clone_from(&locator);
                    open_column_settings.tab =
                        if matches!(locator, Some(ColumnLocator::NewExpression)) {
                            Some(ColumnSettingsTab::Attributes)
                        } else {
                            locator.as_ref().and_then(|x| {
                                x.name().map(|x| {
                                    if self.session_props.is_column_active(x) {
                                        ColumnSettingsTab::Style
                                    } else {
                                        ColumnSettingsTab::Attributes
                                    }
                                })
                            })
                        };

                    ctx.props()
                        .presentation
                        .set_open_column_settings(Some(open_column_settings));

                    if locator.is_some() {
                        self.settings_panel_selected_tab = SelectedTab::Query;
                    }
                }

                if let Some(sender) = sender {
                    sender.send(()).unwrap();
                }

                true
            },
            SettingsPanelSizeUpdate(Some(x)) => {
                self.settings_panel_width_override = Some(x);
                false
            },
            SettingsPanelSizeUpdate(None) => {
                self.settings_panel_width_override = None;
                self.settings_panel_auto_width = 0.0;
                self.on_settings_panel_dimensions_reset.emit(());
                true
            },
            SettingsPanelTabChanged(tab) => {
                let changed = tab != self.settings_panel_selected_tab;
                self.settings_panel_selected_tab = tab;
                changed
            },
            SettingsPanelAutoWidth(w) => {
                if w > self.settings_panel_auto_width {
                    self.settings_panel_auto_width = w;
                    true
                } else {
                    false
                }
            },
            ColumnSettingsPanelSizeUpdate(Some(x)) => {
                self.column_settings_panel_width_override = Some(x);
                false
            },
            ColumnSettingsPanelSizeUpdate(None) => {
                self.column_settings_panel_width_override = None;
                false
            },
            ColumnSettingsTabChanged(tab) => {
                let mut open_column_settings = ctx.props().presentation.get_open_column_settings();
                open_column_settings.tab.clone_from(&Some(tab));
                ctx.props()
                    .presentation
                    .set_open_column_settings(Some(open_column_settings));
                true
            },
            ToggleDebug => {
                self.debug_open = !self.debug_open;
                clone!(ctx.props().renderer, ctx.props().session);
                ApiFuture::spawn(async move {
                    renderer.draw(session.validate().await?.create_view()).await
                });

                true
            },
            UpdateSession(props) => {
                let changed = *props != self.session_props;
                self.session_props = *props;
                changed
            },
            UpdateSessionStats(stats, has_table) => {
                let changed =
                    stats != self.session_props.stats || has_table != self.session_props.has_table;
                self.session_props.stats = stats;
                self.session_props.has_table = has_table;
                changed
            },
            UpdateRenderer(props) => {
                let changed = *props != self.renderer_props;
                self.renderer_props = *props;
                changed
            },
            UpdatePresentation(props) => {
                let changed = *props != self.presentation_props;
                self.presentation_props = *props;
                changed
            },
            UpdateSettingsOpen(open) => {
                let changed = open != self.presentation_props.is_settings_open;
                self.presentation_props.is_settings_open = open;
                changed
            },
            UpdateIsWorkspace(is_workspace) => {
                let changed = is_workspace != self.presentation_props.is_workspace;
                self.presentation_props.is_workspace = is_workspace;
                changed
            },
            UpdateColumnSettings(ocs) => {
                let changed = *ocs != self.presentation_props.open_column_settings;
                self.presentation_props.open_column_settings = *ocs;
                changed
            },
            UpdateDragDrop(props) => {
                let changed = *props != self.dragdrop_props;
                self.dragdrop_props = *props;
                changed
            },
            IncrementUpdateCount => {
                self.update_count = self.update_count.saturating_add(1);
                true
            },
            DecrementUpdateCount => {
                self.update_count = self.update_count.saturating_sub(1);
                true
            },
        }
    }

    /// This top-level component is mounted to the Custom Element, so it has no
    /// API to provide props - but for sanity if needed, just return true on
    /// change.
    fn changed(&mut self, _ctx: &Context<Self>, _old: &Self::Properties) -> bool {
        true
    }

    /// On rendered call notify_resize().  This also triggers any registered
    /// async callbacks to the Custom Element API.
    fn rendered(&mut self, _ctx: &Context<Self>, _first_render: bool) {
        if self.on_rendered.is_some()
            && matches!(self.fonts.get_status(), FontLoaderStatus::Finished)
            && self.on_rendered.take().unwrap().send(()).is_err()
        {
            tracing::warn!("Orphan render");
        }
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let Self::Properties {
            presentation,
            renderer,
            session,
            ..
        } = ctx.props();

        let is_settings_open = self.settings_open
            && matches!(self.session_props.has_table, Some(TableLoadState::Loaded));

        let mut class = classes!();
        if !is_settings_open {
            class.push("settings-closed");
        }

        if self.session_props.title.is_some() {
            class.push("titled");
        }

        let on_open_expr_panel = ctx.link().callback(|c| OpenColumnSettings {
            locator: c,
            sender: None,
            toggle: true,
        });

        let on_split_panel_resize = ctx
            .link()
            .callback(|(x, _)| SettingsPanelSizeUpdate(Some(x)));

        let on_column_settings_panel_resize = ctx
            .link()
            .callback(|(x, _)| ColumnSettingsPanelSizeUpdate(Some(x)));

        let on_close_settings = ctx.link().callback(|()| ToggleSettingsInit(None, None));
        let on_debug = ctx.link().callback(|_| ToggleDebug);
        let selected_column = get_current_column_locator(
            &self.presentation_props.open_column_settings,
            &ctx.props().renderer,
            &self.session_props.config,
            &self.session_props.metadata,
        );

        let selected_tab = self.presentation_props.open_column_settings.tab;
        let plugin_name = self.renderer_props.plugin_name.clone();
        let available_plugins = self.renderer_props.available_plugins.clone();
        let has_table = self.session_props.has_table.clone();
        let named_column_count = self.renderer_props.config.config_column_names.len();

        let view_config = self.session_props.config.clone();
        let drag_column = self.dragdrop_props.column.clone();
        let metadata = self.session_props.metadata.clone();
        let on_select_tab = ctx.link().callback(SettingsPanelTabChanged);
        let on_auto_width = ctx.link().callback(SettingsPanelAutoWidth);
        let settings_panel = html! {
            if is_settings_open {
                <SettingsPanel
                    on_close={on_close_settings}
                    on_resize={&self.on_resize}
                    on_select_column={on_open_expr_panel}
                    is_debug={self.debug_open}
                    {on_debug}
                    {plugin_name}
                    {available_plugins}
                    {has_table}
                    {named_column_count}
                    {view_config}
                    plugin_config={self.renderer_props.plugin_config.clone()}
                    {drag_column}
                    metadata={metadata.clone()}
                    open_column_settings={self.presentation_props.open_column_settings.clone()}
                    selected_theme={self.presentation_props.selected_theme.clone()}
                    selected_tab={self.settings_panel_selected_tab}
                    auto_width={self.settings_panel_auto_width}
                    on_dimensions_reset={&self.on_settings_panel_dimensions_reset}
                    {on_select_tab}
                    {on_auto_width}
                    {presentation}
                    {renderer}
                    {session}
                />
            }
        };

        let on_settings = ctx.link().callback(|()| ToggleSettingsInit(None, None));
        let on_select_tab = ctx.link().callback(ColumnSettingsTabChanged);
        let column_settings_panel = html! {
            if let Some(selected_column) = selected_column {
                <SplitPanel
                    id="modal_panel"
                    reverse=true
                    initial_size={self.column_settings_panel_width_override}
                    on_reset={ctx.link().callback(|_| ColumnSettingsPanelSizeUpdate(None))}
                    on_resize={on_column_settings_panel_resize}
                >
                    <ColumnSettingsPanel
                        {selected_column}
                        {selected_tab}
                        on_close={self.on_close_column_settings.clone()}
                        width_override={self.column_settings_panel_width_override}
                        {on_select_tab}
                        plugin_name={self.renderer_props.plugin_name.clone()}
                        {metadata}
                        view_config={self.session_props.config.clone()}
                        column_stats={self.session_props.column_stats.clone()}
                        selected_theme={self.presentation_props.selected_theme.clone()}
                        {presentation}
                        {renderer}
                        {session}
                    />
                    <></>
                </SplitPanel>
            }
        };

        let on_reset = ctx.link().callback(|all| Reset(all, None));
        let is_settings_open = self.settings_open
            && matches!(self.session_props.has_table, Some(TableLoadState::Loaded));
        let main_panel = html! {
            <MainPanel
                {on_settings}
                {on_reset}
                session_props={self.session_props.clone()}
                renderer_props={self.renderer_props.clone()}
                presentation_props={self.presentation_props.clone()}
                {is_settings_open}
                update_count={self.update_count}
                {presentation}
                {renderer}
                {session}
            />
        };

        html! {
            <StyleProvider root={ctx.props().elem.clone()}>
                <LocalStyle href={css!("viewer")} />
                <div id="component_container">
                    if is_settings_open {
                        <SplitPanel
                            id="app_panel"
                            reverse=true
                            skip_empty=true
                            initial_size={self.settings_panel_width_override}
                            on_reset={ctx.link().callback(|_| SettingsPanelSizeUpdate(None))}
                            on_resize={{
                                let size_cb = on_split_panel_resize.clone();
                                let resize_cb = resize_callback(&ctx.props().session, &ctx.props().renderer);
                                move |x| {
                                    size_cb.emit(x);
                                    resize_cb.emit(());
                                }
                            }}
                            on_resize_finished={resize_callback(&ctx.props().session, &ctx.props().renderer)}
                        >
                            { settings_panel }
                            <div id="main_column_container">
                                { main_panel }
                                { column_settings_panel }
                            </div>
                        </SplitPanel>
                    } else {
                        <div id="main_column_container">
                            { main_panel }
                            { column_settings_panel }
                        </div>
                    }
                </div>
                <FontLoader ..self.fonts.clone() />
            </StyleProvider>
        }
    }

    fn destroy(&mut self, _ctx: &Context<Self>) {}
}

impl PerspectiveViewer {
    /// Toggle the settings, or force the settings panel either open (true) or
    /// closed (false) explicitly.  In order to reduce apparent
    /// screen-shear, `toggle_settings()` uses a somewhat complex render
    /// order:  it first resize the plugin's `<div>` without moving it,
    /// using `overflow: hidden` to hide the extra draw area;  then,
    /// after the _async_ drawing of the plugin is complete, it will send a
    /// message to complete the toggle action and re-render the element with
    /// the settings removed.
    ///
    /// # Arguments
    /// * `force` - Whether to explicitly set the settings panel state to
    ///   Open/Close (`Some(true)`/`Some(false)`), or to just toggle the current
    ///   state (`None`).
    fn init_toggle_settings_task(
        &mut self,
        ctx: &Context<Self>,
        force: Option<bool>,
        sender: Option<Sender<ApiResult<JsValue>>>,
    ) {
        let is_open = ctx.props().presentation.is_settings_open();
        ctx.props().presentation.set_settings_before_open(!is_open);
        match force {
            Some(force) if is_open == force => {
                if let Some(sender) = sender {
                    sender.send(Ok(JsValue::UNDEFINED)).unwrap();
                }
            },
            Some(_) | None => {
                let force = !is_open;
                let callback = ctx.link().callback(move |resolve| {
                    let update = SettingsUpdate::Update(force);
                    ToggleSettingsComplete(update, resolve)
                });

                clone!(
                    ctx.props().renderer,
                    ctx.props().session,
                    ctx.props().presentation
                );

                ApiFuture::spawn(async move {
                    let result = if session.js_get_table().is_some() {
                        renderer
                            .presize(force, {
                                let (sender, receiver) = channel::<()>();
                                async move {
                                    callback.emit(sender);
                                    presentation.set_settings_open(!is_open);
                                    Ok(receiver.await?)
                                }
                            })
                            .await
                    } else {
                        let (sender, receiver) = channel::<()>();
                        callback.emit(sender);
                        presentation.set_settings_open(!is_open);
                        receiver.await?;
                        Ok(JsValue::UNDEFINED)
                    };

                    if let Some(sender) = sender {
                        let msg = result.ignore_view_delete();
                        sender
                            .send(msg.map(|x| x.unwrap_or(JsValue::UNDEFINED)))
                            .into_apierror()?;
                    };

                    Ok(JsValue::undefined())
                });
            },
        };
    }
}

/// Subscribe to PubSub events that still have non-root subscribers and
/// therefore cannot yet be replaced with direct callbacks.
fn create_subscriptions(ctx: &Context<PerspectiveViewer>) -> Vec<Subscription> {
    let session_props_sub = {
        let session = ctx.props().session.clone();
        let cb = ctx
            .link()
            .callback(move |_: ()| UpdateSession(Box::new(session.to_props())));

        let s = &ctx.props().session;
        let sub1 = s.table_loaded.add_notify_listener(&cb);
        let sub2 = s.table_unloaded.add_notify_listener(&cb);
        let sub3 = s.view_created.add_notify_listener(&cb);
        let sub4 = s.view_config_changed.add_notify_listener(&cb);
        let sub5 = s.title_changed.add_notify_listener(&cb);
        let sub6 = s
            .view_config_changed
            .add_listener(ctx.link().callback(|_| IncrementUpdateCount));

        let sub7 = s
            .view_created
            .add_listener(ctx.link().callback(|_| DecrementUpdateCount));

        // Stats fetch resolution (populates session.column_stats) triggers
        // a fresh `SessionProps` so `column_stats` reaches downstream
        // components and the StyleTab re-queries the schema with the
        // new value.
        let sub8 = s.column_stats_changed.add_notify_listener(&cb);

        vec![sub1, sub2, sub3, sub4, sub5, sub6, sub7, sub8]
    };

    let renderer_props_sub = {
        let renderer = ctx.props().renderer.clone();
        let cb_plugin = ctx.link().callback({
            let renderer = renderer.clone();
            move |_: JsPerspectiveViewerPlugin| UpdateRenderer(Box::new(renderer.to_props(None)))
        });

        // Re-snapshot RendererProps when the plugin_config bucket
        // changes (in-tab edit via `send_plugin_config`, JSON paste via
        // `restore_and_render`, full clear via `reset_all` with
        // `all=true`). Without this, `RendererProps.plugin_config`
        // would stay frozen at its construct-time value and `PluginTab`
        // would render stale.
        let cb_plugin_config = ctx.link().callback({
            let renderer = renderer.clone();
            move |_: serde_json::Map<String, serde_json::Value>| {
                UpdateRenderer(Box::new(renderer.to_props(None)))
            }
        });

        let sub1 = ctx.props().renderer.plugin_changed.add_listener(cb_plugin);
        let sub2 = ctx
            .props()
            .renderer
            .plugin_config_changed
            .add_listener(cb_plugin_config);

        vec![sub1, sub2]
    };

    let presentation_props_sub = {
        let presentation = ctx.props().presentation.clone();
        let cb_settings = ctx.link().callback(UpdateSettingsOpen);
        let cb_theme = {
            let pres = presentation.clone();
            ctx.link()
                .callback(move |(themes, _): (PtrEqRc<Vec<String>>, _)| {
                    UpdatePresentation(Box::new(pres.to_props(themes)))
                })
        };

        let cb_column_settings = {
            let pres = presentation.clone();
            ctx.link().callback(move |_: (bool, Option<String>)| {
                UpdateColumnSettings(Box::new(pres.get_open_column_settings()))
            })
        };

        let sub1 = presentation.settings_open_changed.add_listener(cb_settings);
        let sub2 = presentation.theme_config_updated.add_listener(cb_theme);
        let sub3 = presentation
            .column_settings_open_changed
            .add_listener(cb_column_settings);

        vec![sub1, sub2, sub3]
    };

    let dragdrop_props_sub = {
        let cb_clear = ctx.link().callback(|_: ()| UpdateDragDrop(Box::default()));
        let sub1 = ctx
            .props()
            .presentation
            .drop_received
            .add_notify_listener(&cb_clear);

        vec![sub1]
    };

    let mut subscriptions = Vec::new();
    subscriptions.extend(session_props_sub);
    subscriptions.extend(renderer_props_sub);
    subscriptions.extend(presentation_props_sub);
    subscriptions.extend(dragdrop_props_sub);
    subscriptions
}

/// Inject direct callbacks into the engine handles, replacing PubSub fields
/// that were exclusively consumed by the root component.
fn inject_engine_callbacks(ctx: &Context<PerspectiveViewer>) {
    // Session: on_stats_changed
    {
        let session = ctx.props().session.clone();
        let cb = ctx.link().callback(move |_: ()| {
            UpdateSessionStats(session.get_table_stats(), session.has_table())
        });

        *ctx.props().session.on_stats_changed.borrow_mut() = Some(cb);
    }

    // Session: on_table_errored
    {
        let session = ctx.props().session.clone();
        let cb = ctx
            .link()
            .callback(move |_: ()| UpdateSession(Box::new(session.to_props())));

        *ctx.props().session.on_table_errored.borrow_mut() = Some(cb);
    }

    // Renderer: on_render_limits_changed (combines UpdateRenderer + column
    // locator recheck that were previously two separate PubSub subscriptions).
    {
        clone!(
            ctx.props().presentation,
            ctx.props().renderer,
            ctx.props().session
        );

        let cb = ctx.link().batch_callback(move |limits: RenderLimits| {
            let mut msgs = vec![UpdateRenderer(Box::new(renderer.to_props(Some(limits))))];
            if !limits.is_update {
                let locator = get_current_column_locator(
                    &presentation.get_open_column_settings(),
                    &renderer,
                    &session.get_view_config(),
                    &session.metadata(),
                );

                msgs.push(OpenColumnSettings {
                    locator,
                    sender: None,
                    toggle: false,
                });
            }

            msgs
        });

        *ctx.props().renderer.on_render_limits_changed.borrow_mut() = Some(cb);
    }

    // Presentation: on_is_workspace_changed
    {
        let cb = ctx.link().callback(UpdateIsWorkspace);
        *ctx.props()
            .presentation
            .on_is_workspace_changed
            .borrow_mut() = Some(cb);
    }

    // Drag/drop: on_dragstart (post-merge: lives on Presentation)
    {
        let presentation = ctx.props().presentation.clone();
        let cb = ctx.link().callback(move |_: DragEffect| {
            UpdateDragDrop(Box::new(presentation.drag_drop_props()))
        });

        *ctx.props().presentation.on_dragstart.borrow_mut() = Some(cb);
    }

    // Drag/drop: on_dragend
    {
        let cb = ctx.link().callback(|_: ()| UpdateDragDrop(Box::default()));
        *ctx.props().presentation.on_dragend.borrow_mut() = Some(cb);
    }
}
