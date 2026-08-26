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

import { GENERATORS } from "./generators.js";
import {
    multiPanel,
    type Project,
    type ProjectSource,
    singlePanel,
    split,
    tab,
} from "./types.js";

/**
 * Vendored by `build.config.mjs` from `node_modules/superstore-arrow`. A
 * `node_modules` URL would resolve only against the dev server — deployment
 * ships `dist/` alone.
 */
export const SUPERSTORE: ProjectSource = {
    kind: "fetch",
    engine: "perspective-server",
    url: "/data/superstore.lz4.arrow",
    format: "arrow",
    name: "superstore",
};

export const MOVIES: ProjectSource = {
    kind: "fetch",
    engine: "perspective-server",
    url: "/data/movies.arrow",
    format: "arrow",
    name: "movies",
};

export const SUPERSTORE_PROJECTS: Project[] = [
    {
        id: "superstore",
        title: "Superstore",
        description: "Superstore data",
        source: SUPERSTORE,
        workspace: {
            active: "PERSPECTIVE_GENERATED_ID_0",
            layout: {
                type: "tab-layout",
                tabs: ["PERSPECTIVE_GENERATED_ID_0"],
                selected: 0,
            },
            panels: {
                PERSPECTIVE_GENERATED_ID_0: {
                    plugin: "Datagrid",
                    title: "Superstore",
                },
            },
        },
    },
    {
        id: "superstore-overview",
        title: "Superstore (Workspace)",
        description:
            "Sales by sub-category, profit over time, and the grouped grid " +
            "underneath.",
        source: SUPERSTORE,
        workspace: {
            active: "PERSPECTIVE_GENERATED_ID_1",
            layout: {
                type: "split-layout",
                children: [
                    {
                        type: "split-layout",
                        children: [
                            {
                                type: "tab-layout",
                                tabs: ["PERSPECTIVE_GENERATED_ID_0"],
                                selected: 0,
                            },
                            {
                                type: "tab-layout",
                                tabs: ["PERSPECTIVE_GENERATED_ID_2"],
                                selected: 0,
                            },
                        ],
                        sizes: [0.5, 0.5],
                        orientation: "horizontal",
                    },
                    {
                        type: "tab-layout",
                        tabs: ["PERSPECTIVE_GENERATED_ID_1"],
                        selected: 0,
                    },
                ],
                sizes: [0.55, 0.45],
                orientation: "vertical",
            },
            panels: {
                PERSPECTIVE_GENERATED_ID_0: {
                    columns_config: {},
                    plugin: "Y Bar",
                    plugin_config: {},
                    table: "superstore",
                    title: "Y Bar",
                    group_by: ["Sub-Category"],
                    split_by: ["Segment"],
                    sort: [["Sales", "desc"]],
                    filter: [],
                    group_rollup_mode: "flat",
                    split_rollup_mode: "flat",
                    expressions: {},
                    columns: ["Sales"],
                    aggregates: {},
                },
                PERSPECTIVE_GENERATED_ID_1: {
                    columns_config: {
                        Profit: {
                            number_fg_mode: "label-bar",
                            fg_gradient: 17320,
                        },
                    },
                    plugin: "Datagrid",
                    plugin_config: {},
                    table: "superstore",
                    title: "Group By 2",
                    group_by: ["Region", "State"],
                    split_by: ["Category", "Sub-Category"],
                    sort: [["Profit", "asc"]],
                    filter: [],
                    group_rollup_mode: "rollup",
                    split_rollup_mode: "rollup",
                    expressions: {},
                    columns: ["Sales", "Profit"],
                    aggregates: {},
                },
                PERSPECTIVE_GENERATED_ID_2: {
                    columns_config: {},
                    plugin: "Treemap",
                    plugin_config: {},
                    table: "superstore",
                    title: "Y Line - Datetime Axis",
                    group_by: ["Region", "State"],
                    split_by: [],
                    sort: [["Profit", "desc"]],
                    filter: [],
                    group_rollup_mode: "flat",
                    split_rollup_mode: "flat",
                    expressions: {},
                    columns: ["Sales", "Profit", null],
                    aggregates: {},
                },
            },
        },
    },
    // {
    //     id: "superstore-hierarchy",
    //     title: "Superstore — Hierarchy",
    //     description:
    //         "The same hierarchy as treemap and sunburst, side by side.",
    //     source: SUPERSTORE,
    //     workspace: multiPanel(
    //         split("horizontal", [0.5, 0.5], [tab("tree"), tab("sun")]),
    //         {
    //             tree: { theme: null, ...featureByName("Treemap") },
    //             sun: { theme: null, ...featureByName("Sunburst") },
    //         },
    //     ),
    // },
];

