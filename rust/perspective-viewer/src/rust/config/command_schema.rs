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

use perspective_client::config::{Scalar, ViewConfigUpdate};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// The commands a command schema offers for one context.
#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize, TS)]
pub struct CommandSchema {
    pub commands: Vec<CommandSpec>,
}

/// One row a command schema contributes to a menu.
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
#[serde(tag = "kind")]
pub enum CommandSpec {
    /// A command the user can pick, reported back by its `key`.
    Command {
        key: String,
        label: String,

        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        disabled: Option<bool>,

        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        icon: Option<String>,

        /// Tooltip text where the command is a button, the `label` when absent.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        title: Option<String>,
    },

    /// A labelled submenu of further commands.
    Group {
        key: String,
        label: String,
        commands: Vec<CommandSpec>,
    },
}

/// A surface a command schema can be evaluated for.
#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, PartialEq, Serialize, TS)]
#[serde(rename_all = "kebab-case")]
pub enum CommandLocation {
    ContextMenu,
    DatagridRow,
    DatagridCell,
    ChartTooltip,
}

/// Options for the `setCommandSchema()` method.
#[derive(Clone, Debug, Default, Deserialize, TS)]
pub struct CommandSchemaOptions {
    /// The surfaces the schema is evaluated for, `["context-menu"]` when
    /// omitted.
    #[ts(optional)]
    pub scopes: Option<Vec<CommandLocation>>,
}

/// A location in a `PerspectiveViewFrame`'s coordinates: a view row and/or a
/// view column index.
#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Serialize, TS)]
pub struct PerspectiveHitRef {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub y: Option<u32>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub x: Option<u32>,
}

/// Which axes a `PerspectiveHit` addresses.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum PerspectiveHitKind {
    Cell,
    Row,
    Column,
}

/// What a plugin rendered at a location, resolved against its view frame.
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
pub struct PerspectiveHit {
    pub kind: PerspectiveHitKind,

    /// The view row index at draw time.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub y: Option<u32>,

    /// The view column index at draw time.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub x: Option<u32>,

    /// The row's `__ID__`: its index value(s), or its `group_by` path.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub id: Option<Vec<Scalar>>,

    /// The `group_by` values of the row, outermost first.
    pub row_path: Vec<Scalar>,

    /// The `split_by` values of the column, outermost first.
    pub column_path: Vec<Scalar>,

    /// The column targeted, as in `perspective-click`.
    pub column_names: Vec<String>,

    /// The cell's value, for a `"cell"` hit.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub value: Option<Scalar>,

    /// A `restore()` patch whose filters select the target.
    pub config: ViewConfigUpdate,
}
