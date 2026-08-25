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

import { createUrlSource } from "../../data/create_source.js";
import {
    type S3Config,
    type UrlStyle,
    assertReachable,
    defaultStyle,
    listObjects,
    objectUrl,
} from "../../data/s3/client.js";
import { hasWebCrypto } from "../../data/s3/sigv4.js";
import type { EngineId } from "../../data/sources.js";
import { errorText, escape, html, options, query } from "../dom.js";
import {
    type CreatedSource,
    type SourceForm,
    deriveName,
    inferFormat,
} from "./common.js";

/**
 * Provider presets PREFILL only; every field stays editable and
 * "MinIO / other" is a first-class choice rather than a fallback. "S3" here
 * means the protocol, not the AWS service.
 */
const PRESETS: Record<
    string,
    { endpoint: string; region: string; style: UrlStyle }
> = {
    AWS: { endpoint: "", region: "us-east-1", style: "virtual-hosted" },
    "Cloudflare R2": { endpoint: "", region: "auto", style: "path" },
    "Backblaze B2": { endpoint: "", region: "us-west-004", style: "path" },
    "MinIO / other S3-compatible": {
        endpoint: "http://localhost:9000",
        region: "us-east-1",
        style: "path",
    },
};

/** More than this and the presigned-URL list becomes an absurd SQL statement. */
const MAX_PRESIGNED = 100;

const TEMPLATE = `<div>
    <label class="field">
        <span class="field__label">Provider</span>
        <select name="provider">${options(Object.keys(PRESETS))}</select>
    </label>
    <label class="field">
        <span class="field__label">Endpoint</span>
        <input name="endpoint" type="text" placeholder="blank for AWS" />
        <small class="field__hint">Blank for AWS.</small>
    </label>
    <label class="field">
        <span class="field__label">Region</span>
        <input name="region" type="text" required placeholder="us-east-1" />
        <small class="field__hint">R2 uses the literal \`auto\`.</small>
    </label>
    <label class="field">
        <span class="field__label">URL style</span>
        <select name="style">${options(["path", "virtual-hosted"])}</select>
    </label>
    <label class="field">
        <span class="field__label">Bucket</span>
        <input name="bucket" type="text" required />
    </label>
    <label class="field">
        <span class="field__label">Access key ID</span>
        <input name="keyId" type="text" required />
    </label>
    <label class="field">
        <span class="field__label">Secret access key</span>
        <input name="secret" type="password" required />
    </label>
    <label class="field">
        <span class="field__label">Session token</span>
        <input
            name="token"
            type="password"
            placeholder="temporary credentials only"
        />
    </label>
    <button type="button" class="btn" data-role="connect">Connect</button>
    <div class="s3__status" aria-live="polite"></div>
    <div class="s3__browser" hidden></div>
    <label class="field">
        <span class="field__label">Table name</span>
        <input name="name" type="text" placeholder="derived from the key" />
    </label>
</div>`;

interface Selection {
    keys: string[];
    label: string;
}

