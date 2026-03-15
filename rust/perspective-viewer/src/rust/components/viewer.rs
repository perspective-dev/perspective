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
use wasm_bindgen::prelude::*;
use yew::prelude::*;

use super::containers::split_panel::SplitPanel;
use super::font_loader::{FontLoader, FontLoaderProps, FontLoaderStatus};
use super::form::debug::DebugPanel;
use super::style::{LocalStyle, StyleProvider};
use crate::components::column_settings_sidebar::ColumnSettingsPanel;
use crate::components::main_panel::MainPanel;
use crate::components::settings_panel::SettingsPanel;
use crate::config::*;
use crate::css;
use crate::custom_events::CustomEvents;
use crate::dragdrop::*;
use crate::js::JsPerspectiveViewerPlugin;
use crate::presentation::{ColumnLocator, ColumnSettingsTab, Presentation};
use crate::renderer::*;
use crate::session::*;
use crate::state::{DragDropProps, PresentationProps, RendererProps, SessionProps};
use crate::tasks::*;
use crate::utils::*;

#[derive(Clone, Properties)]
pub struct PerspectiveViewerProps {
    /// The light DOM element this component will render to.
    pub elem: web_sys::HtmlElement,

    /// State
    pub custom_events: CustomEvents,
    pub dragdrop: DragDrop,
    pub session: Session,
    pub renderer: Renderer,
    pub presentation: Presentation,
}

impl PartialEq for PerspectiveViewerProps {
    fn eq(&self, _rhs: &Self) -> bool {
        false
    }
}

impl HasCustomEvents for PerspectiveViewerProps {
    fn custom_events(&self) -> &CustomEvents {
        &self.custom_events
    }
}

impl HasDragDrop for PerspectiveViewerProps {
    fn dragdrop(&self) -> &DragDrop {
        &self.dragdrop
    }
}

impl HasPresentation for PerspectiveViewerProps {
    fn presentation(&self) -> &Presentation {
        &self.presentation
    }
}

impl HasRenderer for PerspectiveViewerProps {
    fn renderer(&self) -> &Renderer {
        &self.renderer
    }
}

impl HasSession for PerspectiveViewerProps {
    fn session(&self) -> &Session {
        &self.session
    }
}

impl StateProvider for PerspectiveViewerProps {
    type State = PerspectiveViewerProps;

    fn clone_state(&self) -> Self::State {
        self.clone()
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
    ToggleDebug,
    ToggleSettingsComplete(SettingsUpdate, Sender<()>),
    ToggleSettingsInit(Option<SettingsUpdate>, Option<Sender<ApiResult<JsValue>>>),
    UpdateSession(Box<SessionProps>),
    UpdateRenderer(Box<RendererProps>),
    UpdatePresentation(Box<PresentationProps>),
    /// Update only `is_settings_open` in the presentation snapshot without
    /// touching `available_themes` (which requires async data).
    UpdateSettingsOpen(bool),
    /// Update only `open_column_settings` in the presentation snapshot.
    UpdateColumnSettings(Box<crate::presentation::OpenColumnSettings>),
    UpdateDragDrop(Box<DragDropProps>),
    /// Update only stats-related fields of `session_props` without touching
    /// `config`.  This prevents `stats_changed` events (e.g. from `reset()`)
    /// from propagating a freshly-cleared config to the column selector.
    UpdateSessionStats(Option<ViewStats>, bool),
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
    settings_open: bool,
    settings_panel_width_override: Option<i32>,
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
}

impl Component for PerspectiveViewer {
    type Message = PerspectiveViewerMsg;
    type Properties = PerspectiveViewerProps;

