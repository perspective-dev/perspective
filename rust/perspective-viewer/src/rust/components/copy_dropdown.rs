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
use crate::config::*;
use crate::renderer::*;

type CopyDropDownMenuItem = DropDownMenuItem<ExportFile>;

#[derive(Properties, PartialEq)]
pub struct CopyDropDownMenuProps {
    pub callback: Callback<ExportFile>,
    pub renderer: Renderer,
}

pub struct CopyDropDownMenu {}

impl Component for CopyDropDownMenu {
    type Message = ();
    type Properties = CopyDropDownMenuProps;

    fn create(_ctx: &Context<Self>) -> Self {
        Self {}
    }

    fn update(&mut self, _ctx: &Context<Self>, _msg: Self::Message) -> bool {
        true
    }

    fn view(&self, ctx: &Context<Self>) -> yew::virtual_dom::VNode {
        let is_chart = ctx.props().renderer.is_chart();
        let has_selection = ctx.props().renderer.get_selection().is_some();
        html! {
            <>
                <div id="test" />
                <DropDownMenu<ExportFile>
                    values={Rc::new(get_menu_items(is_chart, has_selection))}
                    callback={&ctx.props().callback}
                />
            </>
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
