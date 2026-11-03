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

import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";
import { test, expect } from "../helpers.ts";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const ROOT = path.resolve(__dirname, "../../../../..");

const VIEWER = path.join(ROOT, "rust/perspective-viewer");

const MANIFEST = JSON.parse(
    fs.readFileSync(path.join(VIEWER, "dist/custom-elements.json"), "utf8"),
);

const MODULE = MANIFEST.modules[0];

const ELEMENTS = MODULE.declarations.filter((x: any) => x.customElement);

function readRust(dir: string): string {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(readRust(full));
        } else if (entry.name.endsWith(".rs")) {
            out.push(fs.readFileSync(full, "utf8"));
        }
    }

    return out.join("\n");
}

const RUST = readRust(path.join(VIEWER, "src/rust"));

test.beforeEach(async ({ page }) => {
    await page.goto("/rust/perspective-viewer/test/html/superstore.html");
    await page.evaluate(async () => {
        while (!window["__TEST_PERSPECTIVE_READY__"]) {
            await new Promise((x) => setTimeout(x, 10));
        }
    });
});

test.describe("Custom elements manifest", () => {
    test("declares the current schema and a resolvable export list", () => {
        expect(MANIFEST.schemaVersion).toBe("2.1.0");
        expect(MANIFEST.modules).toHaveLength(1);
        expect(MODULE.path).toBe("dist/esm/perspective-viewer.js");
        const names = new Set(MODULE.declarations.map((x: any) => x.name));
        expect(names.size).toBe(MODULE.declarations.length);
        for (const entry of MODULE.exports) {
            expect(entry.declaration.module).toBe(MODULE.path);
            expect(names.has(entry.declaration.name)).toBe(true);
        }

        const tags = MODULE.exports
            .filter((x: any) => x.kind === "custom-element-definition")
            .map((x: any) => x.name);

        expect(tags.sort()).toEqual(
            ["perspective-viewer", "perspective-viewer-plugin"].sort(),
        );
    });

    test("package.json advertises the manifest", () => {
        const pkg = JSON.parse(
            fs.readFileSync(path.join(VIEWER, "package.json"), "utf8"),
        );

        expect(pkg.customElements).toBe("dist/custom-elements.json");
    });

    test("tag names match the Rust element registrations", () => {
        const rust = readRust(path.join(VIEWER, "src/rust/custom_elements"));
        const registered = [
            ...rust.matchAll(/CUSTOM_ELEMENT_NAME: &'static str = "([^"]+)"/g),
        ].map((x) => x[1]);

        expect(ELEMENTS.map((x: any) => x.tagName).sort()).toEqual(
            registered.sort(),
        );
    });

    test("instance and static members match the registered classes", async ({
        page,
    }) => {
        for (const element of ELEMENTS) {
            const runtime = await page.evaluate((tag) => {
                const cls = customElements.get(tag) as any;
                const hidden = new Set([
                    "constructor",
                    "free",
                    "connectedCallback",
                ]);
                const visible = (name: string) =>
                    !hidden.has(name) && !name.startsWith("_");

                return {
                    instance: Object.getOwnPropertyNames(cls.prototype)
                        .filter(visible)
                        .sort(),
                    statics: Object.getOwnPropertyNames(cls)
                        .filter((x) => typeof cls[x] === "function")
                        .filter(visible)
                        .sort(),
                };
            }, element.tagName);

            const members = element.members ?? [];
            expect(
                members
                    .filter((x: any) => !x.static)
                    .map((x: any) => x.name)
                    .sort(),
            ).toEqual(runtime.instance);

            expect(
                members
                    .filter((x: any) => x.static)
                    .map((x: any) => x.name)
                    .sort(),
            ).toEqual(runtime.statics);
        }
    });

    test("events cover every typed overload and every Rust dispatch", () => {
        const viewer = ELEMENTS.find(
            (x: any) => x.tagName === "perspective-viewer",
        );

        const manifest = new Set(viewer.events.map((x: any) => x.name));
        const extensions = fs.readFileSync(
            path.join(VIEWER, "src/ts/extensions.ts"),
            "utf8",
        );

        const typed = new Set(
            [...extensions.matchAll(/name: "(perspective-[a-z-]+)"/g)].map(
                (x) => x[1],
            ),
        );

        expect([...manifest].sort()).toEqual([...typed].sort());
        const dispatched = new Set([
            ...[
                ...RUST.matchAll(
                    /dispatch(?:_panel)?_event\([^");]*"([a-z-]+)"/g,
                ),
            ].map((x) => `perspective-${x[1]}`),
            ...[
                ...RUST.matchAll(
                    /CustomEvent::new(?:_with_event_init_dict)?\(\s*"(perspective-[a-z-]+)"/g,
                ),
            ].map((x) => x[1]),
        ]);

        for (const name of dispatched) {
            expect(manifest.has(name), name).toBe(true);
        }
    });

    test("attributes are read by the Rust element", () => {
        for (const element of ELEMENTS) {
            for (const attr of element.attributes ?? []) {
                expect(RUST.includes(`get_attribute("${attr.name}")`)).toBe(
                    true,
                );
            }
        }
    });

    test("css properties come from the theme stylesheets", () => {
        const viewer = ELEMENTS.find(
            (x: any) => x.tagName === "perspective-viewer",
        );

        const names = viewer.cssProperties.map((x: any) => x.name);
        expect(names).toEqual([...names].sort());
        expect(new Set(names).size).toBe(names.length);
        expect(names).toContain("--psp-theme-name");
        expect(names).toContain("--psp-icon--close--mask-image");
        expect(names).toContain("--psp-label--add-expression-button--content");
        expect(names.some((x: string) => x.startsWith("--theme-"))).toBe(false);
        expect(
            viewer.cssProperties.find((x: any) => x.name === "--psp-theme-name")
                .default,
        ).toBe('"Pro Light"');
    });
});
