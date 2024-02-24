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

use wasm_bindgen::JsCast;
use web_sys::*;
use yew::prelude::*;

use super::style::LocalStyle;
use crate::components::containers::select::*;
use crate::components::status_bar_counter::StatusBarRowsCounter;
use crate::custom_elements::copy_dropdown::*;
use crate::custom_elements::export_dropdown::*;
use crate::presentation::Presentation;
use crate::renderer::*;
use crate::session::*;
#[cfg(test)]
use crate::utils::WeakScope;
use crate::utils::*;
use crate::*;

#[derive(Properties)]
pub struct StatusBarProps {
    pub id: String,
    pub on_reset: Callback<bool>,
    pub session: Session,
    pub renderer: Renderer,
    pub presentation: Presentation,

    #[cfg(test)]
    #[prop_or_default]
    pub weak_link: WeakScope<StatusBar>,
}

derive_model!(Renderer, Session, Presentation for StatusBarProps);

impl PartialEq for StatusBarProps {
    fn eq(&self, other: &Self) -> bool {
        self.id == other.id
    }
}

pub enum StatusBarMsg {
    Reset(bool),
    Export,
    Copy,
    SetThemeConfig((Vec<String>, Option<usize>)),
    SetTheme(String),
    TableStatsChanged,
    SetIsUpdating(bool),
    SetTitle(Option<String>),
}

/// A toolbar with buttons, and `Table` & `View` status information.
pub struct StatusBar {
    is_updating: i32,
    theme: Option<String>,
    themes: Vec<String>,
    export_ref: NodeRef,
    copy_ref: NodeRef,
    export_dropdown: Option<ExportDropDownMenuElement>,
    copy_dropdown: Option<CopyDropDownMenuElement>,
    _sub: [Subscription; 5],
}

impl Component for StatusBar {
    type Message = StatusBarMsg;
    type Properties = StatusBarProps;

