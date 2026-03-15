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

use super::style::LocalStyle;
use crate::css;

#[derive(Properties, PartialEq)]
pub struct RenderWarningProps {
    // Current dimensions
    pub dimensions: Option<(usize, usize, Option<usize>, Option<usize>)>,

    /// Called when the user clicks "Render all points".  The parent disables
    /// the render warning on the active plugin and re-draws.
    pub on_dismiss: Callback<()>,
}

pub enum RenderWarningMsg {
    DismissWarning,
}

pub struct RenderWarning {
    col_warn: Option<(usize, usize)>,
    row_warn: Option<(usize, usize)>,
}

impl RenderWarning {
    fn update_warnings(&mut self, ctx: &Context<Self>) {
        if let Some((num_cols, num_rows, max_cols, max_rows)) = ctx.props().dimensions {
            let count = num_cols * num_rows;
            if max_cols.is_some_and(|x| x < num_cols) {
                self.col_warn = Some((max_cols.unwrap(), num_cols));
            } else {
                self.col_warn = None;
            }

            if max_rows.is_some_and(|x| x < num_rows) {
                self.row_warn = Some((num_cols * max_rows.unwrap(), count));
            } else {
                self.row_warn = None;
            }
        } else {
            self.col_warn = None;
            self.row_warn = None;
        }
    }
}

impl Component for RenderWarning {
    type Message = RenderWarningMsg;
    type Properties = RenderWarningProps;

    fn create(ctx: &Context<Self>) -> Self {
        let mut elem = Self {
            col_warn: None,
            row_warn: None,
        };

        elem.update_warnings(ctx);
        elem
    }

    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            RenderWarningMsg::DismissWarning => {
                ctx.props().on_dismiss.emit(());
            },
        };
        true
    }

    fn changed(&mut self, ctx: &Context<Self>, _old: &Self::Properties) -> bool {
        self.update_warnings(ctx);
        true
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        if self.col_warn.is_some() || self.row_warn.is_some() {
            let warning = match (self.col_warn, self.row_warn) {
                (Some((x, y)), Some((a, b))) => html! {
                    <span style="white-space: nowrap">
                        { "Rendering" }
                        { render_pair(x, y) }
                        { "of columns and" }
                        { render_pair(a, b) }
                        { "of points." }
                    </span>
                },
                (Some((x, y)), None) => html! {
                    <span style="white-space: nowrap">
                        { "Rendering" }
                        { render_pair(x, y) }
                        { "of columns." }
                    </span>
                },
                (None, Some((x, y))) => html! {
                    <span style="white-space: nowrap">
                        { "Rendering" }
                        { render_pair(x, y) }
                        { "of points." }
                    </span>
                },
                _ => html! { <div /> },
            };

            let onclick = ctx.link().callback(|_| RenderWarningMsg::DismissWarning);

            html! {
                <>
                    <LocalStyle href={css!("render-warning")} />
                    <div
                        class="plugin_information plugin_information--warning"
                        id="plugin_information--size"
                    >
                        <span class="plugin_information__icon" />
                        <span class="plugin_information__text" id="plugin_information_count">
                            { warning }
                        </span>
                        <span class="plugin_information__actions">
                            <span class="plugin_information__action" onmousedown={onclick}>
                                { "Render all points" }
                            </span>
                        </span>
                    </div>
                </>
            }
        } else {
            html! {}
        }
    }
}

fn pretty_print_int(i: usize) -> String {
    let mut s = String::new();
    let i_str = i.to_string();
    let a = i_str.chars().rev().enumerate();
    for (idx, val) in a {
        if idx != 0 && idx % 3 == 0 {
            s.insert(0, ',');
        }
        s.insert(0, val);
    }
    s
}

fn render_pair(n: usize, d: usize) -> Html {
    let x = pretty_print_int(n);
    let y = pretty_print_int(d);
    let total = ((n as f64 / d as f64) * 100_f64).floor() as usize;
    html! {
        <span title={format!("${x} / ${y}")} class="plugin_information--overflow-hint">
            { "\u{00a0}" }
            <span class="plugin_information--overflow-hint-percent">{ format!("{}%", total) }</span>
            { "\u{00a0}" }
        </span>
    }
}
