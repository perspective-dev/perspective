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

use std::collections::{BTreeMap, BTreeSet};

use perspective_client::config::ViewConfig;
use perspective_client::{DeleteOptions, Table, View};
use perspective_js::utils::*;

use crate::config::{DerivedTableConfig, UnknownKeys};
use crate::session::ViewSubscription;
use crate::utils::PtrEqRc;

/// The `View` a derived `Table` reads, which is a panel's own subscription when
/// the derivation consumed it and a bare `View` when a restore rebuilt it.
pub enum DerivedSource {
    Panel(ViewSubscription),
    Restored(View),
}

impl DerivedSource {
    async fn delete(self) -> ApiResult<()> {
        match self {
            Self::Panel(sub) => sub.delete().await,
            Self::Restored(view) => Ok(view.delete().await?),
        }
    }
}

/// A live derived `Table` and the `View` it reads.
pub struct DerivedTable {
    parent: String,
    view_config: ViewConfig,
    source: DerivedSource,
    table: Table,
}

impl DerivedTable {
    pub fn new(
        parent: String,
        view_config: ViewConfig,
        source: DerivedSource,
        table: Table,
    ) -> Self {
        Self {
            parent,
            view_config,
            source,
            table,
        }
    }

    pub fn parent(&self) -> &str {
        &self.parent
    }

    pub fn view_config(&self) -> &ViewConfig {
        &self.view_config
    }

    pub fn table(&self) -> &Table {
        &self.table
    }

    /// The persisted definition of this derivation.
    pub fn config(&self) -> DerivedTableConfig {
        DerivedTableConfig {
            table: self.parent.clone(),
            view_config: self.view_config.clone(),
            unknown: UnknownKeys,
        }
    }

    /// Whether this derivation was built from `config`, and so may be reused.
    pub fn matches(&self, config: &DerivedTableConfig) -> bool {
        self.parent == config.table && self.view_config == config.view_config
    }

    /// Delete the `Table` before the `View` it reads, which the engine
    /// requires in that order.
    pub async fn delete(self) -> ApiResult<()> {
        self.table.delete(DeleteOptions::default()).await?;
        self.source.delete().await
    }
}

/// The workspace's derived `Table`s: those live, and those whose parent is not
/// yet hosted.
#[derive(Default)]
pub struct DerivedRegistry {
    live: BTreeMap<String, DerivedTable>,
    pending: BTreeMap<String, DerivedTableConfig>,
}

impl DerivedRegistry {
    pub fn get(&self, name: &str) -> Option<&DerivedTable> {
        self.live.get(name)
    }

    pub fn contains(&self, name: &str) -> bool {
        self.live.contains_key(name)
    }

    pub fn insert(&mut self, name: String, table: DerivedTable) {
        self.pending.remove(&name);
        self.live.insert(name, table);
    }

    pub fn remove(&mut self, name: &str) -> Option<DerivedTable> {
        self.pending.remove(name);
        self.live.remove(name)
    }

    pub fn names(&self) -> Vec<String> {
        self.live.keys().cloned().collect()
    }

    /// The name of a live derivation built from `config`, regardless of what
    /// it is named, for inline-definition restores to rebind to.
    pub fn find_structural(&self, config: &DerivedTableConfig) -> Option<String> {
        self.live
            .iter()
            .find(|(_, table)| table.matches(config))
            .map(|(name, _)| name.clone())
    }

    /// The definitions waiting on a parent that is not yet hosted.
    pub fn pending(&self) -> BTreeMap<String, DerivedTableConfig> {
        self.pending.clone()
    }

    pub fn set_pending(&mut self, pending: BTreeMap<String, DerivedTableConfig>) {
        self.pending = pending;
    }

    /// Every derivation's persisted definition, live or pending, for
    /// `saveWorkspace`.
    pub fn configs(&self) -> BTreeMap<String, DerivedTableConfig> {
        let mut out = self.pending.clone();
        out.extend(
            self.live
                .iter()
                .map(|(name, table)| (name.clone(), table.config())),
        );

        out
    }

    /// The names whose `parent` is `name`.
    pub fn children(&self, name: &str) -> Vec<String> {
        self.live
            .iter()
            .filter(|(_, table)| table.parent == name)
            .map(|(child, _)| child.clone())
            .chain(
                self.pending
                    .iter()
                    .filter(|(_, config)| config.table == name)
                    .map(|(child, _)| child.clone()),
            )
            .collect()
    }

    /// `name`'s ancestors, nearest first, stopping at the first non-derived
    /// `Table`.
    pub fn ancestors(&self, name: &str) -> Vec<String> {
        let mut out = vec![];
        let mut seen = BTreeSet::new();
        let mut cursor = name.to_owned();
        while let Some(entry) = self.live.get(&cursor) {
            if !seen.insert(cursor.clone()) {
                break;
            }

            out.push(entry.parent.clone());
            cursor = entry.parent.clone();
        }

        out
    }
}

/// Order `configs` parents-first, or report the names forming a cycle.
pub fn topo_order(configs: &BTreeMap<String, DerivedTableConfig>) -> Result<Vec<String>, String> {
    let mut pending = configs.keys().cloned().collect::<BTreeSet<_>>();
    let mut out = Vec::with_capacity(configs.len());
    while !pending.is_empty() {
        let ready = pending
            .iter()
            .filter(|name| {
                let parent = &configs[*name].table;
                !pending.contains(parent)
            })
            .cloned()
            .collect::<Vec<_>>();

        if ready.is_empty() {
            let cycle = pending.into_iter().collect::<Vec<_>>().join("`, `");
            return Err(format!(
                "`derived_tables` has a dependency cycle among `{cycle}`"
            ));
        }

        for name in ready {
            pending.remove(&name);
            out.push(name);
        }
    }

    Ok(out)
}

/// The subset of `order` that may be reused from `registry`, which requires
/// every ancestor within `configs` to be reusable too.
pub fn reusable(
    order: &[String],
    configs: &BTreeMap<String, DerivedTableConfig>,
    registry: &DerivedRegistry,
) -> BTreeSet<String> {
    let mut out = BTreeSet::new();
    for name in order {
        let config = &configs[name];
        let parent_ok = !configs.contains_key(&config.table) || out.contains(&config.table);
        if parent_ok
            && registry
                .get(name)
                .is_some_and(|table| table.matches(config))
        {
            out.insert(name.clone());
        }
    }

    out
}

/// A `<table> GROUP BY <cols>`-style name that collides with nothing in
/// `taken`.
pub fn suggest_name(
    taken: &BTreeSet<String>,
    config: &PtrEqRc<ViewConfig>,
    table: &Option<String>,
) -> String {
    let table_name = table.as_deref().unwrap_or("...");
    let name = if config.group_by.is_empty() {
        table_name.to_owned()
    } else {
        format!("{} GROUP BY {}", table_name, config.group_by.join(", "))
    };

    if taken.contains(&name) {
        (1..)
            .map(|n| format!("{name} {n}"))
            .find(|name| !taken.contains(name))
            .unwrap()
    } else {
        name
    }
}
