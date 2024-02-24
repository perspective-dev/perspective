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

import { Project, defineConfig, devices } from "@playwright/test";
import path from "path";
import * as dotenv from "dotenv";

import url from "node:url";

globalThis.__filename = url.fileURLToPath(import.meta.url);
globalThis.__dirname = path.dirname(__filename);

dotenv.config({ path: "./.perspectiverc" });

// TODO Don't hardcode this. AFAICT this can only be accomplished by choosing
// the port before calling the playwright CLI, via env var.
const TEST_SERVER_PORT = 6598;

const RUN_JUPYTERLAB = !!process.env.PSP_JUPYTERLAB_TESTS;

const PACKAGE = process.env.PACKAGE?.split(",");

const DEVICE_OPTIONS = {
    "Desktop Chrome": {
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
            ],
        },
    },
};

const BROWSER_PACKAGES = [
    {
        packageName: "perspective-viewer",
        testDir: "rust/perspective-viewer/test/js",
    },
    {
        packageName: "perspective-viewer-datagrid",
        testDir: "packages/perspective-viewer-datagrid/test/js",
    },
    {
        packageName: "perspective-viewer-d3fc",
        testDir: "packages/perspective-viewer-d3fc/test/js",
    },
    {
        packageName: "perspective-viewer-openlayers",
        testDir: "packages/perspective-viewer-openlayers/test/js",
    },
    {
        packageName: "perspective-jupyterlab",
        testDir: "packages/perspective-jupyterlab/test/js",
    },
    {
        packageName: "perspective-workspace",
        testDir: "packages/perspective-workspace/test/js",
    },
    {
        packageName: "perspective-cli",
        testDir: "packages/perspective-cli/test/js",
    },
    {
        packageName: "docs",
        testDir: "docs/test/js",
    },
];

const NODE_PACKAGES = [
    {
        packageName: "perspective",
        testDir: "rust/perspective/test/js",
    },
    {
        packageName: "perspective-tz",
        testDir: "rust/perspective/test/tz",
    },
];

const BROWSER_AND_PYTHON_PACKAGES = [
    {
        packageName: "python-perspective-jupyterlab",
        testDir: "packages/perspective-jupyterlab/test/jupyter",
    },
];

//const RUN_JUPYTERLAB = PACKAGE.includes("perspective-jupyterlab");

const PROJECTS = (() => {
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
                    } as Project);
                }
            }
        }
    }

    return acc;
})();

// See https://playwright.dev/docs/test-configuration.
export default defineConfig({
    timeout: 30_000,
    expect: {
        timeout: 10_000,
    },
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    quiet: !process.env.PSP_DEBUG,
    reporter: process.env.CI ? [["github"], ["html"]] : [["dot"]],
    projects: PROJECTS,
    outputDir: "dist/results",
    use: {
        viewport: { width: 1280, height: 720 },
        actionTimeout: 0,
        // trace: "retain-on-failure",
        // screenshot: "only-on-failure",
        // video: "retain-on-failure",
    },
    globalSetup: RUN_JUPYTERLAB
        ? require.resolve(
              "@finos/perspective-jupyterlab/test/config/jupyter/globalSetup.ts"
          )
        : path.join(__dirname, "src/js/global_startup.ts"),
    globalTeardown: RUN_JUPYTERLAB
        ? require.resolve(
              "@finos/perspective-jupyterlab/test/config/jupyter/globalTeardown.ts"
          )
        : path.join(__dirname, "src/js/global_teardown.ts"),
    snapshotPathTemplate:
        "dist/snapshots/{projectName}/{testFilePath}/{arg}{ext}",
    webServer: {
        command: "node --loader ts-node/esm src/js/start_test_server.ts",
        port: TEST_SERVER_PORT,
        reuseExistingServer: true,
    },
});
