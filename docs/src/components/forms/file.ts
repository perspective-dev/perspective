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

import { createFileSource } from "../../data/create_source.js";
import type { EngineId } from "../../data/sources.js";
import { html, query } from "../dom.js";
import {
    type CreatedSource,
    type SourceForm,
    acceptFor,
    deriveName,
    inferFormat,
} from "./common.js";

const TEMPLATE = `<div>
    <label class="field">
        <span class="field__label">File</span>
        <input name="file" type="file" required />
        <small class="field__hint">
            Read in the browser; never uploaded anywhere.
        </small>
    </label>
    <label class="field">
        <span class="field__label">Table name</span>
        <input
            name="name"
            type="text"
            placeholder="derived from the file name"
        />
    </label>
</div>`;

/** A source read from a local file, in the browser. */
export function fileForm(): SourceForm {
    const fields = html(TEMPLATE);
    const picker = query<HTMLInputElement>(fields, "[name=file]");
    const name = query<HTMLInputElement>(fields, "[name=name]");
    picker.accept = acceptFor("perspective-server");
    picker.addEventListener("change", () => {
        const file = picker.files?.[0];
        if (file && !name.value) {
            name.placeholder = deriveName(file.name);
        }
    });

    return {
        render(root) {
            root.replaceChildren(...fields.children);
        },

        onEngineChange(engine) {
            picker.accept = acceptFor(engine);
        },

        async create(engine: EngineId): Promise<CreatedSource> {
            const file = picker.files?.[0];
            if (!file) {
                throw new Error("Choose a file first.");
            }

            const table = name.value.trim() || deriveName(file.name);
            const format = inferFormat(file.name) ?? "arrow";
            return createFileSource(engine, file, table, format);
        },
    };
}
