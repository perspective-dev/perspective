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

import type { FontFaceDescriptor } from "../transport/protocol";

/**
 * Worker-scope font registration cache, keyed by `family|src|weight|
 * style`. Multiple sessions in one shared worker often ship identical
 * font snapshots (the host's `snapshotFontFaces()` walks
 * `document.styleSheets`, which is page-global). Without this cache,
 * each session would `face.load()` + `fonts.add(face)` afresh —
 * harmless but wasteful, since `fonts.add` dedupes by family but each
 * `face.load()` still pays the await.
 *
 * The first session to ask for a given font owns the load promise;
 * every subsequent session awaits it.
 */
const FONT_LOADS = new Map<string, Promise<void>>();

export async function loadFontDeduped(d: FontFaceDescriptor): Promise<void> {
    const key = [
        d.family,
        d.src,
        d.weight ?? "",
        d.style ?? "",
        // d.stretch ?? "",
        // d.unicodeRange ?? "",
        // d.variant ?? "",
        // d.featureSettings ?? "",
        // d.display ?? "",
    ].join("|");

    let p = FONT_LOADS.get(key);
    if (p) {
        await p;
        return;
    }

    p = (async () => {
        try {
            const descriptors: FontFaceDescriptors = {};
            if (d.style) {
                descriptors.style = d.style;
            }

            if (d.weight) {
                descriptors.weight = d.weight;
            }

            if (d.stretch) {
                descriptors.stretch = d.stretch;
            }

            // if (d.unicodeRange) {
            //     descriptors.unicodeRange = d.unicodeRange;
            // }

            // if (d.variant) {
            //     (descriptors as any).variant = d.variant;
            // }

            // if (d.featureSettings) {
            //     descriptors.featureSettings = d.featureSettings;
            // }

            // if (d.display) {
            //     (descriptors as any).display = d.display;
            // }

            const face = new FontFace(d.family, d.src, descriptors);
            await face.load();
            (self as any).fonts.add(face);
        } catch (err) {
            console.warn(`Failed to load font ${d.family}:`, err);
        }
    })();

    FONT_LOADS.set(key, p);
    await p;
}
