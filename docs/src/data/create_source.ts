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

import { duckdb, perspectiveServer, spawnWorker } from "./engines.js";
import { GENERATORS } from "./projects/generators.js";
import type { ProjectSource } from "./projects/types.js";
import type { EngineId } from "./sources.js";

export interface CreatedSource {
    /** Qualified exactly as the owning client reports it. */
    table: string;
    label: string;

    /**
     * Extra viewer config the source insists on. A generated table can be an
     * *image* in ExprTK over a bare index column, so opening it as a plain
     * datagrid shows a column of integers; the generator supplies the view
     * that makes its data mean something.
     */
    panel?: Record<string, unknown>;
}

function sqlLiteral(value: string): string {
    return value.replace(/'/g, "''");
}

function duckdbReader(format: string): string {
    switch (format) {
        case "csv":
            return "read_csv_auto";
        case "json":
        case "ndjson":
            return "read_json_auto";
        default:
            return "read_parquet";
    }
}

function explain(err: unknown, url: string): Error {
    if (err instanceof TypeError) {
        return new Error(
            `Could not fetch ${url}. The browser reports no detail for this ` +
                `class of failure; the usual cause is a missing CORS header ` +
                `on the remote (this site is static, so there is no proxy to ` +
                `route around it).`,
        );
    }

    return err instanceof Error ? err : new Error(String(err));
}

async function request(url: string): Promise<Response> {
    let response: Response;
    try {
        response = await fetch(url);
    } catch (err) {
        throw explain(err, url);
    }

    if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    return response;
}

async function bytes(url: string): Promise<Uint8Array> {
    return new Uint8Array(await (await request(url)).arrayBuffer());
}

async function text(url: string): Promise<string> {
    return (await request(url)).text();
}

async function readPayload(
    url: string,
    format: string,
): Promise<Uint8Array | string> {
    return format === "arrow" ? bytes(url) : text(url);
}

function assertPerspectiveFormat(format: string): void {
    if (format === "parquet") {
        throw new Error(
            "perspective-server cannot read parquet; choose the " +
                "DuckDB-WASM engine for this source.",
        );
    }
}

async function createEvalSource(
    source: Extract<ProjectSource, { kind: "eval" }>,
): Promise<CreatedSource> {
    const psp = await perspectiveServer();
    const factory = new Function("api", "return (" + source.code + ")(api)");
    await factory({
        client: psp.client(),
        name: source.name,
        worker: spawnWorker,
    });

    return { table: psp.qualify(source.name), label: source.name };
}

async function createGeneratedSource(
    source: Extract<ProjectSource, { kind: "generated" }>,
): Promise<CreatedSource> {
    const spec = GENERATORS[source.generator];
    if (!spec) {
        throw new Error(`Unknown generator "${source.generator}"`);
    }

    const params = { ...spec.defaults, ...(source.params ?? {}) };
    const psp = await perspectiveServer();
    await spec.build(psp.client(), source.name, params);
    return {
        table: psp.qualify(source.name),
        label: source.name,
        panel: spec.panel(params),
    };
}

/**
 * Materialize a table from one or more same-format URLs on either engine —
 * the shared path for fetch sources and S3 presigned-URL lists.
 *
 * @param engine the engine to create the table on.
 * @param urls the URLs to read, in update order.
 * @param name the bare table name.
 * @param format every URL's format.
 */
export async function createUrlSource(
    engine: EngineId,
    urls: string[],
    name: string,
    format: string,
): Promise<CreatedSource> {
    if (engine === "duckdb-wasm") {
        const duck = await duckdb();
        if (format === "arrow") {
            for (const [i, url] of urls.entries()) {
                await duck.conn.insertArrowFromIPCStream(await bytes(url), {
                    name,
                    create: i === 0,
                });
            }
        } else {
            const list = urls.map((url) => `'${sqlLiteral(url)}'`).join(", ");
            await duck.conn.query(
                `CREATE OR REPLACE TABLE "${name}" AS SELECT * FROM ${duckdbReader(format)}([${list}])`,
            );
        }

        return { table: duck.qualify(name), label: name };
    }

    assertPerspectiveFormat(format);
    const psp = await perspectiveServer();
    const [head, ...rest] = urls;
    const created = await psp
        .client()
        .table(await readPayload(head, format), { name, format });

    for (const url of rest) {
        await created.update(await readPayload(url, format));
    }

    return { table: psp.qualify(name), label: name };
}

/**
 * Materialize a table from a local `File`, read in the browser.
 *
 * @param engine the engine to create the table on.
 * @param file the chosen file.
 * @param name the bare table name.
 * @param format the file's format.
 */
export async function createFileSource(
    engine: EngineId,
    file: File,
    name: string,
    format: string,
): Promise<CreatedSource> {
    if (engine === "duckdb-wasm") {
        const duck = await duckdb();
        if (format === "arrow") {
            await duck.conn.insertArrowFromIPCStream(
                new Uint8Array(await file.arrayBuffer()),
                { name, create: true },
            );
        } else {
            const duckdbMod = await import("@duckdb/duckdb-wasm");
            await duck.db.registerFileHandle(
                file.name,
                file,
                duckdbMod.DuckDBDataProtocol.BROWSER_FILEREADER,
                true,
            );

            await duck.conn.query(
                `CREATE OR REPLACE TABLE "${name}" AS SELECT * FROM ${duckdbReader(format)}('${sqlLiteral(file.name)}')`,
            );
        }

        return { table: duck.qualify(name), label: name };
    }

    assertPerspectiveFormat(format);
    const psp = await perspectiveServer();
    const payload =
        format === "arrow"
            ? new Uint8Array(await file.arrayBuffer())
            : await file.text();

    await psp.client().table(payload, { name, format });
    return { table: psp.qualify(name), label: name };
}

/**
 * Materialize a table from a URL on either engine.
 *
 * @param source the URL, format, name and engine to create it on.
 */
export function createFetchSource(
    source: Extract<ProjectSource, { kind: "fetch" }>,
): Promise<CreatedSource> {
    return createUrlSource(
        source.engine,
        [source.url],
        source.name,
        source.format,
    );
}

/**
 * Create the table a source spec describes, with no DOM involved.
 *
 * @param source a corpus entry's source, or a form's equivalent spec.
 */
export async function createSource(
    source: ProjectSource,
): Promise<CreatedSource> {
    if (source.kind === "eval") {
        return createEvalSource(source);
    }

    if (source.kind === "generated") {
        return createGeneratedSource(source);
    }

    return createFetchSource(source);
}
