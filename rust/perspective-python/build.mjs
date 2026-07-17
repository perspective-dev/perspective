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

import * as fs from "node:fs";
import { execSync } from "child_process";
import * as url from "url";
import * as toml from "@iarna/toml";
import * as tar from "tar";
import * as path from "path";
import "zx/globals";

const __dirname = url.fileURLToPath(new URL(".", import.meta.url)).slice(0, -1);
const pkg = JSON.parse(
    fs.readFileSync(__dirname + "/package.json", { encoding: "utf-8" }),
);

let flags = "--release";
let features = [];
if (!!process.env.PSP_DEBUG) {
    flags = "";
}

const is_pyodide = !!process.env.PSP_PYODIDE;

const python_version =
    process.env.PSP_PYTHON_VERSION || (is_pyodide ? "3.13" : "3.12");

const version = pkg.version;

fs.mkdirSync(`./perspective_python-${version}.data`, { recursive: true });
fs.copyFileSync("../../LICENSE.md", "./LICENSE.md");

const cwd = process.cwd();
const env = { ...process.env };

let emsdk_prefix = "";
if (is_pyodide) {
    const emsdkdir = path.resolve(__dirname, "../../.emsdk");
    const { emscripten } = JSON.parse(
        fs.readFileSync(path.resolve(__dirname, "../../package.json")),
    );
    emsdk_prefix = `cd ${emsdkdir} && . ./emsdk_env.sh && ./emsdk activate ${emscripten} && cd ${cwd} && `;
    env.MATURIN_PYEMSCRIPTEN_PLATFORM_VERSION =
        process.env.MATURIN_PYEMSCRIPTEN_PLATFORM_VERSION || "2025_0";
}

// if not windows
if (process.platform !== "win32") {
    env.PSP_ROOT_DIR = "../..";
}

const build_wheel = !!process.env.PSP_BUILD_WHEEL || is_pyodide;
const build_sdist = !!process.env.PSP_BUILD_SDIST;

let target = "";
if (is_pyodide) {
    target = `--target=wasm32-unknown-emscripten -i${python_version}`;
} else if (process.env.PSP_ARCH === "x86_64" && process.platform === "darwin") {
    target = "--target=x86_64-apple-darwin";
} else if (
    process.env.PSP_ARCH === "aarch64" &&
    process.platform === "darwin"
) {
    target = "--target=aarch64-apple-darwin";
} else if (process.env.PSP_ARCH === "x86_64" && process.platform === "linux") {
    target = "--target=x86_64-unknown-linux-gnu --compatibility manylinux_2_28";
} else if (process.env.PSP_ARCH === "aarch64" && process.platform === "linux") {
    target = "--target=aarch64-unknown-linux-gnu";
}

if (build_wheel) {
    if (!!process.env.PSP_BUILD_VERBOSE) {
        flags += " -vv";
    }

    if (process.env.CONDA_BUILD === "1") {
        console.log("Building with Conda flags and features");
        if (process.env.PYTHON) {
            console.log(`interpreter: ${process.env.PYTHON}`);
            flags += ` --interpreter=${process.env.PYTHON}`;
        } else {
            console.warn(
                "Expected PYTHON to be set in CONDA_BUILD environment, but it isn't.  maturin will likely detect the wrong Python.",
            );
        }
        // we need to generate proto.rs using conda's protoc, which is set in
        // the environment.  we use the unstable "versioned" python abi
        features.push(["generate-proto"]);
    } else {
        // standard for in-repo builds.  a different set will be standard in the sdist
        const standard_features = ["abi3", "generate-proto", "protobuf-src"];

        console.log("Building with standard flags and features");
        features.push(...standard_features);
    }

    execSync(
        `${emsdk_prefix}maturin build ${flags} --features=${features.join(",")} ${target}`,
        { stdio: "inherit", env },
    );
}

