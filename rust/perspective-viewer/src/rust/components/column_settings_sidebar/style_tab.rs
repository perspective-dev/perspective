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
pub(crate) mod primitive_field;
mod symbol;

use std::collections::{BTreeMap, HashMap};
use std::rc::Rc;

use itertools::Itertools;
use perspective_client::config::ColumnType;
use yew::{Callback, Html, Properties, function_component, html};

use self::agg_depth_selector::*;
use self::primitive_field::{
    BoolField, ColorField, EnumField, GradientStopsField, NumberFieldPrimitive, PaletteField,
};
use crate::components::column_settings_sidebar::style_tab::symbol::SymbolStyle;
use crate::components::containers::control_group::ControlGroup;
use crate::components::datetime_column_style::DatetimeColumnStyle;
use crate::components::number_series_style::NumberSeriesStyle;
use crate::components::string_column_style::StringColumnStyle;
use crate::components::style_controls::CustomNumberFormat;
use crate::config::{
    ColumnConfigFieldUpdate, ControlSpec, CssKind, CustomNumberFormatConfig,
    DatetimeColumnStyleConfig, NamedValue, NumberSeriesStyleConfig, StringColumnStyleConfig,
};
use crate::presentation::Presentation;
use crate::queries::{fetch_column_abs_max, get_column_config_schema, named_values};
use crate::renderer::Renderer;
use crate::session::Session;
use crate::tasks::send_column_config;
use crate::utils::PtrEqRc;
use crate::workspace::Workspace;

#[derive(Clone, PartialEq, Properties)]
pub struct StyleTabProps {
    pub ty: Option<ColumnType>,
    pub column_name: String,
    pub group_by_depth: u32,

    /// View config snapshot — threaded from parent.
    pub view_config: PtrEqRc<perspective_client::config::ViewConfig>,

    /// Session metadata snapshot — threaded from parent.
    pub metadata: PtrEqRc<crate::session::SessionMetadata>,

    /// Per-column stats snapshot — threaded from `SessionProps`.
    pub column_stats: PtrEqRc<HashMap<String, crate::session::ColumnStats>>,

    /// Selected theme name, threaded for PortalModal consumers.
    pub selected_theme: Option<String>,

    // State
    pub presentation: Presentation,
    pub renderer: Renderer,
    pub session: Session,
    pub workspace: Workspace,
}

#[function_component]
pub fn StyleTab(props: &StyleTabProps) -> Html {
    // Bumped on every primitive field change so Yew re-renders the tab
    // and re-queries `column_config_schema` with the new value. Without
    // this, dynamic field gating (e.g. show `Color` only when
    // `string_color_mode != none`) wouldn't surface until the user
    // closed and reopened the sidebar.
    let revision = yew::use_state(|| 0u32);

    // `abs_max` lives in `Session`'s shared cache, propagated as a
    // value-semantic snapshot through `props.column_stats`. The cache
    // is cleared on `view_config_changed`; on cache miss we spawn the
    // fetch and let `column_stats_changed` drive the re-render via
    // `SessionProps`.
    let abs_max = props
        .column_stats
        .get(&props.column_name)
        .and_then(|s| s.abs_max);

    yew::use_effect_with((props.column_name.clone(), props.view_config.clone()), {
        let session = props.session.clone();
        let column_name = props.column_name.clone();
        move |_| {
            fetch_column_abs_max(&session, column_name);
            || ()
        }
    });

    let raw_config = props.renderer.get_columns_config(&props.column_name);

    let named_for = |kind| Rc::new(named_values(&props.workspace, &props.presentation, kind));
    let named_gradients = named_for(CssKind::Gradient);
    let named_palettes = named_for(CssKind::Palette);
    let named_colors = named_for(CssKind::Color);

    let restored = Rc::new(props.presentation.palette());
    let on_pin = {
        let presentation = props.presentation.clone();
        let revision = revision.clone();
        yew::Callback::from(move |(kind, literal): (CssKind, String)| {
            if let Err(error) = presentation.pin_style(kind, &literal) {
                tracing::warn!("Failed to pin named {kind:?}: {error:?}");
            }

            revision.set(*revision + 1);
        })
    };
    let schema = get_column_config_schema(
        &props.renderer,
        &props.view_config,
        &props.metadata,
        &props.column_name,
        raw_config.as_ref(),
        abs_max,
    );

    let on_change = {
        let state = props.clone();
        let column_name = props.column_name.clone();
        let revision = revision.clone();
        yew::Callback::from(move |config: crate::config::ColumnConfigFieldUpdate| {
            send_column_config(&state.session, &state.renderer, &column_name, config);
            revision.set(*revision + 1);
        })
    };

    let on_group_toggle = {
        let presentation = props.presentation.clone();
        yew::Callback::from(move |(key, open): (String, bool)| {
            presentation.set_control_group_collapsed(&key, !open);
        })
    };

    let ctx = FieldRenderCtx {
        props,
        raw_config: &raw_config,
        on_change: &on_change,
        on_group_toggle: &on_group_toggle,
        on_pin: &on_pin,
        named_colors: &named_colors,
        named_palettes: &named_palettes,
        named_gradients: &named_gradients,
        restored: &restored,
    };

    let components = schema
        .map(|schema| render_specs(schema.fields, &ctx))
        .unwrap_or_else(|error| {
            tracing::error!("{}", error);
            vec![]
        });

    html! {
        <div id="style-tab">
            <div id="column-style-container" class="tab-section">{ components }</div>
        </div>
    }
}

