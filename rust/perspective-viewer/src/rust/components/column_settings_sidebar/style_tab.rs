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

pub mod stub;
mod symbol;

use itertools::Itertools;
use perspective::utils::*;
use perspective_client::ColumnType;
use yew::{function_component, html, Html, Properties};

use crate::components::column_settings_sidebar::style_tab::stub::Stub;
use crate::components::column_settings_sidebar::style_tab::symbol::SymbolStyle;
use crate::components::datetime_column_style::DatetimeColumnStyle;
use crate::components::number_column_style::NumberColumnStyle;
use crate::components::string_column_style::StringColumnStyle;
use crate::components::style_controls::CustomNumberFormat;
use crate::config::{ColumnConfigValueUpdate, Type};
use crate::custom_events::CustomEvents;
use crate::model::PluginColumnStyles;
use crate::presentation::Presentation;
use crate::renderer::Renderer;
use crate::session::Session;
use crate::utils::ApiFuture;
use crate::{clone, derive_model};

#[derive(Clone, PartialEq, Properties)]
pub struct StyleTabProps {
    pub custom_events: CustomEvents,
    pub session: Session,
    pub renderer: Renderer,
    pub presentation: Presentation,

    pub ty: Option<ColumnType>,
    pub column_name: String,
}
derive_model!(Session, Renderer, Presentation, CustomEvents for StyleTabProps);

impl StyleTabProps {
    fn send_plugin_config(&self, update: ColumnConfigValueUpdate) {
        clone!(props = self);
        ApiFuture::spawn(async move {
            props
                .presentation
                .update_columns_config_value(props.column_name.clone(), update);
            let columns_configs = props.presentation.all_columns_configs();
            let plugin_config = props.renderer.get_active_plugin()?.save();
            props
                .renderer
                .get_active_plugin()?
                .restore(&plugin_config, Some(&columns_configs));
            props.renderer.update(&props.session).await?;
            let detail = serde_wasm_bindgen::to_value(&columns_configs).unwrap();
            props.custom_events.dispatch_column_style_changed(&detail);
            Ok(())
        })
    }
}

#[function_component]
pub fn StyleTab(props: &StyleTabProps) -> Html {
    let on_change = yew::use_callback(props.clone(), |config, props| {
        props.send_plugin_config(config);
    });
    let config = props.presentation.get_columns_config(&props.column_name);
    let components = props
        .get_column_style_control_options(&props.column_name)
        .map(|opts| {
            let mut components = vec![];

            if let Some(default_config) = opts.datagrid_number_style {
                let config = config
                    .as_ref()
                    .map(|config| config.datagrid_number_style.clone());

                components.push(("Number Styles", html! {
                    <NumberColumnStyle
                        session={props.session.clone()}
                        column_name={props.column_name.clone()}
                        {config}
                        {default_config}
                        on_change={on_change.clone()}
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

                let enable_time_config = props.ty.unwrap() == Type::Datetime;
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
                        {on_change}
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
