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

use perspective_client::clone;
use yew::{Callback, Html, Properties, function_component, html};

use crate::components::form::number_field::NumberField;
use crate::config::ColumnConfigFieldUpdate;

// ░░░█▀█░█▀▄░█▀█░█▀█░█▀▀░█▀▄░▀█▀░▀█▀░█▀▀░█▀▀░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
// ░░░█▀▀░█▀▄░█░█░█▀▀░█▀▀░█▀▄░░█░░░█░░█▀▀░▀▀█░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
// ░░░▀░░░▀░▀░▀▀▀░▀░░░▀▀▀░▀░▀░░▀░░▀▀▀░▀▀▀░▀▀▀░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
#[derive(Properties, PartialEq)]
pub struct AggregateDepthSelectorProps {
    pub on_change: Callback<ColumnConfigFieldUpdate>,
    pub value: u32,
    pub group_by_depth: u32,
    pub column_name: String,
    #[prop_or_default]
    pub keys: Vec<String>,
}

#[function_component]
pub fn AggregateDepthSelector(props: &AggregateDepthSelectorProps) -> Html {
    let state = yew::use_state_eq(|| 0);
    yew::use_effect_with((props.column_name.to_owned(), props.group_by_depth), {
        clone!(state, props.value);
        move |deps| state.set(std::cmp::min(deps.1, value))
    });

    let on_change = yew::use_callback(
        (state.setter(), props.on_change.clone(), props.keys.clone()),
        |x: Option<f64>, deps| {
            let depth = x.unwrap_or_default() as u32;
            deps.0.set(depth);
            let mut value = serde_json::Map::new();
            if depth > 0 {
                value.insert("aggregate_depth".to_owned(), serde_json::json!(depth));
            }
            deps.1.emit(ColumnConfigFieldUpdate {
                keys: deps.2.clone(),
                value,
            })
        },
    );

    html! {
        <NumberField
            label="aggregate-depth"
            {on_change}
            min=0.0
            max={props.group_by_depth as f64}
            default=0.0
            current_value={*state as f64}
        />
    }
}