export const OLYMPICS_PROJECTS: Project[] = [
    {
        id: "olympics",
        title: "Olympics",
        description: "120 years of Olympic athletes, from Kaggle.",
        source: {
            kind: "fetch",
            engine: "perspective-server",
            url: "/data/olympics.arrow",
            format: "arrow",
            name: "olympics",
        },
        workspace: {
            active: "PERSPECTIVE_GENERATED_ID_0",
            layout: {
                type: "split-layout",
                children: [
                    {
                        type: "tab-layout",
                        tabs: ["PERSPECTIVE_GENERATED_ID_1"],
                        selected: 0,
                    },
                    {
                        type: "tab-layout",
                        tabs: ["PERSPECTIVE_GENERATED_ID_0"],
                        selected: 0,
                    },
                ],
                sizes: [0.5, 0.5],
                orientation: "horizontal",
            },
            panels: {
                PERSPECTIVE_GENERATED_ID_0: {
                    plugin: "Heatmap",
                    table: "olympics",
                    title: "Age Distribution by Sport",
                    group_by: ["Age"],
                    split_by: ["Sport"],
                    sort: [["Event", "col desc"]],
                    columns: ["Name"],
                },
                PERSPECTIVE_GENERATED_ID_1: {
                    plugin: "X/Y Scatter",
                    table: "olympics",
                    title: "Avg Height vs Weight by Sport",
                    group_by: ["Sport"],
                    columns: ["Height", "Weight", null, "City", "Sport", null],
                    aggregates: {
                        Weight: "avg",
                        Sport: "dominant",
                        Height: "avg",
                    },
                },
            },
        },
    },
];

