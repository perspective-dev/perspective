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

import init from "./init";
import { PerspectiveViewerElement } from "../../dist/pkg/perspective-viewer.js";

// This can be done automatically by enabling the `defin_web_components_async`
// feature, but due to async loading, `<perspective-viewer>` methods will not be
// available synchronously - this can be mitigated with
// `customElements.whenDefined()`, but this is a breaking change.
class HTMLPerspectiveViewerElement extends HTMLElement {
    _instance: PerspectiveViewerElement;
    constructor() {
        super();
        if (this._instance === undefined) {
            this._instance = new PerspectiveViewerElement(this);
        }
    }
}

const proto = PerspectiveViewerElement.prototype;
const names = Object.getOwnPropertyNames(proto);
for (const key of names) {
    Object.defineProperty(HTMLPerspectiveViewerElement.prototype, key, {
        value: async function (...args) {
            return await this._instance[key].call(this._instance, ...args);
        },
    });
}

for (const key of ["registerPlugin", "getExprTKCommands"]) {
    Object.defineProperty(HTMLPerspectiveViewerElement, key, {
        value: async function (...args) {
            return init[key].call(init, ...args);
        },
    });
}

Object.defineProperty(HTMLPerspectiveViewerElement, "__wasm_module__", {
    get() {
        return init;
    },
});

customElements.define("perspective-viewer", HTMLPerspectiveViewerElement);
