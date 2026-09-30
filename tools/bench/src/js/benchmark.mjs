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

/**
 * @module perspective_bench
 * The main entrypoint of `perspective_bench` is a CLI node.js application which
 * may star
 */

const MAX_ITERATIONS = 100;
const MIN_ITERATIONS = 5;
const WARM_UP_ITERATIONS = 10;

/**
 * Utility function to push/filter.
 * @param {*} a
 * @param {*} x
 */
function push_if(a, x) {
    if (x !== undefined) {
        a.push(x);
    }
}

/**
 * Calculate avg fora  key.
 * @param {*} a
 * @param {*} key
 * @returns
 */
function avg(a, key) {
    return a.map((x) => x[key]).reduce((x, y) => x + y, 0) / a.length / 1000;
}

/**
 * Calculate stddev for a key.
 * @param {*} array
 * @param {*} key
 * @returns
 */
function stddev(array, key) {
    const n = array.length;
    const mean = array.reduce((a, b) => a + b[key] / 1000, 0) / n;
    return Math.sqrt(
        array
            .map((x) => Math.pow(x[key] / 1000 - mean, 2))
            .reduce((a, b) => a + b) / n,
    );
}

/**
 * Calculate outliers
 * @param {*} someArray
 * @returns
 */
function markOutliers(someArray) {
    var values = someArray.concat();
    values.sort(function (a, b) {
        return a.real_time - b.real_time;
    });

    var q1 = values[Math.floor(values.length / 4)].real_time;
    var q3 = values[Math.ceil(values.length * (3 / 4))].real_time;
    var iqr = q3 - q1;
    var maxValue = q3 + iqr * 1.5;
    var minValue = q1 - iqr * 1.5;
    return someArray.map(function (x) {
        x.outlier = !(x.real_time <= maxValue && x.real_time >= minValue);
        return x;
    });
}

/**
 * Convert a list to arrow and write it to disk. `@perspective-dev/client` is
 * imported in this scope to prevent interpreter-wide side effects of the
 * library from impacting forked processes, based on an observation that some
 * runs inline had anomalies across many observations that couldn't be explained
 * by contemporary system load.
 * @param {Array} obs_records an array of records to persist
 */
async function persist_to_arrow(benchmarks_table, out_path = "") {
    const fs = await import("node:fs");
    const view = await benchmarks_table.view();
    const arrow = await view.to_arrow();
    fs.writeFileSync(out_path, Buffer.from(arrow), "binary");
}

/**
 * Run a single benchmark case, reporting the runtime
 * @param {*} param0
 * @returns An observation record with timing and metadata fields for a single
 * iteration of this case.
 */
async function benchmark_case({
    args,
    before,
    test,
    benchmark,
    metadata,
    after,
    i,
}) {
    const args2 = args.slice();
    push_if(args2, await before?.(...args2));
    if (typeof process !== "undefined") {
        const { default: process } = await import("node:process");
        const { default: microtime } = await import("microtime");
        globalThis.gc(false);
        await new Promise((x) => setTimeout(x, 0));
        const start_time = microtime.now();
        const start_cpu = process.cpuUsage();
        const x = await test(...args2);
        const end = process.cpuUsage(start_cpu);
        const end_time = microtime.now() - start_time;
        push_if(args2, x);
        await after?.(...args2);
        return {
            cpu_time: end.user + end.system,
            real_time: end_time,
            user_time: end.user,
            system_time: end.system,
            benchmark,
            iteration: i,
            ...structuredClone(metadata),
        };
    } else {
        const start_time = performance.now();
        const x = await test(...args2);
        const end_time = performance.now() - start_time;
        push_if(args2, x);
        await after?.(...args2);
        return {
            real_time: end_time * 1000,
            benchmark,
            iteration: i,
            ...structuredClone(metadata),
        };
    }
}

/**
 * Run the benchmarks in a forked process and colelct the observations.
 * @param {{version: string, i: number}} version the versions spec to send to
 * the child process.
 * @returns an array of observation records for this version.
 */
async function benchmark_node_version(version, benchmarks_table) {
    const cp = await import("node:child_process");
    const process = await import("node:process");
    const path = await import("node:path");
    const suite_path = path.join(process.argv[1]);
    let stats = [];
    const worker = cp.fork(suite_path, {
        execArgv: ["--expose-gc"],
        env: {
            BENCH_FLAG: "1",
            ...(process.env.PSP_BENCH_WASM32 && {
                PSP_BENCH_WASM32: process.env.PSP_BENCH_WASM32,
            }),
        },
    });

    let cont;
    worker.on("message", (details) => {
        if (details.finished) {
            cont();
        } else {
            let msg = " - ";
            if (!isNaN(details.stats.filtered_avg_cpu)) {
                msg += `${details.stats.filtered_avg_cpu}ms +/-${details.stats.stddev_percent}% (CPU), `;
            }
            msg += `${details.stats.filtered_avg_time}ms (Real) ${details.stats.non_outliers}/${details.stats.iterations} iterations - ${details.stats.benchmark}`;
            console.log(msg);
            benchmarks_table.update(details.obs_records);
            stats.push(details.stats);
        }
    });

    worker.send({
        ...version,
        stats,
    });

    await new Promise((r) => {
        cont = r;
    });

    worker.kill();
    return { stats };
}

