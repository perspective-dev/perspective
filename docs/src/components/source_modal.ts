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

import { ENGINE_LABELS, engine as getEngine } from "../data/engines.js";
import {
    type EngineId,
    type SourceKind,
    addSource,
    nextSourceId,
} from "../data/sources.js";
import { html, options, query } from "./dom.js";
import { initModalForm } from "./modal.js";
import type { CreatedSource, SourceForm } from "./forms/common.js";
import { fetchForm } from "./forms/fetch.js";
import { fileForm } from "./forms/file.js";
import { generatedForm } from "./forms/generated.js";
import { s3Form } from "./forms/s3.js";

/** The modal's kinds — `sql` comes from the SQL drawer, `eval` from the corpus. */
type ModalKind = Exclude<SourceKind, "sql" | "eval">;

const KIND_LABELS: Record<ModalKind, string> = {
    fetch: "Fetch",
    file: "File",
    s3: "S3",
    generated: "Generated",
};

/**
 * Kinds whose data is built through the client API. DuckDB's virtual server
 * has no `makeTable`, so there is no engine to choose — the select is
 * disabled rather than silently ignored.
 */
const ENGINE_FIXED: Partial<Record<ModalKind, EngineId>> = {
    generated: "perspective-server",
};

const TEMPLATE = `<dialog id="source_modal" class="modal">
    <form method="dialog">
        <h2>Create Data Source</h2>
        <div class="modal__selects">
            <label class="field">
                <span class="field__label">Source</span>
                <select name="kind">${options(KIND_LABELS)}</select>
            </label>
            <label class="field">
                <span class="field__label">Engine</span>
                <select name="engine">${options(ENGINE_LABELS)}</select>
            </label>
        </div>
        <div class="modal__body"></div>
        <div class="modal__status" aria-live="polite"></div>
        <div class="modal__actions">
            <button type="button" class="btn" data-role="cancel">
                Cancel
            </button>
            <button type="submit" class="btn btn--primary">Create</button>
        </div>
    </form>
</dialog>`;

/**
 * The "Create Data Source" modal, one fieldset per source kind.
 *
 * @param viewer the `perspective-viewer` a created source is opened into.
 * @param trigger the button that opens the modal.
 */
export function initSourceModal(viewer: any, trigger: HTMLElement) {
    const dialog = html<HTMLDialogElement>(TEMPLATE);
    const kindSelect = query<HTMLSelectElement>(dialog, "[name=kind]");
    const engineSelect = query<HTMLSelectElement>(dialog, "[name=engine]");
    const body = query(dialog, ".modal__body");
    const cancel = query<HTMLButtonElement>(dialog, "[data-role=cancel]");

    const forms: Record<ModalKind, SourceForm> = {
        fetch: fetchForm(),
        file: fileForm(),
        s3: s3Form(),
        generated: generatedForm(),
    };

    const fieldsets: Record<ModalKind, HTMLFieldSetElement> = {} as any;
    for (const kind of Object.keys(forms) as ModalKind[]) {
        const fieldset = html<HTMLFieldSetElement>(
            `<fieldset class="modal__fieldset"></fieldset>`,
        );

        forms[kind].render(fieldset);
        fieldsets[kind] = fieldset;
        body.appendChild(fieldset);
    }

    function syncFieldsets() {
        const kind = kindSelect.value as ModalKind;
        for (const key of Object.keys(fieldsets) as ModalKind[]) {
            const active = key === kind;
            fieldsets[key].hidden = !active;
            fieldsets[key].disabled = !active;
        }

        const fixed = ENGINE_FIXED[kind];
        engineSelect.disabled = fixed !== undefined;
        if (fixed) {
            engineSelect.value = fixed;
        }
    }

    async function discard(engineId: EngineId, table: string) {
        try {
            const engine = await getEngine(engineId);
            await engine.drop(table.replace(/^memory\./, ""));
        } catch {
            return;
        }
    }

    initModalForm(dialog, {
        trigger,
        pending: "Connecting…",
        busy(busy) {
            cancel.disabled = busy;
            kindSelect.disabled = busy;
            engineSelect.disabled = busy;
        },

        async submit(status) {
            const kind = kindSelect.value as ModalKind;
            const engineId = engineSelect.value as EngineId;
            let created: CreatedSource | undefined;
            try {
                created = await forms[kind].create(engineId);
                status.textContent = "Creating panel…";
                await viewer.addPanel({
                    table: created.table,
                    title: created.label,
                    ...(created.panel ?? {}),
                });

                addSource({
                    id: nextSourceId(),
                    engine: engineId,
                    table: created.table,
                    label: created.label,
                    kind,
                });
            } catch (err) {
                if (created) {
                    await discard(engineId, created.table);
                }

                throw err;
            }
        },
    });

    kindSelect.addEventListener("change", syncFieldsets);
    engineSelect.addEventListener("change", () => {
        for (const source of Object.values(forms)) {
            source.onEngineChange?.(engineSelect.value as EngineId);
        }
    });

    syncFieldsets();
}
