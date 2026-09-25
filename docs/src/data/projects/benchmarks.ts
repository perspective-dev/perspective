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

import {
    type Project,
    type ProjectSource,
    multiPanel,
    singlePanel,
    split,
    tab,
} from "./types.js";

const MS = "Time (ms)";

const EXPRESSIONS = { [MS]: '"real_time" / 1000' };

const NOT_OUTLIER = ["outlier", "==", false];

const HISTORY = {
    title: "Time by release",
    plugin: "Y Line",
    group_by: ["version"],
    split_by: ["benchmark"],
    columns: [MS],
    expressions: EXPRESSIONS,
    aggregates: { [MS]: "avg", version_idx: "avg" },
    filter: [NOT_OUTLIER],
    sort: [["version_idx", "desc"]],
};

const LATEST = {
    title: "Latest release",
    plugin: "X Bar",
    group_by: ["benchmark"],
    columns: [MS],
    expressions: EXPRESSIONS,
    aggregates: { [MS]: "avg" },
    filter: [NOT_OUTLIER, ["version_idx", "==", 0]],
    sort: [[MS, "asc"]],
};

const MATRIX = {
    title: "Benchmark × release",
    plugin: "Datagrid",
    group_by: ["benchmark"],
    split_by: ["version"],
    columns: [MS],
    expressions: EXPRESSIONS,
    aggregates: { [MS]: "avg", version_idx: "avg" },
    filter: [NOT_OUTLIER],
    sort: [["version_idx", "col desc"]],
};

function source(name: string, file: string): ProjectSource {
    return {
        kind: "fetch",
        engine: "perspective-server",
        url: `/data/${file}`,
        format: "arrow",
        name,
    };
}

/**
 * The benchmark results CI attaches to each GitHub release, as fetched by
 * `build.projects.mjs`.
 */
export const BENCHMARKS_JS = source("benchmarks_js", "benchmark-js.arrow");

export const BENCHMARKS_PYTHON = source(
    "benchmarks_python",
    "benchmark-python.arrow",
);

function family(
    id: string,
    runtime: string,
    benchmarks: ProjectSource,
): Project[] {
    return [
        {
            id: `benchmarks-${id}`,
            title: `Benchmarks — ${runtime}`,
            description:
                `Perspective's ${runtime} benchmark results for every ` +
                "release: time by release, the latest release by case, and " +
                "the full benchmark × release matrix.",
            source: benchmarks,
            workspace: multiPanel(
                split(
                    "vertical",
                    [0.55, 0.45],
                    [
                        split(
                            "horizontal",
                            [0.6, 0.4],
                            [tab("history"), tab("latest")],
                        ),
                        tab("matrix"),
                    ],
                ),
                {
                    history: HISTORY,
                    latest: LATEST,
                    matrix: MATRIX,
                },
            ),
        },
        {
            id: `benchmarks-${id}-history`,
            title: `Benchmarks — ${runtime} by release`,
            description:
                `Mean time of each ${runtime} benchmark case across every ` +
                "published Perspective release.",
            source: benchmarks,
            workspace: singlePanel(HISTORY),
        },
    ];
}

export const BENCHMARK_PROJECTS: Project[] = [
    ...family("js", "JavaScript", BENCHMARKS_JS),
    ...family("python", "Python", BENCHMARKS_PYTHON),
];
