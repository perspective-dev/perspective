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

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as url from "node:url";

const ROOT = path.resolve(
    path.dirname(url.fileURLToPath(import.meta.url)),
    "../..",
);

const PUBLINT = "publint@0.3.25";

const ATTW = "@arethetypeswrong/cli@0.18.5";

const AJV = "ajv-cli@5.0.0";

const CEM_SCHEMA_PACKAGE = "custom-elements-manifest@2.1.0";

const CEM_MANIFEST = "rust/perspective-viewer/dist/custom-elements.json";

const PACKAGES = [
    { dir: "rust/perspective-server" },
    { dir: "rust/perspective-js" },
    {
        dir: "rust/perspective-viewer",
        attw: ["--exclude-entrypoints", "./themes"],
    },
    { dir: "packages/viewer-datagrid" },
    { dir: "packages/viewer-charts" },
    { dir: "packages/react" },
];

const CONSUMER = path.join(ROOT, "examples/bundler-test");

const EXAMPLES = [
    ["bundler-test", "build"],
    ["esbuild-example", "build"],
    ["esbuild-duckdb-virtual", "build"],
    ["esbuild-clickhouse-virtual", "build"],
    ["react-example", "build"],
    ["vite-example", "build"],
    ["webpack-example", "webpack_build"],
];

const MATRIX = [
    { module: "esnext", moduleResolution: "bundler" },
    { module: "node16", moduleResolution: "node16" },
    { module: "nodenext", moduleResolution: "nodenext" },
].flatMap((resolution) =>
    [false, true].map((skipLibCheck) => ({ ...resolution, skipLibCheck })),
);

function catalog_version(name) {
    const workspace = fs.readFileSync(
        path.join(ROOT, "pnpm-workspace.yaml"),
        "utf8",
    );

    const escaped = name.replace(/[/@.-]/g, (c) => `\\${c}`);
    const match = workspace.match(new RegExp(`"${escaped}":\\s*"([^"]+)"`));
    if (match === null) {
        throw new Error(`${name} is not in the pnpm catalog`);
    }

    return match[1];
}

function run(cmd, args, options = {}) {
    console.log(`$ ${cmd} ${args.join(" ")}`);
    const result = spawnSync(cmd, args, {
        stdio: options.capture ? "pipe" : "inherit",
        encoding: "utf8",
        cwd: options.cwd ?? ROOT,
    });

    if (result.error) {
        throw result.error;
    }

    return result;
}

function check_public_types(failures) {
    const glue = fs.readFileSync(
        path.join(ROOT, "rust/perspective-js/dist/wasm/perspective-js.d.ts"),
        "utf8",
    );

    const public_types = fs.readFileSync(
        path.join(ROOT, "rust/perspective-js/src/ts/public_types.ts"),
        "utf8",
    );

    for (const [, name] of glue.matchAll(
        /^export type \* from "\.\.\/ts-rs\/(\w+)\.d\.ts";$/gm,
    )) {
        if (!public_types.includes(`"../../dist/ts-rs/${name}.d.ts"`)) {
            failures.push(
                `public_types.ts does not re-export ts-rs/${name}.d.ts`,
            );
        }
    }
}

function check_custom_elements_manifest(tmp, failures) {
    const pkg = JSON.parse(
        fs.readFileSync(
            path.join(ROOT, "rust/perspective-viewer/package.json"),
            "utf8",
        ),
    );

    if (pkg.customElements !== "dist/custom-elements.json") {
        failures.push("viewer package.json#customElements is not the manifest");
    }

    const manifest = path.join(ROOT, CEM_MANIFEST);
    if (!fs.existsSync(manifest)) {
        failures.push(`${CEM_MANIFEST} is missing`);
        return;
    }

    const schema_dir = path.join(tmp, "cem-schema");
    fs.mkdirSync(schema_dir, { recursive: true });
    const packed = run(
        "npm",
        ["pack", CEM_SCHEMA_PACKAGE, "--pack-destination", schema_dir],
        { cwd: schema_dir, capture: true },
    );

    if (packed.status !== 0) {
        failures.push(`npm pack ${CEM_SCHEMA_PACKAGE}`);
        return;
    }

    const tarball = path.join(
        schema_dir,
        packed.stdout.trim().split("\n").pop(),
    );
    if (run("tar", ["-xzf", tarball, "-C", schema_dir]).status !== 0) {
        failures.push(`extract ${CEM_SCHEMA_PACKAGE}`);
        return;
    }

    const schema = path.join(schema_dir, "package/schema.json");
    const validate = run("pnpm", [
        "dlx",
        AJV,
        "validate",
        "--spec=draft7",
        "--all-errors",
        "-s",
        schema,
        "-d",
        manifest,
    ]);

    if (validate.status !== 0) {
        failures.push(`ajv ${CEM_MANIFEST}`);
    }
}

