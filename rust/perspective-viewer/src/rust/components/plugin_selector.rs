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

use yew::prelude::*;

use super::containers::select::*;
use super::style::LocalStyle;
use crate::config::*;
use crate::js::*;
use crate::model::*;
use crate::presentation::Presentation;
use crate::renderer::*;
use crate::session::*;
use crate::utils::*;
use crate::*;

#[derive(Properties, PartialEq)]
pub struct PluginSelectorProps {
    pub renderer: Renderer,
    pub session: Session,
    pub presentation: Presentation,

    #[cfg(test)]
    #[prop_or_default]
    pub weak_link: WeakScope<PluginSelector>,
}

derive_model!(Renderer, Session, Presentation for PluginSelectorProps);

#[derive(Debug)]
pub enum PluginSelectorMsg {
    ComponentSelectPlugin(String),
    RendererSelectPlugin(String),
    OpenMenu,
}

use PluginSelectorMsg::*;

pub struct PluginSelector {
    options: Vec<SelectItem<String>>,
    is_open: bool,
    _plugin_sub: Subscription,
}

impl Component for PluginSelector {
    type Message = PluginSelectorMsg;
    type Properties = PluginSelectorProps;

    fn create(ctx: &Context<Self>) -> Self {
        let options = generate_plugin_optgroups(&ctx.props().renderer);
        let _plugin_sub = ctx.props().renderer.plugin_changed.add_listener({
            let link = ctx.link().clone();
            move |plugin: JsPerspectiveViewerPlugin| {
                let name = plugin.name();
                link.send_message(PluginSelectorMsg::RendererSelectPlugin(name))
            }
        });

        Self {
            options,
            is_open: false,
            _plugin_sub,
        }
    }

    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            RendererSelectPlugin(_plugin_name) => true,
            ComponentSelectPlugin(plugin_name) => {
                ctx.props()
                    .renderer
                    .update_plugin(&PluginUpdate::Update(plugin_name))
                    .unwrap();

                let mut update = ViewConfigUpdate::default();
                ctx.props()
                    .session
                    .set_update_column_defaults(&mut update, &ctx.props().renderer.metadata());

                ctx.props().presentation.set_open_column_settings(None);
                ApiFuture::spawn(ctx.props().update_and_render(update));
                self.is_open = false;
                false
            },
            OpenMenu => {
                self.is_open = !self.is_open;
                true
            },
        }
    }

    fn changed(&mut self, _ctx: &Context<Self>, _old: &Self::Properties) -> bool {
        true
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let callback = ctx.link().callback(|_| OpenMenu);

        let plugin_name = ctx.props().renderer.get_active_plugin().unwrap().name();
        let plugin_name2 = plugin_name.clone();
        let class = if self.is_open { "open" } else { "" };
        let items = self.options.iter().map(|item| match item {
            SelectItem::OptGroup(_cat, items) => html! {
                items.iter().filter(|x| *x != &plugin_name2).map(|x| {
                    let callback = ctx.link().callback(ComponentSelectPlugin);
                    html! {
                        <PluginSelect
                            name={ x.to_owned() }
                            on_click={ callback } />
                    }
                }).collect::<Html>()
            },
            SelectItem::Option(_item) => html! {},
        });

        html! {
            <>
                <LocalStyle href={css!("plugin-selector")} />
                <div id="plugin_selector_container" {class}>
                    <PluginSelect name={plugin_name} on_click={callback} />
                    <div id="plugin_selector_border" />
                    if self.is_open { { items.collect::<Html>() } }
                </div>
            </>
        }
    }
}

/// Generate the opt groups for the plugin selector by collecting by category
/// then sorting.
fn generate_plugin_optgroups(renderer: &Renderer) -> Vec<SelectItem<String>> {
    let mut options = renderer
        .get_all_plugin_categories()
        .into_iter()
        .map(|(category, value)| SelectItem::OptGroup(category.into(), value))
        .collect::<Vec<_>>();

    options.sort_by_key(|x| x.name());
    options
}

#[derive(Properties, PartialEq)]
struct PluginSelectProps {
    name: String,
    on_click: Callback<String>,
}

#[function_component]
fn PluginSelect(props: &PluginSelectProps) -> Html {
    let name = props.name.clone().tee::<2>();
    let path: String = props
        .name
        .chars()
        .map(|x| {
            if x.is_alphanumeric() {
                x.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect();

    html! {
        <div
            class="plugin-select-item"
            data-plugin={name.0}
            style={format!("--default-column-title:var(--plugin-name-{}--content, \"{}\")", path, props.name)}
            onclick={props.on_click.reform(move |_| name.1.clone())}
        >
            <span class="plugin-select-item-name" />
        </div>
    }
}
