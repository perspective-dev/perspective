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

import { defineConfig, devices } from "@playwright/experimental-ct-react";
import path from "path";
import * as dotenv from "dotenv";
import { createRequire } from "node:module";
import url from "node:url";
import { execSync } from "child_process";
import { get_scope } from "../scripts/sh_perspective.mjs";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: "./.perspectiverc", quiet: true });

Error.stackTraceLimit = Infinity;

// TODO Don't hardcode this. AFAICT this can only be accomplished by choosing
// the port before calling the playwright CLI, via env var.
const TEST_SERVER_PORT = 6598;

const RUN_JUPYTERLAB = !!process.env.PSP_JUPYTERLAB_TESTS;

// TODO use this from core
const package_venn = get_scope().reduce(
    (acc, x) => {
        if (x.startsWith("!")) {
            acc.exclude.push(x);
        } else {
            acc.include.push(x);
        }

        return acc;
    },
    { include: [] as string[], exclude: [] as string[] },
);

let PACKAGE: string[] = [];
if (package_venn.include.length === 0) {
    PACKAGE = JSON.parse(execSync(`pnpm m ls --json --depth=-1`).toString())
        .filter((x) => x.name !== undefined)
        .map((x) => x.name.replace("@perspective-dev/", ""))
        .filter((x) => package_venn.exclude.indexOf(`!${x}`) === -1);
} else {
    PACKAGE = package_venn.include.filter(
        (x) => package_venn.exclude.indexOf(`!${x}`) === -1,
    );
}

const DEVICE_OPTIONS = {
    "Desktop Chrome": {
        // Lock DPR to 1 so WebGL viewport / canvas backing sizes are
        // identical across host machines (matters for pixel snapshots).
        // This also overrides the `devices["Desktop Chrome"]` default of 2.
        deviceScaleFactor: 1,
        launchOptions: {
            args: [
                // "--disable-accelerated-2d-canvas",
                // "--disable-gpu",
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--font-render-hinting=none",
                '--proxy-server="direct://"',
                "--proxy-bypass-list=*",
                "--js-flags=--expose-gc",
                "--enable-precise-memory-info",
                // Use the software WebGL backend so GPU/driver differences
                // between machines don't leak into snapshot pixels. The
                // 2× perf hit is under budget for the test suite.
                "--use-gl=swiftshader",
                "--use-angle=swiftshader",
            ],
        },
    },
};

const BROWSER_PACKAGES = [
    {
        packageName: "viewer",
        testDir: "rust/perspective-viewer/test/js",
    },
    {
        packageName: "react",
        testDir: "packages/react/test/js",
    },
    {
        packageName: "viewer-datagrid",
        testDir: "packages/viewer-datagrid/test/js",
    },
    {
        packageName: "viewer-charts",
        testDir: "packages/viewer-charts/test/js",
    },
    {
        packageName: "viewer-openlayers",
        testDir: "packages/viewer-openlayers/test/js",
    },
    {
        packageName: "jupyterlab",
        testDir: "packages/jupyterlab/test/js",
    },
    {
        packageName: "workspace",
        testDir: "packages/workspace/test/js",
    },
    {
        packageName: "docs",
        testDir: "docs/test/js",
    },
];

const NODE_PACKAGES = [
    {
        packageName: "client",
        testDir: "rust/perspective-js/test/js",
    },
    {
        packageName: "client-tz",
        testDir: "rust/perspective-js/test/tz",
    },
];

const BROWSER_AND_PYTHON_PACKAGES = [
    {
        packageName: "python-perspective-jupyterlab",
        testDir: "packages/jupyterlab/test/jupyter",
    },
];

let PROJECTS = (() => {
    const acc = new Array();
    if (RUN_JUPYTERLAB) {
        for (const pkg of BROWSER_AND_PYTHON_PACKAGES) {
            for (const device of Object.keys(DEVICE_OPTIONS)) {
                acc.push({
                    name: `${pkg.packageName}-${device
                        .toLowerCase()
                        .replace(" ", "-")}`,
                    testDir: path.join(__dirname, "../../", pkg.testDir),
                    use: {
                        ...devices[device],
                        // baseURL: `http://localhost:${TEST_SERVER_PORT}`,
                        timezoneId: "UTC",
                        launchOptions: {
                            args: ["--js-flags=--expose-gc"],
                        },
                    },
                });
            }
        }
    } else {
        for (const pkg of NODE_PACKAGES) {
            if (PACKAGE == undefined || PACKAGE.includes(pkg.packageName)) {
                acc.push({
                    name: `${pkg.packageName}-node`,
                    testDir: path.join(__dirname, "../../", pkg.testDir),
                });
            }
        }

        for (const pkg of BROWSER_PACKAGES) {
            if (PACKAGE == undefined || PACKAGE.includes(pkg.packageName)) {
                for (const device of Object.keys(DEVICE_OPTIONS)) {
                    acc.push({
                        name: `${pkg.packageName}-${device
                            .toLowerCase()
                            .replace(" ", "-")}`,
                        testDir: path.join(__dirname, "../../", pkg.testDir),
                        use: {
                            ...devices[device],
                            ...DEVICE_OPTIONS[device],
                            baseURL: `http://localhost:${TEST_SERVER_PORT}`,
                            timezoneId: "UTC",
                        },
                    } as any);
                }
            }
        }
    }

    return acc;
})();

const __require = createRequire(import.meta.url);

const GLOBAL_SETUP_PATH = __require.resolve(
    "@perspective-dev/jupyterlab/test/config/jupyter/globalSetup.ts",
);

const GLOBAL_TEARDOWN_PATH = __require.resolve(
    "@perspective-dev/jupyterlab/test/config/jupyter/globalTeardown.ts",
);

// See https://playwright.dev/docs/test-configuration.
export default defineConfig({
    timeout: 30_000,
    expect: {
        timeout: 30_000,
    },
    repeatEach: process.env.PSP_SATURATE
        ? parseInt(process.env.PSP_SATURATE)
        : 0,
    forbidOnly: !!process.env.CI,
    workers: process.env.PSP_DEBUG ? 1 : "50%",
    retries: 0,
    quiet: !process.env.PSP_DEBUG,
    reporter: process.env.CI ? [["github"], ["html"]] : [["dot"]],
    projects: PROJECTS,
    outputDir: "dist/results",
    use: {
        launchOptions: {
            slowMo: 500, // 500 milliseconds delay
        },
        headless: !process.env.PSP_HEADED,
        ctPort: 3100,
        viewport: { width: 1280, height: 720 },
        actionTimeout: 0,
        // trace: "retain-on-failure",
        // screenshot: "only-on-failure",
        // video: "retain-on-failure",
    },
    updateSnapshots: "none",
    globalSetup: RUN_JUPYTERLAB
        ? GLOBAL_SETUP_PATH
        : path.join(__dirname, "src/js/global_startup.ts"),
    globalTeardown: RUN_JUPYTERLAB
        ? GLOBAL_TEARDOWN_PATH
        : path.join(__dirname, "src/js/global_teardown.ts"),
    snapshotPathTemplate:
        "dist/snapshots/{projectName}/{testFilePath}/{arg}{ext}",
    webServer: {
        command: "tsx src/js/start_test_server.ts",
        port: TEST_SERVER_PORT,
        reuseExistingServer: true,
        stdout: "pipe",
        stderr: "pipe",
    },
});
