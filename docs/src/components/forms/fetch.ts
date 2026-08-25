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

import { createFetchSource } from "../../data/create_source.js";
import type { EngineId } from "../../data/sources.js";
import { html, options, query } from "../dom.js";
import {
    type CreatedSource,
    type Format,
    type SourceForm,
    deriveName,
    formatsFor,
    inferFormat,
    setOptions,
} from "./common.js";

const TEMPLATE = `<div>
    <label class="field">
        <span class="field__label">URL</span>
        <input
            name="url"
            type="url"
            required
            placeholder="https://example.com/data.arrow"
        />
        <small class="field__hint">Must be readable cross-origin (CORS).</small>
    </label>
    <label class="field">
        <span class="field__label">Format</span>
        <select name="format">${options([
            "auto",
            ...formatsFor("perspective-server"),
        ])}</select>
    </label>
    <label class="field">
        <span class="field__label">Table name</span>
        <input name="name" type="text" placeholder="derived from the URL" />
    </label>
</div>`;

/** A source read from a cross-origin URL by either engine. */
export function fetchForm(): SourceForm {
    const fields = html(TEMPLATE);
    const url = query<HTMLInputElement>(fields, "[name=url]");
    const format = query<HTMLSelectElement>(fields, "[name=format]");
    const name = query<HTMLInputElement>(fields, "[name=name]");

    url.addEventListener("input", () => {
        if (!name.value) {
            name.placeholder = deriveName(url.value) || "derived from the URL";
        }
    });

    return {
        render(root) {
            root.replaceChildren(...fields.children);
        },

        onEngineChange(engine) {
            setOptions(format, ["auto", ...formatsFor(engine)]);
        },

        async create(engine: EngineId): Promise<CreatedSource> {
            const href = url.value.trim();
            const chosen =
                format.value === "auto"
                    ? (inferFormat(href) ?? "arrow")
                    : (format.value as Format);

            return createFetchSource({
                kind: "fetch",
                engine,
                url: href,
                format: chosen,
                name: name.value.trim() || deriveName(href),
            });
        },
    };
}
