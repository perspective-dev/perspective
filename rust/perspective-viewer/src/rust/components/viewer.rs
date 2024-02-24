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
use itertools::Itertools;
use perspective_client::ColumnType;
use wasm_bindgen::prelude::*;
use yew::prelude::*;

use super::column_selector::ColumnSelector;
use super::containers::split_panel::SplitPanel;
use super::font_loader::{FontLoader, FontLoaderProps, FontLoaderStatus};
use super::plugin_selector::PluginSelector;
use super::render_warning::RenderWarning;
use super::status_bar::StatusBar;
use super::style::{LocalStyle, StyleProvider};
use crate::components::column_settings_sidebar::ColumnSettingsSidebar;
use crate::components::containers::sidebar::SidebarCloseButton;
use crate::config::*;
use crate::custom_events::CustomEvents;
use crate::dragdrop::*;
use crate::model::*;
use crate::presentation::Presentation;
use crate::renderer::*;
use crate::session::*;
use crate::utils::*;
use crate::*;

/// Locates a view column.
/// Table columns are those defined on the table, but their types will reflect
/// the view type, not the table type.
#[derive(Clone, Debug, PartialEq)]
pub enum ColumnLocator {
    Table(String),
    Expression(String),
    NewExpression,
}
impl ColumnLocator {
    /// Pulls the column's name from the locator.
    /// If the column is a new expression which has yet to be saved, the
    /// function will return None.
    pub fn name(&self) -> Option<&String> {
        match self {
            Self::Table(s) | Self::Expression(s) => Some(s),
            Self::NewExpression => None,
        }
    }

    pub fn name_or_default(&self, session: &Session) -> String {
        match self {
            Self::Table(s) | Self::Expression(s) => s.clone(),
            Self::NewExpression => session.metadata().make_new_column_name(None),
        }
    }

    pub fn is_active(&self, session: &Session) -> bool {
        self.name()
            .map(|name| session.is_column_active(name))
            .unwrap_or_default()
    }

    #[inline(always)]
    pub fn is_saved_expr(&self) -> bool {
        matches!(self, ColumnLocator::Expression(_))
    }

    #[inline(always)]
    pub fn is_expr(&self) -> bool {
        matches!(
            self,
            ColumnLocator::Expression(_) | ColumnLocator::NewExpression
        )
    }

    #[inline(always)]
    pub fn is_new_expr(&self) -> bool {
        matches!(self, ColumnLocator::NewExpression)
    }

    pub fn view_type(&self, session: &Session) -> Option<ColumnType> {
        let name = self.name().cloned().unwrap_or_default();
        session.metadata().get_column_view_type(name.as_str())
    }
}

#[derive(Properties)]
pub struct PerspectiveViewerProps {
    pub elem: web_sys::HtmlElement,
    pub session: Session,
    pub renderer: Renderer,
    pub presentation: Presentation,
    pub dragdrop: DragDrop,
    pub custom_events: CustomEvents,

    #[prop_or_default]
    pub weak_link: WeakScope<PerspectiveViewer>,
}

derive_model!(Renderer, Session, Presentation for PerspectiveViewerProps);

impl PartialEq for PerspectiveViewerProps {
    fn eq(&self, _rhs: &Self) -> bool {
        false
    }
}

impl PerspectiveViewerProps {
    fn is_title(&self) -> bool {
        !self.presentation.get_is_workspace() && self.presentation.get_title().is_some()
    }
}

#[derive(Debug)]
pub enum PerspectiveViewerMsg {
    Resize,
    Reset(bool, Option<Sender<()>>),
    ToggleSettingsInit(Option<SettingsUpdate>, Option<Sender<ApiResult<JsValue>>>),
    ToggleSettingsComplete(SettingsUpdate, Sender<()>),
    PreloadFontsUpdate,
    RenderLimits(Option<(usize, usize, Option<usize>, Option<usize>)>),
    SettingsPanelSizeUpdate(Option<i32>),
    ColumnSettingsPanelSizeUpdate(Option<i32>),
    OpenColumnSettings {
        locator: Option<ColumnLocator>,
        sender: Option<Sender<()>>,
        toggle: bool,
    },
}

