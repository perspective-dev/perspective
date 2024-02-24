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

import sh from "./sh.mjs";
import { getarg, run_with_scope } from "./sh_perspective.mjs";
import minimatch from "minimatch";

// Unfortunately we have to handle parts of the Jupyter test case here,
// as the Jupyter server needs to be run outside of the main Jest process.
const IS_JUPYTER =
    getarg("--jupyter") &&
    minimatch("perspective-jupyterlab", process.env.PACKAGE);

if (getarg("--debug")) {
    console.log("-- Running tests in debug mode.");
}

const IS_CI = process.env.CI || getarg("--ci") ? "CI=1" : "";
if (IS_CI) {
    console.log("-- Running tests in CI mode.");
}

function playwright(pkg, is_jlab) {
    const pkg_name = `"${pkg}" ` || "";
    console.log(`-- Running ${pkg_name}Playwright test suite`);
    const args = process.argv
        .slice(2)
        .filter((x) => x !== "--ci" && x !== "--jupyter");

    const env = {};
    if (is_jlab) {
        env.PSP_JUPYTERLAB_TESTS = 1;
        env.__JUPYTERLAB_PORT__ = 6538;
    }

    if (IS_CI) {
        env.CI = 1;
    }

    if (pkg) {
        env.PACKAGE = pkg;
    }

    return sh`
        TZ=UTC
        npx playwright test 
        --config=tools/perspective-test/playwright.config.ts 
        ${args}
    `.env(env);
}

if (!IS_JUPYTER) {
    // test:build irrelevant for jupyter tests
    await run_with_scope`test:build`;
}

if (process.env.PACKAGE) {
    if (IS_JUPYTER) {
        // Jupyterlab is guaranteed to have started at this point, so
        // copy the test files over and run the tests.
        await run_with_scope`test:jupyter:build`;
        playwright("perspective-jupyterlab", true).runSync();
        process.exit(0);
    }

    if (process.env.PACKAGE !== "perspective-python") {
        playwright(process.env.PACKAGE).runSync();
    }

    if (process.env.PACKAGE.indexOf("perspective-python") >= 0) {
        sh`yarn workspace @finos/perspective-python test`.runSync();
    }
} else {
    console.log("-- Running all tests");
    playwright().runSync();
}
