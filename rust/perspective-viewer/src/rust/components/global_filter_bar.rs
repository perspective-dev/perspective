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

use perspective_client::config::Filter;
use web_sys::MouseEvent;
use yew::prelude::*;

#[derive(Properties, PartialEq)]
pub struct GlobalFilterBarProps {
    /// The element-level global filters (applied to every non-master panel).
    pub filters: Vec<Filter>,

    /// Fired with a filter's index to remove it.
    pub on_remove: Callback<usize>,

    /// Fired to clear all global filters.
    pub on_clear: Callback<()>,
}

/// The global-filter bar: the element-level filters (fed by master/detail
/// selection) as removable chips, rendered inline in the `StatusBar` between
/// the row stats and the menu icons. Purely presentational — the parent owns
/// the filter set and applies it.
pub struct GlobalFilterBar;

impl Component for GlobalFilterBar {
    type Message = ();
    type Properties = GlobalFilterBarProps;

    fn create(_ctx: &Context<Self>) -> Self {
        Self
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let chips = ctx
            .props()
            .filters
            .iter()
            .enumerate()
            .map(|(index, filter)| {
                let on_remove = ctx.props().on_remove.clone();
                let onclick = Callback::from(move |e: MouseEvent| {
                    e.stop_propagation();
                    on_remove.emit(index);
                });

                let label = format!("{} {} {}", filter.column(), filter.op(), filter.term());
                html! {
                    <span class="global-filter-chip">
                        <span class="global-filter-chip-label">{ label }</span>
                        <span class="global-filter-chip-remove" {onclick}>{ "×" }</span>
                    </span>
                }
            });

        let on_clear = ctx.props().on_clear.clone();
        let onclear = Callback::from(move |_: MouseEvent| on_clear.emit(()));

        html! {
            <div id="global_filter_bar">
                <span class="global-filter-bar-label">{ "Filter" }</span>
                <span class="global-filter-bar-chips">{ for chips }</span>
                <span class="global-filter-bar-clear" onclick={onclear}>{ "Clear" }</span>
            </div>
        }
    }
}
