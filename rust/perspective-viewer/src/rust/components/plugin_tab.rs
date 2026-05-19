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
    BoolField, ColorField, ColorRangeField, EnumField, NumberFieldPrimitive,
};
use crate::components::style::LocalStyle;
use crate::config::ControlSpec;
use crate::css;
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
            // (`create_subscriptions`) turns into an `UpdateRenderer`
            // dispatch carrying a fresh `RendererProps`. Yew's prop
            // diff propagates the new `plugin_config` into this
            // component automatically — no manual revision bump.
            send_plugin_config(&session, &renderer, update);
        })
    };

    let raw_config = &*props.plugin_config;
    let components = schema
        .iter()
        .cloned()
        .filter_map(|spec| {
            let component = match spec {
                ControlSpec::Enum {
                    key,
                    variants,
                    default,
                } => {
                    let current = raw_config
                        .get(&key)
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
                    let current = raw_config.get(&key).and_then(|v| v.as_bool());
                    html! {
                        <BoolField
                            field_key={key}
                            {default}
                            {current}
                            on_change={on_change.clone()}
                        />
                    }
                },
                ControlSpec::Color { key, default } => {
                    let current = raw_config
                        .get(&key)
                        .and_then(|v| v.as_str().map(|s| s.to_string()));
                    html! {
                        <ColorField
                            field_key={key}
                            {default}
                            {current}
                            on_change={on_change.clone()}
                        />
                    }
                },
                ControlSpec::ColorRange {
                    key_pos,
                    key_neg,
                    default_pos,
                    default_neg,
                    is_gradient,
                } => {
                    let current_pos = raw_config
                        .get(&key_pos)
                        .and_then(|v| v.as_str().map(|s| s.to_string()));
                    let current_neg = raw_config
                        .get(&key_neg)
                        .and_then(|v| v.as_str().map(|s| s.to_string()));
                    html! {
                        <ColorRangeField
                            field_key_pos={key_pos}
                            field_key_neg={key_neg}
                            {default_pos}
                            {default_neg}
                            {current_pos}
                            {current_neg}
                            {is_gradient}
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
                    let current = raw_config.get(&key).and_then(|v| v.as_f64());
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
                // Column-scoped variants don't apply to
                // plugin-level config; drop silently.
                ControlSpec::AggregateDepth
                | ControlSpec::NumberSeriesStyle { .. }
                | ControlSpec::DatetimeFormat
                | ControlSpec::StringFormat
                | ControlSpec::Symbols { .. }
                | ControlSpec::NumberFormat
                | ControlSpec::String { .. } => {
                    return None;
                },
            };

            Some(html! { <fieldset class="style-control">{ component }</fieldset> })
        })
        .collect_vec();

    html! {
        <div id="plugin-tab" class="sidebar_column scrollable">
            <LocalStyle href={css!("column-style")} />
            <LocalStyle href={css!("plugin-settings-panel")} />
            <LocalStyle href={css!("containers/tabs")} />
            <div id="plugin-config-container" class="tab-section">{ components }</div>
        </div>
    }
}
