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

use perspective_js::utils::*;
use wasm_bindgen::prelude::*;

use crate::config::{CommandSchema, CommandSpec};
use crate::presentation::Presentation;
use crate::workspace::Panel;

/// Where a command schema is being evaluated.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CommandLocation {
    ContextMenu,
}

impl CommandLocation {
    fn as_str(self) -> &'static str {
        match self {
            Self::ContextMenu => "context-menu",
        }
    }
}

/// Which party declared a command, and so receives it when it is picked.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CommandSource {
    App,
    Plugin,
}

/// The custom commands resolved for one gesture, with the context every
/// schema was evaluated against.
#[derive(Debug, Default)]
pub struct ResolvedCommands {
    pub context: JsValue,
    pub app: Vec<CommandSpec>,
    pub plugin: Vec<CommandSpec>,
}

/// Whether any command schema could contribute commands for `panel`.
pub fn has_command_schema(presentation: &Presentation, panel: Option<&Panel>) -> bool {
    presentation.command_schema().is_some()
        || panel
            .and_then(|panel| panel.renderer.active_plugin())
            .is_some_and(|plugin| plugin.capabilities().command_schema)
}

/// Build the command context for `panel` and evaluate the app's and the
/// panel plugin's command schemas against it.
pub async fn resolve_commands(
    presentation: &Presentation,
    panel: Option<&Panel>,
    location: CommandLocation,
    point: (f64, f64),
    hit_test: bool,
) -> ResolvedCommands {
    let hit = match panel {
        Some(panel) if hit_test => plugin_hit(panel, point).await,
        _ => None,
    };

    let context = match command_context(panel, location, point, hit) {
        Ok(context) => context,
        Err(err) => {
            tracing::error!("Failed to build command context: {err}");
            return ResolvedCommands::default();
        },
    };

    let app = presentation
        .command_schema()
        .map(|schema| {
            let result = schema
                .call1(&JsValue::UNDEFINED, &context)
                .map_err(ApiError::from)
                .and_then(parse_schema);

            commands_or_log(result, "the app")
        })
        .unwrap_or_default();

    let plugin = panel
        .and_then(|panel| {
            let plugin = panel.renderer.active_plugin()?;
            let result = plugin.command_schema(&context).transpose()?;
            let name = format!("plugin \"{}\"", panel.renderer.metadata().name);
            Some(commands_or_log(result, &name))
        })
        .unwrap_or_default();

    ResolvedCommands {
        context,
        app,
        plugin,
    }
}

fn parse_schema(value: JsValue) -> ApiResult<CommandSchema> {
    Ok(value.into_serde_ext()?)
}

fn commands_or_log(result: ApiResult<CommandSchema>, source: &str) -> Vec<CommandSpec> {
    match result {
        Ok(schema) => schema.commands,
        Err(err) => {
            tracing::error!("Ignoring the command schema of {source}: {err}");
            vec![]
        },
    }
}

async fn plugin_hit(panel: &Panel, (x, y): (f64, f64)) -> Option<JsValue> {
    let plugin = panel.renderer.active_plugin()?;
    let result = panel
        .renderer
        .clone()
        .with_lock(async { plugin.hit_test(x, y).await })
        .await;

    match result {
        Ok(hit) => hit,
        Err(err) => {
            tracing::error!(
                "Ignoring the `hit_test` of plugin \"{}\": {err}",
                panel.renderer.metadata().name
            );

            None
        },
    }
}

fn command_context(
    panel: Option<&Panel>,
    location: CommandLocation,
    (x, y): (f64, f64),
    hit: Option<JsValue>,
) -> ApiResult<JsValue> {
    let context = js_sys::Object::new();
    let set = |key: &str, value: &JsValue| js_sys::Reflect::set(&context, &key.into(), value);
    set("location", &location.as_str().into())?;
    if let Some(panel) = panel {
        set("panel", &panel.id.as_str().into())?;
        if let Some(table) = panel.session.get_table() {
            set("table", &table.get_name().into())?;
        }

        if panel.renderer.active_plugin().is_some() {
            set("plugin", &panel.renderer.metadata().name.as_str().into())?;
        }

        let view_config = match panel.session.get_rendered_view_config() {
            Some(rendered) => JsValue::from_serde_ext(&*rendered)?,
            None => JsValue::from_serde_ext(&*panel.session.get_view_config())?,
        };

        set("view_config", &view_config)?;
    }

    let point = js_sys::Object::new();
    js_sys::Reflect::set(&point, &"x".into(), &x.into())?;
    js_sys::Reflect::set(&point, &"y".into(), &y.into())?;
    set("point", &point)?;
    if let Some(hit) = hit {
        set("hit", &hit)?;
    }

    Ok(context.into())
}