if (build_sdist) {
    // `maturin sdist` has some issues with Cargo workspaces, so we assemble the sdist by hand here
    // Note that the resulting sdist is _not_ a Cargo workspace, it is rooted in this package.
    const cargo_toml = fs.readFileSync("./Cargo.toml").toString("utf-8");
    const pyproject_toml = fs
        .readFileSync("./pyproject.toml")
        .toString("utf-8");

    const cargo = toml.parse(cargo_toml);
    const pyproject = toml.parse(pyproject_toml);
    const version = cargo["package"]["version"];
    const data_dir = `perspective_python-${version}.data`;
    const testfile = path.join(
        data_dir,
        "data/share/jupyter/labextensions/@perspective-dev/jupyterlab/package.json",
    );

    if (!fs.existsSync(testfile)) {
        throw new Error(
            "labextension is not present in data directory, please build `perspective-jupyterlab`",
        );
    }

    if (
        !fs.existsSync("perspective/widget/static/perspective-anywidget.js")
    ) {
        throw new Error(
            "anywidget bundle is not present in perspective/widget/static, please build `@perspective-dev/anywidget`",
        );
    }

    const readme_md = fs.readFileSync("./README.md");
    const pkg_info = generatePkgInfo(pyproject, cargo, readme_md);
    fs.writeFileSync("./PKG-INFO", pkg_info);

    // Maturin finds extra license files in the root of the source directory,
    // then packages them into .dist-info in the wheel.  As of Nov 2024,
    // Maturin does not yet support explicitly declaring `license-files` in
    // pyproject.toml.  See https://github.com/PyO3/maturin/pull/862
    // https://github.com/PyO3/maturin/issues/861
    const crate_files = glob.sync(Array.from(cargo["package"]["include"]));
    const wheel_dir = `../target/wheels`;
    fs.mkdirSync(wheel_dir, { recursive: true });
    await tar.create(
        {
            gzip: true,
            file: path.join(wheel_dir, `perspective_python-${version}.tar.gz`),
            prefix: `perspective_python-${version}`,
            strict: true,
        },
        crate_files.concat(["PKG-INFO", data_dir]),
    );
}

if (process.env["PSP_UV"] === "1") {
    flags += " --uv";
}

if (!build_wheel && !build_sdist) {
    const dev_features = ["abi3"];
    execSync(
        `${emsdk_prefix}maturin develop --features=${dev_features.join(",")} ${flags} ${target}`,
        { stdio: "inherit", env },
    );
}

// Generates version 2.3 according to https://packaging.python.org/en/latest/specifications/core-metadata/
// Takes parsed pyproject.toml, Cargo.toml, and contents of README.md.
function generatePkgInfo(pyproject, cargo, readme_md) {
    const project = pyproject["project"];
    const field = (name, value) => {
        if (typeof value !== "string") {
            throw new Error(
                `PKG-INFO value for field ${name} was not a string:\n${value}`,
            );
        }
        return `${name}: ${value}`;
    };
    const lines = [];
    const addField = (key, value) => lines.push(field(key, value));
    addField("Metadata-Version", "2.3");
    addField("Name", project.name);
    addField("Version", cargo.package.version);
    for (const c of project["classifiers"]) {
        addField("Classifier", c);
    }
    for (const [extra, deps] of Object.entries(
        project["optional-dependencies"],
    )) {
        for (const dep of deps) {
            addField("Requires-Dist", `${dep} ; extra == '${extra}'`);
        }
    }
    for (const extra of Object.keys(project["optional-dependencies"])) {
        addField("Provides-Extra", extra);
    }
    addField("Summary", cargo.package.description);
    addField("Home-page", cargo.package.homepage);
    addField("Author", cargo.package.authors[0]);
    addField("Author-email", cargo.package.authors[0]);
    addField("License", cargo.package.license);
    addField("Requires-Python", project["requires-python"]);
    addField(
        "Description-Content-Type",
        "text/markdown; charset=UTF-8; variant=GFM",
    );
    addField("Project-URL", `Source Code, ${cargo.package.repository}`);
    lines.push("");
    lines.push(readme_md);

    return lines.join("\n");
}
