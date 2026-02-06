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

import { get_scope } from "./sh_perspective.mjs";
import * as url from "url";
import * as dotenv from "dotenv";
import * as cppLint from "./lint_cpp.mjs";

import "zx/globals";

export async function lint_js(is_fix = false) {
    const prettier_flags = is_fix ? "--write" : "--check";
    await $`prettier ${prettier_flags} "examples/**/*.js" "examples/**/*.tsx" "tools/scripts/*.mjs" "rust/**/*.ts" "rust/**/*.js" "packages/**/*.js" "packages/**/*.ts"`.verbose();
    await $`prettier --prose-wrap=always ${prettier_flags} "rust/*/docs/**/*.md"`.verbose();
    // cmd.sh`prettier ${prettier_flags} "**/*.yaml"`;
    await $`prettier ${prettier_flags} "**/less/*.less"`.verbose();
    await $`prettier ${prettier_flags} "**/html/*.html"`.verbose();
    await $`prettier ${prettier_flags} "packages/**/package.json" "rust/**/package.json" "examples/**/package.json" "docs/package.json"`.verbose();

    const check = is_fix ? [] : ["--check"];
    const dirty = is_fix ? ["--allow-dirty"] : [];
    const staged = is_fix ? ["--allow-staged"] : [];
    const fix = is_fix ? ["--fix"] : [];
    await $`cargo build -p perspective-lint --features="yew-fmt"`.verbose();
    await $`cargo clippy ${fix} ${dirty} ${staged} -p perspective-viewer -- -Dwarnings`.verbose();
    await $`RUSTFMT="rust/target/debug/lint" cargo fmt ${check}`.verbose();
}

export function lint_python(is_fix = false) {
    if (get_scope().indexOf("perspective-python") > -1) {
        if (is_fix) {
            $.sync`ruff check --fix`;
        } else {
            $.sync`ruff check`;
        }
    }
}

if (import.meta.url.startsWith("file:")) {
    if (process.argv[1] === url.fileURLToPath(import.meta.url)) {
        dotenv.config({ path: "./.perspectiverc", quiet: true });
        const { default: run } = await import("./lint_headers.mjs");
        const exit_code = await run(false);
        // if (process.env.PSP_PROJECT === "python") {
        // await import("./lint_python.mjs");
        // } else {

        await lint_js();
        lint_python();
        // }

        cppLint.checkFormatting();
        process.exit(exit_code);
    }
}
