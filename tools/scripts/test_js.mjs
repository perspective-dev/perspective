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

import { execSync } from "child_process";
import { getarg, run_with_scope, get_scope } from "./sh_perspective.mjs";

const IS_NEEDS_BUILD = get_scope().some((x) => x === "jupyterlab");

// Unfortunately we have to handle parts of the Jupyter test case here,
// as the Jupyter server needs to be run outside of the main Jest process.
const IS_JUPYTER = !!getarg("--jupyter") && IS_NEEDS_BUILD;

if (getarg("--debug")) {
    console.log("-- Running tests in debug mode.");
}

const IS_PLAYWRIGHT = get_scope().reduce(
    (is_playwright, pkg) =>
        is_playwright ||
        [
            "docs",
            "client",
            "react",
            "viewer",
            "viewer-datagrid",
            "viewer-charts",
            "viewer-openlayers",
            "viewer-workspace",
            "workspace",
            "jupyterlab",
        ].includes(pkg),
    false,
);

const IS_RUST = get_scope().reduce(
    (is_playwright, pkg) => is_playwright || ["rust"].includes(pkg),
    false,
);

const IS_CI = process.env.CI || getarg("--ci") ? "CI=1" : "";
if (IS_CI) {
    console.log("-- Running tests in CI mode.");
}

function playwright(pkg, is_jlab) {
    const pkg_name = pkg ? `"${pkg}" ` : "";
    console.log(`-- Running ${pkg_name}Playwright test suite`);
    const args = process.argv
        .slice(2)
        .filter(
            (x) =>
                x !== "--ci" && x !== "--jupyter" && x !== "--fetch-snapshots",
        );

    const env = { ...process.env, TZ: "UTC" };
    if (is_jlab) {
        env.PSP_JUPYTERLAB_TESTS = "1";
        env.__JUPYTERLAB_PORT__ = "6538";
    }

    if (getarg("--fetch-snapshots")) {
        env.PSP_FETCH_SNAPSHOTS = "1";
    }

    if (getarg("--update-snapshots")) {
        env.PSP_UPDATE_SNAPSHOTS = "1";
    }

    if (IS_CI) {
        env.CI = "1";
    }

    if (pkg) {
        env.PACKAGE = pkg;
    }

    const cmd = [
        "npx",
        "playwright",
        "test",
        "--config=tools/test/playwright.config.ts",
        ...args,
    ].join(" ");
    execSync(cmd, { stdio: "inherit", env });
}

if (!IS_JUPYTER) {
    // test:build irrelevant for jupyter tests
    await run_with_scope`test:build`;
}

if (process.env.PACKAGE) {
    if (IS_NEEDS_BUILD) {
        await run_with_scope`test:jupyter:build`;
    }

    if (IS_JUPYTER) {
        // Jupyterlab is guaranteed to have started at this point, so
        // copy the test files over and run the tests.
        playwright("jupyterlab", true);
        process.exit(0);
    }

    if (IS_PLAYWRIGHT) {
        playwright(process.env.PACKAGE);
    }

    if (
        process.env.PACKAGE.indexOf("python") >= 0 &&
        process.env.PACKAGE.indexOf("!python") === -1
    ) {
        // Support `pnpm test -- --my_cool --test_arguments`
        const args = process.argv.slice(2);
        execSync(
            `pnpm run --recursive --filter @perspective-dev/python test ${args.join(" ")}`,
            { stdio: "inherit" },
        );
    }

    if (IS_RUST) {
        let target = "";
        let flags = "--release";
        if (!!process.env.PSP_DEBUG) {
            flags = "";
        }

        if (
            process.env.PSP_ARCH === "x86_64" &&
            process.platform === "darwin"
        ) {
            target = "--target=x86_64-apple-darwin";
        } else if (
            process.env.PSP_ARCH === "aarch64" &&
            process.platform === "darwin"
        ) {
            target = "--target=aarch64-apple-darwin";
        } else if (
            process.env.PSP_ARCH === "x86_64" &&
            process.platform === "linux"
        ) {
            target =
                "--target=x86_64-unknown-linux-gnu --compatibility manylinux_2_28";
        } else if (
            process.env.PSP_ARCH === "aarch64" &&
            process.platform === "linux"
        ) {
            target = "--target=aarch64-unknown-linux-gnu";
        }

        execSync(
            `cargo test ${flags} ${target} -p perspective -p perspective-client`,
            { stdio: "inherit" },
        );
    }
} else {
    console.log("-- Running all tests");
    playwright();
}
