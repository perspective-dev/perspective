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

import inquirer from "inquirer";
import fs from "fs";
import * as dotenv from "dotenv";
import { execSync } from "child_process";

const original = dotenv.config({
    path: "./.perspectiverc",
    quiet: true,
}).parsed;

const CONFIG = new Proxy(
    new (class {
        constructor() {
            this.config = [];
            this._values = { ...original } || {};
            if (this._values.PACKAGE && this._values.PACKAGE.startsWith("@")) {
                this._values.PACKAGE = this._values.PACKAGE.slice(
                    2,
                    this._values.PACKAGE.length - 1,
                ).replace(/\|/g, ",");
            }
        }
        remove(keyname) {
            const idx = this.config.find((x) => s.startsWith(keyname));
            if (idx >= 0) {
                this.config.splice(idx);
            }
        }
        add(new_config) {
            for (const key in new_config) {
                const val = new_config[key];
                if (val !== "" && !!val) {
                    this._values[key] = val;
                    this.config.push(`${key}=${val}`);
                }
            }
        }
        write() {
            fs.writeFileSync("./.perspectiverc", this.config.join("\n"));
            if (process.env.PSP_BUILD_IMMEDIATELY || process.env.PSP_ONCE) {
                execSync("node tools/scripts/build.mjs", { stdio: "inherit" });
                if (process.env.PSP_ONCE) {
                    while (this.config.length > 0) {
                        this.config.pop();
                    }

                    for (const key in this._values) {
                        if (key in original) {
                            this._values[key] = original[key];
                        } else {
                            delete this._values[key];
                        }
                    }

                    if (
                        this._values.PACKAGE &&
                        this._values.PACKAGE.startsWith("@")
                    ) {
                        this._values.PACKAGE = this._values.PACKAGE.slice(
                            2,
                            this._values.PACKAGE.length - 1,
                        ).replace(/\|/g, ",");
                    }

                    const config = [];
                    for (const key in this._values) {
                        config.push(`${key}=${this._values[key]}`);
                    }

                    fs.writeFileSync("./.perspectiverc", config.join("\n"));
                }
            }
        }
    })(),
    {
        set: function (target, name, val) {
            target.add({
                [name]: val,
            });
        },
        get: function (target, name) {
            if (name in target._values) {
                return target._values[name];
            } else {
                return target[name];
            }
        },
    },
);

const PROMPT_DEBUG = {
    type: "confirm",
    name: "PSP_DEBUG",
    message: "Run debug build?",
    default: CONFIG["PSP_DEBUG"] || false,
};

const PROMPT_DOCKER = {
    type: "confirm",
    name: "PSP_DOCKER",
    message: "Use docker for build env?",
    default: CONFIG["PSP_DOCKER"] || false,
};

async function choose_docker() {
    const answers = await inquirer.prompt([PROMPT_DOCKER]);
    CONFIG.add(answers);
    CONFIG.write();
}

async function focus_package() {
    const choices = [
        {
            key: "r",
            name: "docs",
            value: "docs",
        },

        {
            key: "m",
            name: "metadata",
            value: "metadata",
        },
        {
            key: "y",
            name: "perspective-python",
            value: "python",
        },
        {
            key: "q",
            name: "perspective-python (pyodide)",
            value: "pyodide",
        },
        {
            key: "r",
            name: "perspective (rust)",
            value: "rust",
        },
        {
            key: "c",
            name: "@perspective-dev/server",
            value: "server",
        },
        {
            key: "p",
            name: "@perspective-dev/client",
            value: "client",
        },
        {
            key: "v",
            name: "@perspective-dev/viewer",
            value: "viewer",
        },
        {
            key: "e",
            name: "@perspective-dev/viewer-datagrid",
            value: "viewer-datagrid",
        },
        {
            key: "g",
            name: "@perspective-dev/viewer-charts",
            value: "viewer-charts",
        },
        {
            key: "i",
            name: "@perspective-dev/jupyterlab",
            value: "jupyterlab",
        },
        {
            key: "o",
            name: "@perspective-dev/viewer-openlayers",
            value: "viewer-openlayers",
        },
        {
            key: "w",
            name: "@perspective-dev/workspace",
            value: "workspace",
        },
        {
            key: "a",
            name: "@perspective-dev/react",
            value: "react",
        },
    ];
    const new_config = await inquirer.prompt([
        {
            type: "checkbox",
            name: "PACKAGE",
            message: "Focus NPM package(s)?",
            default: () => {
                if (CONFIG["PACKAGE"]) {
                    const packages = CONFIG["PACKAGE"].split(",");
                    if (CONFIG["PSP_PYODIDE"] === "1") {
                        const py = packages.indexOf("python");
                        if (py >= 0) {
                            packages[py] = "pyodide";
                        }
                    }
                    return packages;
                } else {
                    return [""];
                }
            },
            filter: (answer) => {
                if (!answer || answer.length === choices.length) {
                    return "";
                } else {
                    return answer;
                }
            },
            loop: false,
            pageSize: 20,
            choices,
        },
    ]);

    if (Array.isArray(new_config.PACKAGE)) {
        if (new_config.PACKAGE.length > 0) {
            let pyodide = new_config.PACKAGE.indexOf("pyodide");
            if (pyodide >= 0) {
                new_config.PACKAGE.splice(pyodide, 1);
                new_config.PSP_PYODIDE = 1;
                new_config.CI = 1;
                new_config.PACKAGE.push("python");
            } else {
                CONFIG.remove("PSP_PYODIDE");
                CONFIG.remove("CI");
            }

            new_config.PACKAGE = `${new_config.PACKAGE.join(",")}`;
        } else {
            new_config.PACKAGE = undefined;
        }
    }

    CONFIG.add(new_config);
    await javascript_options();
}

async function javascript_options() {
    const new_config = await inquirer.prompt([PROMPT_DEBUG, PROMPT_DOCKER]);
    CONFIG.add(new_config);
    CONFIG.write();
}

focus_package();
