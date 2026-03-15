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

use crate::session::ViewStats;
use crate::utils::u32Ext;

/// Props are now pure value types: no `Session` handle, no PubSub
/// subscriptions.  The parent passes an updated `stats` whenever the
/// underlying data changes (driven by the root's `UpdateSession` message).
#[derive(PartialEq, Properties)]
pub struct StatusBarRowsCounterProps {
    pub stats: Option<ViewStats>,
}

/// A component to show the current [`Table`]'s dimensions.
#[function_component]
pub fn StatusBarRowsCounter(props: &StatusBarRowsCounterProps) -> Html {
    match props.stats {
        Some(
            ViewStats {
                num_table_cells: Some((tr, tc)),
                num_view_cells: Some((vr, vc)),
                is_group_by: true,
                ..
            }
            | ViewStats {
                num_table_cells: Some((tr, tc)),
                num_view_cells: Some((vr, vc)),
                is_filtered: true,
                ..
            },
        ) if vc != tc => {
            let vrows = vr.to_formatted_string();
            let nrows = tr.to_formatted_string();
            let vcols = vc.to_formatted_string();
            let ncols = tc.to_formatted_string();
            html! {
                <span id="rows">
                    <span>{ vrows }</span>
                    <span class="total">{ format!(" ({})", nrows) }</span>
                    <span class="x">{ " x " }</span>
                    <span>{ vcols }</span>
                    <span class="total">{ format!(" ({})", ncols) }</span>
                </span>
            }
        },

        Some(
            ViewStats {
                num_table_cells: Some((tr, _)),
                num_view_cells: Some((vr, vc)),
                is_group_by: true,
                ..
            }
            | ViewStats {
                num_table_cells: Some((tr, _)),
                num_view_cells: Some((vr, vc)),
                is_filtered: true,
                ..
            },
        ) => {
            let vrows = vr.to_formatted_string();
            let nrows = tr.to_formatted_string();
            let vcols = vc.to_formatted_string();
            html! {
                <span id="rows">
                    <span>{ vrows }</span>
                    <span class="total">{ format!(" ({})", nrows) }</span>
                    <span class="x">{ " x " }</span>
                    <span>{ vcols }</span>
                </span>
            }
        },

        Some(ViewStats {
            num_table_cells: Some((_, tc)),
            num_view_cells: Some((vr, vc)),
            ..
        }) if vc != tc => {
            let vrows = vr.to_formatted_string();
            let vcols = vc.to_formatted_string();
            let ncols = tc.to_formatted_string();
            html! {
                <span id="rows">
                    <span>{ vrows }</span>
                    <span class="x">{ " x " }</span>
                    <span>{ vcols }</span>
                    <span class="total">{ format!(" ({})", ncols) }</span>
                </span>
            }
        },

        Some(ViewStats {
            num_table_cells: Some((tr, tc)),
            ..
        }) => {
            let nrows = tr.to_formatted_string();
            let ncols = tc.to_formatted_string();
            html! {
                <span id="rows">
                    <span>{ nrows }</span>
                    <span class="x">{ " x " }</span>
                    <span>{ ncols }</span>
                </span>
            }
        },
        Some(ViewStats {
            num_table_cells: None,
            ..
        }) => html! { <span /> },
        None => html! { <span /> },
    }
}
