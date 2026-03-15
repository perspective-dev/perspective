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
use yew::*;

use super::form::color_selector::*;
use super::modal::{ModalLink, SetModalLink};
use super::style::LocalStyle;
use crate::components::datetime_column_style::custom::DatetimeStyleCustom;
use crate::components::datetime_column_style::simple::DatetimeStyleSimple;
use crate::components::form::select_enum_field::SelectEnumField;
use crate::components::form::select_value_field::SelectValueField;
use crate::config::*;
use crate::css;
use crate::utils::WeakScope;

#[derive(Properties, Derivative)]
#[derivative(Debug)]
pub struct DatetimeColumnStyleProps {
    pub enable_time_config: bool,
    pub config: Option<DatetimeColumnStyleConfig>,
    pub default_config: DatetimeColumnStyleDefaultConfig,

    #[prop_or_default]
    pub on_change: Callback<ColumnConfigValueUpdate>,

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
        self.enable_time_config == other.enable_time_config
            && self.config == other.config
            && self.default_config == other.default_config
    }
}

pub enum DatetimeColumnStyleMsg {
    SimpleDatetimeStyleConfigChanged(SimpleDatetimeStyleConfig),
    CustomDatetimeStyleConfigChanged(CustomDatetimeStyleConfig),
    TimezoneChanged(Option<String>),
    ColorModeChanged(Option<DatetimeColorMode>),
    ColorChanged(String),
    ColorReset,
}

/// Column style controls for the `datetime` type.
#[derive(Debug)]
pub struct DatetimeColumnStyle {
    config: DatetimeColumnStyleConfig,
    default_config: DatetimeColumnStyleDefaultConfig,
}

impl Component for DatetimeColumnStyle {
    type Message = DatetimeColumnStyleMsg;
    type Properties = DatetimeColumnStyleProps;

    fn create(ctx: &Context<Self>) -> Self {
        ctx.set_modal_link();
        Self {
            config: ctx.props().config.clone().unwrap_or_default(),
            default_config: ctx.props().default_config.clone(),
        }
    }

    // Always re-render when config changes.
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

    // TODO could be more conservative here with re-rendering
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
            DatetimeColumnStyleMsg::ColorModeChanged(mode) => {
                self.config.datetime_color_mode = mode.unwrap_or_default();
                self.dispatch_config(ctx);
                true
            },
            DatetimeColumnStyleMsg::ColorChanged(color) => {
                self.config.color = Some(color);
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
            DatetimeColumnStyleMsg::ColorReset => {
                self.config.color = Some(self.default_config.color.clone());
                self.dispatch_config(ctx);
                true
            },
        }
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let selected_color_mode = self.config.datetime_color_mode;
        let color_mode_changed = ctx
            .link()
            .callback(DatetimeColumnStyleMsg::ColorModeChanged);

        let color_controls = match selected_color_mode {
            DatetimeColorMode::None => html! {},
            DatetimeColorMode::Foreground => {
                self.color_select_row(ctx, &DatetimeColorMode::Foreground, "foreground-label")
            },
            DatetimeColorMode::Background => {
                self.color_select_row(ctx, &DatetimeColorMode::Background, "background-label")
            },
        };

        html! {
            <>
                <LocalStyle href={css!("column-style")} />
                <div id="column-style-container" class="datetime-column-style-container">
                    <SelectEnumField<DatetimeColorMode>
                        label="color"
                        on_change={color_mode_changed}
                        current_value={selected_color_mode}
                    />
                    { color_controls }
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
        let update =
            Some(self.config.clone()).filter(|x| x != &DatetimeColumnStyleConfig::default());
        ctx.props()
            .on_change
            .emit(ColumnConfigValueUpdate::DatagridDatetimeStyle(update));
    }

    /// Generate a color selector component for a specific `StringColorMode`
    /// variant.
    fn color_select_row(&self, ctx: &Context<Self>, mode: &DatetimeColorMode, title: &str) -> Html {
        let on_color = ctx.link().callback(DatetimeColumnStyleMsg::ColorChanged);
        let color = self
            .config
            .color
            .clone()
            .unwrap_or_else(|| self.default_config.color.to_owned());

        let color_props = props!(ColorProps {
            title: title.to_owned(),
            on_color,
            is_modified: color != self.default_config.color,
            color,
            on_reset: ctx.link().callback(|_| DatetimeColumnStyleMsg::ColorReset)
        });

        if &self.config.datetime_color_mode == mode {
            html! { <div class="row"><ColorSelector ..color_props /></div> }
        } else {
            html! {}
        }
    }
}
