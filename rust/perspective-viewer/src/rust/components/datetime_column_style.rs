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

use std::fmt::Display;
use std::rc::Rc;
use std::sync::LazyLock;

use derivative::Derivative;
use yew::prelude::*;

use crate::components::datetime_column_style::custom::DatetimeStyleCustom;
use crate::components::datetime_column_style::simple::DatetimeStyleSimple;
use crate::config::*;
use crate::ui::{ModalLink, SelectValueField, SetModalLink};
use crate::utils::WeakScope;

/// The `date_format` editor for `date` and `datetime` columns.
#[derive(Properties, Derivative)]
#[derivative(Debug)]
pub struct DatetimeColumnStyleProps {
    pub enable_time_config: bool,
    pub config: Option<DatetimeColumnStyleConfig>,

    /// The format the column inherits when it stores none.
    pub default_format: Rc<DatetimeFormat>,

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
        self.enable_time_config == other.enable_time_config
            && self.config == other.config
            && self.default_format == other.default_format
    }
}

/// A display-field edit, applied to the shown shape given the shape a reset
/// restores.
pub type ShapeEdit = Rc<dyn Fn(&DatetimeFormat, &DatetimeFormat) -> DatetimeFormat>;

pub enum DatetimeColumnStyleMsg {
    ShapeChanged(ShapeEdit),
    ToParts,
    ToPreset,
    TimezoneChanged(Option<String>),
    Hour12Changed(Option<bool>),
}

/// A display field's select value: one of its forms, or not shown.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum PartChoice<T> {
    Shown(T),
    Hidden,
}

impl<T: Display> Display for PartChoice<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Shown(x) => x.fmt(f),
            Self::Hidden => f.write_str("disabled"),
        }
    }
}

impl<T> From<Option<T>> for PartChoice<T> {
    fn from(value: Option<T>) -> Self {
        value.map_or(Self::Hidden, Self::Shown)
    }
}

impl<T> PartChoice<T> {
    /// The field value this choice stores, given the value a reset restores.
    pub fn resolve(choice: Option<Self>, reset: Option<T>) -> Option<T> {
        match choice {
            None => reset,
            Some(Self::Hidden) => None,
            Some(Self::Shown(x)) => Some(x),
        }
    }
}

/// Every form of `T`, then [`PartChoice::Hidden`] when `hideable`.
pub fn part_choices<T: strum::IntoEnumIterator>(hideable: bool) -> Rc<Vec<PartChoice<T>>> {
    let mut values: Vec<_> = T::iter().map(PartChoice::Shown).collect();
    if hideable {
        values.push(PartChoice::Hidden);
    }

    Rc::new(values)
}

#[derive(Debug)]
pub struct DatetimeColumnStyle {
    stored: DatetimeFormat,
}

impl Component for DatetimeColumnStyle {
    type Message = DatetimeColumnStyleMsg;
    type Properties = DatetimeColumnStyleProps;

    fn create(ctx: &Context<Self>) -> Self {
        ctx.set_modal_link();
        Self {
            stored: stored_format(ctx.props()),
        }
    }

    fn changed(&mut self, ctx: &Context<Self>, old: &Self::Properties) -> bool {
        let stored = stored_format(ctx.props());
        let rerender = self.stored != stored
            || old.enable_time_config != ctx.props().enable_time_config
            || old.default_format != ctx.props().default_format;

        self.stored = stored;
        rerender
    }

    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        let inherited = &*ctx.props().default_format;
        let with_time = ctx.props().enable_time_config;
        let next = match msg {
            DatetimeColumnStyleMsg::ShapeChanged(edit) => {
                let effective = inherited.overlay(&self.stored);
                let reset_shape = if effective.has_parts() {
                    parts_reset_shape(inherited, with_time)
                } else {
                    preset_reset_shape(inherited, with_time)
                };

                let shape = edit(&effective.shape(), &reset_shape);
                if !shape.has_shape() {
                    return false;
                }

                self.stored.with_shape(&shape)
            },
            DatetimeColumnStyleMsg::ToParts => self
                .stored
                .with_shape(&parts_reset_shape(inherited, with_time)),
            DatetimeColumnStyleMsg::ToPreset => self
                .stored
                .with_shape(&preset_reset_shape(inherited, with_time)),
            DatetimeColumnStyleMsg::TimezoneChanged(time_zone) => DatetimeFormat {
                time_zone: time_zone.filter(|tz| *tz != inherited_time_zone(inherited)),
                ..self.stored.clone()
            },
            DatetimeColumnStyleMsg::Hour12Changed(hour12) => DatetimeFormat {
                hour12: hour12.filter(|h| *h != inherited_hour12(inherited)),
                ..self.stored.clone()
            },
        };

