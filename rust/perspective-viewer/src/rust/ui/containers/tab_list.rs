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

use std::fmt::Display;

use yew::{Callback, Children, Component, Html, Properties, classes, html};

use crate::ui::form::intl_label::{intl_content_style, intl_slug};

pub trait TabItem: PartialEq + Display + Clone + Default + 'static {}

impl TabItem for String {}

impl TabItem for &'static str {}

#[derive(Properties, Debug, PartialEq)]
pub struct TabListProps<T: TabItem> {
    pub tabs: Vec<T>,

    pub on_tab_change: Callback<(usize, T)>,

    pub selected_tab: Option<usize>,

    pub children: Children,
}

pub enum TabListMsg {
    SetSelected(usize),
}

pub struct TabList<T: TabItem> {
    t: std::marker::PhantomData<T>,
    selected_idx: usize,
}

impl<T: TabItem> Component for TabList<T> {
    type Message = TabListMsg;
    type Properties = TabListProps<T>;

    fn create(_ctx: &yew::Context<Self>) -> Self {
        Self {
            t: std::marker::PhantomData,
            selected_idx: 0,
        }
    }

    fn update(&mut self, ctx: &yew::Context<Self>, msg: Self::Message) -> bool {
        match msg {
            TabListMsg::SetSelected(idx) => {
                ctx.props()
                    .on_tab_change
                    .emit((idx, ctx.props().tabs[idx].clone()));
                self.selected_idx = idx;
                true
            },
        }
    }

    fn changed(&mut self, ctx: &yew::Context<Self>, _old_props: &Self::Properties) -> bool {
        self.selected_idx = ctx.props().selected_tab.unwrap_or_default();
        true
    }

    fn view(&self, ctx: &yew::Context<Self>) -> Html {
        let p = ctx.props();
        let gutter_tabs = p.tabs.iter().enumerate().map(|(idx, tab)| {
            let mut class = classes!("settings_tab");
            if idx == self.selected_idx {
                class.push("selected_tab");
            }

            let onclick = ctx.link().callback(move |_| TabListMsg::SetSelected(idx));
            let title = tab.to_string();
            let style = intl_content_style(&format!("{}-tab", intl_slug(&title)));
            html! {
                <span {class} {onclick}>
                    <div class="tab-title" id={title} {style} />
                    <div class="tab-border" />
                </span>
            }
        });

        html! {
            <>
                <div id="settings_tab_bar">{ for gutter_tabs }</div>
                <div id="format-tab" class="tab-content scrollable">
                    { ctx.props().children.iter().nth(self.selected_idx) }
                </div>
            </>
        }
    }
}