export const NYPD_PROJECTS: Project[] = [
    {
        id: "nypd",
        title: "NYPD CCRB",
        description: "Civilian complaints against NYPD officers.",
        source: {
            kind: "fetch",
            engine: "perspective-server",
            url: "/data/nypdccrb.arrow",
            format: "arrow",
            name: "nypd",
        },
        workspace: singlePanel({
            title: "NYPD CCRB",
            plugin: "Datagrid",
            theme: null,
        }),
    },
    {
        id: "nypd-3",
        title: "NYPD CCRB",
        description: "Civilian complaints against NYPD officers.",
        source: {
            kind: "fetch",
            engine: "perspective-server",
            url: "/data/nypdccrb.arrow",
            format: "arrow",
            name: "nypd",
        },
        workspace: {
            active: "PERSPECTIVE_GENERATED_ID_4",
            layout: {
                type: "tab-layout",
                tabs: ["PERSPECTIVE_GENERATED_ID_4"],
                selected: 0,
            },
            panels: {
                PERSPECTIVE_GENERATED_ID_4: {
                    plugin: "Heatmap",
                    table: "ccrb",
                    title: "Incidents",
                    group_by: ["bucket(\"IncidentDate\", '3M')"],
                    split_by: ["Allegation"],
                    sort: [["IncidentDate", "col asc"]],
                    filter: [
                        ["IncidentDate", ">", "1985-01-01"],
                        ["IncidentDate", "<", "2025-01-01"],
                    ],
                    expressions: {
                        "bucket(\"IncidentDate\", '3M')":
                            "bucket(\"IncidentDate\", '3M')",
                    },
                    columns: ["AllegationID"],
                    aggregates: {
                        IncidentDate: "median",
                        AllegationID: "distinct count",
                    },
                },
            },
        },
    },
    {
        id: "nypd-2",
        title: "NYPD CCRB",
        description: "Civilian complaints against NYPD officers.",
        source: {
            kind: "fetch",
            engine: "perspective-server",
            url: "/data/nypdccrb.arrow",
            format: "arrow",
            name: "nypd",
        },
        workspace: {
            active: "PERSPECTIVE_GENERATED_ID_1",
            layout: {
                type: "split-layout",
                children: [
                    {
                        type: "tab-layout",
                        tabs: ["PERSPECTIVE_GENERATED_ID_1"],
                        selected: 0,
                    },
                    {
                        type: "split-layout",
                        children: [
                            {
                                type: "tab-layout",
                                tabs: ["PERSPECTIVE_GENERATED_ID_2"],
                                selected: 0,
                            },
                            {
                                type: "tab-layout",
                                tabs: ["PERSPECTIVE_GENERATED_ID_3"],
                                selected: 0,
                            },
                        ],
                        sizes: [0.5, 0.5],
                        orientation: "vertical",
                    },
                ],
                sizes: [0.25, 0.75],
                orientation: "horizontal",
            },
            panels: {
                PERSPECTIVE_GENERATED_ID_1: {
                    plugin: "Datagrid",
                    table: "ccrb",
                    title: "Filter",
                    group_by: ["FADOType", "Allegation"],
                    sort: [["ComplaintID", "desc"]],
                    columns: ["ComplaintID"],
                    aggregates: {
                        ComplaintID: "distinct count",
                    },
                },
                PERSPECTIVE_GENERATED_ID_2: {
                    plugin: "Heatmap",
                    table: "ccrb",
                    title: "Year vs Month of Incident",
                    group_by: ["bucket(\"IncidentDate\", 'Y')"],
                    split_by: ['month_of_year("IncidentDate")'],
                    filter: [
                        ["IncidentDate", ">", "1985-01-01"],
                        ["IncidentDate", "<", "2025-01-01"],
                    ],
                    group_rollup_mode: "flat",
                    split_rollup_mode: "flat",
                    expressions: {
                        "bucket(\"IncidentDate\", 'Y')":
                            "bucket(\"IncidentDate\", 'Y')",
                        'month_of_year("IncidentDate")':
                            'month_of_year("IncidentDate")',
                    },
                    columns: ["ComplaintID"],
                    aggregates: {
                        ComplaintID: "distinct count",
                    },
                },
                PERSPECTIVE_GENERATED_ID_3: {
                    plugin: "Heatmap",
                    table: "ccrb",
                    title: "Month vs Weekday of Incident",
                    group_by: ['month_of_year("IncidentDate")'],
                    split_by: ['day_of_week("IncidentDate")'],
                    filter: [
                        ["IncidentDate", ">", "1985-01-01"],
                        ["IncidentDate", "<", "2025-01-01"],
                    ],
                    expressions: {
                        'month_of_year("IncidentDate")':
                            'month_of_year("IncidentDate")',
                        "bucket(\"IncidentDate\", 'Y')":
                            "bucket(\"IncidentDate\", 'Y')",
                        'day_of_week("IncidentDate")':
                            'day_of_week("IncidentDate")',
                    },
                    columns: ["ComplaintID"],
                    aggregates: {
                        ComplaintID: "distinct count",
                    },
                },
            },
        },
    },
    {
        id: "nypd-4",
        title: "NYPD CCRB",
        description: "Civilian complaints against NYPD officers.",
        source: {
            kind: "fetch",
            engine: "perspective-server",
            url: "/data/nypdccrb.arrow",
            format: "arrow",
            name: "nypd",
        },
        workspace: {
            active: "PERSPECTIVE_GENERATED_ID_9",
            layout: {
                type: "split-layout",
                children: [
                    {
                        type: "tab-layout",
                        tabs: ["PERSPECTIVE_GENERATED_ID_9"],
                        selected: 0,
                    },
                    {
                        type: "tab-layout",
                        tabs: ["PERSPECTIVE_GENERATED_ID_10"],
                        selected: 0,
                    },
                ],
                sizes: [0.5, 0.5],
                orientation: "vertical",
            },
            panels: {
                PERSPECTIVE_GENERATED_ID_10: {
                    plugin: "Y Area",
                    table: "ccrb",
                    title: "Incidents (area)",
                    group_by: ["bucket(\"IncidentDate\", 'M')"],
                    split_by: ["FADOType"],
                    sort: [["AllegationID", "col asc"]],
                    filter: [
                        ["IncidentDate", ">", "1985-01-01"],
                        ["IncidentDate", "<", "2025-01-01"],
                    ],
                    expressions: {
                        "bucket(\"IncidentDate\", 'M')":
                            "bucket(\"IncidentDate\", 'M')",
                    },
                    columns: ["AllegationID"],
                    aggregates: {
                        AllegationID: "distinct count",
                    },
                },
                PERSPECTIVE_GENERATED_ID_9: {
                    plugin: "Y Line",
                    table: "ccrb",
                    title: "Incidents (line)",
                    group_by: ["bucket(\"IncidentDate\", 'M')"],
                    split_by: ["FADOType"],
                    sort: [["AllegationID", "col asc"]],
                    filter: [
                        ["IncidentDate", ">", "1985-01-01"],
                        ["IncidentDate", "<", "2025-01-01"],
                    ],
                    expressions: {
                        "bucket(\"IncidentDate\", 'M')":
                            "bucket(\"IncidentDate\", 'M')",
                    },
                    columns: ["AllegationID"],
                    aggregates: {
                        AllegationID: "distinct count",
                    },
                },
            },
        },
    },
];

