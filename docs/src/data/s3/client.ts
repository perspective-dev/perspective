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

import { type Credentials, presign } from "./sigv4.js";

export type UrlStyle = "virtual-hosted" | "path";

export interface S3Config {
    /** Blank for AWS; otherwise the S3-compatible endpoint origin. */
    endpoint?: string;
    region: string;
    bucket: string;
    style: UrlStyle;
    credentials: Credentials;
}

export interface S3Object {
    key: string;
    size: number;
    lastModified: string;
}

export interface S3Listing {
    /** `/`-delimited common prefixes, i.e. folders. */
    prefixes: string[];
    objects: S3Object[];
}

/**
 * Throw unless an `https:` page can reach `endpoint` at all — a plain-HTTP
 * endpoint is blocked as mixed content, which no later code can recover from.
 *
 * @param endpoint the S3-compatible endpoint, or undefined for AWS.
 */
export function assertReachable(endpoint: string | undefined): void {
    if (!endpoint) {
        return;
    }

    let parsed: URL;
    try {
        parsed = new URL(endpoint);
    } catch {
        throw new Error(`Endpoint is not a valid URL: ${endpoint}`);
    }

    if (parsed.protocol === "http:" && location.protocol === "https:") {
        throw new Error(
            `This page is served over HTTPS, so the browser blocks requests ` +
                `to the plain-HTTP endpoint ${parsed.origin} as mixed ` +
                `content. The endpoint needs TLS, or a TLS-terminating proxy.`,
        );
    }
}

/**
 * The conventional URL style: AWS is virtual-hosted, everything else is path.
 *
 * @param endpoint the S3-compatible endpoint, or undefined for AWS.
 */
export function defaultStyle(endpoint: string | undefined): UrlStyle {
    return endpoint ? "path" : "virtual-hosted";
}

function serviceOrigin(config: S3Config): string {
    if (config.endpoint) {
        return new URL(config.endpoint).origin;
    }

    return `https://s3.${config.region}.amazonaws.com`;
}

function bucketUrl(config: S3Config, key: string): URL {
    const encodedKey = key ? `/${key}` : "";
    if (config.style === "virtual-hosted" && !config.endpoint) {
        return new URL(
            `https://${config.bucket}.s3.${config.region}.amazonaws.com${encodedKey}`,
        );
    }

    return new URL(`${serviceOrigin(config)}/${config.bucket}${encodedKey}`);
}

/**
 * A presigned GET URL for one object — the whole download path.
 *
 * @param config the bucket and credentials to sign with.
 * @param key the object key.
 * @param expires the URL's lifetime in seconds.
 */
export function objectUrl(
    config: S3Config,
    key: string,
    expires?: number,
): Promise<string> {
    return presign(
        {
            method: "GET",
            url: bucketUrl(config, key),
            region: config.region,
            expires,
        },
        config.credentials,
    );
}

async function getXml(url: string): Promise<Document> {
    const response = await fetch(url);
    const text = await response.text();
    const doc = new DOMParser().parseFromString(text, "text/xml");
    if (!response.ok) {
        const message = first(doc, "Message") ?? response.statusText;
        throw new Error(`S3 error ${response.status}: ${message}`);
    }

    return doc;
}

function first(scope: Document | Element, tag: string): string | undefined {
    return scope.getElementsByTagName(tag)[0]?.textContent ?? undefined;
}

function all(scope: Document | Element, tag: string): Element[] {
    return Array.from(scope.getElementsByTagName(tag));
}

function parseListing(doc: Document): S3Listing {
    const prefixes = all(doc, "CommonPrefixes")
        .map((node) => first(node, "Prefix"))
        .filter((p): p is string => !!p);

    const objects = all(doc, "Contents").map((node) => ({
        key: first(node, "Key") ?? "",
        size: Number(first(node, "Size") ?? 0),
        lastModified: first(node, "LastModified") ?? "",
    }));

    return { prefixes, objects };
}

const LIST_VERSION = new WeakMap<S3Config, 1 | 2>();

/**
 * One page-merged listing of a prefix, via `ListObjectsV2` with a V1 fallback
 * remembered per config so the probe happens once.
 *
 * @param config the bucket and credentials to sign with.
 * @param prefix the `/`-delimited prefix to list.
 */
export async function listObjects(
    config: S3Config,
    prefix: string,
): Promise<S3Listing> {
    assertReachable(config.endpoint);
    const version = LIST_VERSION.get(config) ?? 2;
    try {
        const listing = await listPaged(config, prefix, version);
        LIST_VERSION.set(config, version);
        return listing;
    } catch (err) {
        if (version === 2) {
            LIST_VERSION.set(config, 1);
            return listPaged(config, prefix, 1);
        }

        throw err;
    }
}

async function listPaged(
    config: S3Config,
    prefix: string,
    version: 1 | 2,
): Promise<S3Listing> {
    const merged: S3Listing = { prefixes: [], objects: [] };
    let token: string | undefined;
    do {
        const url = bucketUrl(config, "");
        url.searchParams.set("delimiter", "/");
        url.searchParams.set("max-keys", "1000");
        if (prefix) {
            url.searchParams.set("prefix", prefix);
        }

        if (version === 2) {
            url.searchParams.set("list-type", "2");
            if (token) {
                url.searchParams.set("continuation-token", token);
            }
        } else if (token) {
            url.searchParams.set("marker", token);
        }

        const doc = await getXml(
            await presign(
                {
                    method: "GET",
                    url,
                    region: config.region,
                },
                config.credentials,
            ),
        );

        const page = parseListing(doc);
        merged.prefixes.push(...page.prefixes);
        merged.objects.push(...page.objects);

        const truncated = first(doc, "IsTruncated") === "true";
        if (!truncated) {
            token = undefined;
        } else if (version === 2) {
            token = first(doc, "NextContinuationToken");
        } else {
            token =
                first(doc, "NextMarker") ??
                page.objects[page.objects.length - 1]?.key;
        }
    } while (token);

    return merged;
}
