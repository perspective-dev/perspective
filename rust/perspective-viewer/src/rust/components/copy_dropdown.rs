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

use super::containers::dropdown_menu::*;
use super::modal::*;
use super::style::StyleProvider;
use crate::tasks::*;
use crate::renderer::*;
use crate::utils::*;

type CopyDropDownMenuItem = DropDownMenuItem<ExportFile>;

#[derive(Properties, PartialEq)]
pub struct CopyDropDownMenuProps {
    pub callback: Callback<ExportFile>,
    pub root: web_sys::HtmlElement,
    pub renderer: Renderer,

    #[prop_or_default]
    weak_link: WeakScope<CopyDropDownMenu>,
}

impl ModalLink<CopyDropDownMenu> for CopyDropDownMenuProps {
    fn weak_link(&self) -> &'_ WeakScope<CopyDropDownMenu> {
        &self.weak_link
    }
}

pub struct CopyDropDownMenu {}

impl Component for CopyDropDownMenu {
    type Message = ();
    type Properties = CopyDropDownMenuProps;

    fn create(ctx: &Context<Self>) -> Self {
        ctx.set_modal_link();
        Self {}
    }

    fn update(&mut self, _ctx: &Context<Self>, _msg: Self::Message) -> bool {
        true
    }

    fn view(&self, ctx: &Context<Self>) -> yew::virtual_dom::VNode {
        let plugin = ctx.props().renderer.get_active_plugin().unwrap();
        let is_chart = plugin.name().as_str() != "Datagrid";
        let has_selection = ctx.props().renderer.get_selection().is_some();
        html! {
            <StyleProvider root={ctx.props().root.clone()}>
                <DropDownMenu<ExportFile>
                    values={Rc::new(get_menu_items(is_chart, has_selection))}
                    callback={&ctx.props().callback}
                />
            </StyleProvider>
        }
    }
}

fn get_menu_items(is_chart: bool, has_selection: bool) -> Vec<CopyDropDownMenuItem> {
    let mut items = vec![
        CopyDropDownMenuItem::OptGroup(
            "Current View".into(),
            if is_chart {
                vec![
                    ExportMethod::Csv.new_file("clipboard", is_chart),
                    ExportMethod::Json.new_file("clipboard", is_chart),
                    ExportMethod::Ndjson.new_file("clipboard", is_chart),
                    ExportMethod::Plugin.new_file("clipboard", is_chart),
                ]
            } else {
                vec![
                    ExportMethod::Csv.new_file("clipboard", is_chart),
                    ExportMethod::Json.new_file("clipboard", is_chart),
                    ExportMethod::Ndjson.new_file("clipboard", is_chart),
                ]
            },
        ),
        CopyDropDownMenuItem::OptGroup("All".into(), vec![
            ExportMethod::CsvAll.new_file("clipboard", is_chart),
            ExportMethod::JsonAll.new_file("clipboard", is_chart),
            ExportMethod::NdjsonAll.new_file("clipboard", is_chart),
        ]),
        CopyDropDownMenuItem::OptGroup("Config".into(), vec![
            ExportMethod::JsonConfig.new_file("clipboard", is_chart),
        ]),
    ];

    if has_selection {
        items.insert(
            0,
            CopyDropDownMenuItem::OptGroup(
                "Current Selection".into(),
                if is_chart {
                    vec![
                        ExportMethod::CsvSelected.new_file("clipboard", is_chart),
                        ExportMethod::JsonSelected.new_file("clipboard", is_chart),
                        ExportMethod::NdjsonSelected.new_file("clipboard", is_chart),
                    ]
                } else {
                    vec![
                        ExportMethod::CsvSelected.new_file("clipboard", is_chart),
                        ExportMethod::JsonSelected.new_file("clipboard", is_chart),
                        ExportMethod::NdjsonSelected.new_file("clipboard", is_chart),
                        ExportMethod::Plugin.new_file("clipboard", is_chart),
                    ]
                },
            ),
        )
    }

    items
}
