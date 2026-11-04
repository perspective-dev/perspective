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

mod v3_0_0;
mod v3_8_0;
mod v5_2_0;
mod v5_6_0;
mod v5_7_0;

use crate::step::Step;
use crate::version::Version;

pub(crate) const STEPS: &[Step] = &[
    Step {
        at: Version::new(3, 0, 0),
        id: "view.v2_aliases",
        apply: v3_0_0::v2_aliases,
    },
    Step {
        at: Version::new(3, 0, 0),
        id: "view.drop_split_by_depth",
        apply: v3_0_0::drop_split_by_depth,
    },
    Step {
        at: Version::new(3, 0, 0),
        id: "view.drop_viewport",
        apply: v3_0_0::drop_viewport,
    },
    Step {
        at: Version::new(3, 0, 0),
        id: "view.filter_op_symbols",
        apply: v3_0_0::filter_op_symbols,
    },
    Step {
        at: Version::new(3, 0, 0),
        id: "view.expression_tuples",
        apply: v3_0_0::expression_tuples,
    },
    Step {
        at: Version::new(3, 8, 0),
        id: "view.multi_aggregate_args",
        apply: v3_8_0::multi_aggregate_args,
    },
    Step {
        at: Version::new(5, 2, 0),
        id: "view.prune_unused_aggregates",
        apply: v5_2_0::prune_unused_aggregates,
    },
    Step {
        at: Version::new(5, 6, 0),
        id: "view.dedupe_group_by",
        apply: v5_6_0::dedupe_group_by,
    },
    Step {
        at: Version::new(5, 7, 0),
        id: "view.expressions_map",
        apply: v5_7_0::expressions_map,
    },
    Step {
        at: Version::new(5, 7, 0),
        id: "view.canonical_names",
        apply: v5_7_0::canonical_names,
    },
];

pub(crate) const VIEW_KEYS: &[&str] = &[
    "group_by",
    "split_by",
    "columns",
    "filter",
    "sort",
    "expressions",
    "windows",
    "aggregates",
    "group_by_depth",
    "filter_op",
    "group_rollup_mode",
    "split_rollup_mode",
];