fn deser_sub<T: serde::de::DeserializeOwned>(
    raw: &Option<serde_json::Map<String, serde_json::Value>>,
) -> Option<T> {
    raw.as_ref()
        .and_then(|m| serde_json::from_value::<T>(serde_json::Value::Object(m.clone())).ok())
}

struct FieldRenderCtx<'a> {
    props: &'a StyleTabProps,
    raw_config: &'a Option<serde_json::Map<String, serde_json::Value>>,
    on_change: &'a Callback<ColumnConfigFieldUpdate>,
    on_group_toggle: &'a Callback<(String, bool)>,
    on_pin: &'a Callback<(CssKind, String)>,
    named_colors: &'a Rc<Vec<NamedValue>>,
    named_palettes: &'a Rc<Vec<NamedValue>>,
    named_gradients: &'a Rc<Vec<NamedValue>>,
    restored: &'a Rc<BTreeMap<String, String>>,
}

fn render_specs(specs: Vec<ControlSpec>, ctx: &FieldRenderCtx) -> Vec<Html> {
    specs
        .into_iter()
        .filter_map(|spec| match spec {
            ControlSpec::Group { key, fields } => {
                let children = render_specs(fields, ctx);
                (!children.is_empty()).then(|| {
                    let open = !ctx
                        .props
                        .presentation
                        .is_control_group_collapsed(&key);

                    html! {
                        <ControlGroup
                            key={format!("{}::group::{}", ctx.props.column_name, key)}
                            group_key={key.clone()}
                            {open}
                            on_toggle={ctx.on_group_toggle.clone()}
                        >
                            { children }
                        </ControlGroup>
                    }
                })
            },
            spec => {
                let keys: Vec<String> = spec
                    .serialized_keys()
                    .into_iter()
                    .map(|s| s.to_string())
                    .collect();

                let component = render_leaf(spec, &keys, ctx)?;
                let key = format!("{}::{}", ctx.props.column_name, keys.join("+"));
                Some(html! { <fieldset class="style-control" {key}>{ component }</fieldset> })
            },
        })
        .collect_vec()
}

