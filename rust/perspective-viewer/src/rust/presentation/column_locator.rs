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

use std::fmt::Display;

/// Locates a view column.
/// Table columns are those defined on the table, but their types will reflect
/// the view type, not the table type.
#[derive(Clone, Debug, PartialEq)]
pub enum ColumnLocator {
    Table(String),
    Expression(String),
    Window(String),
    NewExpression,
}

impl ColumnLocator {
    /// Pulls the column's name from the locator.
    /// If the column is a new expression which has yet to be saved, the
    /// function will return None.
    pub fn name(&self) -> Option<&String> {
        match self {
            Self::Table(s) | Self::Expression(s) | Self::Window(s) => Some(s),
            Self::NewExpression => None,
        }
    }

    #[inline(always)]
    pub fn is_saved_expr(&self) -> bool {
        matches!(self, ColumnLocator::Expression(_))
    }

    #[inline(always)]
    pub fn is_expr(&self) -> bool {
        matches!(
            self,
            ColumnLocator::Expression(_) | ColumnLocator::NewExpression
        )
    }

    #[inline(always)]
    pub fn is_new_expr(&self) -> bool {
        matches!(self, ColumnLocator::NewExpression)
    }

    #[inline(always)]
    pub fn is_saved_window(&self) -> bool {
        matches!(self, ColumnLocator::Window(_))
    }

    #[inline(always)]
    pub fn is_window_editable(&self) -> bool {
        matches!(
            self,
            ColumnLocator::Window(_) | ColumnLocator::NewExpression
        )
    }
}

/// What the column-settings drawer is opened on, as held in presentation
/// state: a column by name, or the not-yet-saved expression.
#[derive(Clone, Debug, PartialEq)]
pub enum ColumnSettingsTarget {
    Column(String),
    NewExpression,
}

impl ColumnSettingsTarget {
    pub fn name(&self) -> Option<&String> {
        match self {
            Self::Column(name) => Some(name),
            Self::NewExpression => None,
        }
    }
}

#[derive(Debug, Default, Clone, Copy, PartialEq)]

pub enum ColumnSettingsTab {
    #[default]
    Attributes,
    Window,
    Style,
}

impl Display for ColumnSettingsTab {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_fmt(format_args!("{self:?}"))
    }
}

#[derive(Clone, Default, Debug, PartialEq)]
pub struct OpenColumnSettings {
    pub target: Option<ColumnSettingsTarget>,
    pub tab: Option<ColumnSettingsTab>,
}

impl OpenColumnSettings {
    pub fn name(&self) -> Option<String> {
        self.target.as_ref().and_then(|t| t.name()).cloned()
    }
}

pub trait ColumnTab: PartialEq + Display + Clone + Default + 'static {}

impl ColumnTab for String {}

impl ColumnTab for &'static str {}

impl ColumnTab for ColumnSettingsTab {}
