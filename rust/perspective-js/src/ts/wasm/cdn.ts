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
 * Resolve the URL of a WASM binary shipped in the `wasm_package` Perspective
 * package, relative to the URL of the `bundle_package` CDN bundle which loads
 * it.
 */
export function resolve_package_wasm_url(
    bundle_url: string,
    bundle_package: string,
    wasm_package: string,
    filename: string,
): string {
    const pattern = new RegExp(
        `/${bundle_package}(@[^/]+)?/dist/cdn/[^/?#]*([?#].*)?$`,
    );

    const rewritten = bundle_url.replace(
        pattern,
        (_, tag) => `/${wasm_package}${tag ?? ""}/dist/wasm/${filename}`,
    );

    if (rewritten !== bundle_url) {
        return rewritten;
    }

    return new URL(`../../../${wasm_package}/dist/wasm/${filename}`, bundle_url)
        .href;
}

/**
 * Resolve the URL of one of `@perspective-dev/server`'s engine WASM binaries
 * relative to the URL of the `@perspective-dev/client` CDN bundle which loads
 * it.
 */
export function resolve_server_wasm_url(
    client_url: string,
    filename: string = "perspective-server.wasm",
): string {
    return resolve_package_wasm_url(client_url, "client", "server", filename);
}
