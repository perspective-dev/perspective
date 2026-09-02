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

import "/node_modules/@perspective-dev/viewer/dist/cdn/perspective-viewer.js";
import perspective from "/node_modules/@perspective-dev/client/dist/cdn/perspective.js";

const BasePlugin = customElements.get("perspective-viewer-plugin");

class DebugStyledPlugin extends BasePlugin {
    get_static_config() {
        return {
            name: "Debug Styled",
            select_mode: "toggle",
            config_column_names: ["Columns"],
            priority: 1,
            can_render_column_styles: true,
        };
    }

    plugin_config_schema() {
        return {
            fields: [
                {
                    kind: "Enum",
                    key: "edit_mode",
                    default: "READ_ONLY",
                    variants: [
                        { value: "EDIT", label: "Edit" },
                        { value: "READ_ONLY", label: "Read-only" },
                    ],
                },
                {
                    kind: "Group",
                    key: "legend",
                    fields: [
                        { kind: "Bool", key: "legend_on", default: false },
                        {
                            kind: "Number",
                            key: "legend_width",
                            default: 120,
                            min: 0,
                            max: 512,
                        },
                    ],
                },
            ],
        };
    }

    column_config_schema(type, _group, _column_name, current_value) {
        const fields = [];
        if (type === "integer" || type === "float") {
            fields.push({
                kind: "GradientStops",
                key: "fg_colors",
                default: "linear-gradient(to right, #ff471e 0%, #2771a8 100%)",
                discrete: true,
            });
            fields.push({
                kind: "GradientStops",
                key: "gradient",
                default: "linear-gradient(to right, #2771a8 0%, #ff471e 100%)",
            });
            fields.push({
                kind: "Color",
                key: "color",
                default: "#2771a8",
            });
            fields.push({ kind: "NumberFormat" });

            fields.push({
                kind: "Group",
                key: "fg",
                fields: [
                    { kind: "Bool", key: "fg_flag", default: false },
                    { kind: "Color", key: "fg_color", default: "#ff471e" },
                ],
            });

            fields.push({
                kind: "Group",
                key: "bg",
                fields: [{ kind: "Bool", key: "bg_flag", default: false }],
            });
        } else if (type === "date") {
            fields.push({ kind: "DatetimeFormat" });
        } else if (type === "datetime") {
            fields.push({ kind: "DatetimeFormat" });
            fields.push({
                kind: "Enum",
                key: "datetime_color_mode",
                default: "none",
                variants: [
                    { value: "none", label: "None" },
                    { value: "foreground", label: "Foreground" },
                ],
            });
        } else if (type === "string") {
            fields.push({
                kind: "Enum",
                key: "string_color_mode",
                default: "none",
                variants: [
                    { value: "none", label: "None" },
                    { value: "background", label: "Background" },
                    { value: "series", label: "Series" },
                ],
            });

            if (current_value?.string_color_mode === "background") {
                fields.push({
                    kind: "Color",
                    key: "color",
                    default: "#2771a8",
                });
            } else if (current_value?.string_color_mode === "series") {
                fields.push({
                    kind: "Palette",
                    key: "palette",
                    default:
                        "linear-gradient(to right, #2771a8, #8b86ff, #ff471e)",
                    max: 6,
                });
            }

            fields.push({ kind: "StringFormat" });
        }

        return { fields };
    }

    restore(token, columns_config) {
        this._restored_plugin_config = token;
        this._restored_columns_config = columns_config;
        this._restore_count = (this._restore_count ?? 0) + 1;
    }

    async update(view) {
        return this.draw(view);
    }

    async draw(view) {
        this._draw_count = (this._draw_count ?? 0) + 1;
        const num_rows = await view.num_rows();
        this.textContent = `${this.get_static_config().name}: ${num_rows} rows`;
    }
}

class DebugAltPlugin extends DebugStyledPlugin {
    get_static_config() {
        return {
            name: "Debug Alt",
            select_mode: "select",
            priority: 0,
            can_render_column_styles: false,
        };
    }

    plugin_config_schema() {
        return { fields: [] };
    }

    column_config_schema() {
        return { fields: [] };
    }
}

customElements.define("perspective-viewer-debug-styled", DebugStyledPlugin);
customElements.define("perspective-viewer-debug-alt", DebugAltPlugin);

const Viewer = customElements.get("perspective-viewer");
Viewer.registerPlugin("perspective-viewer-debug-styled");
Viewer.registerPlugin("perspective-viewer-debug-alt");

async function load() {
    const resp = await fetch(
        "/node_modules/@perspective-dev/test/assets/superstore.csv",
    );

    const csv = await resp.text();
    const viewer = document.querySelector("perspective-viewer");
    const worker = await perspective.worker();
    const table = worker.table(csv, {
        index: "Row ID",
        name: "load-viewer-csv",
    });

    if (viewer) {
        await viewer.load(table);
    }

    window.__TEST_WORKER__ = worker;
}

await load();
window.__TEST_PERSPECTIVE_READY__ = true;
