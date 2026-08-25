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

import { html, options, query, readLocalJson } from "./dom.js";
import { initModalForm } from "./modal.js";

const DOCS_URL = "/perspective-docs.json";
const STORAGE_KEY = "perspective-agent-config";

interface Preset {
    name: string;
    url: string;
    headers?: Record<string, string>;
    model?: string;
    note?: string;
}

/**
 * Mirrors `@perspective-dev/viewer`'s `providers` export. Inlined rather than
 * imported so the dialog can show each provider's browser-CORS requirement in
 * help text — knowledge the presets hold but do not surface.
 */
const PRESETS: Record<string, Preset> = {
    Anthropic: {
        name: "anthropic",
        url: "https://api.anthropic.com/v1/chat/completions",
        headers: { "anthropic-dangerous-direct-browser-access": "true" },
        model: "claude-opus-5",
    },
    OpenAI: {
        name: "openai",
        url: "https://api.openai.com/v1/chat/completions",
        model: "gpt-5.2",
    },
    Gemini: {
        name: "gemini",
        url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        model: "gemini-2.5-flash",
    },
    OpenRouter: {
        name: "openrouter",
        url: "https://openrouter.ai/api/v1/chat/completions",
    },
    "LM Studio (local)": {
        name: "lmstudio",
        url: "http://localhost:1234/v1/chat/completions",
        note: "Enable CORS in LM Studio's settings.",
    },
    "Ollama (local)": {
        name: "ollama",
        url: "http://localhost:11434/v1/chat/completions",
        note: "Set OLLAMA_ORIGINS for CORS.",
    },
    "Custom (OpenAI-compatible)": { name: "custom", url: "" },
};

const ACCESS: Record<string, string[] | undefined> = {
    "Full (default)": undefined,
    "Read-only": ["read_view", "read_docs"],
};

const TEMPLATE = `<dialog class="modal">
    <form method="dialog">
        <h2>Configure Agent</h2>
        <label class="field">
            <span class="field__label">Provider</span>
            <select name="provider">${options(Object.keys(PRESETS))}</select>
        </label>
        <label class="field">
            <span class="field__label">Model</span>
            <input name="model" type="text" placeholder="provider default" />
        </label>
        <label class="field">
            <span class="field__label">API key</span>
            <input name="apiKey" type="password" placeholder="sk-…" />
        </label>
        <label class="field">
            <span class="field__label">Base URL</span>
            <input name="baseUrl" type="url" required />
        </label>
        <label class="field">
            <span class="field__label">Access</span>
            <select name="access">${options(Object.keys(ACCESS))}</select>
            <small class="field__hint">What the agent is allowed to do.</small>
        </label>
        <label class="field">
            <span class="field__label">
                Load documentation bundle (312 KB)
            </span>
            <input name="docs" type="checkbox" checked />
        </label>
        <p class="modal__note" data-role="note"></p>
        <p class="modal__note">
            Your key and settings are saved in this browser's localStorage on
            this device (“Disable” erases them), and the key is sent from the
            browser directly to the provider you choose.
        </p>
        <div class="modal__status" aria-live="polite"></div>
        <div class="modal__actions">
            <button type="button" class="btn" data-role="disable" hidden>
                Disable
            </button>
            <button type="button" class="btn" data-role="cancel">
                Cancel
            </button>
            <button type="submit" class="btn btn--primary">Enable</button>
        </div>
    </form>
</dialog>`;

interface StoredAgentConfig {
    provider: string;
    model: string;
    apiKey: string;
    baseUrl: string;
    access: string;
    docs: boolean;
}

function noteFor(preset: Preset, baseUrl: string): string {
    if (baseUrl.startsWith("http://") && location.protocol === "https:") {
        return (
            `This page is served over HTTPS, so the browser blocks requests ` +
            `to ${baseUrl} as mixed content. Local providers work when the ` +
            `docs site is run over http://localhost.`
        );
    }

    if (preset.headers) {
        return `${preset.note ?? ""} This provider requires a special browser-access header, which is sent for you.`.trim();
    }

    return preset.note ?? "";
}

