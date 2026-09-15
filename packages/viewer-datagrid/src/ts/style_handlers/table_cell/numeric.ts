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
import { style_cell_flash } from "./cell_flash.js";
import { format_raw } from "../../data_listener/format_cell.js";
import {
    infer_foreground_from_background,
    rgbaToRgb,
    rgbToHex,
    sampleGradientRgb,
} from "../../color_utils.js";
import {
    parse_bg_mode,
    parse_fg_mode,
    type ColorRecord,
    type DatagridModel,
    type ResolvedColumnStyle,
} from "../../types.js";
import type { ColumnType } from "@perspective-dev/client";

const MAX_BAR_WIDTH_PCT = 1;

interface CellMetaWithExtras {
    _is_hidden_by_aggregate_depth?: boolean;
    user?: number;
    dy: number;
    column_header?: string[];
}

/**
 * Write the value-derived bar presentation onto the `<td>` itself: bar
 * length/anchor as the `--psp-bar-size`/`--psp-bar-anchor` custom properties
 * (consumed by the `psp-color-mode-*` `background-image` rules) and the
 * formatted label as the `data-psp-label` attribute (consumed via
 * `content: attr(...)` by the `psp-color-mode-label-bar` pseudo-elements).
 * This runs only at commit time against the mounted table - the
 * `DataListener` returns `""` for these cells and holds no DOM references,
 * so a staged `predraw()` can never repaint mounted cells (the panel-resize
 * row-shift corruption).
 */
function style_cell_bar(
    td: HTMLElement,
    plugin: ResolvedColumnStyle,
    type: ColumnType | undefined,
    user: number | null | undefined,
    label: boolean,
): void {
    if (user === null || user === undefined) {
        td.style.removeProperty("--psp-bar-size");
        td.removeAttribute("data-psp-label");
        return;
    }

    const a = Math.max(
        0,
        Math.min(
            MAX_BAR_WIDTH_PCT,
            Math.abs(user / plugin.fg_gradient!) * MAX_BAR_WIDTH_PCT,
        ),
    );

    const pct = Number.isFinite(a) ? (a * 100).toFixed(2) : "100";
    td.style.setProperty("--psp-bar-size", `${pct}%`);
    td.style.setProperty("--psp-bar-anchor", user < 0 ? "100%" : "0%");
    if (label) {
        const formatter = format_raw(type ?? "float", plugin);

        td.setAttribute(
            "data-psp-label",
            formatter ? formatter.format(user) : String(user),
        );
    } else {
        td.removeAttribute("data-psp-label");
    }
}

function neutral_record(model: DatagridModel): ColorRecord {
    return [
        "",
        model._plugin_background[0],
        model._plugin_background[1],
        model._plugin_background[2],
        "",
        "",
        "",
    ];
}

export function cell_style_numeric(
    model: DatagridModel,
    plugin: ResolvedColumnStyle | undefined,
    type: ColumnType | undefined,
    td: HTMLElement,
    metadata: CellMetaWithExtras,
    is_settings_open: boolean,
): void {
    const fg_mode = parse_fg_mode("float", plugin?.fg_mode) ?? "color";
    const bg_mode = parse_bg_mode("float", plugin?.bg_mode) ?? "disabled";
    const is_positive = (metadata.user ?? 0) > 0;
    const is_negative = (metadata.user ?? 0) < 0;
    const pos_bg_color = plugin?.pos_bg_color ?? model._pos_bg_color;
    const neg_bg_color = plugin?.neg_bg_color ?? model._neg_bg_color;
    const bg_tuple: ColorRecord = is_positive
        ? pos_bg_color
        : is_negative
          ? neg_bg_color
          : neutral_record(model);

    td.style.position = "";
    if (metadata._is_hidden_by_aggregate_depth) {
        td.style.animation = "";
        td.style.backgroundColor = "";
    } else {
        switch (bg_mode) {
            case "color":
                td.style.animation = "";
                td.style.backgroundColor = bg_tuple[0];
                break;
            case "gradient": {
                const stops = plugin?.bg_stops ?? model._default_bg_color_stops;
                const t =
                    0.5 +
                    0.5 *
                        Math.max(
                            -1,
                            Math.min(
                                1,
                                (metadata.user ?? 0) /
                                    (plugin?.bg_gradient ?? 1),
                            ),
                        );

                const sample = sampleGradientRgb(stops, t);
                td.style.animation = "";
                td.style.color = infer_foreground_from_background(sample);
                td.style.backgroundColor = rgbToHex(sample);
                break;
            }

            case "pulse":
                style_cell_flash(
                    model,
                    metadata as any,
                    td,
                    pos_bg_color,
                    neg_bg_color,
                    is_settings_open,
                );
                td.style.backgroundColor = "";
                break;
            case "disabled":
                td.style.animation = "";
                td.style.backgroundColor = "";
                break;
        }
    }

    const pos_fg_color = plugin?.pos_fg_color ?? model._pos_fg_color;
    const neg_fg_color = plugin?.neg_fg_color ?? model._neg_fg_color;
    const fg_tuple: ColorRecord = is_positive
        ? pos_fg_color
        : is_negative
          ? neg_fg_color
          : neutral_record(model);

    const [hex, , , , gradhex] = fg_tuple;
    if (metadata._is_hidden_by_aggregate_depth) {
        td.style.backgroundColor = "";
        td.style.color = "";
        td.style.removeProperty("--psp-bar-size");
        td.removeAttribute("data-psp-label");
        return;
    }

    switch (fg_mode) {
        case "disabled":
            if (bg_mode === "color") {
                const source = model._plugin_background as [
                    number,
                    number,
                    number,
                ];

                td.style.color = infer_foreground_from_background(
                    rgbaToRgb(
                        [bg_tuple[1], bg_tuple[2], bg_tuple[3], 1],
                        source,
                    ),
                );
            } else if (bg_mode !== "gradient") {
                td.style.color = "";
            }

            break;
        case "bar":
        case "label-bar":
            td.style.color = "";
            td.style.setProperty("--psp-label-bar-color", gradhex);
            td.style.setProperty("--psp-label-bar-bg", hex);
            style_cell_bar(
                td,
                plugin!,
                type,
                metadata.user,
                fg_mode === "label-bar",
            );

            break;
        case "color":
            td.style.color = hex;
            break;
    }
}