function check_packed_manifest(tarballs, failures) {
    const viewer = tarballs.find((x) => path.basename(x).includes("viewer-"));
    const listing = run("tar", ["-tzf", viewer], { capture: true });
    if (!listing.stdout.includes("package/dist/custom-elements.json")) {
        failures.push(
            "viewer tarball does not contain dist/custom-elements.json",
        );
    }
}

function lint_packages(failures) {
    for (const pkg of PACKAGES) {
        const cwd = path.join(ROOT, pkg.dir);
        if (
            run("pnpm", ["dlx", PUBLINT, "--pack", "pnpm"], { cwd }).status !==
            0
        ) {
            failures.push(`publint ${pkg.dir}`);
        }

        const attw = ["dlx", ATTW, "--pack", ".", "--profile", "esm-only"];
        if (run("pnpm", [...attw, ...(pkg.attw ?? [])], { cwd }).status !== 0) {
            failures.push(`attw ${pkg.dir}`);
        }
    }
}

function pack_packages(tmp) {
    const tarballs = path.join(tmp, "tarballs");
    fs.mkdirSync(tarballs, { recursive: true });
    for (const pkg of PACKAGES) {
        const result = run("pnpm", ["pack", "--pack-destination", tarballs], {
            cwd: path.join(ROOT, pkg.dir),
        });

        if (result.status !== 0) {
            throw new Error(`pnpm pack failed for ${pkg.dir}`);
        }
    }

    return fs.readdirSync(tarballs).map((name) => path.join(tarballs, name));
}

function consumer_dependencies() {
    const manifest = JSON.parse(
        fs.readFileSync(path.join(CONSUMER, "package.json"), "utf8"),
    );

    return Object.entries({
        ...manifest.dependencies,
        ...manifest.devDependencies,
    })
        .filter(([name]) => !name.startsWith("@perspective-dev/"))
        .filter(([name]) => name !== "typescript")
        .map(([name, spec]) =>
            spec === "catalog:"
                ? `${name}@${catalog_version(name)}`
                : `${name}@${spec}`,
        );
}

function typecheck_consumer(tmp, tarballs, failures) {
    const app = path.join(tmp, "consumer");
    fs.cpSync(path.join(CONSUMER, "src"), path.join(app, "src"), {
        recursive: true,
    });

    fs.copyFileSync(
        path.join(CONSUMER, "tsconfig.json"),
        path.join(app, "tsconfig.json"),
    );

    fs.writeFileSync(
        path.join(app, "package.json"),
        JSON.stringify({ name: "consumer", private: true, type: "module" }),
    );

    const require = createRequire(
        path.join(ROOT, "rust/perspective-viewer/package.json"),
    );

    const typescript = require("typescript/package.json").version;
    const install = run(
        "npm",
        [
            "install",
            "--no-audit",
            "--no-fund",
            "--ignore-scripts",
            `typescript@${typescript}`,
            ...consumer_dependencies(),
            ...tarballs,
        ],
        { cwd: app },
    );

    if (install.status !== 0) {
        throw new Error("npm install of the packed tarballs failed");
    }

    for (const options of MATRIX) {
        const label = `tsc ${options.moduleResolution} skipLibCheck=${options.skipLibCheck}`;
        const result = run(
            path.join(app, "node_modules/.bin/tsc"),
            [
                "-p",
                "tsconfig.json",
                "--module",
                options.module,
                "--moduleResolution",
                options.moduleResolution,
                "--skipLibCheck",
                String(options.skipLibCheck),
            ],
            { cwd: app, capture: true },
        );

        const errors = `${result.stdout}${result.stderr}`
            .split("\n")
            .filter((line) => line.includes("error TS"));

        const ours = errors.filter(
            (line) =>
                line.startsWith("src/") ||
                line.includes("node_modules/@perspective-dev/"),
        );

        for (const line of errors.filter((line) => !ours.includes(line))) {
            console.warn(`  (third-party) ${line}`);
        }

        for (const line of ours) {
            console.error(`  ${line}`);
        }

        console.log(`${label}: ${ours.length} error(s)`);
        if (ours.length > 0) {
            failures.push(label);
        }
    }
}

function build_examples(failures) {
    for (const [name, script] of EXAMPLES) {
        if (run("pnpm", ["--filter", name, "run", script]).status !== 0) {
            failures.push(`example ${name}`);
        }
    }
}

const failures = [];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "psp-consumers-"));
try {
    check_public_types(failures);
    check_custom_elements_manifest(tmp, failures);
    lint_packages(failures);
    const tarballs = pack_packages(tmp);
    check_packed_manifest(tarballs, failures);
    typecheck_consumer(tmp, tarballs, failures);
    build_examples(failures);
} finally {
    fs.rmSync(tmp, { recursive: true, force: true });
}

if (failures.length > 0) {
    console.error(`\nConsumer checks failed:\n- ${failures.join("\n- ")}`);
    process.exit(1);
}

console.log("\nConsumer checks passed");
