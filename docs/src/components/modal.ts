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

import { errorText, query } from "./dom.js";

export interface ModalFormHandles {
    /** The `.modal__status` line, for progress text outside the submit flow. */
    status: HTMLElement;

    /** The submit button, for relabeling. */
    submit: HTMLButtonElement;
}

export interface ModalFormOptions {
    /** The button that opens the dialog. */
    trigger: HTMLElement;

    /** Status text shown while `submit` runs. */
    pending: string;

    /** Extra enable/disable state beyond the submit button. */
    busy?(busy: boolean): void;

    /**
     * The dialog's work. A resolve closes the dialog; a throw keeps it open
     * with the error's `errorText` in the status line.
     *
     * @param status the status line, for mid-flight progress updates.
     */
    submit(status: HTMLElement): Promise<void>;
}

/**
 * The scaffolding every form modal repeats: append the dialog to `<body>`,
 * open it from `trigger` with a clean status line, close it from the Cancel
 * button, and run `submit` behind validity, busy state and status ceremony.
 *
 * @param dialog a `<dialog>` containing a `form`, a `.modal__status` line, a
 * `[data-role=cancel]` button and a `[type=submit]` button.
 * @param opts the trigger and submit behavior.
 */
export function initModalForm(
    dialog: HTMLDialogElement,
    opts: ModalFormOptions,
): ModalFormHandles {
    const form = query<HTMLFormElement>(dialog, "form");
    const status = query(dialog, ".modal__status");
    const submit = query<HTMLButtonElement>(dialog, "[type=submit]");
    document.body.appendChild(dialog);

    query(dialog, "[data-role=cancel]").addEventListener("click", () =>
        dialog.close(),
    );

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!form.reportValidity()) {
            return;
        }

        submit.disabled = true;
        opts.busy?.(true);
        status.textContent = opts.pending;
        try {
            await opts.submit(status);
            status.textContent = "";
            dialog.close();
        } catch (err) {
            status.textContent = errorText(err);
        } finally {
            submit.disabled = false;
            opts.busy?.(false);
        }
    });

    opts.trigger.addEventListener("click", () => {
        status.textContent = "";
        dialog.showModal();
    });

    return { status, submit };
}
