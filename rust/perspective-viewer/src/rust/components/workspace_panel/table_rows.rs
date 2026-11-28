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

use crate::config::DerivedTableConfig;

#[derive(Clone, Copy, PartialEq)]
pub enum TableKind {
    Base,
    Derived,
    Pending,
    Join,
}

impl TableKind {
    /// The row's CSS class.
    pub fn class(self) -> &'static str {
        match self {
            Self::Base => "is-base",
            Self::Derived => "is-derived",
            Self::Pending => "is-pending",
            Self::Join => "is-join",
        }
    }

    /// Whether the workspace created this `Table` and may delete it.
    pub fn is_owned(self) -> bool {
        matches!(self, Self::Derived | Self::Join)
    }
}

pub struct TableRow {
    pub name: String,
    pub depth: usize,
    pub kind: TableKind,
}

/// Order `tables` as a forest by derivation, with pending derivations under
/// their parents.
pub fn table_rows(
    tables: &[String],
    derived: &BTreeMap<String, DerivedTableConfig>,
    pending: &BTreeSet<String>,
    joins: &BTreeSet<String>,
    orphans: bool,
) -> Vec<TableRow> {
    let hosted = tables.iter().cloned().collect::<BTreeSet<_>>();
    let parent = |name: &str| derived.get(name).map(|config| config.table.clone());
    let kind = |name: &str| {
        if pending.contains(name) {
            TableKind::Pending
        } else if derived.contains_key(name) {
            TableKind::Derived
        } else if joins.contains(name) {
            TableKind::Join
        } else {
            TableKind::Base
        }
    };

    let known = hosted.union(pending).cloned().collect::<BTreeSet<_>>();
    let mut rows = vec![];
    let mut stack = known
        .iter()
        .rev()
        .filter(|name| match parent(name) {
            None => hosted.contains(*name),
            Some(parent) if known.contains(&parent) => false,
            Some(_) => hosted.contains(*name) || orphans,
        })
        .map(|name| (name.clone(), 0))
        .collect::<Vec<_>>();

    let mut seen = BTreeSet::new();
    while let Some((name, depth)) = stack.pop() {
        if !seen.insert(name.clone()) {
            continue;
        }

        let children = known
            .iter()
            .rev()
            .filter(|child| parent(child).as_deref() == Some(name.as_str()))
            .map(|child| (child.clone(), depth + 1));

        stack.extend(children);
        rows.push(TableRow {
            kind: kind(&name),
            name,
            depth,
        });
    }

    rows
}
