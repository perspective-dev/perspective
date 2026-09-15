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
import { CellMetadata } from "regular-table/dist/esm/types.js";
import {
    rgbaToRgb,
    infer_foreground_from_background,
    type RGB,
} from "../../color_utils.js";
import {
    parse_bg_mode,
    parse_fg_mode,
    type DatagridModel,
    type ResolvedColumnStyle,
} from "../../types.js";

/** Apply a datetime column's foreground and background modes independently. */
export function cell_style_datetime(
    model: DatagridModel,
    plugin: ResolvedColumnStyle | undefined,
    td: HTMLElement,
    metadata: CellMetadata,
): void {
    const fg_mode = parse_fg_mode("datetime", plugin?.fg_mode) ?? "disabled";
    const bg_mode = parse_bg_mode("datetime", plugin?.bg_mode) ?? "disabled";
    let color = "";
    let background = "";
    if (
        // @ts-ignore
        !metadata._is_hidden_by_aggregate_depth &&
        metadata.user !== null
    ) {
        if (bg_mode === "color") {
            const [hex, r, g, b] = plugin?.bg_color ?? model._color;
            background = hex;
            if (fg_mode !== "color") {
                const source = model._plugin_background as RGB;
                color = infer_foreground_from_background(
                    rgbaToRgb([r, g, b, 1], source),
                );
            }
        }

        if (fg_mode === "color") {
            color = (plugin?.fg_color ?? model._color)[0];
        }
    }

    td.style.color = color;
    td.style.backgroundColor = background;
}
