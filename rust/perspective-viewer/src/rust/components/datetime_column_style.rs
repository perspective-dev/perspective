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

mod custom;
mod simple;

use std::rc::Rc;
use std::sync::LazyLock;

use derivative::Derivative;
use perspective_js::json;
use perspective_js::utils::global::navigator;
use wasm_bindgen::prelude::*;
use yew::prelude::*;

use super::modal::{ModalLink, SetModalLink};
use super::style::LocalStyle;
use crate::components::datetime_column_style::custom::DatetimeStyleCustom;
use crate::components::datetime_column_style::simple::DatetimeStyleSimple;
use crate::components::form::select_value_field::SelectValueField;
use crate::config::*;
use crate::css;
use crate::utils::WeakScope;

/// Format-only widget for `datetime` columns. Renders the `date_format`
/// hierarchy (Simple|Custom + timezone); color/color-mode UI is provided
/// externally as primitive `Enum` + `Color` schema fields.
#[derive(Properties, Derivative)]
#[derivative(Debug)]
pub struct DatetimeColumnStyleProps {
    pub enable_time_config: bool,
    pub config: Option<DatetimeColumnStyleConfig>,

    #[prop_or_default]
    pub on_change: Callback<ColumnConfigFieldUpdate>,

    #[prop_or_default]
    pub keys: Vec<String>,

    #[prop_or_default]
    #[derivative(Debug = "ignore")]
    weak_link: WeakScope<DatetimeColumnStyle>,
}

impl ModalLink<DatetimeColumnStyle> for DatetimeColumnStyleProps {
    fn weak_link(&self) -> &'_ WeakScope<DatetimeColumnStyle> {
        &self.weak_link
    }
}

impl PartialEq for DatetimeColumnStyleProps {
    fn eq(&self, other: &Self) -> bool {
        self.enable_time_config == other.enable_time_config && self.config == other.config
    }
}

pub enum DatetimeColumnStyleMsg {
    SimpleDatetimeStyleConfigChanged(SimpleDatetimeStyleConfig),
    CustomDatetimeStyleConfigChanged(CustomDatetimeStyleConfig),
    TimezoneChanged(Option<String>),
}

#[derive(Debug)]
pub struct DatetimeColumnStyle {
    config: DatetimeColumnStyleConfig,
}

impl Component for DatetimeColumnStyle {
    type Message = DatetimeColumnStyleMsg;
    type Properties = DatetimeColumnStyleProps;

    fn create(ctx: &Context<Self>) -> Self {
        ctx.set_modal_link();
        Self {
            config: ctx.props().config.clone().unwrap_or_default(),
        }
    }

    fn changed(&mut self, ctx: &Context<Self>, old: &Self::Properties) -> bool {
        let mut rerender = false;
        let mut new_config = ctx.props().config.clone().unwrap_or_default();
        if self.config != new_config {
            std::mem::swap(&mut self.config, &mut new_config);
            rerender = true;
        }
        if old.enable_time_config != ctx.props().enable_time_config {
            rerender = true;
        }
        rerender
    }

    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            DatetimeColumnStyleMsg::TimezoneChanged(val) => {
                if Some(&*USER_TIMEZONE) != val.as_ref() {
                    *self.config.date_format.time_zone_mut() = val;
                } else {
                    *self.config.date_format.time_zone_mut() = None;
                }

                self.dispatch_config(ctx);
                true
            },
            DatetimeColumnStyleMsg::SimpleDatetimeStyleConfigChanged(simple) => {
                self.config.date_format = DatetimeFormatType::Simple(simple);
                self.dispatch_config(ctx);
                true
            },
            DatetimeColumnStyleMsg::CustomDatetimeStyleConfigChanged(custom) => {
                self.config.date_format = DatetimeFormatType::Custom(custom);
                self.dispatch_config(ctx);
                true
            },
        }
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        html! {
            <>
                <LocalStyle href={css!("column-style")} />
                <div id="column-style-container" class="datetime-column-style-container">
                    if ctx.props().enable_time_config {
                        <SelectValueField<String>
                            label="timezone"
                            values={ALL_TIMEZONES.with(|x| (*x).clone())}
                            default_value={(*USER_TIMEZONE).clone()}
                            on_change={ctx.link().callback(DatetimeColumnStyleMsg::TimezoneChanged)}
                            current_value={self.config.date_format.time_zone().as_ref().unwrap_or(&*USER_TIMEZONE).clone()}
                        />
                    }
                    if let DatetimeFormatType::Simple(config) = &self.config.date_format {
                        if ctx.props().enable_time_config {
                            <div class="row">
                                <button
                                    id="datetime_format"
                                    data-title="Simple"
                                    data-title-hover="Switch to Custom"
                                    onclick={ctx.link().callback(|_| DatetimeColumnStyleMsg::CustomDatetimeStyleConfigChanged(CustomDatetimeStyleConfig::default()))}
                                />
                            </div>
                        }
                        <DatetimeStyleSimple
                            enable_time_config={ctx.props().enable_time_config}
                            on_change={ctx.link().callback(DatetimeColumnStyleMsg::SimpleDatetimeStyleConfigChanged)}
                            config={config.clone()}
                        />
                    } else if let DatetimeFormatType::Custom(config) = &self.config.date_format {
                        if ctx.props().enable_time_config {
                            <div class="row">
                                <button
                                    id="datetime_format"
                                    data-title="Custom"
                                    data-title-hover="Switch to Simple"
                                    onclick={ctx.link().callback(|_| DatetimeColumnStyleMsg::SimpleDatetimeStyleConfigChanged(SimpleDatetimeStyleConfig::default()))}
                                />
                            </div>
                        }
                        <DatetimeStyleCustom
                            enable_time_config={ctx.props().enable_time_config}
                            on_change={ctx.link().callback(DatetimeColumnStyleMsg::CustomDatetimeStyleConfigChanged)}
                            config={config.clone()}
                        />
                    }
                </div>
            </>
        }
    }
}

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_name = supportedValuesOf, js_namespace = Intl)]
    pub fn supported_values_of(s: &JsValue) -> js_sys::Array;
}

thread_local! {
    static ALL_TIMEZONES: LazyLock<Rc<Vec<String>>> = LazyLock::new(|| {
        Rc::new(
            supported_values_of(&JsValue::from("timeZone"))
                .iter()
                .map(|x| x.as_string().unwrap())
                .collect(),
        )
    });
}

static USER_TIMEZONE: LazyLock<String> = LazyLock::new(|| {
    js_sys::Reflect::get(
        &js_sys::Intl::DateTimeFormat::new(&navigator().languages(), &json!({})).resolved_options(),
        &JsValue::from("timeZone"),
    )
    .unwrap()
    .as_string()
    .unwrap()
});

impl DatetimeColumnStyle {
    /// When this config has changed, we must signal the wrapper element.
    fn dispatch_config(&self, ctx: &Context<Self>) {
        let value = if self.config == DatetimeColumnStyleConfig::default() {
            serde_json::Map::new()
        } else {
            match serde_json::to_value(&self.config) {
                Ok(serde_json::Value::Object(m)) => m,
                _ => serde_json::Map::new(),
            }
        };

        ctx.props().on_change.emit(ColumnConfigFieldUpdate {
            keys: ctx.props().keys.clone(),
            value,
        });
    }
}
