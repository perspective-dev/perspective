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

use crate::renderer::limits::RenderLimits;

#[derive(Properties, PartialEq)]
pub struct RenderWarningProps {
    pub dimensions: Option<RenderLimits>,

    /// Called when the user clicks "Render all points".  The parent disables
    /// the render warning on the active plugin and re-draws.
    pub on_dismiss: Callback<()>,
}

#[function_component(RenderWarning)]
pub fn render_warning(props: &RenderWarningProps) -> Html {
    let dimensions = props.dimensions;
    let (col_warn, row_warn) = if let Some(limits) = dimensions {
        let col_warn = if limits.max_cols.is_some_and(|x| x < limits.num_cols) {
            Some((limits.max_cols.unwrap(), limits.num_cols))
        } else {
            None
        };

        let row_warn = if limits.max_rows.is_some_and(|x| x < limits.num_rows) {
            Some((
                limits.num_cols * limits.max_rows.unwrap(),
                limits.num_cols * limits.num_rows,
            ))
        } else {
            None
        };

        (col_warn, row_warn)
    } else {
        (None, None)
    };

    if col_warn.is_some() || row_warn.is_some() {
        let warning = match (col_warn, row_warn) {
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

        let on_dismiss = props.on_dismiss.clone();
        let onclick = Callback::from(move |_: MouseEvent| on_dismiss.emit(()));
        html! {
            <>
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