pub struct PerspectiveViewer {
    dimensions: Option<(usize, usize, Option<usize>, Option<usize>)>,
    on_rendered: Option<Sender<()>>,
    fonts: FontLoaderProps,
    settings_open: bool,
    /// The column which will be opened in the ColumnSettingsSidebar
    selected_column: Option<ColumnLocator>,
    selected_column_is_active: bool, // TODO: should we use a struct?
    on_resize: Rc<PubSub<()>>,
    on_dimensions_reset: Rc<PubSub<()>>,
    _subscriptions: [Subscription; 1],
    settings_panel_width_override: Option<i32>,
    column_settings_panel_width_override: Option<i32>,
}

impl Component for PerspectiveViewer {
    type Message = PerspectiveViewerMsg;
    type Properties = PerspectiveViewerProps;

    fn create(ctx: &Context<Self>) -> Self {
        *ctx.props().weak_link.borrow_mut() = Some(ctx.link().clone());
        let elem = ctx.props().elem.clone();
        let callback = ctx
            .link()
            .callback(|()| PerspectiveViewerMsg::PreloadFontsUpdate);

        let session_sub = {
            clone!(
                ctx.props().presentation,
                ctx.props().session,
                plugin_query = ctx.props().get_plugin_column_styles_query()
            );
            let callback = ctx.link().batch_callback(move |(update, render_limits)| {
                if update {
                    vec![PerspectiveViewerMsg::RenderLimits(Some(render_limits))]
                } else {
                    let locator =
                        presentation
                            .get_open_column_settings()
                            .locator
                            .filter(|locator| match locator {
                                ColumnLocator::Table(ref name) => {
                                    locator.is_active(&session)
                                        && plugin_query
                                            .can_render_column_styles(name)
                                            .unwrap_or_default()
                                },
                                _ => true,
                            });

                    vec![
                        PerspectiveViewerMsg::RenderLimits(Some(render_limits)),
                        PerspectiveViewerMsg::OpenColumnSettings {
                            locator,
                            sender: None,
                            toggle: false,
                        },
                    ]
                }
            });
            ctx.props().renderer.session_changed.add_listener(callback)
        };

        Self {
            dimensions: None,
            on_rendered: None,
            fonts: FontLoaderProps::new(&elem, callback),
            settings_open: false,
            selected_column: None,
            selected_column_is_active: false,
            on_resize: Default::default(),
            on_dimensions_reset: Default::default(),
            _subscriptions: [session_sub],
            settings_panel_width_override: None,
            column_settings_panel_width_override: None,
        }
    }

    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        let needs_update = self.selected_column.is_some();
        match msg {
            PerspectiveViewerMsg::PreloadFontsUpdate => true,
            PerspectiveViewerMsg::Resize => {
                self.on_resize.emit(());
                false
            },
            PerspectiveViewerMsg::Reset(all, sender) => {
                self.selected_column = None;
                clone!(
                    ctx.props().renderer,
                    ctx.props().session,
                    ctx.props().presentation
                );

                ApiFuture::spawn(async move {
                    session.reset(all);
                    let columns_config = if all {
                        presentation.reset_columns_configs();
                        None
                    } else {
                        Some(presentation.all_columns_configs())
                    };
                    renderer.reset(columns_config.as_ref()).await;
                    presentation.reset_available_themes(None).await;
                    let result = renderer.draw(session.validate().await?.create_view()).await;
                    if let Some(sender) = sender {
                        sender.send(()).unwrap();
                    }

                    result
                });

                needs_update
            },
            PerspectiveViewerMsg::ToggleSettingsInit(Some(SettingsUpdate::Missing), None) => false,
            PerspectiveViewerMsg::ToggleSettingsInit(
                Some(SettingsUpdate::Missing),
                Some(resolve),
            ) => {
                resolve.send(Ok(JsValue::UNDEFINED)).unwrap();
                false
            },
            PerspectiveViewerMsg::ToggleSettingsInit(Some(SettingsUpdate::SetDefault), resolve) => {
                self.init_toggle_settings_task(ctx, Some(false), resolve);
                false
            },
            PerspectiveViewerMsg::ToggleSettingsInit(
                Some(SettingsUpdate::Update(force)),
                resolve,
            ) => {
                self.init_toggle_settings_task(ctx, Some(force), resolve);
                false
            },
            PerspectiveViewerMsg::ToggleSettingsInit(None, resolve) => {
                self.init_toggle_settings_task(ctx, None, resolve);
                false
            },
            PerspectiveViewerMsg::ToggleSettingsComplete(SettingsUpdate::SetDefault, resolve)
                if self.settings_open =>
            {
                self.selected_column = None;
                self.settings_open = false;
                self.on_rendered = Some(resolve);
                true
            },
            PerspectiveViewerMsg::ToggleSettingsComplete(
                SettingsUpdate::Update(force),
                resolve,
            ) if force != self.settings_open => {
                self.selected_column = None;
                self.settings_open = force;
                self.on_rendered = Some(resolve);
                true
            },
            PerspectiveViewerMsg::ToggleSettingsComplete(_, resolve)
                if matches!(self.fonts.get_status(), FontLoaderStatus::Finished) =>
            {
                self.selected_column = None;
                resolve.send(()).expect("Orphan render");
                false
            },
            PerspectiveViewerMsg::ToggleSettingsComplete(_, resolve) => {
                self.selected_column = None;
                self.on_rendered = Some(resolve);
                true
            },
            PerspectiveViewerMsg::RenderLimits(dimensions) => {
                if self.dimensions != dimensions {
                    self.dimensions = dimensions;
                    true
                } else {
                    false
                }
            },
            PerspectiveViewerMsg::OpenColumnSettings {
                locator,
                sender,
                toggle,
            } => {
                let is_active = locator
                    .as_ref()
                    .map(|l| l.is_active(&ctx.props().session))
                    .unwrap_or_default();
                self.selected_column_is_active = is_active;

                if toggle && self.selected_column == locator {
                    self.selected_column = None;
                    (false, None)
                } else {
                    self.selected_column = locator.clone();

                    locator
                        .clone()
                        .map(|c| (true, c.name().cloned()))
                        .unwrap_or_default()
                };

                let mut open_column_settings = ctx.props().presentation.get_open_column_settings();
                open_column_settings.locator = self.selected_column.clone();
                ctx.props()
                    .presentation
                    .set_open_column_settings(Some(open_column_settings));

                if let Some(sender) = sender {
                    sender.send(()).unwrap();
                }
                true
            },
            PerspectiveViewerMsg::SettingsPanelSizeUpdate(Some(x)) => {
                self.settings_panel_width_override = Some(x);
                false
            },
            PerspectiveViewerMsg::SettingsPanelSizeUpdate(None) => {
                self.settings_panel_width_override = None;
                false
            },
            PerspectiveViewerMsg::ColumnSettingsPanelSizeUpdate(Some(x)) => {
                self.column_settings_panel_width_override = Some(x);
                false
            },
            PerspectiveViewerMsg::ColumnSettingsPanelSizeUpdate(None) => {
                self.column_settings_panel_width_override = None;
                false
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
    fn rendered(&mut self, ctx: &Context<Self>, _first_render: bool) {
        ctx.props()
            .presentation
            .set_settings_open(Some(self.settings_open))
            .unwrap();

        if self.on_rendered.is_some()
            && matches!(self.fonts.get_status(), FontLoaderStatus::Finished)
        {
            self.on_rendered
                .take()
                .unwrap()
                .send(())
                .expect("Orphan render");
        }
    }

    /// `PerspectiveViewer` has two basic UI modes - "open" and "closed".
    fn view(&self, ctx: &Context<Self>) -> Html {
        let settings = ctx
            .link()
            .callback(|_| PerspectiveViewerMsg::ToggleSettingsInit(None, None));

        let on_close_settings = ctx
            .link()
            .callback(|()| PerspectiveViewerMsg::ToggleSettingsInit(None, None));

        let mut class = classes!("settings-closed");
        if ctx.props().is_title() {
            class.push("titled");
        }

        let on_open_expr_panel =
            ctx.link()
                .callback(|c| PerspectiveViewerMsg::OpenColumnSettings {
                    locator: Some(c),
                    sender: None,
                    toggle: true,
                });

        let on_reset = ctx
            .link()
            .callback(|all| PerspectiveViewerMsg::Reset(all, None));

        let on_split_panel_resize = ctx
            .link()
            .callback(|(x, _)| PerspectiveViewerMsg::SettingsPanelSizeUpdate(Some(x)));

        let on_column_settings_panel_resize = ctx
            .link()
            .callback(|(x, _)| PerspectiveViewerMsg::ColumnSettingsPanelSizeUpdate(Some(x)));

        html! {
            <>
                <StyleProvider>
                    <LocalStyle href={css!("viewer")} />
                    if self.settings_open {
                        <SplitPanel
                            id="app_panel"
                            reverse=true
                            initial_size={self.settings_panel_width_override}
                            on_reset={ctx.link().callback(|_| PerspectiveViewerMsg::SettingsPanelSizeUpdate(None))}
                            on_resize={on_split_panel_resize}
                            on_resize_finished={ctx.props().render_callback()}
                        >
                            <div
                                id="settings_panel"
                                class="sidebar_column noselect split-panel orient-vertical"
                            >
                                if self.selected_column.is_none() {
                                    <SidebarCloseButton
                                        id="settings_close_button"
                                        on_close_sidebar={&on_close_settings}
                                    />
                                }
                                <PluginSelector
                                    session={&ctx.props().session}
                                    renderer={&ctx.props().renderer}
                                    presentation={&ctx.props().presentation}
                                />
                                <ColumnSelector
                                    dragdrop={&ctx.props().dragdrop}
                                    renderer={&ctx.props().renderer}
                                    session={&ctx.props().session}
                                    presentation={&ctx.props().presentation}
                                    on_resize={&self.on_resize}
                                    on_open_expr_panel={&on_open_expr_panel}
                                    on_dimensions_reset={&self.on_dimensions_reset}
                                    selected_column={self.selected_column.clone()}
                                />
                            </div>
                            <div id="main_column">
                                <StatusBar
                                    id="status_bar"
                                    session={&ctx.props().session}
                                    renderer={&ctx.props().renderer}
                                    presentation={&ctx.props().presentation}
                                    {on_reset}
                                />
                                <div id="main_panel_container">
                                    <RenderWarning
                                        dimensions={self.dimensions}
                                        session={&ctx.props().session}
                                        renderer={&ctx.props().renderer}
                                    />
                                    <slot />
                                </div>
                                if let Some(selected_column) = self.selected_column.clone() {
                                    <SplitPanel
                                        id="modal_panel"
                                        reverse=true
                                        initial_size={self.column_settings_panel_width_override}
                                        on_reset={ctx.link().callback(|_| PerspectiveViewerMsg::ColumnSettingsPanelSizeUpdate(None))}
                                        on_resize={on_column_settings_panel_resize}
                                    >
                                        <ColumnSettingsSidebar
                                            session={&ctx.props().session}
                                            renderer={&ctx.props().renderer}
                                            custom_events={&ctx.props().custom_events}
                                            presentation={&ctx.props().presentation}
                                            {selected_column}
                                            on_close={ctx.link().callback(|_| PerspectiveViewerMsg::OpenColumnSettings{ locator: None, sender: None, toggle: false })}
                                            width_override={self.column_settings_panel_width_override}
                                            is_active={self.selected_column_is_active}
                                        />
                                        <></>
                                    </SplitPanel>
                                }
                            </div>
                        </SplitPanel>
                    } else {
                        <RenderWarning
                            dimensions={self.dimensions}
                            session={&ctx.props().session}
                            renderer={&ctx.props().renderer}
                        />
                        if ctx.props().is_title() {
                            <StatusBar
                                id="status_bar"
                                session={&ctx.props().session}
                                renderer={&ctx.props().renderer}
                                presentation={&ctx.props().presentation}
                                {on_reset}
                            />
                        }
                        <div id="main_panel_container" {class}><slot /></div>
                        if !ctx.props().presentation.get_is_workspace() {
                            <div
                                id="settings_button"
                                class={if ctx.props().is_title() { "noselect button closed titled" } else { "noselect button closed" }}
                                onmousedown={settings}
                            />
                        }
                    }
                </StyleProvider>
                <FontLoader ..self.fonts.clone() />
            </>
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
                    PerspectiveViewerMsg::ToggleSettingsComplete(update, resolve)
                });

                clone!(ctx.props().renderer, ctx.props().session);
                ApiFuture::spawn(async move {
                    let result = if session.js_get_table().is_some() {
                        renderer.presize(force, callback.emit_async_safe()).await
                    } else {
                        callback.emit_async_safe().await?;
                        Ok(JsValue::UNDEFINED)
                    };

                    if let Some(sender) = sender {
                        let msg = result.clone().ignore_view_delete();
                        sender.send(msg).into_apierror()?;
                    };

                    result
                });
            },
        };
    }
}
