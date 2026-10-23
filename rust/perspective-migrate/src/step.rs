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

use serde_json::{Map, Value};

use crate::error::MigrateError;
use crate::json::escape;
use crate::notice::Notice;
use crate::plugins::resolve_plugin;
use crate::version::Version;
use crate::{Kind, check_version};

/// Rewrites one config object from the shape before [`Step::at`] to the shape
/// after it.
pub type Apply = fn(&mut Map<String, Value>, &mut StepCx) -> Result<(), MigrateError>;

/// One schema change: `apply` runs on every object it concerns when the
/// source version predates `at`.
#[derive(Clone, Copy)]
pub struct Step {
    /// The first release that shipped the new shape.
    pub at: Version,

    /// A stable identifier, reported in [`crate::Migrated::steps`].
    pub id: &'static str,

    /// The rewrite, which must only touch keys present in its input.
    pub apply: Apply,
}

/// The context a [`Step`] runs in.
pub struct StepCx<'a> {
    kind: Kind,
    from: Version,
    step: &'static str,
    pointer: &'a str,
    known_plugins: &'a [&'static str],
    notices: &'a mut Vec<Notice>,
}

impl StepCx<'_> {
    /// The kind of document being migrated.
    pub fn kind(&self) -> Kind {
        self.kind
    }

    /// The version the document was written by.
    pub fn from(&self) -> Version {
        self.from
    }

    /// Record that `value`, found at `path` below this object, was removed.
    pub fn dropped(&mut self, path: &[&str], value: Value) {
        let pointer = self.pointer_to(path);
        self.notices.push(Notice::Dropped {
            step: self.step,
            pointer,
            value,
        });
    }

    /// Record that the value at `path` below this object was approximated.
    pub fn approximated(&mut self, path: &[&str], reason: &'static str) {
        let pointer = self.pointer_to(path);
        self.notices.push(Notice::Approximated {
            step: self.step,
            pointer,
            reason,
        });
    }

    /// A [`MigrateError::Malformed`] for the value at `path` below this object.
    pub fn malformed(&self, path: &[&str], expected: &'static str) -> MigrateError {
        MigrateError::Malformed {
            step: self.step,
            pointer: self.pointer_to(path),
            expected,
        }
    }

    /// A [`MigrateError::Conflict`] between `keys` of this object.
    pub fn conflict(&self, keys: &[&str]) -> MigrateError {
        MigrateError::Conflict {
            step: self.step,
            pointer: self.pointer.to_owned(),
            keys: keys.iter().map(|x| (*x).to_owned()).collect(),
        }
    }

    /// A [`MigrateError::MissingTable`] for the workspace panel `panel`.
    pub fn missing_table(&self, panel: &str) -> MigrateError {
        MigrateError::MissingTable {
            step: self.step,
            panel: panel.to_owned(),
        }
    }

    pub(crate) fn resolve_plugin(&self, name: &str) -> Option<&'static str> {
        resolve_plugin(name, self.known_plugins)
    }

    fn pointer_to(&self, path: &[&str]) -> String {
        path.iter().fold(self.pointer.to_owned(), |acc, seg| {
            format!("{acc}/{}", escape(seg))
        })
    }
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub(crate) enum Layer {
    View,
    Viewer,
    ColumnStyle,
    Plugin,
    Workspace,
}

pub(crate) struct Entry<'a> {
    pub layer: Layer,
    pub plugins: &'a [&'static str],
    pub step: Step,
}

pub(crate) struct Run<'a> {
    pub kind: Kind,
    pub from: Version,
    pub schema: Version,
    pub known_plugins: &'a [&'static str],
    pub notices: Vec<Notice>,
    pub steps: Vec<&'static str>,
}

impl Run<'_> {
    pub fn apply(&mut self, entries: &[Entry], root: &mut Value) -> Result<(), MigrateError> {
        for entry in entries {
            let notices = self.notices.len();
            let mut changed = false;
            for pointer in targets(self.kind, entry.layer, root) {
                let Some(Value::Object(target)) = root.pointer_mut(&pointer) else {
                    continue;
                };

                let from = match target.get("version").and_then(Value::as_str) {
                    Some(version) => check_version(version, self.schema)?,
                    None => self.from,
                };

                if from >= entry.step.at
                    || (entry.layer == Layer::Plugin && !self.owns(entry.plugins, target))
                {
                    continue;
                }

                let before = target.clone();
                let mut cx = StepCx {
                    kind: self.kind,
                    from,
                    step: entry.step.id,
                    pointer: &pointer,
                    known_plugins: self.known_plugins,
                    notices: &mut self.notices,
                };

                (entry.step.apply)(target, &mut cx)?;
                changed |= *target != before;
            }

            if changed || self.notices.len() > notices {
                self.steps.push(entry.step.id);
            }
        }

        Ok(())
    }

    fn owns(&self, plugins: &[&'static str], target: &Map<String, Value>) -> bool {
        target
            .get("plugin")
            .and_then(Value::as_str)
            .and_then(|name| resolve_plugin(name, self.known_plugins))
            .is_some_and(|name| plugins.contains(&name))
    }
}

fn targets(kind: Kind, layer: Layer, root: &Value) -> Vec<String> {
    match (kind, layer) {
        (Kind::View, Layer::View) => vec![String::new()],
        (Kind::View, _) => vec![],
        (Kind::Viewer, Layer::View) => {
            let mut out = vec![String::new()];
            let mut pointer = String::from("/table");
            while root.pointer(&pointer).is_some_and(Value::is_object) {
                out.push(pointer.clone());
                pointer.push_str("/table");
            }

            out
        },
        (Kind::Viewer, Layer::Workspace) => vec![],
        (Kind::Viewer, _) => vec![String::new()],
        (Kind::Workspace, Layer::Workspace) => vec![String::new()],
        (Kind::Workspace, Layer::View) => {
            let mut out = panels(root);
            out.extend(children(root, "derived_tables"));
            out
        },
        (Kind::Workspace, _) => panels(root),
    }
}

pub(crate) fn panels(root: &Value) -> Vec<String> {
    let mut out = children(root, "panels");
    out.extend(children(root, "viewers"));
    out
}

fn children(root: &Value, key: &str) -> Vec<String> {
    root.get(key)
        .and_then(Value::as_object)
        .map(|map| {
            map.keys()
                .map(|name| format!("/{key}/{}", escape(name)))
                .collect()
        })
        .unwrap_or_default()
}
