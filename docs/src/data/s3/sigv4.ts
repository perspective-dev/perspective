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

export interface Credentials {
    accessKeyId: string;
    secretAccessKey: string;

    /** Temporary credentials only; signed as `X-Amz-Security-Token`. */
    sessionToken?: string;
}

export interface SignTarget {
    method: "GET" | "HEAD";

    /** Host, path and any operation query parameters, already assembled. */
    url: URL;

    /**
     * The credential-scope region. NOT an enum: R2 requires the literal
     * `auto`, MinIO conventionally wants `us-east-1` wherever it runs, Ceph
     * deployments often use `default`.
     */
    region: string;

    expires?: number;
}

const ALGORITHM = "AWS4-HMAC-SHA256";

/**
 * Percent-encode per RFC 3986, which `encodeURIComponent` alone is not —
 * nothing in this module may call that directly.
 *
 * @param value the component to encode.
 */
function rfc3986(value: string): string {
    return encodeURIComponent(value).replace(
        /[!'()*]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
    );
}

/**
 * The canonical URI, encoded per segment — S3 encodes the path ONCE and does
 * not normalize `.` or `..`, unlike every other AWS service.
 *
 * @param pathname the URL's path.
 */
function canonicalUri(pathname: string): string {
    if (pathname === "" || pathname === "/") {
        return "/";
    }

    return pathname.split("/").map(rfc3986).join("/");
}

/**
 * The canonical query string, sorted by ENCODED name then encoded value —
 * sorting raw names disagrees on exactly the `X-Amz-*` pairs that matter.
 *
 * @param params the query parameters to sign.
 */
function canonicalQuery(params: [string, string][]): string {
    return params
        .map(([k, v]): [string, string] => [rfc3986(k), rfc3986(v)])
        .sort(([ak, av], [bk, bv]) =>
            ak < bk ? -1 : ak > bk ? 1 : av < bv ? -1 : av > bv ? 1 : 0,
        )
        .map(([k, v]) => `${k}=${v}`)
        .join("&");
}

function hex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

async function sha256(data: string): Promise<string> {
    const bytes = new TextEncoder().encode(data);
    return hex(await crypto.subtle.digest("SHA-256", bytes));
}

async function hmac(
    key: ArrayBuffer | Uint8Array,
    data: string,
): Promise<ArrayBuffer> {
    const raw = key instanceof Uint8Array ? new Uint8Array(key) : key;
    const cryptoKey = await crypto.subtle.importKey(
        "raw",
        raw as BufferSource,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );

    return crypto.subtle.sign(
        "HMAC",
        cryptoKey,
        new TextEncoder().encode(data),
    );
}

async function signingKey(
    secret: string,
    date: string,
    region: string,
    service: string,
): Promise<ArrayBuffer> {
    const seed = new TextEncoder().encode(`AWS4${secret}`);
    const kDate = await hmac(seed, date);
    const kRegion = await hmac(kDate, region);
    const kService = await hmac(kRegion, service);
    return hmac(kService, "aws4_request");
}

/**
 * `20130524T000000Z` and `20130524`, from an instant.
 *
 * @param now the instant to stamp.
 */
function amzDate(now: Date): { long: string; short: string } {
    const long = now
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "");
    return { long, short: long.slice(0, 8) };
}

/**
 * Whether `crypto.subtle` is usable, which requires a secure context —
 * `https:` or `localhost`.
 */
export function hasWebCrypto(): boolean {
    return typeof crypto !== "undefined" && !!crypto.subtle;
}

/**
 * A presigned URL valid for the target's `expires` seconds.
 *
 * @param target the request to sign.
 * @param creds the credentials to sign with.
 */
export async function presign(
    target: SignTarget,
    creds: Credentials,
): Promise<string> {
    if (!hasWebCrypto()) {
        throw new Error(
            "WebCrypto is unavailable — S3 request signing requires a secure " +
                "context (https:, or localhost during development).",
        );
    }

    const service = "s3";
    const expires = target.expires ?? 900;
    const { long, short } = amzDate(new Date());
    const scope = `${short}/${target.region}/${service}/aws4_request`;

    const params: [string, string][] = [];
    target.url.searchParams.forEach((v, k) => params.push([k, v]));
    params.push(
        ["X-Amz-Algorithm", ALGORITHM],
        ["X-Amz-Credential", `${creds.accessKeyId}/${scope}`],
        ["X-Amz-Date", long],
        ["X-Amz-Expires", String(expires)],
        ["X-Amz-SignedHeaders", "host"],
    );

    if (creds.sessionToken) {
        params.push(["X-Amz-Security-Token", creds.sessionToken]);
    }

    const query = canonicalQuery(params);
    const host = target.url.host;
    const canonicalRequest = [
        target.method,
        canonicalUri(target.url.pathname),
        query,
        `host:${host}\n`,
        "host",
        "UNSIGNED-PAYLOAD",
    ].join("\n");

    const stringToSign = [
        ALGORITHM,
        long,
        scope,
        await sha256(canonicalRequest),
    ].join("\n");

    const key = await signingKey(
        creds.secretAccessKey,
        short,
        target.region,
        service,
    );

    const signature = hex(await hmac(key, stringToSign));
    return `${target.url.origin}${target.url.pathname}?${query}&X-Amz-Signature=${signature}`;
}