fn render_leaf(spec: ControlSpec, keys: &[String], ctx: &FieldRenderCtx) -> Option<Html> {
    let props = ctx.props;
    let raw_config = ctx.raw_config;
    let on_change = ctx.on_change;
    let component = match spec {
        ControlSpec::AggregateDepth => {
            let aggregate_depth = raw_config
                .as_ref()
                .and_then(|m| m.get("aggregate_depth"))
                .and_then(|v| v.as_u64())
                .unwrap_or(0) as u32;
            html! {
                <AggregateDepthSelector
                    group_by_depth={props.group_by_depth}
                    on_change={on_change.clone()}
                    column_name={props.column_name.to_owned()}
                    value={aggregate_depth}
                    keys={keys.to_vec()}
                />
            }
        },
        ControlSpec::NumberSeriesStyle {
            default: default_config,
        } => {
            let config: Option<NumberSeriesStyleConfig> = deser_sub(raw_config);
            html! {
                <NumberSeriesStyle
                    {config}
                    {default_config}
                    on_change={on_change.clone()}
                    keys={keys.to_vec()}
                />
            }
        },
        ControlSpec::DatetimeFormat => {
            let config: Option<DatetimeColumnStyleConfig> = deser_sub(raw_config);
            let enable_time_config = props.ty.unwrap() == ColumnType::Datetime;
            html! {
                <DatetimeColumnStyle
                    {enable_time_config}
                    {config}
                    on_change={on_change.clone()}
                    keys={keys.to_vec()}
                />
            }
        },
        ControlSpec::StringFormat => {
            let config: Option<StringColumnStyleConfig> = deser_sub(raw_config);
            html! {
                <StringColumnStyle {config} on_change={on_change.clone()} keys={keys.to_vec()} />
            }
        },
        ControlSpec::Symbols {
            default: default_config,
        } => {
            let restored_config: HashMap<String, String> = raw_config
                .as_ref()
                .and_then(|m| m.get("symbols"))
                .and_then(|v| serde_json::from_value(v.clone()).ok())
                .unwrap_or_default();

            html! {
                <SymbolStyle
                    {default_config}
                    restored_config={Some(restored_config)}
                    on_change={on_change.clone()}
                    column_name={props.column_name.clone()}
                    selected_theme={props.selected_theme.clone()}
                    session={props.session.clone()}
                    keys={keys.to_vec()}
                />
            }
        },
        ControlSpec::NumberFormat => {
            let restored_config: CustomNumberFormatConfig = raw_config
                .as_ref()
                .and_then(|m| m.get("number_format"))
                .and_then(|v| serde_json::from_value(v.clone()).ok())
                .unwrap_or_default();

            html! {
                <CustomNumberFormat
                    {restored_config}
                    on_change={on_change.clone()}
                    view_type={props.ty.unwrap()}
                    column_name={props.column_name.clone()}
                    keys={keys.to_vec()}
                />
            }
        },
        ControlSpec::Enum {
            key,
            variants,
            default,
        } => {
            let current = raw_config
                .as_ref()
                .and_then(|m| m.get(&key))
                .and_then(|v| v.as_str().map(|s| s.to_string()));

            html! {
                <EnumField
                    field_key={key}
                    {variants}
                    {default}
                    {current}
                    on_change={on_change.clone()}
                />
            }
        },
        ControlSpec::Bool { key, default } => {
            let current = raw_config
                .as_ref()
                .and_then(|m| m.get(&key))
                .and_then(|v| v.as_bool());
            html! { <BoolField field_key={key} {default} {current} on_change={on_change.clone()} /> }
        },
        ControlSpec::Color { key, default } => {
            let current = raw_config
                .as_ref()
                .and_then(|m| m.get(&key))
                .and_then(|v| v.as_str().map(|s| s.to_string()));
            html! {
                <ColorField
                    field_key={key}
                    {default}
                    {current}
                    named={ctx.named_colors.clone()}
                    restored={ctx.restored.clone()}
                    on_pin={ctx.on_pin.clone()}
                    on_change={on_change.clone()}
                />
            }
        },
        ControlSpec::Palette { key, default, max } => {
            let current = raw_config
                .as_ref()
                .and_then(|m| m.get(&key))
                .and_then(|v| v.as_str().map(|s| s.to_string()));
            html! {
                <PaletteField
                    field_key={key}
                    {default}
                    {max}
                    {current}
                    named={ctx.named_palettes.clone()}
                    restored={ctx.restored.clone()}
                    on_pin={ctx.on_pin.clone()}
                    on_change={on_change.clone()}
                />
            }
        },
        ControlSpec::GradientStops {
            key,
            default,
            discrete,
        } => {
            let current = raw_config
                .as_ref()
                .and_then(|m| m.get(&key))
                .and_then(|v| v.as_str().map(|s| s.to_string()));
            html! {
                <GradientStopsField
                    field_key={key}
                    {default}
                    {discrete}
                    {current}
                    named={ctx.named_gradients.clone()}
                    restored={ctx.restored.clone()}
                    on_pin={ctx.on_pin.clone()}
                    on_change={on_change.clone()}
                />
            }
        },
        ControlSpec::Number {
            key,
            default,
            min,
            max,
            step,
            include,
        } => {
            let current = raw_config
                .as_ref()
                .and_then(|m| m.get(&key))
                .and_then(|v| v.as_f64());
            html! {
                <NumberFieldPrimitive
                    field_key={key}
                    {default}
                    {current}
                    {min}
                    {max}
                    {step}
                    {include}
                    on_change={on_change.clone()}
                />
            }
        },
        ControlSpec::String { .. } | ControlSpec::Group { .. } => {
            return None;
        },
    };

    Some(component)
}
