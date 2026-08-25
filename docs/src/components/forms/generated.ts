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

import { createSource } from "../../data/create_source.js";
import { type ParamSpec, GENERATORS } from "../../data/projects/generators.js";
import type { EngineId } from "../../data/sources.js";
import { escape, html, options, query } from "../dom.js";
import type { CreatedSource, SourceForm } from "./common.js";

const KEYS = Object.keys(GENERATORS);

const TEMPLATE = `<div>
    <label class="field">
        <span class="field__label">Generator</span>
        <select name="generator">${options(
            KEYS.map((key) => GENERATORS[key].label),
        )}</select>
    </label>
    <p class="modal__note" data-role="description"></p>
    <div data-role="params"></div>
    <label class="field">
        <span class="field__label">Table name</span>
        <input
            name="name"
            type="text"
            placeholder="derived from the generator"
        />
    </label>
</div>`;

function paramMarkup(param: ParamSpec, value: number): string {
    const bounds = [
        param.min !== undefined ? `min="${param.min}"` : "",
        param.max !== undefined ? `max="${param.max}"` : "",
        `step="${param.step ?? 1}"`,
    ].join(" ");

    return `<label class="field">
        <span class="field__label">${escape(param.label)}</span>
        <input
            name="${escape(param.key)}"
            type="number"
            required
            value="${value}"
            ${bounds}
        />
        ${param.hint ? `<small class="field__hint">${escape(param.hint)}</small>` : ""}
    </label>`;
}

/** A source computed in the browser from a `GENERATORS` entry. */
export function generatedForm(): SourceForm {
    const fields = html(TEMPLATE);
    const generator = query<HTMLSelectElement>(fields, "[name=generator]");
    const description = query(fields, "[data-role=description]");
    const params = query(fields, "[data-role=params]");
    const name = query<HTMLInputElement>(fields, "[name=name]");

    function currentKey(): string {
        return KEYS[generator.selectedIndex] ?? KEYS[0];
    }

    function renderParams() {
        const spec = GENERATORS[currentKey()];
        description.textContent = spec.description;
        params.innerHTML = spec.params
            .map((param) =>
                paramMarkup(param, Number(spec.defaults[param.key] ?? 0)),
            )
            .join("");

        name.placeholder = currentKey();
    }

    generator.addEventListener("change", renderParams);
    renderParams();

    return {
        render(root) {
            root.replaceChildren(...fields.children);
        },

        async create(_engine: EngineId): Promise<CreatedSource> {
            const key = currentKey();
            const values: Record<string, number> = {};
            for (const input of params.querySelectorAll("input")) {
                const value = Number(input.value);
                if (!Number.isFinite(value)) {
                    throw new Error(`"${input.name}" must be a number.`);
                }

                values[input.name] = value;
            }

            return createSource({
                kind: "generated",
                generator: key,
                name: name.value.trim() || key,
                params: values,
            });
        },
    };
}