/**
 * Register a benchmark for a test case.
 * @param {*} param0
 */
export async function benchmark({
    name: benchmark,
    before,
    before_all,
    test,
    after,
    after_all,
    args = [],
    metadata = {},
    warm_up_iterations = WARM_UP_ITERATIONS,
    max_iterations = MAX_ITERATIONS,
    min_iterations = MIN_ITERATIONS,
    max_time = 3_000,
} = {}) {
    let obs_records = [];
    push_if(args, await before_all?.(...args));
    const start_time = performance.now();
    for (let i = 0; i < warm_up_iterations; i++) {
        await benchmark_case({
            args,
            before,
            test,
            benchmark,
            metadata,
            after,
            i,
        });
    }

    let i;
    for (i = 0; i < max_iterations; i++) {
        if (performance.now() - start_time > max_time && i >= min_iterations) {
            break;
        }

        obs_records.push(
            await benchmark_case({
                args,
                before,
                test,
                benchmark,
                metadata,
                after,
                i,
            }),
        );
    }

    obs_records = markOutliers(obs_records);
    const filtered = obs_records.filter((x) => !x.outlier);
    const n_outliers = obs_records.length - filtered.length;
    const filtered_avg_cpu = avg(filtered, "cpu_time");
    const filtered_avg_time = avg(filtered, "real_time").toFixed(3);
    const stddev_cpu = stddev(filtered, "cpu_time").toFixed(3);
    const stats = {
        benchmark,
        metadata,
        filtered_avg_cpu: filtered_avg_cpu.toFixed(3),
        stddev_percent: ((stddev_cpu / filtered_avg_cpu) * 100).toFixed(1),
        stddev_cpu,
        filtered_avg_time,
        hr_time: avg(filtered, "hr_time"),
        iterations: i,
        non_outliers: i - n_outliers,
    };

    await after_all?.(...args);
    globalThis.__SEND__({ obs_records, stats });
}

function buffer_to_arraybuffer(buffer) {
    return new Int8Array(
        buffer.buffer.slice(
            buffer.byteOffset,
            buffer.byteOffset + buffer.length,
        ),
    );
}

/**
 * Host a Perspective server to view the live benchmark data as it accumulates.
 * @param {*} param0
 * @returns
 */
async function start_server({
    cwd_static_file_handler,
    make_session,
    WebSocketServer,
}) {
    return new WebSocketServer({ assets: ["src/html/", "../.."], port: 8081 });
}

/**
 * Register a suite of benchmarks to run against a set of packages with
 * similar APIs.
 * @param {*} versions
 * @param {*} run_version_callback
 */
export async function suite(
    versions,
    out_path,
    run_version_callback,
    start_server_callback,
    stop_server_callback,
) {
    if (!!process.env.BENCH_FLAG) {
        const { default: process } = await import("node:process");
        process.on("message", async function bench_all({ path, i }) {
            await run_version_callback(path, i);
            process.send({ finished: true });
        });
    } else {
        const psp = await import("@perspective-dev/client");
        const benchmarks_table = await psp.default.table(
            {
                version: "string",
                cpu_time: "float",
                system_time: "float",
                user_time: "float",
                real_time: "float",
                version_idx: "integer",
                benchmark: "string",
                outlier: "boolean",
            },
            { name: "benchmarks" },
        );

        const app = await start_server(psp);

        for (let i = 0; i < versions.length; i++) {
            let s;
            if (start_server_callback) {
                s = await start_server_callback(versions[i], i);
            }

            await Promise.all([
                benchmark_node_version(
                    { path: versions[i], i },
                    benchmarks_table,
                ),
                // benchmark_puppeteer_version(
                //     { path: versions[i], i },
                //     benchmarks_table
                // ),
                // benchmark_version({ path: versions[i], i }, benchmarks_table),
                // benchmark_version({ path: versions[i], i }, benchmarks_table),
                // benchmark_version({ path: versions[i], i }, benchmarks_table),
            ]);

            await persist_to_arrow(benchmarks_table, out_path);

            if (stop_server_callback) {
                await stop_server_callback(s, versions[i], i);
            }
        }

        await app.close();
        process.exit(0);
    }
}
