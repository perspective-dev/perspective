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
import inquirer from "inquirer";
import fs from "fs";
import * as dotenv from "dotenv";

const CONFIG = new Proxy(
    new (class {
        constructor() {
            this.config = [];
            this._values =
                dotenv.config({
                    path: "./.perspectiverc",
                }).parsed || {};
            if (this._values.PACKAGE && this._values.PACKAGE.startsWith("@")) {
                this._values.PACKAGE = this._values.PACKAGE.slice(
                    2,
                    this._values.PACKAGE.length - 1
                ).replace(/\|/g, ",");
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
            if (process.env.PSP_BUILD_IMMEDIATELY) {
                sh`node tools/perspective-scripts/build.mjs`.runSync();
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
    }
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
    const new_config = await inquirer.prompt([
        {
            type: "checkbox",
            name: "PACKAGE",
            message: "Focus NPM package(s)?",
            default: () => {
                if (CONFIG["PACKAGE"]) {
                    return CONFIG["PACKAGE"].split(",");
                } else {
                    return [""];
                }
            },
            filter: (answer) => {
                if (!answer || answer.length === 9) {
                    return "";
                } else {
                    return answer;
                }
            },
            loop: false,
            pageSize: 12,
            choices: [
                {
                    key: "c",
                    name: "perspective-cpp",
                    value: "perspective-cpp",
                },
                {
                    key: "p",
                    name: "perspective",
                    value: "perspective",
                },
                {
                    key: "y",
                    name: "perspective-python",
                    value: "perspective-python",
                },
                {
                    key: "v",
                    name: "perspective-viewer",
                    value: "perspective-viewer",
                },
                {
                    key: "e",
                    name: "perspective-viewer-datagrid",
                    value: "perspective-viewer-datagrid",
                },
                {
                    key: "d",
                    name: "perspective-viewer-d3fc",
                    value: "perspective-viewer-d3fc",
                },
                {
                    key: "i",
                    name: "perspective-jupyterlab",
                    value: "perspective-jupyterlab",
                },
                {
                    key: "m",
                    name: "perspective-viewer-openlayers",
                    value: "perspective-viewer-openlayers",
                },
                {
                    key: "w",
                    name: "perspective-workspace",
                    value: "perspective-workspace",
                },
                {
                    key: "l",
                    name: "perspective-cli",
                    value: "perspective-cli",
                },
            ],
        },
    ]);

    if (Array.isArray(new_config.PACKAGE)) {
        if (new_config.PACKAGE.length > 0) {
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
