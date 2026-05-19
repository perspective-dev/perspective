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

use yew::{Callback, Children, Component, Html, Properties, classes, html};

use crate::components::style::LocalStyle;
use crate::css;
use crate::presentation::ColumnTab;

#[derive(Properties, Debug, PartialEq)]
pub struct TabListProps<T: ColumnTab> {
    /// All tabs
    pub tabs: Vec<T>,

    /// Fires when the selected tab changes in the UI.
    pub on_tab_change: Callback<(usize, T)>,

    // Which tab is selected.
    pub selected_tab: Option<usize>,

    // The currently instantiated tabs.
    pub children: Children,
}

pub enum TabListMsg {
    SetSelected(usize),
}

pub struct TabList<T: ColumnTab> {
    t: std::marker::PhantomData<T>,
    selected_idx: usize,
}

impl<T: ColumnTab> Component for TabList<T> {
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
            html! {
                <span {class} {onclick}>
                    <div class="tab-title" id={tab.to_string()} />
                    <div class="tab-border" />
                </span>
            }
        });

        html! {
            <>
                <LocalStyle href={css!("containers/tabs")} />
                <div id="settings_tab_bar">{ for gutter_tabs }</div>
                <div id="format-tab" class="tab-content scrollable">
                    { ctx.props().children.iter().nth(self.selected_idx) }
                </div>
            </>
        }
    }
}
