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
import * as fs from "fs";
import * as url from "url";
import * as os from "os";
import glob from "glob";
import { execSync } from "child_process";
import * as dotenv from "dotenv";

const __dirname = url.fileURLToPath(new URL(".", import.meta.url)).slice(0, -1);

export function tidyLint(flags) {
    dotenv.config({ path: "./.perspectiverc" });
    // if (process.env.PSP_PROJECT === "js") {
    const cppPath = sh.path`${__dirname}/../../cpp/perspective`;
    const cppDistPath = sh.path`${cppPath}/dist/release`;
    tidy(cppDistPath, sh.path`${cppPath}/src`, flags);
    // } else if (process.env.PSP_PROJECT === "python") {
    //     const cppPath = sh.path`${__dirname}/../../python/perspective`;
    //     const cppDistPath = sh.path`${cppPath}/build/last_build`;
    //     tidy(cppDistPath, sh.path`${cppPath}/perspective`, flags);
    // } else {
    //     console.error("Unknown project type, skipping lint");
    // }
}

/** @typedef {import('./sh.mjs').Command} Command */

/**
 * Runs clang tidy on the source directory using the compile_commands.json
 * from the build directory.
 *
 * @param {string} buildDir
 * @param {string} sourceDir
 */
function tidy(buildDir, sourceDir, flags) {
    const ctpath = CLANG_TIDY_PATH;
    // if (!fs.existsSync(ctpath)) {
    //     console.warn("run-clang-tidy not found, skipping lint");
    //     return;
    // }
    if (fs.existsSync(buildDir)) {
        const jobs = os.cpus().length;
        const sources = glob
            .sync(`${sourceDir}/**/*.{cpp,h}`)
            .filter((x) => -1 === x.indexOf("emscripten"));
        // `-extra-arg=-I${buildDir + "/../../../../.emsdk/upstream/emscripten/system/include"}`
        sh`${ctpath} -use-color ${flags} -quiet -p${buildDir} -extra-arg=-UPSP_ENABLE_WASM  -j${jobs} ${sources}`.runSync();
    } else {
        console.warn("No C++ build directory found, skipping lint");
    }
}

const CLANG_TIDY_PATH = fs.existsSync(`${__dirname}/../../.llvm`)
    ? `${__dirname}/../../.llvm/bin/run-clang-tidy`
    : `run-clang-tidy`;

const CLANG_FMT_PATH = fs.existsSync(`${__dirname}/../../.llvm`)
    ? `${__dirname}/../../.llvm/bin/clang-format`
    : `clang-format`;

console.log(`${__dirname}/../../.llvm`);

function formatLint(dir) {
    execSync(`${CLANG_FMT_PATH} -style=file --dry-run -Werror ${dir}`, {
        stdio: "inherit",
    });
}

function clangFormatFix(dir) {
    execSync(`${CLANG_FMT_PATH} -style=file -i ${dir}`, {
        stdio: "inherit",
    });
}

export function checkFormatting() {
    formatLint(sh.path`./cpp/perspective/src/cpp/*.cpp`);
    formatLint(sh.path`./cpp/perspective/src/cpp/vendor/*.cpp`);
    formatLint(sh.path`./cpp/perspective/src/include/perspective/*.h`);
    formatLint(sh.path`./cpp/perspective/src/include/perspective/vendor/*.h`);
    // formatLint(sh.path`./python/perspective/perspective/src/*.cpp`);
    // formatLint(
    //     sh.path`./python/perspective/perspective/include/perspective/*.h`
    // );
    // formatLint(
    //     sh.path`./python/perspective/perspective/include/perspective/python/*.h`
    // );

    tidyLint();
}

export function fixFormatting() {
    tidyLint("-fix");
    clangFormatFix(sh.path`./cpp/perspective/src/cpp/*.cpp`);
    clangFormatFix(sh.path`./cpp/perspective/src/cpp/vendor/*.cpp`);
    clangFormatFix(sh.path`./cpp/perspective/src/include/perspective/*.h`);
    clangFormatFix(
        sh.path`./cpp/perspective/src/include/perspective/vendor/*.h`
    );
    // clangFormatFix(sh.path`./python/perspective/perspective/src/*.cpp`);
    // clangFormatFix(
    //     sh.path`./python/perspective/perspective/include/perspective/*.h`
    // );
    // clangFormatFix(
    //     sh.path`./python/perspective/perspective/include/perspective/python/*.h`
    // );
}
