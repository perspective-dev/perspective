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
 * Walk every accessible `@font-face` rule in the document and collect a
 * descriptor list ready for forwarding to a Web Worker, where each
 * entry is reconstituted via `new FontFace(family, src, descriptors)`
 * and registered in the worker's own `self.fonts` set.
 *
 * Background: a `Worker` has its own `FontFaceSet` distinct from the
 * document's. Fonts loaded into `document.fonts` (by `<link>`,
 * `@font-face`, or programmatic `FontFace`) are *not* visible to the
 * worker — Canvas2D `ctx.font` lookups inside the worker fall back to
 * the platform default if the family isn't in `self.fonts`. This
 * helper bridges that gap for the in-CSS case.
 *
 * # CORS / security caveats
 *
 * 1. **Cross-origin stylesheets without permissive CORS** throw
 *    `SecurityError` on `cssRules` access, and we silently skip them.
 *    Their `@font-face` rules are unreachable to JS regardless of
 *    where the worker would re-load them, so this is the same
 *    fundamental limitation the document itself has.
 *
 * 2. **Font URLs are absolutized against the parent stylesheet's
 *    `href`** before forwarding. The worker's own script URL is a
 *    Blob URL produced by `WorkerPlugin`, so relative URLs in the raw
 *    `src:` declaration would resolve against the Blob origin (i.e.
 *    fail). Callers should treat the absolute URLs as the canonical
 *    source.
 *
 * 3. **The actual font fetch issued by `face.load()` in the worker
 *    is a fresh cross-origin request from the worker scope.** The
 *    font server must respond with `Access-Control-Allow-Origin`
 *    (e.g. `*` or the page origin) and an appropriate
 *    `Access-Control-Allow-Headers` policy if any non-simple headers
 *    are involved. A "no-cors" / opaque response is *not* usable
 *    here: `FontFace.load()` rejects on opaque responses, and even
 *    if it didn't, painted glyphs would taint the canvas and break
 *    `getImageData`. Same-origin fonts (including `data:` URIs)
 *    sidestep this entirely.
 *
 * 4. **Programmatic fonts** (e.g. `document.fonts.add(new
 *    FontFace(name, source))`) are *not* captured by this walker —
 *    they don't appear in any stylesheet's `cssRules`. Iterating
 *    `document.fonts` directly would catch them, but `FontFace`
 *    instances don't expose their source URL or buffer post-
 *    construction, so there's no public path to forward them. If a
 *    test or app needs that, it must register the same fonts in the
 *    worker explicitly.
 */
export function snapshotFontFaces(): FontFaceDescriptor[] {
    const out: FontFaceDescriptor[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList;
        try {
            rules = sheet.cssRules;
        } catch {
            // Cross-origin stylesheet without permissive CORS — its
            // `@font-face` rules are unreachable to JS. See caveat (1).
            continue;
        }

        const base = sheet.href ?? document.baseURI;
        for (const rule of Array.from(rules)) {
            if (!(rule instanceof CSSFontFaceRule)) {
                continue;
            }

            const style = rule.style;
            const rawFamily = style.getPropertyValue("font-family").trim();
            const rawSrc = style.getPropertyValue("src").trim();
            if (!rawFamily || !rawSrc) {
                continue;
            }

            out.push({
                // CSSOM serializes multi-word family names with their
                // CSS quotes preserved (e.g. `"Roboto Mono"`). The
                // `FontFace` constructor *doesn't* unquote on parse —
                // Chromium stores the literal input and re-quotes /
                // escapes on `face.family` getter access, yielding
                // `"\"Roboto Mono\""` and a name that no `ctx.font`
                // lookup can match. Strip one layer of matching outer
                // quotes here so the worker's font set keys align
                // with how Canvas2D resolves family names.
                family: stripOuterQuotes(rawFamily),
                src: resolveSrcUrls(rawSrc, base),
                style: optional(style, "font-style"),
                weight: optional(style, "font-weight"),
                stretch: optional(style, "font-stretch"),
                unicodeRange: optional(style, "unicode-range"),
                variant: optional(style, "font-variant"),
                featureSettings: optional(style, "font-feature-settings"),
                display: optional(style, "font-display"),
            });
        }
    }

    return out;
}

function optional(
    style: CSSStyleDeclaration,
    prop: string,
): string | undefined {
    const v = style.getPropertyValue(prop).trim();
    return v || undefined;
}

/**
 * Remove a single matching pair of outer `"…"` or `'…'` quotes from a
 * family name. CSSOM serializes multi-word `font-family` descriptor
 * values with their quotes preserved; `FontFace` then re-quotes on
 * serialization, producing the literal `"\"Foo\""` double-quoting
 * observed in `face.family`. Stripping one layer here aligns the
 * stored family with what Canvas2D resolves at render time.
 */
function stripOuterQuotes(s: string): string {
    if (s.length >= 2) {
        const first = s.charCodeAt(0);
        const last = s.charCodeAt(s.length - 1);
        if (first === last && (first === 0x22 || first === 0x27)) {
            return s.slice(1, -1);
        }
    }

    return s;
}

/**
 * Rewrite every `url(...)` token inside a CSS `src:` value to its
 * absolute form. Multi-source declarations (`url(...) format(...),
 * url(...) format(...)`) are handled by replacing each `url(...)`
 * chunk independently. See caveat (2).
 */
function resolveSrcUrls(src: string, base: string): string {
    return src.replace(
        /url\(\s*(['"]?)([^'")]+)\1\s*\)/g,
        (match, _quote, url) => {
            try {
                return `url(${new URL(url, base).href})`;
            } catch {
                return match;
            }
        },
    );
}
