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

/**
 * Escape text for interpolation into an HTML template literal.
 *
 * @param text arbitrary text, including untrusted cell and column values.
 */
export function escape(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/**
 * Parse a markup fragment into its single root element.
 *
 * @param markup HTML with exactly one root element.
 */
export function html<T extends Element = HTMLElement>(markup: string): T {
    const template = document.createElement("template");
    template.innerHTML = markup.trim();
    return template.content.firstElementChild as T;
}

/**
 * The one element matching `selector`, or throw.
 *
 * @param root the element or fragment to search.
 * @param selector a CSS selector.
 */
export function query<T extends Element = HTMLElement>(
    root: ParentNode,
    selector: string,
): T {
    const found = root.querySelector<T>(selector);
    if (!found) {
        throw new Error(`No element matches "${selector}"`);
    }

    return found;
}

/**
 * `<option>` markup for a `<select>`.
 *
 * @param values the option values, or a value-to-label record.
 */
export function options(
    values: readonly string[] | Record<string, string>,
): string {
    const entries: [string, string][] = Array.isArray(values)
        ? values.map((value) => [value, value])
        : Object.entries(values);

    return entries
        .map(
            ([value, label]) =>
                `<option value="${escape(value)}">${escape(label)}</option>`,
        )
        .join("");
}

/**
 * The displayable message for a thrown value.
 *
 * @param err anything `catch` can bind.
 */
export function errorText(err: unknown): string {
    return String(err instanceof Error ? err.message : err);
}

/**
 * A JSON value from `localStorage`, or `undefined` when the key is absent or
 * holds unparseable text. Callers still validate the shape.
 *
 * @param key the `localStorage` key.
 */
export function readLocalJson<T>(key: string): T | undefined {
    try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : undefined;
    } catch {
        return undefined;
    }
}
