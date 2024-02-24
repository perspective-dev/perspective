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

const fs = require("fs");
const microtime = require("microtime");

let PERSPECTIVE, VERSION;
async function load_version(path, i) {
    const module = await import(path);
    let { version } = JSON.parse(
        fs.readFileSync(require.resolve(`${path}/package.json`))
    );

    PERSPECTIVE = module.default || module;
    PERSPECTIVE.version = version.split(".").map((x) => parseInt(x));

    if (i === 0) {
        version = `${version} (master)`;
    }

    console.log(`${version}`);

    VERSION = version;
    VERSION_ID = i;
}

const SUPERSTORE_ARROW = fs.readFileSync(
    require.resolve("superstore-arrow/superstore.arrow")
).buffer;

const SUPERSTORE_FEATHER = fs.readFileSync(
    require.resolve("superstore-arrow/superstore.lz4.arrow")
).buffer;

function new_table(perspective) {
    const [M, m, _] = perspective.version;
    if (M >= 2 && m >= 5) {
        return SUPERSTORE_ARROW.slice();
    } else {
        return SUPERSTORE_ARROW.slice();
    }
}

const ITERATIONS = 20;
const WARM_UP_ITERATIONS = 10;

Object.defineProperty(Array.prototype, "push_if", {
    value: function (x) {
        if (x !== undefined) {
            this.push(x);
        }
    },
});

Object.defineProperty(Array.prototype, "sum", {
    value: function () {
        return this.reduce((x, y) => x + y, 0);
    },
});

async function benchmark({ name, before, before_all, test, after, after_all }) {
    let obs_records = [];
    const args = [];
    args.push_if(await before_all?.(PERSPECTIVE));
    const observations = [];
    for (let i = 0; i < ITERATIONS + WARM_UP_ITERATIONS; i++) {
        const args2 = args.slice();
        args2.push_if(await before?.(PERSPECTIVE, ...args2));
        const start = microtime.now();
        args2.push_if(await test(PERSPECTIVE, ...args2));
        if (i >= WARM_UP_ITERATIONS) {
            observations.push(microtime.now() - start);
        }

        await after?.(PERSPECTIVE, ...args2);
    }

    const avg = observations.sum() / observations.length / 1000;
    console.log(` - ${avg.toFixed(3)}ms - ${name}`);
    await after_all?.(PERSPECTIVE, ...args);

    obs_records = obs_records.concat(
        observations.map((obs) => ({
            version: VERSION,
            version_idx: VERSION_ID,
            time: obs,
            benchmark: name,
        }))
    );

    process.send({ obs_records });
}

async function to_data_suite() {
    async function before_all(perspective) {
        const table = await perspective.table(new_table(perspective));
        const view = await table.view();
        return { table, view };
    }

    async function after_all(perspective, { table, view }) {
        await view.delete();
        await table.delete();
    }

    await benchmark({
        name: `.to_arrow()`,
        before_all,
        after_all,
        async test(_perspective, { view }) {
            const _arrow = await view.to_arrow();
        },
    });

    await benchmark({
        name: `.to_csv()`,
        before_all,
        after_all,
        async test(_perspective, { view }) {
            const _csv = await view.to_csv();
        },
    });

    await benchmark({
        name: `.to_columns()`,
        before_all,
        after_all,
        async test(_perspective, { view }) {
            const _columns = await view.to_columns();
        },
    });

    await benchmark({
        name: `.to_json()`,
        before_all,
        after_all,
        async test(_perspective, { view }) {
            const _json = await view.to_json();
        },
    });
}

async function view_suite() {
    async function before_all(perspective) {
        const table = await perspective.table(new_table(perspective));
        for (let i = 0; i < 4; i++) {
            await table.update(new_table(perspective));
        }

        const schema = await table.schema();

        return { table, schema };
    }

    async function after_all(perspective, { table }) {
        await table.delete();
    }

    async function after(perspective, { table }, view) {
        await view.delete();
    }

    await benchmark({
        name: `.view()`,
        before_all,
        after_all,
        after,
        async test(_perspective, { table }) {
            return await table.view();
        },
    });

    await benchmark({
        name: `.view({group_by})`,
        before_all,
        after_all,
        after,
        async test(perspective, { table }) {
            const [M, m, _] = perspective.version;
            if ((M === 1 && m >= 2) || M === 2) {
                return await table.view({ group_by: ["Product Name"] });
            } else {
                return await table.view({ row_pivots: ["Product Name"] });
            }
        },
    });

    // await benchmark({
    //     name: `.view({expressions: ["Sales" + "Profit"].reduce((x, y) => Object.assign(x, {[y]: y}), {})})`,
    //     before_all,
    //     after_all,
    //     after,
    //     async test(perspective, { table, schema }) {
    //         const [M, m, _] = perspective.version;
    //         // const columns = Object.keys(schema);
    //         columns = [`"Sales" + "Profit"`];
    //         if (M === 0 && m < 9) {

    //         } else if ((M === 1 && m >= 2) || M === 2) {
    //             return await table.view({
    //                 columns,
    //                 group_by: ["Product Name"],
    //                 expressions: [`"Sales" + "Profit"`].reduce((x, y) => Object.assign(x, {[y]: y}), {}),
    //             });
    //         } else {
    //             return await table.view({
    //                 columns,
    //                 row_pivots: ["Product Name"],
    //                 expressions: [`"Sales" + "Profit"`].reduce((x, y) => Object.assign(x, {[y]: y}), {}),
    //             });
    //         }
    //     },
    // });

    await benchmark({
        name: `.view({group_by, aggregates: "median"})`,
        before_all,
        after_all,
        after,
        async test(perspective, { table, schema }) {
            const columns = ["Sales", "Quantity", "City"];
            const aggregates = Object.fromEntries(
                Object.keys(schema).map((x) => [x, "median"])
            );
            const [M, m, _] = perspective.version;
            if ((M === 1 && m >= 2) || M === 2) {
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

async function table_suite() {
    async function before_all(perspective) {
        const table = await perspective.table(new_table(perspective));
        const view = await table.view();
        const csv = await view.to_csv();
        const json = await view.to_json();
        const columns = await view.to_columns();
        await view.delete();
        await table.delete();
        return { csv, columns, json };
    }

    await benchmark({
        name: `.table(arrow)`,
        before_all,
        async after(_perspective, _, table) {
            await table.delete();
        },
        async test(perspective) {
            return await perspective.table(new_table(perspective));
        },
    });

    await benchmark({
        name: `.table(csv)`,
        before_all,
        async after(_perspective, _, table) {
            await table.delete();
        },

        async test(perspective, { table, csv }) {
            return await perspective.table(csv);
        },
    });

    await benchmark({
        name: `.table(json)`,
        before_all,
        async after(_perspective, _, table) {
            await table.delete();
        },

        async test(perspective, { table, json }) {
            return await perspective.table(json);
        },
    });

    await benchmark({
        name: `.table(columns)`,
        before_all,
        async after(_perspective, _, table) {
            await table.delete();
        },

        async test(perspective, { table, columns }) {
            return await perspective.table(columns);
        },
    });
}

async function bench_all() {
    await table_suite();
    await view_suite();
    await to_data_suite();
    process.send({ finished: true });
}

process.on("message", async ({ path, i }) => {
    await load_version(path, i);
    bench_all();
});
