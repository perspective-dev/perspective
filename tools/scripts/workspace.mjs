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

import fs from "node:fs";
import url from "node:url";
import path from "node:path";

const __dirname = url.fileURLToPath(new URL(".", import.meta.url)).slice(0, -1);
const workspaceRoot = path.normalize(path.join(__dirname, "..", ".."));
const rustTargetDir = path.join(workspaceRoot, "rust", "target");
const rustWheelsDir = path.join(rustTargetDir, "wheels");

const memoize = (f) => {
    let val = undefined;
    return () => {
        if (typeof val !== "undefined") return val;
        val = f();
        return val;
    };
};

export function getWorkspaceRoot() {
    return workspaceRoot;
}
export function getRustTargetDir() {
    return rustTargetDir;
}
export function getRustWheelsDir() {
    return rustWheelsDir;
}
export function getEmscriptenWheelPath() {
    const pspVersion = getWorkspacePackageJson().version.replace("-", ".");
    const wheeljunk = "cp311-abi3-emscripten_4_0_9_wasm32";
    return path.join(
        rustWheelsDir,
        `perspective_python-${pspVersion}-${wheeljunk}.whl`,
    );
}
/**
 * @returns memoized, deserialized contents of workspace package.json
 */
export const getWorkspacePackageJson = memoize(() =>
    JSON.parse(fs.readFileSync(path.join(workspaceRoot, "package.json"))),
);
