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

import { benchmark } from "./src/js/benchmark.mjs";
import {
    check_version_gte,
    new_superstore_table,
} from "./src/js/superstore.mjs";

export async function join_suite(perspective, metadata) {
    if (check_version_gte(metadata.version, "4.4.0")) {
        async function before_all() {
            const left = await perspective.table(
                new_superstore_table(metadata),
            );

            const columns = await left.columns();
            const expressions = Object.fromEntries(
                columns
                    .filter((x) => x !== "Row ID")
                    .map((x) => [`${x}_2`, `"${x}"`]),
            );

            const view = await left.view({
                columns: ["Row ID", ...Object.keys(expressions)],
                expressions,
            });

            const right = await perspective.table(await view.to_arrow());
            await view.delete();
            return { left, right };
        }

        async function after_all({ left, right }) {
            await left.delete();
            await right.delete();
        }

        await benchmark({
            name: `.join()`,
            before_all,
            after_all,
            metadata,
            async after(_, joined) {
                await joined.delete();
            },
            async test({ left, right }) {
                return await perspective.join(left, right, "Row ID");
            },
        });
    }
}

export async function to_data_suite(perspective, metadata) {
    async function before_all() {
        const table = await perspective.table(new_superstore_table(metadata));
        const view = await table.view();
        return { table, view };
    }

    async function after_all({ table, view }) {
        if (check_version_gte(metadata.version, "2.10.9")) {
            await view.delete();
        }

        if (check_version_gte(metadata.version, "3.0.0")) {
            await table.delete();
        }
    }

    await benchmark({
        name: `.to_arrow()`,
        before_all,
        after_all,
        metadata,
        async test({ view }) {
            const _arrow = await view.to_arrow();
        },
    });

    await benchmark({
        name: `.to_csv()`,
        before_all,
        after_all,
        metadata,
        async test({ view }) {
            const _csv = await view.to_csv();
        },
    });

    await benchmark({
        name: `.to_columns()`,
        before_all,
        after_all,
        metadata,
        async test({ view }) {
            const _columns = await view.to_columns();
        },
    });

    await benchmark({
        name: `.to_json()`,
        before_all,
        after_all,
        metadata,
        async test({ view }) {
            const _json = await view.to_json();
        },
    });
}

export async function view_suite(perspective, metadata) {
    async function before_all() {
        const table = await perspective.table(new_superstore_table(metadata));

        const schema = await table.schema();
        return { table, schema };
    }

    async function after_all({ table }) {
        if (check_version_gte(metadata.version, "3.0.0")) {
            await table.delete();
        }
    }

    async function after({ table }, view) {
        if (check_version_gte(metadata.version, "2.10.9")) {
            await view.delete();
        }
    }

    await benchmark({
        name: `.view()`,
        before_all,
        after_all,
        after,
        metadata,
        async test({ table }) {
            return await table.view();
        },
    });

    await benchmark({
        name: `.view({group_by})`,
        before_all,
        after_all,
        after,
        metadata,
        async test({ table }) {
            if (check_version_gte(metadata.version, "1.2.0")) {
                return await table.view({ group_by: ["Product Name"] });
            } else {
                return await table.view({ row_pivots: ["Product Name"] });
            }
        },
    });

    await benchmark({
        name: `.view({expressions})`,
        before_all,
        after_all,
        after,
        metadata,
        async test({ table }) {
            if (check_version_gte(metadata.version, "2.7.0")) {
                return await table.view({
                    columns: ["AAA"],
                    expressions: {
                        AAA: `("Sales" + "Profit") / 2`,
                    },
                });
            } else {
                return await table.view({
                    columns: ["AAA"],
                    expressions: [`//AAA\n("Sales" + "Profit") / 2`],
                });
            }
        },
    });

    await benchmark({
        name: `.view({group_by, aggregates: "median"})`,
        before_all,
        after_all,
        after,
        metadata,
        async test({ table, schema }) {
            const columns = ["Sales", "Quantity", "City"];
            const aggregates = Object.fromEntries(
                Object.keys(schema).map((x) => [x, "median"]),
            );

            if (check_version_gte(metadata.version, "1.2.0")) {
                return await table.view({
                    group_by: ["State"],
                    aggregates,
                    columns,
                });
            } else {
                return await table.view({
                    row_pivots: ["State"],
                    aggregates,
                    columns,
                });
            }
        },
    });
}

export async function table_suite(perspective, metadata) {
    async function before_all() {
        try {
            const table = await perspective.table(
                new_superstore_table(metadata),
            );

            const view = await table.view();
            const csv = await view.to_csv();
            const arrow = await view.to_arrow();
            const json = await view.to_json();
            const columns = await view.to_columns();
            if (check_version_gte(metadata.version, "2.10.9")) {
                await view.delete();
            }

            if (check_version_gte(metadata.version, "3.0.0")) {
                await table.delete();
            }

            return { csv, arrow, table, json, columns };
        } catch (e) {
            console.error(e);
        }
    }

    if (check_version_gte(metadata.version, "2.3.0")) {
        await benchmark({
            name: `.table(arrow, {limit: 1000})`,
            before_all,
            metadata,
            async after(_, table) {
                if (check_version_gte(metadata.version, "3.0.0")) {
                    await table.delete();
                }
            },
            async test({ arrow }) {
                return await perspective.table(arrow.slice(), { limit: 1000 });
            },
        });
    }

    await benchmark({
        name: `.table(arrow)`,
        before_all,
        metadata,
        async after(_, table) {
            if (check_version_gte(metadata.version, "3.0.0")) {
                await table.delete();
            }
        },
        async test({ table, arrow }) {
            return await perspective.table(arrow.slice());
        },
    });

    if (check_version_gte(metadata.version, "3.0.0")) {
        await benchmark({
            name: `table.update(arrow)`,
            before_all,
            metadata,
            async before({ arrow }) {
                let table2 = await perspective.table(arrow.slice(), {
                    limit: 1000,
                });
                return table2;
            },
            async after(_, table) {
                if (!check_version_gte(metadata.version, "3.4.3")) {
                    // Bug with old versions of perspective segfault when you delete
                    // a table with pending updates.
                    await table.size();
                }
                await table.delete();
            },
            async test({ arrow }, table2) {
                for (let i = 0; i < 3; i++) {
                    await table2.update(arrow.slice());
                }
            },
        });
    }

    await benchmark({
        name: `.table(csv)`,
        before_all,
        metadata,
        async after(_, table) {
            if (check_version_gte(metadata.version, "3.0.0")) {
                await table.delete();
            }
        },
        async test({ csv }) {
            return await perspective.table(csv);
        },
    });

    await benchmark({
        name: `.table(json)`,
        before_all,
        metadata,
        async after(_, table) {
            if (check_version_gte(metadata.version, "3.0.0")) {
                await table.delete();
            }
        },

        async test({ table, json }) {
            return await perspective.table(json);
        },
    });

    await benchmark({
        name: `.table(columns)`,
        before_all,
        metadata,
        async after(_, table) {
            if (check_version_gte(metadata.version, "3.0.0")) {
                await table.delete();
            }
        },
        async test({ table, columns }) {
            return await perspective.table(columns);
        },
    });
}