/**
 * A form over the viewer's `agentConfig()` API, persisted to localStorage.
 *
 * @param viewer the `perspective-viewer` the agent is configured on.
 * @param trigger the button that opens the dialog and shows agent state.
 */
export function initAgentDialog(viewer: any, trigger: HTMLElement) {
    const dialog = html<HTMLDialogElement>(TEMPLATE);
    const provider = query<HTMLSelectElement>(dialog, "[name=provider]");
    const model = query<HTMLInputElement>(dialog, "[name=model]");
    const apiKey = query<HTMLInputElement>(dialog, "[name=apiKey]");
    const baseUrl = query<HTMLInputElement>(dialog, "[name=baseUrl]");
    const access = query<HTMLSelectElement>(dialog, "[name=access]");
    const docs = query<HTMLInputElement>(dialog, "[name=docs]");
    const note = query(dialog, "[data-role=note]");
    const disable = query<HTMLButtonElement>(dialog, "[data-role=disable]");

    const { status, submit } = initModalForm(dialog, {
        trigger,
        pending: "Configuring…",
        async submit() {
            await configure();
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({
                    provider: provider.value,
                    model: model.value,
                    apiKey: apiKey.value,
                    baseUrl: baseUrl.value,
                    access: access.value,
                    docs: docs.checked,
                } satisfies StoredAgentConfig),
            );
        },
    });

    function updateNote() {
        note.textContent = noteFor(PRESETS[provider.value], baseUrl.value);
    }

    function applyPreset() {
        const preset = PRESETS[provider.value];
        baseUrl.value = preset.url;
        model.value = preset.model ?? "";
        updateNote();
    }

    function syncTrigger(configured: boolean) {
        trigger.textContent = configured
            ? `Agent: ${provider.value}`
            : "Configure Agent";
    }

    async function configure() {
        const preset = PRESETS[provider.value];
        let bundle: unknown;
        if (docs.checked) {
            status.textContent = "Loading documentation bundle…";
            bundle = await (await fetch(DOCS_URL)).json();
        }

        viewer.agentConfig({
            name: preset.name,
            url: baseUrl.value.trim(),
            headers: preset.headers,
            apiKey: apiKey.value || undefined,
            model: model.value.trim() || undefined,
            entitlements: ACCESS[access.value],
            docs: bundle,
        });

        disable.hidden = false;
        submit.textContent = "Update";
        syncTrigger(true);
    }

    function restore(stored: StoredAgentConfig) {
        if (stored.provider in PRESETS) {
            provider.value = stored.provider;
            applyPreset();
        }

        baseUrl.value = stored.baseUrl ?? baseUrl.value;
        model.value = stored.model ?? model.value;
        apiKey.value = stored.apiKey ?? "";
        if (stored.access in ACCESS) {
            access.value = stored.access;
        }

        docs.checked = stored.docs !== false;
        updateNote();
        syncTrigger(true);

        void (async () => {
            try {
                await customElements.whenDefined("perspective-viewer");
                await configure();
                status.textContent = "";
            } catch (err) {
                syncTrigger(false);
                console.warn("Stored agent config was not re-applied:", err);
            }
        })();
    }

    provider.addEventListener("change", applyPreset);
    baseUrl.addEventListener("input", updateNote);

    disable.addEventListener("click", async () => {
        await viewer.agentReset?.();
        localStorage.removeItem(STORAGE_KEY);
        disable.hidden = true;
        submit.textContent = "Enable";
        syncTrigger(false);
        dialog.close();
    });

    viewer.addEventListener("perspective-agent-tool", (event: CustomEvent) => {
        console.log("[agent tool]", event.detail);
    });

    applyPreset();
    const stored = readLocalJson<StoredAgentConfig>(STORAGE_KEY);
    if (stored) {
        restore(stored);
    }
}
