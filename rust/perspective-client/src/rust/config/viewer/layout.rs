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

use serde::{Deserialize, Serialize};

/// The direction a [`SplitLayout`] divides its space in: `horizontal` places
/// children side by side as columns, `vertical` stacks them as rows.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "lowercase")]
pub enum Orientation {
    /// Children side by side, as columns.
    Horizontal,

    /// Children stacked, as rows.
    Vertical,
}

/// A dashboard's panel arrangement: nested splits whose leaves are tab stacks
/// of panel ids, naming each panel at most once.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, ts_rs::TS)]
#[serde(tag = "type")]
pub enum Layout {
    /// Space divided among children, side-by-side or stacked.
    #[serde(rename = "split-layout")]
    Split(SplitLayout),

    /// A leaf node holding one or more named tabs (a stack).
    #[serde(rename = "tab-layout")]
    Tab(TabLayout),
}

/// A row or column of child layouts, nested to form a grid.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, ts_rs::TS)]
pub struct SplitLayout {
    /// Child layouts, in left-to-right or top-to-bottom order.
    pub children: Vec<Layout>,

    /// Each child's share of the split, one per child, as a proportion of
    /// their total.
    pub sizes: Vec<f64>,

    /// Whether children sit side by side (`horizontal`) or stacked
    /// (`vertical`).
    pub orientation: Orientation,
}

/// A stack of panels shown as tabs, one visible at a time.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, ts_rs::TS)]
pub struct TabLayout {
    /// Panel ids (slot names) in this stack.
    pub tabs: Vec<String>,

    /// Index of the selected tab within `tabs`.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub selected: Option<usize>,
}

impl Layout {
    /// Check that this tree is well-formed and names each of `ids` at most
    /// once, returning the `ids` it leaves unplaced.
    pub fn validate(&self, ids: &[String]) -> Result<Vec<String>, String> {
        let mut seen = Vec::new();
        self.validate_node("layout", ids, &mut seen)?;
        Ok(ids
            .iter()
            .filter(|id| !seen.contains(id))
            .cloned()
            .collect())
    }

    fn validate_node(
        &self,
        path: &str,
        ids: &[String],
        seen: &mut Vec<String>,
    ) -> Result<(), String> {
        match self {
            Layout::Split(split) => {
                if split.sizes.len() != split.children.len() {
                    return Err(format!(
                        "Invalid layout: {path}.sizes has {} entries for {} children",
                        split.sizes.len(),
                        split.children.len()
                    ));
                }

                if let Some(size) = split.sizes.iter().find(|x| !x.is_finite() || **x < 0.0) {
                    return Err(format!("Invalid layout: {path}.sizes contains {size}"));
                }

                if !split.sizes.is_empty() && split.sizes.iter().sum::<f64>() <= 0.0 {
                    return Err(format!("Invalid layout: {path}.sizes sum to zero"));
                }

                for (index, child) in split.children.iter().enumerate() {
                    child.validate_node(&format!("{path}.children[{index}]"), ids, seen)?;
                }

                Ok(())
            },
            Layout::Tab(tab) => {
                for name in &tab.tabs {
                    if !ids.contains(name) {
                        return Err(format!(
                            "Invalid layout: {path}.tabs names unknown panel \"{name}\" (panels: \
                             {ids:?})"
                        ));
                    }

                    if seen.contains(name) {
                        return Err(format!(
                            "Invalid layout: panel \"{name}\" appears more than once"
                        ));
                    }

                    seen.push(name.clone());
                }

                Ok(())
            },
        }
    }

    /// Collect every panel id (slot name) in the tree, depth-first.
    pub fn slot_names(&self) -> Vec<String> {
        match self {
            Layout::Split(split) => split.children.iter().flat_map(Layout::slot_names).collect(),
            Layout::Tab(tab) => tab.tabs.clone(),
        }
    }

    /// Collect every panel id that is *hidden* — i.e. in a stack (tab-layout)
    /// at an index other than its `selected` one — in depth-first order. The
    /// complement of the visible set: every other panel is the front of its
    /// stack (single-tab leaves are trivially visible).
    pub fn hidden_slot_names(&self) -> Vec<String> {
        match self {
            Layout::Split(split) => split
                .children
                .iter()
                .flat_map(Layout::hidden_slot_names)
                .collect(),
            Layout::Tab(tab) => {
                let selected = tab.selected.unwrap_or(0);
                tab.tabs
                    .iter()
                    .enumerate()
                    .filter(|(idx, _)| *idx != selected)
                    .map(|(_, name)| name.clone())
                    .collect()
            },
        }
    }

    /// Rewrite every panel id through `f`, returning the remapped tree. Ids for
    /// which `f` returns `None` are left unchanged. Used by `restoreWorkspace`,
    /// which recreates panels under fresh (collision-free) ids and must point
    /// the saved layout tree at them.
    pub fn remap(&self, f: &impl Fn(&str) -> Option<String>) -> Layout {
        match self {
            Layout::Split(split) => Layout::Split(SplitLayout {
                children: split.children.iter().map(|c| c.remap(f)).collect(),
                sizes: split.sizes.clone(),
                orientation: split.orientation,
            }),
            Layout::Tab(tab) => Layout::Tab(TabLayout {
                tabs: tab
                    .tabs
                    .iter()
                    .map(|name| f(name).unwrap_or_else(|| name.clone()))
                    .collect(),
                selected: tab.selected,
            }),
        }
    }
}
