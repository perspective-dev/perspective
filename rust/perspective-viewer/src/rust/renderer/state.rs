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

use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

use perspective_js::utils::ApiError;

use super::plugin_config::PluginScopedConfig;
use crate::config::{ColumnConfigFieldUpdate, PluginStaticConfig};

/// How a panel is drawn, as one immutable value replaced whole.
#[derive(Clone, Default)]
pub struct RendererState {
    /// The selected plugin, or `None` until the first run selects one.
    pub plugin: Option<PluginRef>,

    /// Every plugin's own `plugin_config` and `columns_config`, keyed by
    /// plugin name.
    pub buckets: Rc<HashMap<String, PluginScopedConfig>>,

    /// This panel's concrete theme name.
    pub theme: Option<String>,
}

/// A plugin selection: its index in the plugin store and its static config.
#[derive(Clone)]
pub struct PluginRef {
    pub idx: usize,
    pub static_config: Rc<PluginStaticConfig>,
}

impl RendererState {
    pub fn with_theme(&self, theme: Option<String>) -> Self {
        Self {
            theme,
            ..self.clone()
        }
    }

    pub fn with_plugin(&self, plugin: PluginRef) -> Self {
        Self {
            plugin: Some(plugin),
            ..self.clone()
        }
    }

    /// This state with no plugin selected and every bucket forgotten.
    pub fn without_plugins(&self) -> Self {
        Self {
            plugin: None,
            buckets: Rc::default(),
            ..self.clone()
        }
    }

    /// The named plugin's bucket, empty when it has never been written.
    pub fn bucket(&self, name: &str) -> PluginScopedConfig {
        self.buckets.get(name).cloned().unwrap_or_default()
    }

    /// This state with the named plugin's bucket replaced.
    pub fn with_bucket(&self, name: &str, bucket: PluginScopedConfig) -> Self {
        let mut buckets = (*self.buckets).clone();
        buckets.insert(name.to_owned(), bucket);
        Self {
            buckets: Rc::new(buckets),
            ..self.clone()
        }
    }
}

/// A failure to draw a valid committed state.
#[derive(Clone)]
pub struct RenderError(pub ApiError);

impl PartialEq for RenderError {
    fn eq(&self, other: &Self) -> bool {
        self.0.to_string() == other.0.to_string()
    }
}

impl std::fmt::Debug for RenderError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_tuple("RenderError")
            .field(&self.0.to_string())
            .finish()
    }
}

/// How the last draw of the committed state went, which any commit resets.
#[derive(Clone, Default)]
pub enum RenderOutcome {
    #[default]
    Never,
    Ok,
    Failed(RenderError),
}

/// A UI edit of the renderer's state that is queued but not yet committed.
#[derive(Clone)]
pub enum StagedEdit {
    /// One plugin-level settings field of the selected plugin.
    PluginField(ColumnConfigFieldUpdate),

    /// One style field of one column, for the selected plugin.
    ColumnField {
        column: String,
        update: ColumnConfigFieldUpdate,
    },

    /// Keys merged into the selected plugin's `plugin_config`.
    PluginConfig(serde_json::Map<String, serde_json::Value>),
    Theme(Option<String>),
}

/// The renderer's staged edits, in the order they were made.
#[derive(Default)]
pub(super) struct StagedEdits {
    next_id: std::cell::Cell<u64>,
    edits: RefCell<Vec<(u64, StagedEdit)>>,
}

impl StagedEdits {
    pub fn stage(self: &Rc<Self>, edit: StagedEdit) -> Staged {
        let id = self.next_id.get();
        self.next_id.set(id + 1);
        self.edits.borrow_mut().push((id, edit));
        Staged {
            id,
            edits: Rc::downgrade(self),
        }
    }

    pub fn pending(&self) -> Vec<StagedEdit> {
        self.edits.borrow().iter().map(|x| x.1.clone()).collect()
    }
}

/// Keeps one [`StagedEdit`] visible to the UI until its op leaves the queue.
pub struct Staged {
    id: u64,
    edits: std::rc::Weak<StagedEdits>,
}

impl Drop for Staged {
    fn drop(&mut self) {
        if let Some(edits) = self.edits.upgrade() {
            edits.edits.borrow_mut().retain(|x| x.0 != self.id);
        }
    }
}

/// `bucket` with every pending bucket edit applied, in the order made.
pub(super) fn project_bucket(
    mut bucket: PluginScopedConfig,
    pending: Vec<StagedEdit>,
) -> PluginScopedConfig {
    for edit in pending {
        match edit {
            StagedEdit::PluginField(update) => {
                for key in &update.keys {
                    match update.value.get(key) {
                        Some(value) => {
                            bucket.plugin.insert(key.clone(), value.clone());
                        },
                        None => {
                            bucket.plugin.remove(key);
                        },
                    }
                }
            },
            StagedEdit::ColumnField { column, update } => {
                let entry = bucket.columns.entry(column.clone()).or_default();
                for key in &update.keys {
                    entry.remove(key);
                }

                for (key, value) in update.value {
                    if update.keys.contains(&key) {
                        entry.insert(key, value);
                    }
                }

                if entry.is_empty() {
                    bucket.columns.remove(&column);
                }
            },
            StagedEdit::PluginConfig(map) => bucket.plugin.extend(map),
            StagedEdit::Theme(_) => {},
        }
    }

    bucket
}
