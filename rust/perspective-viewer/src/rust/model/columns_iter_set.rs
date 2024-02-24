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

use std::collections::HashSet;

use itertools::Itertools;
use perspective_client::ColumnType;

use super::{HasRenderer, HasSession, IsInvalidDrop};
use crate::config::*;
use crate::dragdrop::*;
use crate::renderer::*;
use crate::session::*;
use crate::*;

/// The possible states of a column (row) in the active columns list, including
/// the `Option<String>` label type.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActiveColumnState {
    pub label: Label,
    pub state: ActiveColumnStateData,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ActiveColumnStateData {
    Column(String),
    Required,
    DragOver,
    Invalid,
}

impl From<&Option<String>> for ActiveColumnStateData {
    fn from(value: &Option<String>) -> Self {
        match value {
            Some(x) => Self::Column(x.to_string()),
            None => Self::Required,
        }
    }
}

impl ActiveColumnState {
    pub fn get_name(&self) -> Option<&'_ str> {
        match &self.state {
            ActiveColumnStateData::Column(x) => Some(x.as_str()),
            _ => None,
        }
    }
}

type Label = Option<String>;

/// Encapsulates the logic of determining which columns go in the "Active" and
/// "Inactive" column sections of the `ColumnSelector` component, via the
/// iterator returning functions `active()`, `inactive()` and `expression()`.
pub struct ColumnsIteratorSet<'a> {
    config: &'a ViewConfig,
    session: &'a Session,
    renderer: &'a Renderer,
    metadata: MetadataRef<'a>,
    is_dragover_column: Option<(usize, String)>,
    named_columns: Vec<String>,
}

impl<'a> HasRenderer for ColumnsIteratorSet<'a> {
    fn renderer(&self) -> &'_ Renderer {
        self.renderer
    }
}
impl<'a> HasSession for ColumnsIteratorSet<'a> {
    fn session(&self) -> &'_ Session {
        self.session
    }
}