function fmtSize(bytes: number): string {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let n = bytes;
    let i = 0;
    while (n >= 1024 && i < units.length - 1) {
        n /= 1024;
        i++;
    }

    return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function crumbsMarkup(bucket: string, prefix: string): string {
    let walked = "";
    const parts = prefix
        .split("/")
        .filter(Boolean)
        .map((part) => {
            walked += `${part}/`;
            return `<button type="button" class="s3__crumb"
                data-browse="${escape(walked)}">${escape(part)}</button>`;
        });

    return `<div class="s3__crumbs">
        <button type="button" class="s3__crumb" data-browse=""
            >${escape(bucket || "/")}</button>
        ${parts.join("")}
    </div>`;
}

function listMarkup(
    prefix: string,
    prefixes: string[],
    objects: { key: string; size: number }[],
): string {
    const whole = prefix
        ? `<li><button
               type="button"
               class="s3__entry s3__entry--prefix"
               data-select-prefix
           >Use this whole prefix (${escape(prefix)})</button></li>`
        : "";

    const folders = prefixes.map(
        (p) => `<li><button
            type="button"
            class="s3__entry s3__entry--folder"
            data-browse="${escape(p)}"
        >${escape(p.slice(prefix.length).replace(/\/$/, ""))}</button></li>`,
    );

    const files = objects.map(
        (object) => `<li><button
            type="button"
            class="s3__entry s3__entry--object"
            data-key="${escape(object.key)}"
        >${escape(object.key.slice(prefix.length))}  (${fmtSize(object.size)})</button></li>`,
    );

    return `<ul class="s3__list">${whole}${folders.join("")}${files.join("")}</ul>`;
}

/** A source read from an S3-protocol bucket over presigned URLs. */
export function s3Form(): SourceForm {
    const fields = html(TEMPLATE);
    const provider = query<HTMLSelectElement>(fields, "[name=provider]");
    const endpoint = query<HTMLInputElement>(fields, "[name=endpoint]");
    const region = query<HTMLInputElement>(fields, "[name=region]");
    const style = query<HTMLSelectElement>(fields, "[name=style]");
    const bucket = query<HTMLInputElement>(fields, "[name=bucket]");
    const keyId = query<HTMLInputElement>(fields, "[name=keyId]");
    const secret = query<HTMLInputElement>(fields, "[name=secret]");
    const token = query<HTMLInputElement>(fields, "[name=token]");
    const name = query<HTMLInputElement>(fields, "[name=name]");
    const status = query(fields, ".s3__status");
    const browser = query(fields, ".s3__browser");

    let config: S3Config | undefined;
    let prefix = "";
    let selection: Selection | undefined;

    function applyPreset() {
        const preset = PRESETS[provider.value];
        if (!preset) {
            return;
        }

        endpoint.value = preset.endpoint;
        region.value = preset.region;
        style.value = preset.style;
        if (
            provider.value.startsWith("MinIO") &&
            location.hostname === "localhost"
        ) {
            keyId.value ||= "perspective";
            secret.value ||= "perspective";
            bucket.value ||= "perspective";
        }
    }

    function readConfig(): S3Config {
        const ep = endpoint.value.trim() || undefined;
        assertReachable(ep);
        return {
            endpoint: ep,
            region: region.value.trim(),
            bucket: bucket.value.trim(),
            style: style.value as UrlStyle,
            credentials: {
                accessKeyId: keyId.value.trim(),
                secretAccessKey: secret.value,
                sessionToken: token.value.trim() || undefined,
            },
        };
    }

    async function browse(next: string) {
        if (!config) {
            return;
        }

        prefix = next;
        status.textContent = `Listing ${prefix || "/"}…`;
        try {
            const listing = await listObjects(config, prefix);
            browser.hidden = false;
            browser.innerHTML =
                crumbsMarkup(bucket.value.trim(), prefix) +
                listMarkup(prefix, listing.prefixes, listing.objects);

            status.textContent = "";
        } catch (err) {
            status.textContent = errorText(err);
        }
    }

    async function selectPrefix() {
        if (!config) {
            return;
        }

        status.textContent = "Enumerating prefix…";
        const listing = await listObjects(config, prefix);
        selection = {
            keys: listing.objects.map((o) => o.key),
            label: deriveName(prefix),
        };

        status.textContent = `Selected ${selection.keys.length} object(s) under ${prefix}.`;
    }

    provider.addEventListener("change", applyPreset);
    endpoint.addEventListener("input", () => {
        style.value = defaultStyle(endpoint.value.trim() || undefined);
    });

    browser.addEventListener("click", (event) => {
        const button = (event.target as HTMLElement).closest<HTMLElement>(
            "button",
        );

        if (!button) {
            return;
        }

        if (button.dataset.browse !== undefined) {
            void browse(button.dataset.browse);
        } else if (button.dataset.selectPrefix !== undefined) {
            void selectPrefix();
        } else if (button.dataset.key) {
            selection = {
                keys: [button.dataset.key],
                label: deriveName(button.dataset.key),
            };

            status.textContent = `Selected ${button.dataset.key}.`;
        }
    });

    query(fields, "[data-role=connect]").addEventListener("click", async () => {
        if (!hasWebCrypto()) {
            status.textContent =
                "WebCrypto is unavailable — signing requires a secure context (https:, or localhost).";

            return;
        }

        try {
            config = readConfig();
        } catch (err) {
            status.textContent = errorText(err);
            return;
        }

        await browse("");
    });

    applyPreset();

    return {
        render(root) {
            root.replaceChildren(...fields.children);
        },

        async create(engine: EngineId): Promise<CreatedSource> {
            if (!config) {
                throw new Error("Connect first, then choose an object.");
            }

            if (!selection || selection.keys.length === 0) {
                throw new Error("Choose an object or a prefix.");
            }

            const table = name.value.trim() || selection.label;
            if (selection.keys.length > MAX_PRESIGNED) {
                throw new Error(
                    `${selection.keys.length} objects exceeds the ` +
                        `${MAX_PRESIGNED}-object presigned-list cap. Narrow ` +
                        `the prefix, or use a DuckDB \`CREATE SECRET\` glob.`,
                );
            }

            const urls = await Promise.all(
                selection.keys.map((key) => objectUrl(config!, key)),
            );

            const format = inferFormat(selection.keys[0]) ?? "parquet";
            return createUrlSource(engine, urls, table, format);
        },
    };
}