    fn create(ctx: &Context<Self>) -> Self {
        let elem = ctx.props().elem.clone();
        let fonts = FontLoaderProps::new(&elem, ctx.link().callback(|()| PreloadFontsUpdate));

        // Existing subscription: re-check column locator on render-limits change.
        let render_limits_sub = {
            clone!(
                ctx.props().presentation,
                ctx.props().renderer,
                ctx.props().session
            );
            let callback = ctx.link().batch_callback(move |(update, _)| {
                if update {
                    vec![]
                } else {
                    let locator = get_current_column_locator(
                        &presentation.get_open_column_settings(),
                        &renderer,
                        &session.get_view_config(),
                        &session.metadata(),
                    );
                    vec![OpenColumnSettings {
                        locator,
                        sender: None,
                        toggle: false,
                    }]
                }
            });
            ctx.props()
                .renderer
                .render_limits_changed
                .add_listener(callback)
        };

        // --- Value-prop snapshot subscriptions ----------------------------------
        // Each subscription snapshots the relevant engine state and dispatches
        // an `Update*` message so the root keeps `*_props` fields current.

        let session_props_sub = {
            let session = ctx.props().session.clone();
            let cb = ctx
                .link()
                .callback(move |_: ()| UpdateSession(Box::new(session.to_props())));
            // Fire on any session change that affects the snapshot.
            let s = &ctx.props().session;
            let sub1 = s.stats_changed.add_listener({
                let session = ctx.props().session.clone();
                let stats_cb = ctx.link().callback(move |_: ()| {
                    UpdateSessionStats(session.get_table_stats(), session.has_table())
                });
                move |_| stats_cb.emit(())
            });
            let sub2 = s.table_loaded.add_notify_listener(&cb);
            let sub3 = s.table_errored.add_notify_listener(&cb);
            let sub4 = s.table_unloaded.add_notify_listener(&cb);
            let sub5 = s.view_created.add_notify_listener(&cb);
            let sub6 = s.view_config_changed.add_notify_listener(&cb);
            let sub7 = s.title_changed.add_notify_listener(&cb);
            let sub8 = s
                .view_config_changed
                .add_listener(ctx.link().callback(|_| IncrementUpdateCount));
            let sub9 = s
                .view_created
                .add_listener(ctx.link().callback(|_| DecrementUpdateCount));
            vec![sub1, sub2, sub3, sub4, sub5, sub6, sub7, sub8, sub9]
        };

        let renderer_props_sub = {
            let renderer = ctx.props().renderer.clone();
            let cb_plugin = ctx.link().callback({
                let renderer = renderer.clone();
                move |_: JsPerspectiveViewerPlugin| {
                    UpdateRenderer(Box::new(renderer.to_props(None)))
                }
            });
            let cb_limits = ctx.link().callback({
                let renderer = renderer.clone();
                move |limits: (bool, RenderLimits)| {
                    UpdateRenderer(Box::new(renderer.to_props(Some(limits))))
                }
            });
            let sub1 = renderer.plugin_changed.add_listener(cb_plugin);
            let sub2 = renderer.render_limits_changed.add_listener(cb_limits);
            vec![sub1, sub2]
        };

        let presentation_props_sub = {
            let presentation = ctx.props().presentation.clone();
            let cb_settings = ctx.link().callback(UpdateSettingsOpen);
            let cb_theme = {
                let pres = presentation.clone();
                ctx.link()
                    .callback(move |(themes, _): (std::rc::Rc<Vec<String>>, _)| {
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

        // Initial snapshots (synchronous; themes start empty until async detection
        // fires `theme_config_updated`).
        let session_props = ctx.props().session.to_props();
        let renderer_props = ctx.props().renderer.to_props(None);
        let presentation_props = ctx.props().presentation.to_props(std::rc::Rc::new(vec![]));

        // Subscribe to drag-start/end/drop to keep `dragdrop_props` in sync.
        // Components use `drag_column` from this prop for visual feedback
        // (dragdrop-highlight class) rather than subscribing to these events
        // individually.
        let dragdrop_props_sub = {
            let dragdrop = ctx.props().dragdrop.clone();
            let cb = ctx
                .link()
                .callback(move |_| UpdateDragDrop(Box::new(dragdrop.to_props())));
            let cb_clear = ctx
                .link()
                .callback(|_: ()| UpdateDragDrop(Box::new(DragDropProps::default())));
            let sub1 = ctx.props().dragdrop.dragstart_received.add_listener(cb);
            let sub2 = ctx.props().dragdrop.dragend_received.add_notify_listener(&cb_clear);
            let sub3 = ctx.props().dragdrop.drop_received.add_notify_listener(&cb_clear);
            vec![sub1, sub2, sub3]
        };

        let mut subscriptions = vec![render_limits_sub];
        subscriptions.extend(session_props_sub);
        subscriptions.extend(renderer_props_sub);
        subscriptions.extend(presentation_props_sub);
        subscriptions.extend(dragdrop_props_sub);

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
            let cb = ctx.link().callback(move |themes: Rc<Vec<String>>| {
                UpdatePresentation(Box::new(presentation.to_props(themes)))
            });
            let presentation = ctx.props().presentation.clone();
            ApiFuture::spawn(async move {
                let themes = presentation.get_available_themes().await?;
                cb.emit(themes);
                Ok(())
            });
        }

        Self {
            _subscriptions: subscriptions,
            column_settings_panel_width_override: None,
            debug_open: false,
            fonts,
            on_close_column_settings,
            on_rendered: None,
            on_resize: Default::default(),
            settings_open: false,
            settings_panel_width_override: None,
            session_props,
            renderer_props,
            presentation_props,
            dragdrop_props: DragDropProps::default(),
            update_count: 0,
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
                ctx.props().presentation.set_open_column_settings(None);
                clone!(
                    ctx.props().renderer,
                    ctx.props().session,
                    ctx.props().presentation
                );

                ApiFuture::spawn(async move {
                    session
                        .reset(ResetOptions {
                            config: true,
                            expressions: all,
                            ..ResetOptions::default()
                        })
                        .await?;
                    let columns_config = if all {
                        presentation.reset_columns_configs();
                        None
                    } else {
                        Some(presentation.all_columns_configs())
                    };

                    renderer.reset(columns_config.as_ref()).await?;
                    presentation.reset_available_themes(None).await;
                    if all {
                        presentation.reset_theme().await?;
                    }

                    let result = renderer.draw(session.validate().await?.create_view()).await;
                    if let Some(sender) = sender {
                        sender.send(()).unwrap();
                    }

                    renderer.reset_changed.emit(());
                    result
                });

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
                ctx.props().presentation.set_open_column_settings(None);
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
                false
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
            custom_events,
            dragdrop,
            presentation,
            renderer,
            session,
            ..
        } = ctx.props();

        let is_settings_open = self.settings_open && self.session_props.has_table;
        let mut class = classes!();
        if !is_settings_open {
            class.push("settings-closed");
        }

        if self.session_props.title.is_some() {
            class.push("titled");
        }

        let on_open_expr_panel = ctx.link().callback(|c| OpenColumnSettings {
            locator: Some(c),
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
        let has_table = self.session_props.has_table;
        let named_column_count = self
            .renderer_props
            .requirements
            .names
            .as_ref()
            .map(|n| n.len())
            .unwrap_or(0);
        let view_config = self.session_props.config.clone();
        let drag_column = self.dragdrop_props.column.clone();
        let metadata = self.session_props.metadata.clone();
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
                    {drag_column}
                    metadata={metadata.clone()}
                    open_column_settings={self.presentation_props.open_column_settings.clone()}
                    {dragdrop}
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
                        {custom_events}
                        {presentation}
                        {renderer}
                        {session}
                    />
                    <></>
                </SplitPanel>
            }
        };

        let on_reset = ctx.link().callback(|all| Reset(all, None));
        let render_limits = self.renderer_props.render_limits.map(|(_, dims)| dims);
        let has_table = self.session_props.has_table;
        let is_errored = self.session_props.error.is_some();
        let stats = self.session_props.stats.clone();
        let update_count = self.update_count;
        let error = self.session_props.error.clone();
        let is_settings_open = self.settings_open && self.session_props.has_table;
        let title = self.session_props.title.clone();
        let selected_theme = self.presentation_props.selected_theme.clone();
        let available_themes = self.presentation_props.available_themes.clone();
        let main_panel = html! {
            <MainPanel
                {on_settings}
                {on_reset}
                {render_limits}
                {has_table}
                {is_errored}
                {stats}
                {update_count}
                {error}
                {is_settings_open}
                {title}
                {selected_theme}
                {available_themes}
                is_workspace={self.presentation_props.is_workspace}
                {custom_events}
                {presentation}
                {renderer}
                {session}
            />
        };

        let debug_panel = html! {
            if self.debug_open { <DebugPanel {presentation} {renderer} {session} /> }
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
                            on_resize={on_split_panel_resize.clone()}
                            on_resize_finished={ctx.props().render_callback()}
                        >
                            { debug_panel }
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
