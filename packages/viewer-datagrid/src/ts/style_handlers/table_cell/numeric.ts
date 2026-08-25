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
    rgbaToRgb,
    infer_foreground_from_background,
} from "../../color_utils.js";
import type { DatagridModel, ColumnConfig, ColorRecord } from "../../types.js";
import type { ColumnType } from "@perspective-dev/client";

const MAX_BAR_WIDTH_PCT = 1;

interface CellMetaWithExtras {
    _is_hidden_by_aggregate_depth?: boolean;
    user?: number;
    dy: number;
    column_header?: string[];
}

interface PluginWithColors
    extends Omit<
        ColumnConfig,
        "pos_fg_color" | "neg_fg_color" | "pos_bg_color" | "neg_bg_color"
    > {
    pos_bg_color?: ColorRecord;
    neg_bg_color?: ColorRecord;
    pos_fg_color?: ColorRecord;
    neg_fg_color?: ColorRecord;
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
    plugin: PluginWithColors,
    type: ColumnType | undefined,
    user: number | null | undefined,
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
    if (plugin.number_fg_mode === "label-bar") {
        const formatter = format_raw(
            type ?? "float",
            plugin as unknown as ColumnConfig,
        );

        td.setAttribute(
            "data-psp-label",
            formatter ? formatter.format(user) : String(user),
        );
    } else {
        td.removeAttribute("data-psp-label");
    }
}

export function cell_style_numeric(
    model: DatagridModel,
    plugin: PluginWithColors | undefined,
    type: ColumnType | undefined,
    td: HTMLElement,
    metadata: CellMetaWithExtras,
    is_settings_open: boolean,
): void {
    const is_positive = (metadata.user ?? 0) > 0;
    const is_negative = (metadata.user ?? 0) < 0;

    let pos_bg_color: ColorRecord;
    if (plugin?.pos_bg_color !== undefined) {
        pos_bg_color = plugin.pos_bg_color;
    } else {
        pos_bg_color = model._pos_bg_color;
    }

    let neg_bg_color: ColorRecord;
    if (plugin?.neg_bg_color !== undefined) {
        neg_bg_color = plugin.neg_bg_color;
    } else {
        neg_bg_color = model._neg_bg_color;
    }

    const bg_tuple: ColorRecord = is_positive
        ? pos_bg_color
        : is_negative
          ? neg_bg_color
          : [
                "",
                model._plugin_background[0],
                model._plugin_background[1],
                model._plugin_background[2],
                "",
                "",
                "",
            ];

    {
        const [hex, r, g, b] = bg_tuple;

        td.style.position = "";
        if (metadata._is_hidden_by_aggregate_depth) {
            td.style.animation = "";
            td.style.backgroundColor = "";
        } else if (plugin?.number_bg_mode === "color") {
            td.style.animation = "";
            td.style.backgroundColor = hex;
        } else if (plugin?.number_bg_mode === "gradient") {
            const a = Math.max(
                0,
                Math.min(
                    1,
                    Math.abs((metadata.user ?? 0) / (plugin.bg_gradient ?? 1)),
                ),
            );
            const source = model._plugin_background as [number, number, number];
            const foreground = infer_foreground_from_background(
                rgbaToRgb([r, g, b, a], source),
            );

            td.style.animation = "";
            td.style.color = foreground;
            td.style.backgroundColor = `rgba(${r},${g},${b},${a})`;
        } else if (plugin?.number_bg_mode === "pulse") {
            style_cell_flash(
                model,
                metadata as any,
                td,
                pos_bg_color,
                neg_bg_color,
                is_settings_open,
            );
            td.style.backgroundColor = "";
        } else if (
            plugin?.number_bg_mode === "disabled" ||
            !plugin?.number_bg_mode
        ) {
            td.style.animation = "";
            td.style.backgroundColor = "";
        } else {
            td.style.animation = "";
            td.style.backgroundColor = "";
        }
    }

    let pos_fg_color: ColorRecord;
    if (plugin?.pos_fg_color !== undefined) {
        pos_fg_color = plugin.pos_fg_color;
    } else {
        pos_fg_color = model._pos_fg_color;
    }

    let neg_fg_color: ColorRecord;
    if (plugin?.neg_fg_color !== undefined) {
        neg_fg_color = plugin.neg_fg_color;
    } else {
        neg_fg_color = model._neg_fg_color;
    }

    const fg_tuple: ColorRecord = is_positive
        ? pos_fg_color
        : is_negative
          ? neg_fg_color
          : [
                "",
                model._plugin_background[0],
                model._plugin_background[1],
                model._plugin_background[2],
                "",
                "",
                "",
            ];

    const [hex, , , , gradhex] = fg_tuple;

    if (metadata._is_hidden_by_aggregate_depth) {
        td.style.backgroundColor = "";
        td.style.color = "";
        td.style.removeProperty("--psp-bar-size");
        td.removeAttribute("data-psp-label");
    } else if (plugin?.number_fg_mode === "disabled") {
        if (plugin?.number_bg_mode === "color") {
            const source = model._plugin_background as [number, number, number];
            const foreground = infer_foreground_from_background(
                rgbaToRgb([bg_tuple[1], bg_tuple[2], bg_tuple[3], 1], source),
            );
            td.style.color = foreground;
        } else if (plugin?.number_bg_mode === "gradient") {
            // Color already set above
        } else {
            td.style.color = "";
        }
    } else if (
        plugin?.number_fg_mode === "bar" ||
        plugin?.number_fg_mode === "label-bar"
    ) {
        td.style.color = "";
        td.style.setProperty("--psp-label-bar-color", gradhex);
        td.style.setProperty("--psp-label-bar-bg", hex);
        style_cell_bar(td, plugin, type, metadata.user);
    } else if (plugin?.number_fg_mode === "color" || !plugin?.number_fg_mode) {
        td.style.color = hex;
    }
}
