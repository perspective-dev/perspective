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

//! Upgrades persisted Perspective configs — engine `ViewConfig`s,
//! `<perspective-viewer>` tokens and workspaces — written by any release since
//! 2.0.0 to the current schema.
//!
//! ```
//! use perspective_migrate::{Kind, Migrator};
//! use serde_json::json;
//!
//! let migrated = Migrator::new()
//!     .migrate(Kind::View, Some("2.6.0"), json!({
//!         "row_pivot": ["State"],
//!         "expressions": ["//profit\n\"Sales\" - \"Cost\""]
//!     }))
//!     .unwrap();
//!
//! assert_eq!(migrated.value, json!({
//!     "group_by": ["State"],
//!     "expressions": {"profit": "\"Sales\" - \"Cost\""}
//! }));
//! ```

mod column_style;
mod css;
mod error;
mod json;
mod notice;
mod plugin;
mod plugins;
mod step;
mod version;
mod view;
mod viewer;
mod workspace;

pub use error::MigrateError;
pub use notice::Notice;
pub use plugin::PluginMigration;
use serde::{Deserialize, Serialize};
use serde_json::Value;
pub use step::{Apply, Step, StepCx};
use step::{Entry, Layer, Run, panels};
pub use version::Version;

/// The kind of document a config is.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    /// An engine `ViewConfig` or `ViewConfigUpdate`.
    View,

    /// A `<perspective-viewer>` `save()` / `restore()` token.
    Viewer,

    /// A workspace `save()` / `restoreWorkspace()` token.
    Workspace,
}

/// A migrated config and what the migration could not carry over exactly.
#[derive(Clone, Debug, PartialEq)]
pub struct Migrated {
    /// The config in the current schema.
    pub value: Value,

    /// Information dropped or approximated along the way.
    pub notices: Vec<Notice>,

    /// The ids of the steps that changed the config, in the order they ran.
    pub steps: Vec<&'static str>,
}

/// Upgrades configs through every schema change since their source version.
pub struct Migrator {
    plugins: Vec<Box<dyn PluginMigration>>,
}

impl Default for Migrator {
    fn default() -> Self {
        Self::new()
    }
}

impl Migrator {
    /// A migrator for the engine, the viewer and the first-party plugins.
    pub fn new() -> Self {
        Self {
            plugins: plugins::first_party(),
        }
    }

    /// Add the migrations of a third-party plugin.
    ///
    /// # Panics
    ///
    /// When `plugin` claims a plugin name another migration already owns.
    pub fn with_plugin(mut self, plugin: impl PluginMigration + 'static) -> Self {
        let owned = self
            .plugins
            .iter()
            .flat_map(|x| x.plugins().iter().copied())
            .collect::<Vec<_>>();

        if let Some(name) = plugin.plugins().iter().find(|x| owned.contains(x)) {
            panic!("plugin `{name}` already has a migration");
        }

        self.plugins.push(Box::new(plugin));
        self
    }

    /// Upgrade `value`, a `kind` document, to the current schema.
    ///
    /// The release that wrote each object is read from its own `version`
    /// field, falling back to `from` and then to 2.0.0, so re-migrating an
    /// output is a no-op.
    ///
    /// # Arguments
    ///
    /// - `kind` - Which document `value` is.
    /// - `from` - The release that wrote `value`, as `x.y.z`, used only when
    ///   `value` has no `version` field.
    /// - `value` - The config, as JSON.
    pub fn migrate(
        &self,
        kind: Kind,
        from: Option<&str>,
        value: Value,
    ) -> Result<Migrated, MigrateError> {
        let mut value = value;
        if !value.is_object() {
            return Err(MigrateError::NotAnObject);
        }

        let schema = self.schema_version();
        let from = match value.get("version").and_then(Value::as_str).or(from) {
            Some(version) => check_version(version, schema)?,
            None => Version::new(2, 0, 0),
        };

        let entries = self.entries();
        let known_plugins = self.plugin_names();
        let mut run = Run {
            kind,
            from,
            schema,
            known_plugins: &known_plugins,
            notices: vec![],
            steps: vec![],
        };

        run.apply(&entries, &mut value)?;
        stamp(kind, &schema.to_string(), &mut value);
        Ok(Migrated {
            value,
            notices: run.notices,
            steps: run.steps,
        })
    }

    /// The id of every step this migrator can run.
    pub fn step_ids(&self) -> Vec<&'static str> {
        self.entries().iter().map(|x| x.step.id).collect()
    }

    /// The newest release any step migrates to.
    pub fn newest_step_version(&self) -> Version {
        self.entries()
            .iter()
            .map(|x| x.step.at)
            .max()
            .unwrap_or_else(Version::crate_version)
    }

    /// The newest release whose configs this migrator accepts.
    pub fn schema_version(&self) -> Version {
        self.newest_step_version().max(Version::crate_version())
    }

    fn plugin_names(&self) -> Vec<&'static str> {
        let mut names = plugins::REGISTRATION_ORDER.to_vec();
        for name in self.plugins.iter().flat_map(|x| x.plugins().iter()) {
            if !names.contains(name) {
                names.push(name);
            }
        }

        names
    }

    fn entries(&self) -> Vec<Entry<'_>> {
        let fixed = [
            (Layer::View, view::STEPS),
            (Layer::Viewer, viewer::STEPS),
            (Layer::ColumnStyle, column_style::STEPS),
            (Layer::Workspace, workspace::STEPS),
        ];

        let mut entries = fixed
            .into_iter()
            .flat_map(|(layer, steps)| {
                steps.iter().map(move |step| Entry {
                    layer,
                    plugins: &[],
                    step: *step,
                })
            })
            .collect::<Vec<_>>();

        for plugin in &self.plugins {
            entries.extend(plugin.steps().into_iter().map(|step| Entry {
                layer: Layer::Plugin,
                plugins: plugin.plugins(),
                step,
            }));
        }

        entries.sort_by_key(|x| (x.step.at, x.layer));
        entries
    }
}

pub(crate) fn check_version(version: &str, schema: Version) -> Result<Version, MigrateError> {
    let parsed = Version::parse(version).ok_or_else(|| MigrateError::InvalidVersion {
        version: version.to_owned(),
    })?;

    if parsed < Version::new(2, 0, 0) {
        Err(MigrateError::Unsupported {
            version: version.to_owned(),
        })
    } else if parsed > schema {
        Err(MigrateError::FromFuture {
            version: version.to_owned(),
        })
    } else {
        Ok(parsed)
    }
}

fn stamp(kind: Kind, version: &str, value: &mut Value) {
    let version = Value::from(version);
    match kind {
        Kind::View => {},
        Kind::Viewer => {
            value["version"] = version;
        },
        Kind::Workspace => {
            for pointer in panels(value) {
                if let Some(Value::Object(panel)) = value.pointer_mut(&pointer)
                    && panel.contains_key("version")
                {
                    panel.insert("version".to_owned(), version.clone());
                }
            }

            value["version"] = version;
        },
    }
}
