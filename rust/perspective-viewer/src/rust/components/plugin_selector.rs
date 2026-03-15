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

use yew::prelude::*;

use super::style::LocalStyle;
use crate::css;

/// Pure value props — no engine handles, no PubSub subscriptions.
/// The parent passes updated values whenever the renderer state changes.
#[derive(Properties, PartialEq)]
pub struct PluginSelectorProps {
    /// Name of the currently active plugin.
    pub plugin_name: Option<String>,

    /// Flat list of all registered plugin names (all categories merged).
    pub available_plugins: Rc<Vec<String>>,

    /// Called when the user selects a different plugin.
    pub on_select_plugin: Callback<String>,
}

#[derive(Debug)]
pub enum PluginSelectorMsg {
    ComponentSelectPlugin(String),
    OpenMenu,
}

use PluginSelectorMsg::*;

pub struct PluginSelector {
    is_open: bool,
}

impl Component for PluginSelector {
    type Message = PluginSelectorMsg;
    type Properties = PluginSelectorProps;

    fn create(_ctx: &Context<Self>) -> Self {
        Self { is_open: false }
    }

    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            ComponentSelectPlugin(plugin_name) => {
                ctx.props().on_select_plugin.emit(plugin_name);
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
        let plugin_name = ctx
            .props()
            .plugin_name
            .clone()
            .unwrap_or_default();
        let plugin_name2 = plugin_name.clone();
        let class = if self.is_open { "open" } else { "" };
        let items = ctx
            .props()
            .available_plugins
            .iter()
            .filter(|x| x.as_str() != plugin_name2.as_str())
            .map(|x| {
                let callback = ctx.link().callback(ComponentSelectPlugin);
                html! {
                    <PluginSelect
                        name={ x.to_owned() }
                        on_click={ callback } />
                }
            });

        html! {
            <>
                <LocalStyle href={css!("plugin-selector")} />
                <div id="plugin_selector_container" {class}>
                    <PluginSelect name={plugin_name} on_click={callback} />
                    <div id="plugin_selector_border" />
                    if self.is_open {
                        <div class="plugin-selector-options">{ items.collect::<Html>() }</div>
                    }
                </div>
            </>
        }
    }
}

#[derive(Properties, PartialEq)]
struct PluginSelectProps {
    name: String,
    on_click: Callback<String>,
}

#[function_component]
fn PluginSelect(props: &PluginSelectProps) -> Html {
    let name = props.name.clone();
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
            data-plugin={name.clone()}
            style={format!("--default-column-title:var(--plugin-name-{}--content, \"{}\")", path, props.name)}
            onclick={props.on_click.reform(move |_| name.clone())}
        >
            <span class="plugin-select-item-name" />
        </div>
    }
}