impl<'a> ColumnsIteratorSet<'a> {
    pub fn new(
        config: &'a ViewConfig,
        session: &'a Session,
        renderer: &'a Renderer,
        dragdrop: &DragDrop,
    ) -> ColumnsIteratorSet<'a> {
        let is_dragover_column = dragdrop.is_dragover(DragTarget::Active);
        let named_columns = renderer.metadata().names.clone().unwrap_or_default();
        ColumnsIteratorSet {
            config,
            session,
            renderer,
            metadata: session.metadata(),
            is_dragover_column,
            named_columns,
        }
    }

    /// Generate an iterator for active columns, which are represented as
    /// `Option` for dragover and missing columns.
    pub fn active(&'a self) -> impl Iterator<Item = ActiveColumnState> + 'a {
        let min_cols = self
            .renderer
            .metadata()
            .names
            .as_ref()
            .map_or(0, |x| x.len());

        let last_col = self.config.columns.last().and_then(|x| x.as_ref());
        let has_blank_tail = last_col.is_none()
            || self.config.columns.len() < self.named_columns.len()
            || self.config.columns.iter().filter(|x| x.is_some()).count()
                == self
                    .session
                    .metadata()
                    .get_table_columns()
                    .map(|x| x.len())
                    .unwrap_or_default()
                    + self.config.expressions.len();

        match &self.is_dragover_column {
            Some((to_index, from_column)) => {
                let is_to_swap = self.renderer.metadata().is_swap(*to_index);
                let to_column = self.config.columns.get(*to_index);
                let is_to_empty = to_column.map(|x| x.is_none()).unwrap_or_default();
                let from_index = self
                    .config
                    .columns
                    .iter()
                    .position(|x| x.as_ref() == Some(from_column));

                let is_from_required = from_index
                    .and_then(|x| self.renderer.metadata().min.map(|y| x < y))
                    .unwrap_or_default();

                let is_from_swap = from_index
                    .map(|x| self.renderer.metadata().is_swap(x))
                    .unwrap_or_default();

                let is_swap_invalid = self.is_invalid_columns_column(from_column, *to_index);
                let is_dragover_after_last = *to_index == self.config.columns.len();
                if is_swap_invalid {
                    let all_columns = self.config.columns.iter().map(|x| x.into());
                    let before_cols = all_columns
                        .clone()
                        .pad_using(min_cols, |_| ActiveColumnStateData::Required)
                        .take(*to_index);

                    let after_cols = all_columns.skip(*to_index + 1);
                    self.to_active_column_state(Box::new(
                        before_cols
                            .chain(std::iter::once(ActiveColumnStateData::Invalid))
                            .chain(after_cols),
                    ))
                } else if is_to_swap || is_from_required {
                    let all_columns = self.config.columns.iter().filter_map(move |x| match x {
                        Some(x) if x == from_column => {
                            if is_to_empty && !is_from_swap {
                                None
                            } else {
                                Some(to_column.unwrap_or(&None).into())
                            }
                        },
                        x => Some(x.into()),
                    });

                    let before_cols = all_columns
                        .clone()
                        .pad_using(min_cols, |_| ActiveColumnStateData::Required)
                        .take(*to_index);

                    let after_cols = all_columns.skip(*to_index + 1);
                    self.to_active_column_state(Box::new(
                        before_cols
                            .chain(std::iter::once(ActiveColumnStateData::DragOver))
                            .chain(after_cols),
                    ))
                } else if !is_from_swap && from_index.is_some() && is_dragover_after_last {
                    let iter = self.config.columns.iter().map(|x| x.into());
                    self.to_active_column_state(Box::new(
                        iter.chain(std::iter::once(ActiveColumnStateData::Invalid)),
                    ))
                } else {
                    let to_offset = match to_column {
                        Some(Some(_)) => *to_index,
                        _ => *to_index + 1,
                    };

                    let all_columns = self.config.columns.iter().filter_map(move |x| match x {
                        Some(x) if x == from_column => {
                            if !is_from_swap {
                                // this is invalid
                                None
                            } else {
                                Some(ActiveColumnStateData::Required)
                            }
                        },
                        x => Some(x.into()),
                    });

                    let before_cols = all_columns
                        .clone()
                        .pad_using(min_cols, |_| ActiveColumnStateData::Required)
                        .take(*to_index);

                    let tail = if !is_from_swap && from_index.is_some() && !has_blank_tail {
                        Some(ActiveColumnStateData::Required)
                    } else {
                        None
                    };

                    let after_cols = all_columns.skip(to_offset).chain(tail);
                    self.to_active_column_state(Box::new(
                        before_cols
                            .chain(std::iter::once(ActiveColumnStateData::DragOver))
                            .chain(after_cols),
                    ))
                }
            },
            _ => {
                let iter = self.config.columns.iter().map(|x| x.into());
                self.to_active_column_state(if has_blank_tail {
                    Box::new(iter)
                } else {
                    Box::new(iter.chain(std::iter::once(ActiveColumnStateData::Required)))
                })
            },
        }
    }

    fn to_active_column_state(
        &'a self,
        iter: Box<dyn Iterator<Item = ActiveColumnStateData> + 'a>,
    ) -> impl Iterator<Item = ActiveColumnState> + 'a {
        iter.pad_using(self.named_columns.len(), |_| {
            ActiveColumnStateData::Required
        })
        .enumerate()
        .map(move |(idx, state)| {
            let label = self.named_columns.get(idx).cloned();
            ActiveColumnState { state, label }
        })
    }

    /// Generate an iterator for inactive expressions.
    pub fn expression(&'a self) -> impl Iterator<Item = OrderedColumn<'a>> {
        self.order_columns(self.metadata.get_expression_columns())
    }

    /// Generate an iterator for inactive columns, which also shows the columns
    /// in sorted order by type, then name.
    pub fn inactive(&'a self) -> impl Iterator<Item = OrderedColumn<'a>> {
        self.order_columns(self.metadata.get_table_columns().into_iter().flatten())
    }

    fn order_columns(
        &'a self,
        values: impl Iterator<Item = &'a String>,
    ) -> impl Iterator<Item = OrderedColumn<'a>> {
        let is_drag_active = maybe! {
            let dragover_col = self.is_dragover_column.as_ref();
            let cols = &self.config.columns;
            let (_, drag_name) = dragover_col?;
            let is_drag_active = cols.iter().flatten().any(|x| x == drag_name);
            Some(is_drag_active)
        };

        let col_set = self.config.columns.iter().collect::<HashSet<_>>();
        let mut filtered = values
            .filter_map(move |name| self.to_ordered_column(name, is_drag_active, &col_set))
            .collect::<Vec<_>>();

        filtered.sort();
        filtered.into_iter()
    }

    /// Convert a column `name` into an `OrderedColumn` based on whether it is
    /// active or in a drag state where an immediate drop would make it active.
    fn to_ordered_column(
        &'a self,
        name: &'a str,
        is_drag_active: Option<bool>,
        col_set: &HashSet<&Option<String>>,
    ) -> Option<OrderedColumn<'a>> {
        let dragover_col = self.is_dragover_column.as_ref();
        let cols = &self.config.columns;
        let is_active = col_set.contains(&Some(name.to_string())); // cols.iter().flatten().any(|x| x == name);
        let is_swap_over = maybe! {
            let (drop_index, _) = dragover_col?;
            let is_swap = self.renderer.metadata().is_swap(*drop_index);
            let is_over = cols.get(*drop_index)?.as_ref()? == name;
            Some(is_swap && is_over && !is_drag_active?)
        };

        if !is_active || is_swap_over.unwrap_or_default() {
            let col_type = self.session.metadata().get_column_table_type(name)?;
            let is_visible = !dragover_col.map_or(false, |(_, x)| x == name);
            Some(OrderedColumn {
                is_visible,
                name,
                col_type,
            })
        } else {
            None
        }
    }
}

pub struct OrderedColumn<'a> {
    pub is_visible: bool,
    pub name: &'a str,
    col_type: ColumnType,
}

impl<'a> PartialEq for OrderedColumn<'a> {
    fn eq(&self, rhs: &OrderedColumn<'a>) -> bool {
        self.col_type == rhs.col_type && self.name == rhs.name
    }
}

impl<'a> Eq for OrderedColumn<'a> {}

impl<'a> PartialOrd for OrderedColumn<'a> {
    fn partial_cmp(&self, rhs: &OrderedColumn<'a>) -> Option<std::cmp::Ordering> {
        Some(self.cmp(rhs))
    }
}

impl<'a> Ord for OrderedColumn<'a> {
    fn cmp(&self, rhs: &OrderedColumn<'a>) -> std::cmp::Ordering {
        self.col_type
            .cmp(&rhs.col_type)
            .then(self.name.cmp(rhs.name))
    }
}
