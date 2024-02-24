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

use crate::config::*;
use crate::dragdrop::{DragEffect, DragTarget};
use crate::js::plugin::ViewConfigRequirements;

#[extend::ext]
pub impl ViewConfig {
    /// Create an update for this `ViewConfig` which applies a drag/drop action.
    /// This method is designed to be called from `crate::session`.
    fn create_drag_drop_update(
        &self,
        column: String,
        index: usize,
        drop: DragTarget,
        drag: DragEffect,
        requirements: &ViewConfigRequirements,
    ) -> ViewConfigUpdate {
        let mut config = self.clone();
        let mut update = ViewConfigUpdate::default();
        let is_to_swap = requirements.is_swap(index);
        let from_index = config
            .columns
            .iter()
            .position(|x| x.as_ref() == Some(&column));

        let is_from_required = from_index
            .and_then(|x| requirements.min.map(|z| x < z))
            .unwrap_or_default();

        let is_from_swap = from_index
            .map(|x| requirements.is_swap(x))
            .unwrap_or_default();

        let is_to_empty = config
            .columns
            .get(index)
            .map(|x| x.is_none())
            .unwrap_or_default();

        let is_swap_to_after_last = index == config.columns.len() && from_index.is_some();
        match drag {
            DragEffect::Copy => (),
            DragEffect::Move(DragTarget::Active) => {
                let is_to_group_or_split =
                    matches!(drop, DragTarget::GroupBy | DragTarget::SplitBy);

                if ((!is_to_swap && is_from_swap)
                    || (is_to_swap && !is_from_swap && is_to_empty)
                    || is_to_group_or_split)
                    && config.columns.len() > 1
                    && !is_from_required
                    && !is_swap_to_after_last
                {
                    // Is not a swap
                    if !is_to_swap && !is_to_group_or_split {
                        config.columns.iter_mut().for_each(|x| {
                            if x.as_ref() == Some(&column) {
                                *x = None;
                            }
                        });
                    } else {
                        config.columns.retain(|x| x.as_ref() != Some(&column));
                    }

                    update.columns = Some(config.columns.clone());
                }
            },
            DragEffect::Move(DragTarget::GroupBy) => {
                config.group_by.retain(|x| x != &column);
                update.group_by = Some(config.group_by.clone());
            },
            DragEffect::Move(DragTarget::SplitBy) => {
                config.split_by.retain(|x| x != &column);
                update.split_by = Some(config.split_by.clone());
            },
            DragEffect::Move(DragTarget::Sort) => {
                config.sort.retain(|x| x.0 != column);
                update.sort = Some(config.sort.clone());
            },
            DragEffect::Move(DragTarget::Filter) => {
                config.filter.retain(|x| x.0 != column);
                update.filter = Some(config.filter.clone());
            },
        }

        match drop {
            DragTarget::Active => {
                if !is_swap_to_after_last {
                    if is_to_swap || is_from_required {
                        let column = Some(column);
                        config.columns.extend(std::iter::repeat(None).take({
                            let fill_to = requirements
                                .names
                                .as_ref()
                                .map(|x| std::cmp::max(x.len() - 1, index))
                                .unwrap_or(index);

                            if fill_to >= (config.columns.len() - 1) {
                                fill_to + 1 - config.columns.len()
                            } else {
                                0
                            }
                        }));

                        if let Some(prev) = config.columns.iter().position(|x| *x == column) {
                            config.columns.swap(index, prev);
                        } else {
                            config.columns[index] = column;
                        }
                    } else {
                        config.columns.retain(|x| x.as_ref() != Some(&column));
                        config.columns.extend(std::iter::repeat(None).take(
                            if index >= config.columns.len() {
                                index - config.columns.len()
                            } else {
                                0
                            },
                        ));

                        if is_to_empty {
                            config.columns[index] = Some(column)
                        } else {
                            config.columns.insert(index, Some(column));
                        }
                    }

                    update.columns = Some(config.columns);
                }
            },
            DragTarget::GroupBy => {
                config.group_by.retain(|x| x != &column);
                let index = std::cmp::min(index, config.group_by.len());
                config.group_by.insert(index, column);
                update.group_by = Some(config.group_by);
            },
            DragTarget::SplitBy => {
                config.split_by.retain(|x| x != &column);
                let index = std::cmp::min(index, config.split_by.len());
                config.split_by.insert(index, column);
                update.split_by = Some(config.split_by);
            },
            DragTarget::Sort => {
                let index = std::cmp::min(index, config.sort.len());
                config.sort.insert(index, Sort(column, SortDir::Asc));
                update.sort = Some(config.sort);
            },
            DragTarget::Filter => {
                let index = std::cmp::min(index, config.filter.len());
                config.filter.insert(
                    index,
                    Filter(column, FilterOp::EQ, FilterTerm::Scalar(Scalar::Null)),
                );
                update.filter = Some(config.filter);
            },
        }

        update
    }
}
