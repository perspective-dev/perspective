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

import type * as wasm_module from "../../../dist/wasm/perspective-viewer.js";

export type {
    DateFormatConfig,
    DateFormatModifiers,
    FormattedColumn,
    Formatter,
    NumberFormatConfig,
} from "../../../dist/wasm/perspective-viewer.js";

/**
 * The members of `plugin_utils` implemented in the viewer's WebAssembly,
 * which a `Worker` reaches as the exports of the viewer's wasm module.
 */
export type NativeUtils = Pick<
    typeof wasm_module,
    | "formatter"
    | "source_column"
    | "parse_css_color"
    | "parse_css_gradient"
    | "parse_css_palette"
    | "css_gradient"
    | "css_palette"
    | "has_date_format_shape"
    | "date_format_modifiers"
>;

/** The names of the members of {@link NativeUtils}. */
const NATIVE_UTILS = [
    "formatter",
    "source_column",
    "parse_css_color",
    "parse_css_gradient",
    "parse_css_palette",
    "css_gradient",
    "css_palette",
    "has_date_format_shape",
    "date_format_modifiers",
] as const satisfies readonly (keyof NativeUtils)[];

let NATIVE: NativeUtils | undefined;

/** The members of {@link NativeUtils} in `module`, the viewer's wasm module. */
export function pick_native(module: NativeUtils): NativeUtils {
    return Object.fromEntries(
        NATIVE_UTILS.map((name) => [name, module[name]]),
    ) as NativeUtils;
}

export function bind_native(native: NativeUtils): void {
    NATIVE = native;
}

export function native(): NativeUtils {
    return NATIVE!;
}
