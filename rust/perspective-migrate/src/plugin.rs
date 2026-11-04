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

use crate::step::Step;

/// The migrations of a plugin's `plugin_config` and `columns_config`, whose
/// [`Step::at`] versions are the Perspective release that wrote a token rather
/// than releases of the plugin itself.
///
/// # Example
///
/// ```
/// use perspective_migrate::{Kind, Migrator, PluginMigration, Step, StepCx, Version};
/// use serde_json::{Map, Value, json};
///
/// struct Sparkline;
///
/// fn rename_width(
///     token: &mut Map<String, Value>,
///     _cx: &mut StepCx,
/// ) -> Result<(), perspective_migrate::MigrateError> {
///     if let Some(Value::Object(config)) = token.get_mut("plugin_config")
///         && let Some(width) = config.remove("width")
///     {
///         config.insert("line_width".to_owned(), width);
///     }
///
///     Ok(())
/// }
///
/// impl PluginMigration for Sparkline {
///     fn plugins(&self) -> &[&'static str] {
///         &["Sparkline"]
///     }
///
///     fn steps(&self) -> Vec<Step> {
///         vec![Step {
///             at: Version::new(3, 0, 0),
///             id: "sparkline.line_width",
///             apply: rename_width,
///         }]
///     }
/// }
///
/// let migrated = Migrator::new()
///     .with_plugin(Sparkline)
///     .migrate(Kind::Viewer, None, json!({
///         "version": "2.10.0",
///         "plugin": "Sparkline",
///         "plugin_config": {"width": 2}
///     }))
///     .unwrap();
///
/// assert_eq!(migrated.value["plugin_config"], json!({"line_width": 2}));
/// ```
pub trait PluginMigration {
    /// The `plugin` names whose payloads this migration owns.
    fn plugins(&self) -> &[&'static str];

    /// The plugin-layer steps, in any order.
    fn steps(&self) -> Vec<Step>;
}
