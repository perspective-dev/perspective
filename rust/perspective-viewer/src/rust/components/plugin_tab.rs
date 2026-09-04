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

//! Plugin-scoped settings tab. Mirrors `style_tab` but operates on the
//! active plugin's `save()`/`restore()` token rather than a per-column
//! config map. The schema comes from `plugin.plugin_config_schema()`;
//! field updates are dispatched through `tasks::send_plugin_config`.

use itertools::Itertools;
use perspective_client::config::ViewConfig;
use yew::prelude::*;

use crate::components::column_settings_sidebar::style_tab::primitive_field::{
    BoolField, ColorField, EnumField, NumberFieldPrimitive,
};
use crate::components::containers::control_group::ControlGroup;
use crate::config::ControlSpec;
use crate::presentation::Presentation;
use crate::queries::get_plugin_config_schema;
use crate::renderer::Renderer;
use crate::session::Session;
use crate::tasks::send_plugin_config;
use crate::utils::PtrEqRc;

#[derive(Clone, PartialEq, Properties)]
pub struct PluginTabProps {
    /// View config snapshot — passed to the plugin schema callback in
    /// case the plugin wants to gate fields based on it.
    pub view_config: PtrEqRc<ViewConfig>,

    /// Active plugin's `plugin_config` bucket — threaded as a value
    /// snapshot from `RendererProps`. Changes on every mutation path
    /// that fires `plugin_config_changed` (in-tab edit,
    /// `restore_and_render` JSON paste, `reset_all` with `all=true`)
    /// AND on plugin switch (the active bucket is keyed by plugin
    /// name, so `to_props()` produces a fresh `Rc` after
    /// `commit_plugin_idx`). PluginTab is a pure function of this
    /// prop — no `Renderer::get_plugin_config()` reads against the
    /// interior-mutable handle.
    pub plugin_config: PtrEqRc<serde_json::Map<String, serde_json::Value>>,

    // State
    pub presentation: Presentation,
    pub renderer: Renderer,
    pub session: Session,
}

#[function_component]
pub fn PluginTab(props: &PluginTabProps) -> Html {
    // Memoize the JS-side `plugin_config_schema` call. The schema is a
    // function of (active plugin, current plugin_config values,
    // view_config); each of those arrives as a prop so the deps tuple
    // uses cheap pointer-equality / value-equality. Yew re-runs the
    // closure only when one of them actually changed, so the JS
    // round-trip doesn't fire on unrelated re-renders.
    //
    // The closure captures `renderer` to dispatch `_plugin_config_schema`
    // through the active plugin handle, but resolves it via the props
    // at call time so the schema query is bound to the same atomic
    // snapshot the rendered controls read from. No race window between
    // a plugin swap and the schema fetch — both observe the same
    // `RendererProps` value.
    let schema = {
        let renderer = props.renderer.clone();
        let view_config = props.view_config.clone();
        use_memo(
            (props.plugin_config.clone(), props.view_config.clone()),
            move |_| match get_plugin_config_schema(&renderer, &view_config) {
                Ok(schema) => schema.fields,
                Err(error) => {
                    tracing::error!("{}", error);
                    vec![]
                },
            },
        )
    };

    let on_change = {
        let session = props.session.clone();
        let renderer = props.renderer.clone();
        yew::Callback::from(move |update: crate::config::ColumnConfigFieldUpdate| {
            // `send_plugin_config` emits `plugin_config_changed`,
            // which the root component's subscription
            // (`create_active_subscriptions`) turns into an `UpdateRenderer`
            // dispatch carrying a fresh `RendererProps`. Yew's prop
            // diff propagates the new `plugin_config` into this
            // component automatically — no manual revision bump.
            send_plugin_config(&session, &renderer, update);
        })
    };

    let on_group_toggle = {
        let presentation = props.presentation.clone();
        yew::Callback::from(move |(key, open): (String, bool)| {
            presentation.set_control_group_collapsed(&key, !open);
        })
    };

    let raw_config = &*props.plugin_config;
    let components = render_specs(
        &schema,
        raw_config,
        &on_change,
        &props.presentation,
        &on_group_toggle,
    );
    html! {
        <div id="plugin-tab" class="sidebar_column scrollable">
            <div id="plugin-config-container" class="tab-section">{ components }</div>
        </div>
    }
}

fn render_specs(
    specs: &[ControlSpec],
    raw_config: &serde_json::Map<String, serde_json::Value>,
    on_change: &Callback<crate::config::ColumnConfigFieldUpdate>,
    presentation: &Presentation,
    on_group_toggle: &Callback<(String, bool)>,
) -> Vec<Html> {
    specs
        .iter()
        .filter_map(|spec| match spec {
            ControlSpec::Group { key, fields } => {
                let children =
                    render_specs(fields, raw_config, on_change, presentation, on_group_toggle);

                (!children.is_empty()).then(|| {
                    html! {
                        <ControlGroup
                            key={format!("group::{key}")}
                            group_key={key.clone()}
                            open={!presentation.is_control_group_collapsed(key)}
                            on_toggle={on_group_toggle.clone()}
                        >
                            { children }
                        </ControlGroup>
                    }
                })
            },
            leaf => {
                let key = leaf.serialized_keys().join("+");
                let component = render_leaf(leaf, raw_config, on_change)?;
                Some(html! { <fieldset class="style-control" {key}>{ component }</fieldset> })
            },
        })
        .collect_vec()
}

fn render_leaf(
    spec: &ControlSpec,
    raw_config: &serde_json::Map<String, serde_json::Value>,
    on_change: &Callback<crate::config::ColumnConfigFieldUpdate>,
) -> Option<Html> {
    match spec.clone() {
        ControlSpec::Enum {
            key,
            variants,
            default,
        } => {
            let current = raw_config
                .get(&key)
                .and_then(|v| v.as_str().map(|s| s.to_string()));
            Some(html! {
                <EnumField
                    field_key={key}
                    {variants}
                    {default}
                    {current}
                    on_change={on_change.clone()}
                />
            })
        },
        ControlSpec::Bool { key, default } => {
            let current = raw_config.get(&key).and_then(|v| v.as_bool());
            Some(html! {
                <BoolField field_key={key} {default} {current} on_change={on_change.clone()} />
            })
        },
        ControlSpec::Color { key, default } => {
            let current = raw_config
                .get(&key)
                .and_then(|v| v.as_str().map(|s| s.to_string()));
            Some(html! {
                <ColorField field_key={key} {default} {current} on_change={on_change.clone()} />
            })
        },
        ControlSpec::Number {
            key,
            default,
            min,
            max,
            step,
            include,
        } => {
            let current = raw_config.get(&key).and_then(|v| v.as_f64());
            Some(html! {
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
            })
        },
        ControlSpec::Group { .. }
        | ControlSpec::AggregateDepth
        | ControlSpec::NumberSeriesStyle { .. }
        | ControlSpec::DatetimeFormat { .. }
        | ControlSpec::StringFormat
        | ControlSpec::Symbols { .. }
        | ControlSpec::NumberFormat { .. }
        | ControlSpec::String { .. }
        | ControlSpec::Palette { .. }
        | ControlSpec::GradientStops { .. } => None,
    }
}
