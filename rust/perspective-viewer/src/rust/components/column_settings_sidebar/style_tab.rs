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

mod agg_depth_selector;
mod stub;
mod symbol;

use itertools::Itertools;
use perspective_client::config::ColumnType;
use yew::{Html, Properties, function_component, html};

use self::agg_depth_selector::*;
use crate::components::column_settings_sidebar::style_tab::stub::Stub;
use crate::components::column_settings_sidebar::style_tab::symbol::SymbolStyle;
use crate::components::datetime_column_style::DatetimeColumnStyle;
use crate::components::number_column_style::NumberColumnStyle;
use crate::components::string_column_style::StringColumnStyle;
use crate::components::style_controls::CustomNumberFormat;
use crate::custom_events::CustomEvents;
use crate::tasks::{
    get_column_style_control_options, HasCustomEvents, HasPresentation, HasRenderer, HasSession,
    SendPluginConfig,
};
use crate::presentation::Presentation;
use crate::renderer::Renderer;
use crate::session::Session;

#[derive(Clone, PartialEq, Properties)]
pub struct StyleTabProps {
    pub ty: Option<ColumnType>,
    pub column_name: String,
    pub group_by_depth: u32,

    /// View config snapshot — threaded from parent.
    pub view_config: perspective_client::config::ViewConfig,

    /// Session metadata snapshot — threaded from parent.
    pub metadata: crate::session::SessionMetadata,

    // State
    pub custom_events: CustomEvents,
    pub presentation: Presentation,
    pub renderer: Renderer,
    pub session: Session,
}

impl HasCustomEvents for StyleTabProps {
    fn custom_events(&self) -> &CustomEvents {
        &self.custom_events
    }
}

impl HasPresentation for StyleTabProps {
    fn presentation(&self) -> &Presentation {
        &self.presentation
    }
}

impl HasRenderer for StyleTabProps {
    fn renderer(&self) -> &Renderer {
        &self.renderer
    }
}

impl HasSession for StyleTabProps {
    fn session(&self) -> &Session {
        &self.session
    }
}

#[function_component]
pub fn StyleTab(props: &StyleTabProps) -> Html {
    let config = props.presentation.get_columns_config(&props.column_name);
    let on_change = yew::use_callback(
        (props.clone(), props.column_name.clone()),
        |config, (state, column_name)| {
            state.send_plugin_config(column_name, config);
        },
    );

    let components = get_column_style_control_options(
        &props.renderer,
        &props.view_config,
        &props.metadata,
        &props.column_name,
    )
        .map(|opts| {
            let mut components = vec![];
            if !props.view_config.group_by.is_empty() {
                let aggregate_depth = config.as_ref().map(|x| x.aggregate_depth as f64);
                components.push(("Aggregate Depth", html! {
                    <AggregateDepthSelector
                        group_by_depth={props.group_by_depth}
                        on_change={on_change.clone()}
                        column_name={props.column_name.to_owned()}
                        value={aggregate_depth.unwrap_or_default() as u32}
                    />
                }));
            }

            if let Some(default_config) = opts.datagrid_number_style {
                let config = config
                    .as_ref()
                    .map(|config| config.datagrid_number_style.clone());

                components.push(("Number Styles", html! {
                    <NumberColumnStyle
                        column_name={props.column_name.clone()}
                        {config}
                        {default_config}
                        on_change={on_change.clone()}
                        session={props.session.clone()}
                    />
                }));
            }
            if let Some(default_config) = opts.datagrid_string_style {
                let config = config
                    .as_ref()
                    .map(|config| config.datagrid_string_style.clone());

                components.push(("String Styles", html! {
                    <StringColumnStyle {config} {default_config} on_change={on_change.clone()} />
                }));
            }

            if let Some(default_config) = opts.datagrid_datetime_style {
                let config = config
                    .as_ref()
                    .map(|config| config.datagrid_datetime_style.clone());

                let enable_time_config = props.ty.unwrap() == ColumnType::Datetime;
                components.push(("Datetime Styles", html! {
                    <DatetimeColumnStyle
                        {enable_time_config}
                        {config}
                        {default_config}
                        on_change={on_change.clone()}
                    />
                }))
            }

            if let Some(default_config) = opts.symbols {
                let restored_config = config
                    .as_ref()
                    .map(|config| config.symbols.clone())
                    .unwrap_or_default();

                components.push(("Symbols", html! {
                    <SymbolStyle
                        {default_config}
                        {restored_config}
                        on_change={on_change.clone()}
                        column_name={props.column_name.clone()}
                        session={props.session.clone()}
                    />
                }))
            }

            if opts.number_string_format.unwrap_or_default() {
                let restored_config = config
                    .as_ref()
                    .and_then(|config| config.number_format.clone())
                    .unwrap_or_default();

                components.push(("Number Formatting", html! {
                    <CustomNumberFormat
                        {restored_config}
                        on_change={on_change.clone()}
                        view_type={props.ty.unwrap()}
                        column_name={props.column_name.clone()}
                    />
                }));
            }

            components
                .into_iter()
                .map(|(_title, component)| {
                    html! {
                        <fieldset class="style-control">
                            // <legend >{ title }</legend>
                            { component }
                        </fieldset>
                    }
                })
                .collect_vec()
        })
        .unwrap_or_else(|error| {
            vec![html! {
                <Stub message="Could not render column styles" error={Some(format!("{error:?}"))} />
            }]
        });

    html! {
        <div id="style-tab">
            <div id="column-style-container" class="tab-section">{ components }</div>
        </div>
    }
}