    fn create(ctx: &Context<Self>) -> Self {
        let _sub = [
            ctx.props()
                .session
                .stats_changed
                .add_listener(ctx.link().callback(|_| StatusBarMsg::TableStatsChanged)),
            ctx.props()
                .session
                .view_config_changed
                .add_listener(ctx.link().callback(|_| StatusBarMsg::SetIsUpdating(true))),
            ctx.props()
                .session
                .view_created
                .add_listener(ctx.link().callback(|_| StatusBarMsg::SetIsUpdating(false))),
            ctx.props()
                .presentation
                .theme_config_updated
                .add_listener(ctx.link().callback(StatusBarMsg::SetThemeConfig)),
            ctx.props()
                .presentation
                .title_changed
                .add_listener(ctx.link().callback(|_| StatusBarMsg::TableStatsChanged)),
        ];

        // Fetch initial theme
        let presentation = ctx.props().presentation.clone();
        let on_theme = ctx.link().callback(StatusBarMsg::SetThemeConfig);
        ApiFuture::spawn(async move {
            on_theme.emit(presentation.get_selected_theme_config().await?);
            Ok(())
        });

        Self {
            _sub,
            theme: None,
            themes: vec![],
            copy_dropdown: None,
            copy_ref: NodeRef::default(),
            export_dropdown: None,
            export_ref: NodeRef::default(),
            is_updating: 0,
        }
    }

    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            StatusBarMsg::SetIsUpdating(is_updating) => {
                self.is_updating = max!(0, self.is_updating + if is_updating { 1 } else { -1 });
                true
            },
            StatusBarMsg::TableStatsChanged => true,
            StatusBarMsg::Reset(all) => {
                ctx.props().on_reset.emit(all);
                false
            },
            StatusBarMsg::SetThemeConfig((themes, index)) => {
                let new_theme = index.and_then(|x| themes.get(x)).cloned();
                let should_render = new_theme != self.theme || self.themes != themes;
                self.theme = new_theme;
                self.themes = themes;
                should_render
            },
            StatusBarMsg::SetTheme(theme_name) => {
                clone!(
                    ctx.props().renderer,
                    ctx.props().session,
                    ctx.props().presentation
                );
                ApiFuture::spawn(async move {
                    presentation.set_theme_name(Some(&theme_name)).await?;
                    let view = session.get_view().into_apierror()?;
                    renderer.restyle_all(&view).await
                });

                false
            },
            StatusBarMsg::Export => {
                let target = self.export_ref.cast::<HtmlElement>().unwrap();
                self.export_dropdown
                    .get_or_insert_with(|| ExportDropDownMenuElement::new_from_model(ctx.props()))
                    .open(target);
                false
            },
            StatusBarMsg::Copy => {
                let target = self.copy_ref.cast::<HtmlElement>().unwrap();
                self.copy_dropdown
                    .get_or_insert_with(|| CopyDropDownMenuElement::new_from_model(ctx.props()))
                    .open(target);
                false
            },
            StatusBarMsg::SetTitle(title) => {
                ctx.props().presentation.set_title(title);
                false
            },
        }
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let stats = ctx.props().session.get_table_stats();
        let class_name = self.status_class_name(&stats);
        let mut is_updating_class_name = classes!();
        if self.is_updating > 0 {
            is_updating_class_name.push("updating")
        };

        if ctx.props().presentation.get_title().is_some() {
            is_updating_class_name.push("titled")
        };

        let reset = ctx
            .link()
            .callback(|event: MouseEvent| StatusBarMsg::Reset(event.shift_key()));

        let export = ctx.link().callback(|_: MouseEvent| StatusBarMsg::Export);
        let copy = ctx.link().callback(|_: MouseEvent| StatusBarMsg::Copy);

        let theme_button = match &self.theme {
            None => html! {},
            Some(selected) => {
                let ontheme = ctx.link().callback(StatusBarMsg::SetTheme);
                let values = self
                    .themes
                    .iter()
                    .cloned()
                    .map(SelectItem::Option)
                    .collect::<Vec<_>>();

                html! {
                    if values.len() > 1 {
                        <span id="theme" class="button">
                            <Select<String>
                                id="theme_selector"
                                {values}
                                selected={selected.to_owned()}
                                on_select={ontheme}
                            />
                        </span>
                    }
                }
            },
        };

        let oninput = ctx.link().callback({
            move |input: InputEvent| {
                let title = input
                    .target()
                    .unwrap()
                    .unchecked_into::<HtmlInputElement>()
                    .value();

                let title = if title.trim().is_empty() {
                    None
                } else {
                    Some(title)
                };

                StatusBarMsg::SetTitle(title)
            }
        });

        html! {
            <>
                <LocalStyle href={css!("status-bar")} />
                <div id={ctx.props().id.clone()} class={is_updating_class_name}>
                    <div class="section"><span id="status" class={class_name} /></div>
                    <label
                        class="input-sizer"
                        data-value={ctx.props().presentation.get_title().unwrap_or_default()}
                    >
                        <input
                            placeholder=" "
                            value={ctx.props().presentation.get_title()}
                            size="10"
                            {oninput}
                        />
                        <span id="status-bar-placeholder" />
                    </label>
                    <div id="rows" class="section"><StatusBarRowsCounter {stats} /></div>
                    <div id="menu-bar" class="section">
                        { theme_button }
                        <div id="plugin-settings"><slot name="plugin-settings" /></div>
                        <span id="reset" class="button" onmousedown={reset}><span /></span>
                        <span
                            ref={&self.export_ref}
                            id="export"
                            class="button"
                            onmousedown={export}
                        >
                            <span />
                        </span>
                        <span ref={&self.copy_ref} id="copy" class="button" onmousedown={copy}>
                            <span />
                        </span>
                    </div>
                </div>
            </>
        }
    }
}

impl StatusBar {
    const fn status_class_name(&self, stats: &Option<ViewStats>) -> &'static str {
        match stats {
            Some(ViewStats {
                num_table_cells: Some(_),
                ..
            }) => "connected",
            Some(ViewStats {
                num_table_cells: None,
                ..
            }) => "initializing",
            None => "uninitialized",
        }
    }
}