export const MOVIES_PROJECTS: Project[] = [
    {
        id: "movies",
        title: "Movies",
        description: "Box office and ratings, from the Vega sample data.",
        source: MOVIES,
        workspace: {
            active: "PERSPECTIVE_GENERATED_ID_2",
            layout: {
                type: "split-layout",
                children: [
                    {
                        type: "tab-layout",
                        tabs: ["PERSPECTIVE_GENERATED_ID_2"],
                        selected: 0,
                    },
                    {
                        type: "split-layout",
                        children: [
                            {
                                type: "split-layout",
                                children: [
                                    {
                                        type: "tab-layout",
                                        tabs: ["PERSPECTIVE_GENERATED_ID_1"],
                                        selected: 0,
                                    },
                                    {
                                        type: "tab-layout",
                                        tabs: ["PERSPECTIVE_GENERATED_ID_3"],
                                        selected: 0,
                                    },
                                ],
                                sizes: [0.5, 0.5],
                                orientation: "horizontal",
                            },
                            {
                                type: "tab-layout",
                                tabs: ["PERSPECTIVE_GENERATED_ID_0"],
                                selected: 0,
                            },
                        ],
                        sizes: [0.5, 0.5],
                        orientation: "vertical",
                    },
                ],
                sizes: [0.25, 0.75],
                orientation: "horizontal",
            },
            panels: {
                PERSPECTIVE_GENERATED_ID_0: {
                    plugin: "Heatmap",
                    table: "movies",
                    group_by: ['bucket("Rotten Tomatoes Rating", 2.5)'],
                    split_by: ['bucket("IMDB Rating", 0.25)'],
                    filter: [
                        ['bucket("IMDB Rating", 0.25)', "is not null", null],
                    ],
                    expressions: {
                        'bucket("Rotten Tomatoes Rating", 2.5)':
                            'bucket("Rotten Tomatoes Rating", 2.5)',
                        'bucket("IMDB Rating", 0.25)':
                            'bucket("IMDB Rating", 0.25)',
                    },
                    columns: ["US Gross"],
                    aggregates: {
                        'bucket("Rotten Tomatoes Rating", 2.5)': "avg",
                    },
                },
                PERSPECTIVE_GENERATED_ID_1: {
                    plugin: "Y Line",
                    table: "movies",
                    title: "Ratings vs Sales",
                    group_by: ["bucket(\"Release Date\", 'Y')"],
                    expressions: {
                        "bucket(\"Release Date\", 'Y')":
                            "bucket(\"Release Date\", 'Y')",
                    },
                    columns: [
                        "US Gross",
                        "Rotten Tomatoes Rating",
                        "Production Budget",
                        "Worldwide Gross",
                        "US DVD Sales",
                    ],
                    aggregates: {
                        "Rotten Tomatoes Rating": "avg",
                    },
                },
                PERSPECTIVE_GENERATED_ID_2: {
                    plugin: "Datagrid",
                    plugin_config: {
                        scroll_lock: true,
                        edit_mode: "SELECT_ROW_TREE",
                    },
                    table: "movies",
                    group_by: ["Distributor"],
                    sort: [["US Gross", "desc"]],
                    columns: ["US Gross"],
                },
                PERSPECTIVE_GENERATED_ID_3: {
                    plugin: "Y Area",
                    table: "movies",
                    title: "US Gross by Genre",
                    group_by: ["bucket(\"Release Date\", 'Y')"],
                    split_by: ["Major Genre"],
                    expressions: {
                        "bucket(\"Release Date\", 'Y')":
                            "bucket(\"Release Date\", 'Y')",
                    },
                    columns: ["US Gross"],
                },
            },
            masters: ["PERSPECTIVE_GENERATED_ID_2"],
        },
    },
];

