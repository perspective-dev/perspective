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

import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import { spawn, spawnSync } from "child_process";
import * as os from "os";

import "zx/globals";

dotenv.config({ path: "./.perspectiverc", quiet: true });
process.env.FORCE_COLOR = true;

/**
 * Calls `path.resolve` on each of the input path arguments, then removes the
 * path if it exists.
 *
 * @param {string} dirs paths to clean.
 * @example
 * clean("a/b/c"); // Cleans this dir
 * clean("a/b/c", "d/e/f"); // Cleans both dirs
 */
export function clean(...dirs) {
    for (const dir of dirs) {
        const resolved = path.resolve(dir);
        if (fs.existsSync(resolved)) {
            fs.rmSync(resolved, { recursive: true, force: true });
        }
    }
}

/**
 * Returns the value after this command-line flag, or `true` if it is the last
 * arg.  This makes it easy to null-pun for boolean flags, and capture the
 * argument for argument-providing flags, and respect quotes and parens, in
 * one function.  Can be used as a template literal - not sure why, 2 less
 * characters?
 *
 * @param {string} flag The command line flag name.  Returns all arguments if
 *     this param is `undefined`.
 * @returns {string} The next argument after this flag in the command args, or
 *     `true.
 * @example
 * console.assert(getarg`--debug`);
 */
export function getarg(flag, ...args) {
    if (Array.isArray(flag)) {
        flag = flag.map((x, i) => x + (args[i] || "")).join("");
    }
    const argv = process.argv.slice(2);
    if (flag) {
        const index = argv.indexOf(flag);
        if (index > -1) {
            const next = argv[index + 1];
            if (next) {
                return next;
            } else {
                return true;
            }
        }
    } else {
        return argv
            .map(function (arg) {
                return "'" + arg.replace(/'/g, "'\\''") + "'";
            })
            .join(" ");
    }
}

export function get_scope() {
    const package_venn = (process.env.PACKAGE || "").split(",").reduce(
        (acc, x) => {
            if (x.startsWith("!")) {
                acc.exclude.push(x);
            } else if (x != "") {
                acc.include.push(x);
            }

            return acc;
        },
        { include: [], exclude: [] },
    );

    let packages;
    if (package_venn.include.length === 0) {
        packages = JSON.parse($.sync`pnpm m ls --json --depth=-1`.toString())
            .filter((x) => x.name !== undefined)
            .map((x) => x.name.replace("@perspective-dev/", ""))
            .filter((x) => package_venn.exclude.indexOf(`!${x}`) === -1);
    } else {
        packages = package_venn.include.filter(
            (x) => package_venn.exclude.indexOf(`!${x}`) === -1,
        );
    }

    return packages;
}

const CANCEL_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"];

const CANCEL_GRACE_MS = 4_000;

const IS_WINDOWS = process.platform === "win32";

function run_cancellable(cmd, args) {
    return new Promise((resolve, reject) => {
        const child = IS_WINDOWS
            ? spawn(cmd, args, {
                  stdio: ["ignore", "inherit", "inherit"],
                  shell: true,
              })
            : spawn(cmd, args, {
                  stdio: ["ignore", "inherit", "inherit"],
                  detached: true,
              });

        let cancelled;
        let escalation;
        const signal_group = (signal) => {
            try {
                if (IS_WINDOWS) {
                    spawnSync(
                        "taskkill",
                        ["/pid", `${child.pid}`, "/T", "/F"],
                        {
                            stdio: "ignore",
                        },
                    );
                } else {
                    process.kill(-child.pid, signal);
                }
            } catch {}
        };

        const cancel = (signal) => {
            if (cancelled) {
                signal_group("SIGKILL");
                return;
            }

            cancelled = signal;
            signal_group("SIGTERM");
            escalation = setTimeout(
                () => signal_group("SIGKILL"),
                CANCEL_GRACE_MS,
            );
            escalation.unref();
        };

        for (const signal of CANCEL_SIGNALS) {
            process.on(signal, cancel);
        }

        child.on("error", reject);
        child.on("exit", (code, signal) => {
            clearTimeout(escalation);
            for (const s of CANCEL_SIGNALS) {
                process.off(s, cancel);
            }

            if (cancelled && !IS_WINDOWS) {
                process.kill(process.pid, cancelled);
            } else if (cancelled) {
                process.exit(128 + (os.constants.signals[cancelled] ?? 0));
            } else if (signal) {
                process.exit(128 + (os.constants.signals[signal] ?? 0));
            } else if (code !== 0) {
                process.exit(code);
            } else {
                resolve();
            }
        });
    });
}

export const run_with_scope = async function run_recursive(strings, ...args) {
    let scope = get_scope();
    const cmd = strings[0].split(" ")[0];
    const filters = scope.flatMap((x) => ["--filter", x, "--if-present"]);
    await run_cancellable("pnpm", [
        "run",
        "--sequential",
        "--recursive",
        ...filters,
        cmd,
    ]);
};
