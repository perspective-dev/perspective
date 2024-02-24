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

use perspective_client::config::*;
use perspective_client::{clone, ColumnType};
use serde::de::DeserializeOwned;
use yew::{function_component, html, Callback, Html, Properties};

use crate::components::column_settings_sidebar::style_tab::stub::Stub;
use crate::components::datetime_column_style::DatetimeColumnStyle;
use crate::components::number_column_style::NumberColumnStyle;
use crate::components::string_column_style::StringColumnStyle;
use crate::components::style::LocalStyle;
use crate::config::*;
use crate::custom_events::CustomEvents;
use crate::model::*;
use crate::renderer::Renderer;
use crate::session::Session;
use crate::{css, derive_model};

/// This function retrieves the plugin's config using its `save` method.
/// It also introduces the `default_config` field for the plugin.
/// If this field does not exist, the plugin is considered to be un-style-able.
fn get_column_style<T, U>(
    mut config: PluginConfig,
    attrs: PluginAttributes,
    column_name: &str,
    ty: ColumnType,
) -> Result<(Option<T>, U), String>
where
    T: DeserializeOwned + std::fmt::Debug,
    U: DeserializeOwned + std::fmt::Debug,
{
    let current_config = if let Some(config) = config.columns.remove(column_name) {
        serde_json::from_value(config)
            .map_err(|e| format!("Could not deserialize config with error {e:?}"))?
    } else {
        None
    };

    let style = attrs
        .style
        .ok_or_else(|| "Styles not implemented".to_string())?;
    let val = match ty {
        ColumnType::String => style.string,
        ColumnType::Datetime => style.datetime,
        ColumnType::Date => style.date,
        ColumnType::Integer => style.integer,
        ColumnType::Float => style.float,
        ColumnType::Boolean => style.bool,
    };
    serde_json::from_value(val)
        .map_err(|e| format!("Could not deserialize default_config with error {e:?}"))
        .map(|default_config| (current_config, default_config))
}

#[derive(Clone, PartialEq, Properties)]
pub struct ColumnStyleProps {
    pub custom_events: CustomEvents,
    pub session: Session,
    pub renderer: Renderer,
    pub column_name: String,
    pub view_type: ColumnType,
}
derive_model!(CustomEvents, Session, Renderer for ColumnStyleProps);
#[function_component]
pub fn ColumnStyle(props: &ColumnStyleProps) -> Html {
    let props = props.clone();
    let (config, attrs) = (props.get_plugin_config(), props.get_plugin_attrs());
    let (config, attrs) = (config.unwrap(), attrs.unwrap());
    let view_type = props.view_type;

    let opt_html = match view_type {
        ColumnType::String => get_column_style::<_, StringColumnStyleDefaultConfig>(
            config.clone(),
            attrs.clone(),
            &props.column_name,
            view_type,
        )
        .map(|(config, default_config)| {
            let on_change = Callback::from(move |config| {
                props.send_plugin_config(
                    props.column_name.clone(),
                    serde_json::to_value(config).ok(),
                )
            });

            html! {
                <>
                    <div
                        class="style_contents"
                    >
                        <StringColumnStyle {config} {default_config} {on_change} />
                    </div>
                </>
            }
        }),
        ColumnType::Datetime | ColumnType::Date => {
            get_column_style::<_, DatetimeColumnStyleDefaultConfig>(
                config.clone(),
                attrs.clone(),
                &props.column_name,
                view_type,
            )
            .map(|(config, default_config)| {
                let enable_time_config = matches!(view_type, ColumnType::Datetime);
                let on_change = Callback::from(move |config| {
                    props.send_plugin_config(
                        props.column_name.clone(),
                        serde_json::to_value(config).unwrap(),
                    )
                });

                html! {
                    <div
                        class="style_contents"
                    >
                        <DatetimeColumnStyle
                            {enable_time_config}
                            {config}
                            {default_config}
                            {on_change}
                        />
                    </div>
                }
            })
        },
        ColumnType::Integer | ColumnType::Float => {
            get_column_style::<_, NumberColumnStyleDefaultConfig>(
                config.clone(),
                attrs.clone(),
                &props.column_name,
                view_type,
            )
            .map(|(config, default_config)| {
                let on_change = {
                    clone!(props);
                    Callback::from(move |config| {
                        props.send_plugin_config(
                            props.column_name.clone(),
                            serde_json::to_value(config).unwrap(),
                        )
                    })
                };
                html! {
                    <div
                        class="style_contents"
                    >
                        <NumberColumnStyle
                            session={props.session.clone()}
                            column_name={props.column_name.clone()}
                            {config}
                            {default_config}
                            {on_change}
                        />
                    </div>
                }
            })
        },
        _ => Err("Booleans aren't styled yet.".into()),
    };

    let contents = opt_html.unwrap_or_else(|e| {
        html! { <Stub message="No styles available" error={e} /> }
    });

    html! { <><LocalStyle href={css!("column-style")} />{ contents }</> }
}