export const SF_PROJECTS: Project[] = [
    // {
    //     id: "evictions",
    //     title: "SF Evictions",
    //     description: "San Francisco eviction notices, from DataSF.",
    //     source: {
    //         kind: "fetch",
    //         engine: "perspective-server",
    //         url: "/data/evictions.arrow",
    //         format: "arrow",
    //         name: "evictions",
    //     },
    //     workspace: singlePanel({
    //         plugin: "Datagrid",
    //         theme: null,
    //     }),
    // },
    {
        id: "evictions-2",
        title: "SF Evictions",
        description: "San Francisco eviction notices, from DataSF.",
        source: {
            kind: "fetch",
            engine: "perspective-server",
            url: "/data/evictions.arrow",
            format: "arrow",
            name: "evictions",
        },
        workspace: singlePanel({
            columns_config: {
                state: {
                    gradient:
                        "linear-gradient(to right, #000000 0%, #590d4f 24%, #dd6367 52.6%, #ffe894 70.1%, #ffffff 100%)",
                },
            },
            plugin: "Map Density",
            plugin_config: {
                gradient_radius_px: 15,
                gradient_intensity: 1,
            },
            table: "evictions",
            group_by: ["lat", "lon"],
            filter: [["lon", "is not null", null]],
            expressions: {
                lat: 'var x[2];\nindexof("shape", \' .+?( )\', x);\nvar y := substring("shape", x[0], length("shape") - x[1]);\nfloat(y)',
                lon: 'var x[2];\nindexof("shape", \' .+?( )\', x);\nvar y := substring("shape", 7, x[1] - 7);\nfloat(y)',
            },
            columns: ["lon", "lat", "state", null],
            aggregates: {
                lat: "any",
                lon: "any",
            },
        }),
    },
    {
        id: "evictions-3",
        title: "SF Evictions",
        description: "San Francisco eviction notices, from DataSF.",
        source: {
            kind: "fetch",
            engine: "perspective-server",
            url: "/data/evictions.arrow",
            format: "arrow",
            name: "evictions",
        },
        workspace: singlePanel({
            columns_config: {},
            plugin: "Map Scatter",
            table: "evictions",
            theme: null,
            title: null,
            group_by: ["lat", "lon"],
            split_by: [],
            sort: [],
            filter: [["lon", "is not null", null]],
            group_rollup_mode: "flat",
            split_rollup_mode: "flat",
            expressions: {
                lat: 'var x[2];\nindexof("shape", \' .+?( )\', x);\nvar y := substring("shape", x[0], length("shape") - x[1]);\nfloat(y)',
                lon: 'var x[2];\nindexof("shape", \' .+?( )\', x);\nvar y := substring("shape", 7, x[1] - 7);\nfloat(y)',
            },
            columns: ["lon", "lat", "neighborhood", null, null, null],
            aggregates: {
                neighborhood: "dominant",
                lat: "any",
                lon: "any",
            },
        }),
    },
];

export const EXPRESSIONS_PROJECTS: Project[] = [
    {
        id: "fractal",
        title: "Mandelbrot",
        description: GENERATORS.fractal.description,
        source: { kind: "generated", generator: "fractal", name: "raw_data" },
        workspace: singlePanel({
            title: "Mandelbrot",
            theme: null,
            columns_config: {
                color: {
                    gradient:
                        "linear-gradient(to right, #000000 50%, #4d0034 54.5%, #880f02 73.8%, #ca7f16 82.5%, #72991e 88.7%, #1a6b2a 94%, #175e59 97.5%, #3289c8 100%)",
                },
            },
            ...GENERATORS.fractal.panel(GENERATORS.fractal.defaults),
        }),
    },
    {
        id: "raycasting",
        title: "Raycasting",
        description: GENERATORS.raycasting.description,
        source: {
            kind: "generated",
            generator: "raycasting",
            name: "raycasting",
        },
        workspace: singlePanel({
            title: "Raycasting",
            theme: null,
            columns_config: {
                color: {
                    gradient:
                        "linear-gradient(to right, #242526 50%, #071841 69.5%, #3289c8 87%, #7ae4ff 100%)",
                },
            },
            ...GENERATORS.raycasting.panel(GENERATORS.raycasting.defaults),
        }),
    },
];
