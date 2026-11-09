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

use js_sys::{Array, Object, Reflect};
use perspective_client::config::ViewConfig;
use perspective_js::utils::*;
use wasm_bindgen::prelude::*;

use super::resolve_hit::{ViewFrame, resolve_hit};
use crate::config::{CommandLocation, CommandSchema, CommandSpec, PerspectiveHitRef};
use crate::presentation::Presentation;
use crate::workspace::{Panel, Workspace};

impl CommandLocation {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ContextMenu => "context-menu",
            Self::DatagridRow => "datagrid-row",
            Self::DatagridCell => "datagrid-cell",
            Self::ChartTooltip => "chart-tooltip",
        }
    }
}

/// The app's commands resolved for one gesture, with the context the schema
/// was evaluated against.
#[derive(Debug, Default)]
pub struct ResolvedCommands {
    pub context: JsValue,
    pub commands: Vec<CommandSpec>,
}

/// The panel whose active plugin element is `plugin`.
pub fn panel_for_plugin(workspace: &Workspace, plugin: &JsValue) -> Option<Panel> {
    workspace.panels().into_iter().find(|panel| {
        panel
            .renderer
            .active_plugin()
            .is_some_and(|active| AsRef::<JsValue>::as_ref(&active) == plugin)
    })
}

/// The view config `panel` is rendering, as `getViewConfig()` reports it.
pub fn panel_view_config(panel: &Panel) -> ViewConfig {
    if let Some(ctx) = panel.renderer.render_context() {
        (*ctx.view_config).clone()
    } else if let Some(rendered) = panel.session.get_rendered_view_config() {
        (*rendered).clone()
    } else {
        panel.session.get_view_config().clone()
    }
}

/// Build the command context for `panel` and evaluate the app's command
/// schema against it.
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

    let context = match command_context(panel, location, Some(point), hit) {
        Ok(context) => context,
        Err(err) => {
            tracing::error!("Failed to build command context: {err}");
            return ResolvedCommands::default();
        },
    };

    let commands = presentation
        .command_schema_for(location)
        .map(
            |schema| match call_schema(&schema, &context).and_then(parse_schema) {
                Ok(schema) => schema.commands,
                Err(err) => {
                    tracing::error!("Ignoring the command schema of the app: {err}");
                    vec![]
                },
            },
        )
        .unwrap_or_default();

    ResolvedCommands { context, commands }
}

/// Evaluate the app's schema at `location` for every ref in `refs` against
/// `frame`, or `None` when `location` is out of the schema's scopes.
pub fn query_commands(
    presentation: &Presentation,
    panel: &Panel,
    location: CommandLocation,
    frame: &JsValue,
    refs: &JsValue,
) -> ApiResult<Option<Array>> {
    let Some(schema) = presentation.command_schema_for(location) else {
        return Ok(None);
    };

    let frame = ViewFrame::new(frame)?;
    let refs: Vec<PerspectiveHitRef> = refs.into_serde_ext()?;
    let config = panel_view_config(panel);
    let index = panel
        .session
        .get_table()
        .and_then(|table| table.get_index());
    let base = command_context(Some(panel), location, None, None)?;
    let results = Array::new();
    let mut failed = false;
    for hit_ref in refs {
        let hit =
            JsValue::from_serde_ext(&resolve_hit(&config, index.as_ref(), &frame, &hit_ref)?)?;
        let context = Object::assign(&Object::new(), base.unchecked_ref::<Object>());
        Reflect::set(&context, &"hit".into(), &hit)?;
        let commands = if failed {
            Array::new().into()
        } else {
            match call_schema(&schema, &context).and_then(validate_schema) {
                Ok(commands) => commands,
                Err(err) => {
                    tracing::error!("Ignoring the command schema of the app: {err}");
                    failed = true;
                    Array::new().into()
                },
            }
        };

        let entry = Object::new();
        Reflect::set(&entry, &"context".into(), &context)?;
        Reflect::set(&entry, &"commands".into(), &commands)?;
        results.push(&entry);
    }

    Ok(Some(results))
}

fn call_schema(schema: &js_sys::Function, context: &JsValue) -> ApiResult<JsValue> {
    Ok(schema.call1(&JsValue::UNDEFINED, context)?)
}

fn parse_schema(value: JsValue) -> ApiResult<CommandSchema> {
    Ok(value.into_serde_ext()?)
}

/// Validate a schema's return and hand back its own `commands` array.
fn validate_schema(value: JsValue) -> ApiResult<JsValue> {
    parse_schema(value.clone())?;
    Ok(Reflect::get(&value, &"commands".into())?)
}

async fn plugin_hit(panel: &Panel, (x, y): (f64, f64)) -> Option<JsValue> {
    let plugin = panel.renderer.active_plugin()?;
    let result = panel
        .renderer
        .clone()
        .with_lock(async { plugin.hit_test(x, y).await })
        .await;

    let hit_test = match result {
        Ok(hit_test) => hit_test?,
        Err(err) => {
            tracing::error!(
                "Ignoring the `hit_test` of plugin \"{}\": {err}",
                panel.renderer.metadata().name
            );

            return None;
        },
    };

    match resolve_hit_test(panel, &hit_test) {
        Ok(hit) => Some(hit),
        Err(err) => {
            tracing::error!(
                "Ignoring the `hit_test` of plugin \"{}\": {err}",
                panel.renderer.metadata().name
            );

            None
        },
    }
}

/// Resolve a plugin's `{ frame, ref }` hit test against `panel`'s config.
fn resolve_hit_test(panel: &Panel, hit_test: &JsValue) -> ApiResult<JsValue> {
    let frame = ViewFrame::new(&Reflect::get(hit_test, &"frame".into())?)?;
    let hit_ref: PerspectiveHitRef = Reflect::get(hit_test, &"ref".into())?.into_serde_ext()?;
    let index = panel
        .session
        .get_table()
        .and_then(|table| table.get_index());
    let hit = resolve_hit(&panel_view_config(panel), index.as_ref(), &frame, &hit_ref)?;
    Ok(JsValue::from_serde_ext(&hit)?)
}

/// The context a command schema is evaluated against, without a `hit`.
pub fn command_context(
    panel: Option<&Panel>,
    location: CommandLocation,
    point: Option<(f64, f64)>,
    hit: Option<JsValue>,
) -> ApiResult<JsValue> {
    let context = Object::new();
    let set = |key: &str, value: &JsValue| Reflect::set(&context, &key.into(), value);
    set("location", &location.as_str().into())?;
    if let Some(panel) = panel {
        set("panel", &panel.id.as_str().into())?;
        if let Some(table) = panel.session.get_table() {
            set("table", &table.get_name().into())?;
        }

        if panel.renderer.active_plugin().is_some() {
            set("plugin", &panel.renderer.metadata().name.as_str().into())?;
        }

        set(
            "view_config",
            &JsValue::from_serde_ext(&panel_view_config(panel))?,
        )?;
    }

    if let Some((x, y)) = point {
        let point = Object::new();
        Reflect::set(&point, &"x".into(), &x.into())?;
        Reflect::set(&point, &"y".into(), &y.into())?;
        set("point", &point)?;
    }

    if let Some(hit) = hit {
        set("hit", &hit)?;
    }

    Ok(context.into())
}