        self.stored = next.diff(inherited);
        let mut value = serde_json::Map::new();
        if !self.stored.is_empty()
            && let Ok(format) = serde_json::to_value(&self.stored)
        {
            value.insert("date_format".to_owned(), format);
        }

        ctx.props().on_change.emit(ColumnConfigFieldUpdate {
            keys: ctx.props().keys.clone(),
            value,
        });

        true
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let inherited = &*ctx.props().default_format;
        let with_time = ctx.props().enable_time_config;
        let effective = inherited.overlay(&self.stored);
        let hour_values = Rc::new(vec!["12 Hour", "24 Hour"]);
        let hour_label = |hour12: bool| if hour12 { "12 Hour" } else { "24 Hour" };
        html! {
            <div id="column-style-container" class="datetime-column-style-container">
                if with_time {
                    <SelectValueField<String>
                        label="timezone"
                        values={ALL_TIMEZONES.with(|x| (*x).clone())}
                        default_value={inherited_time_zone(inherited)}
                        on_change={ctx.link().callback(DatetimeColumnStyleMsg::TimezoneChanged)}
                        current_value={inherited_time_zone(&effective)}
                    />
                    <SelectValueField<&'static str>
                        label="hours"
                        values={hour_values}
                        default_value={hour_label(inherited_hour12(inherited))}
                        on_change={ctx.link().callback(|x: Option<&'static str>| DatetimeColumnStyleMsg::Hour12Changed(x.map(|x| x == "12 Hour")))}
                        current_value={hour_label(inherited_hour12(&effective))}
                    />
                }
                if effective.has_parts() {
                    if with_time {
                        <div class="row">
                            <button
                                id="datetime_format"
                                data-title="Custom"
                                data-title-hover="Switch to Simple"
                                onclick={ctx.link().callback(|_| DatetimeColumnStyleMsg::ToPreset)}
                            />
                        </div>
                    }
                    <DatetimeStyleCustom
                        enable_time_config={with_time}
                        shape={effective.shape()}
                        default_shape={parts_reset_shape(inherited, with_time)}
                        on_change={ctx.link().callback(DatetimeColumnStyleMsg::ShapeChanged)}
                    />
                } else {
                    if with_time {
                        <div class="row">
                            <button
                                id="datetime_format"
                                data-title="Simple"
                                data-title-hover="Switch to Custom"
                                onclick={ctx.link().callback(|_| DatetimeColumnStyleMsg::ToParts)}
                            />
                        </div>
                    }
                    <DatetimeStyleSimple
                        enable_time_config={with_time}
                        shape={effective.shape()}
                        default_shape={preset_reset_shape(inherited, with_time)}
                        on_change={ctx.link().callback(DatetimeColumnStyleMsg::ShapeChanged)}
                    />
                }
            </div>
        }
    }
}

fn parts_reset_shape(inherited: &DatetimeFormat, with_time: bool) -> DatetimeFormat {
    if inherited.has_parts() {
        inherited.shape()
    } else {
        DatetimeFormat::parts_base(with_time)
    }
}

fn preset_reset_shape(inherited: &DatetimeFormat, with_time: bool) -> DatetimeFormat {
    if inherited.has_preset() {
        inherited.shape()
    } else {
        DatetimeFormat::base(with_time)
    }
}

fn stored_format(props: &DatetimeColumnStyleProps) -> DatetimeFormat {
    props
        .config
        .as_ref()
        .and_then(|config| config.date_format.clone())
        .unwrap_or_default()
}

fn inherited_time_zone(format: &DatetimeFormat) -> String {
    format
        .time_zone
        .clone()
        .unwrap_or_else(|| crate::plugin_utils::local_time_zone().to_owned())
}

fn inherited_hour12(format: &DatetimeFormat) -> bool {
    format.hour12.unwrap_or(*USER_HOUR12)
}

thread_local! {
    static ALL_TIMEZONES: LazyLock<Rc<Vec<String>>> =
        LazyLock::new(|| Rc::new(crate::plugin_utils::time_zones()));
}

static USER_HOUR12: LazyLock<bool> =
    LazyLock::new(|| crate::format::prefers_hour12(crate::plugin_utils::languages()));
