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
    FRACTAL_RESOLUTION,
    MANDELBROT,
    RAYCASTING,
    RAYCASTING_RESOLUTION,
} from "./expressions.js";

export interface ParamSpec {
    key: string;
    label: string;
    min?: number;
    max?: number;
    step?: number;
    hint?: string;
}

export type Params = Record<string, number>;

export interface GeneratorSpec {
    label: string;
    description: string;
    params: ParamSpec[];
    defaults: Params;

    /** Populate `name` on `client`. */
    build(client: any, name: string, params: Params): Promise<void>;

    /** The view this data is only meaningful under. */
    panel(params: Params): Record<string, unknown>;
}

async function chunked(
    total: number,
    size: number,
    emit: (from: number, to: number) => Promise<void> | void,
) {
    for (let from = 0; from < total; from += size) {
        await emit(from, Math.min(from + size, total));
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}

const choose = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
const range = (lo: number, hi: number) => Math.random() * (hi - lo) + lo;
const word = () => Math.random().toString(36).substring(7);

const TYPES = ["float", "integer", "string", "datetime", "boolean"] as const;

function datasetSchema(params: Params): Record<string, string> {
    const schema: Record<string, string> = {};
    for (const type of TYPES) {
        for (let i = 0; i < (params[`num_${type}`] ?? 0); i++) {
            schema[`${type[0].toUpperCase()}${type.slice(1)} ${i}`] = type;
        }
    }

    return schema;
}

/**
 * Sources with no URL to fetch — the table is computed in the browser. Each
 * declares its own parameters, so the Create Data Source form, the corpus and
 * the thumbnail pass all render themselves from this table.
 */
export const GENERATORS: Record<string, GeneratorSpec> = {
    dataset: {
        label: "Random dataset",
        description:
            "Random data with a configurable column mix — the shape used to " +
            "benchmark the engine.",
        params: [
            { key: "num_rows", label: "Rows", min: 25, max: 1_000_000 },
            { key: "num_float", label: "Float columns", min: 0, max: 50 },
            { key: "num_integer", label: "Integer columns", min: 0, max: 50 },
            { key: "num_string", label: "String columns", min: 0, max: 50 },
            {
                key: "num_strings",
                label: "Unique strings",
                min: 1,
                max: 500,
                hint: "Dictionary size each string column draws from.",
            },
            { key: "num_datetime", label: "Datetime columns", min: 0, max: 50 },
            { key: "num_boolean", label: "Boolean columns", min: 0, max: 50 },
        ],
        defaults: {
            num_rows: 100_000,
            num_float: 5,
            num_integer: 5,
            num_string: 5,
            num_strings: 50,
            num_datetime: 5,
            num_boolean: 1,
        },

        async build(client, name, params) {
            const schema = datasetSchema(params);
            if (Object.keys(schema).length === 0) {
                throw new Error("Choose at least one column.");
            }

            const dictionary = new Array(Math.max(1, params.num_strings))
                .fill(null)
                .map(word);

            const table = await client.table(schema, { name });
            const cell: Record<string, () => unknown> = {
                float: () => range(-10, 10),
                integer: () => Math.floor(range(-10, 10)),
                string: () => choose(dictionary),
                datetime: () => new Date(),
                boolean: () => choose([true, false, null]),
            };

            await chunked(params.num_rows, 25_000, async (from, to) => {
                const rows = new Array(to - from);
                for (let i = 0; i < rows.length; i++) {
                    const row: Record<string, unknown> = {};
                    for (const [column, type] of Object.entries(schema)) {
                        row[column] = cell[type]();
                    }

                    rows[i] = row;
                }

                await table.update(rows);
            });
        },

        panel: () => ({ plugin: "Datagrid" }),
    },

    fractal: {
        label: "Mandelbrot",
        description: "A fractal computed entirely in ExprTK, one static frame.",
        params: [],
        defaults: {},

        async build(client, name) {
            const table = await client.table({ index: "integer" }, { name });
            await chunked(FRACTAL_RESOLUTION ** 2, 50_000, async (from, to) => {
                const rows = new Array(to - from);
                for (let i = from; i < to; i++) {
                    rows[i - from] = { index: i };
                }

                await table.update(rows);
            });
        },

        panel: () => ({
            plugin: "Heatmap",
            group_by: [`floor("index" / ${FRACTAL_RESOLUTION})`],
            split_by: [`"index" % ${FRACTAL_RESOLUTION}`],
            columns: ["color"],
            expressions: {
                color: MANDELBROT,
                [`floor("index" / ${FRACTAL_RESOLUTION})`]: `floor("index" / ${FRACTAL_RESOLUTION})`,
                [`"index" % ${FRACTAL_RESOLUTION}`]: `"index" % ${FRACTAL_RESOLUTION}`,
            },
        }),
    },

    raycasting: {
        label: "Raycasting",
        description: "A raytraced torus, rendered by an ExprTK expression.",
        params: [],
        defaults: {},

        async build(client, name) {
            const index = new Array(RAYCASTING_RESOLUTION ** 2).fill(0);
            await client.table({ index }, { name });
        },

        panel: () => ({
            plugin: "Heatmap",
            group_by: ["x"],
            split_by: ["y"],
            columns: ["color"],
            theme: null,
            expressions: {
                color: RAYCASTING,
                x: `floor(index() / ${RAYCASTING_RESOLUTION}) - ${RAYCASTING_RESOLUTION} / 2`,
                y: `index() % ${RAYCASTING_RESOLUTION} - ${RAYCASTING_RESOLUTION} / 2`,
            },
        }),
    },
};
