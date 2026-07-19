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

import { ActivityMonitor } from "@jupyterlab/coreutils";
import { ILayoutRestorer } from "@jupyterlab/application";
import {
    IThemeManager,
    WidgetTracker,
    Dialog,
    showDialog,
} from "@jupyterlab/apputils";

import { ABCWidgetFactory, DocumentWidget } from "@jupyterlab/docregistry";
import { Widget } from "@lumino/widgets";

// The Perspective runtime lives in the anywidget bundle and is loaded lazily on
// first file-open (see `_update`), so the labextension doesn't load it at
// startup. Importing the bundle eagerly registers the custom elements
// (idempotent across bundle copies); `worker()` resolves its wasm from the
// registered `<perspective-viewer>` element.
const runtime = () => import("@perspective-dev/anywidget");

const FACTORY_CSV = "Perspective-CSV";
const FACTORY_JSON = "Perspective-JSON";
const FACTORY_ARROW = "Perspective-Arrow";
const RENDER_TIMEOUT = 1000;

const baddialog = () => {
    showDialog({
        body: "Perspective could not render the data",
        buttons: [
            Dialog.okButton({
                label: "Dismiss",
            }),
        ],
        focusNodeSelector: "input",
        title: "Error",
    });
};

class PerspectiveViewerWidget extends Widget {
    constructor() {
        const node = document.createElement("div");
        node.classList.add("PSPContainer");
        const viewer = document.createElement("perspective-viewer");
        viewer.classList.add("PSPViewer");
        viewer.addEventListener(
            "contextmenu",
            (event) => event.stopPropagation(),
            false,
        );
        node.appendChild(viewer);
        super({ node });
        this._viewer = viewer;
    }

    get viewer() {
        return this._viewer;
    }

    set theme(t) {
        this._viewer.restore({ theme: t });
    }

    onAfterShow() {
        this._viewer.resize?.(true);
    }

    onActivateRequest() {
        if (this.isAttached) {
            this._viewer.focus();
        }
    }

    dispose() {
        if (this.isDisposed) {
            return;
        }
        this._viewer.delete();
        super.dispose();
    }
}

export class PerspectiveDocumentWidget extends DocumentWidget {
    constructor(options, type = "csv") {
        super({
            content: new PerspectiveViewerWidget(),
            context: options.context,
            reveal: options.reveal,
        });

        this._monitor = null;
        this._psp = this.content;
        this._type = type;
        this._context = options.context;
        this._context.ready.then(() => {
            this._update();
            this._monitor = new ActivityMonitor({
                signal: this.context.model.contentChanged,
                timeout: RENDER_TIMEOUT,
            });
            this._monitor.activityStopped.connect(this._update, this);
        });
    }

    async _update() {
        // Lazy-load the Perspective runtime bundle; importing it eagerly
        // registers the custom elements (idempotent across the widget/renderer
        // bundle copies) and `await ready` ensures wasm init + that
        // `<perspective-viewer>` is defined before the constructor's element is
        // used to load a table.
        const psp_runtime = await runtime();
        await psp_runtime.ready;
        try {
            let data;
            if (this._type === "csv") {
                data = this._context.model.toString();
            } else if (this._type === "arrow") {
                data = Uint8Array.from(
                    atob(this._context.model.toString()),
                    (c) => c.charCodeAt(0),
                ).buffer;
            } else if (this._type === "json") {
                data = this._context.model.toJSON();
                if (Array.isArray(data) && data.length > 0) {
                    data = data;
                } else {
                    throw "Not handled";
                }
            } else {
                throw "Not handled";
            }
            try {
                const table = await this._psp.viewer.getTable();
                table.replace(data);
            } catch (e) {
                this.worker = await psp_runtime.worker();
                const table_promise = this.worker.table(data);

                await this._psp.viewer.load(table_promise);
                const table = await this._psp.viewer.getTable();

                const view = await table.view();
                view.on_update(async () => {
                    if (this._type === "csv") {
                        const result = await view.to_csv();
                        this.context.model.fromString(result);
                        this.context.save();
                    } else if (this._type === "arrow") {
                        const result = await view.to_arrow();
                        const resultAsB64 = btoa(
                            new Uint8Array(result).reduce(
                                (acc, i) =>
                                    (acc += String.fromCharCode.apply(null, [
                                        i,
                                    ])),
                                "",
                            ),
                        );
                        this.context.model.fromString(resultAsB64);
                        this.context.save();
                    } else if (this._type === "json") {
                        const result = await view.to_json();
                        this.context.model.fromJSON(result);
                        this.context.save();
                    }
                });
            }
        } catch (e) {
            baddialog();
            throw e;
        }

        this._psp.theme =
            document.body.getAttribute("data-jp-theme-light") === "false"
                ? "Pro Light"
                : "Pro Dark";
    }

    dispose() {
        if (this._monitor) {
            this._monitor.dispose();
        }

        if (this.worker) {
            this.worker.terminate();
        }
        super.dispose();
    }

    get psp() {
        return this._psp;
    }
}

export class PerspectiveCSVFactory extends ABCWidgetFactory {
    createNewWidget(context) {
        return new PerspectiveDocumentWidget(
            {
                context,
            },
            "csv",
        );
    }
}

export class PerspectiveJSONFactory extends ABCWidgetFactory {
    createNewWidget(context) {
        return new PerspectiveDocumentWidget(
            {
                context,
            },
            "json",
        );
    }
}

export class PerspectiveArrowFactory extends ABCWidgetFactory {
    createNewWidget(context) {
        return new PerspectiveDocumentWidget(
            {
                context,
            },
            "arrow",
        );
    }
}

function activate(app, restorer, themeManager) {
    const factorycsv = new PerspectiveCSVFactory({
        name: FACTORY_CSV,
        fileTypes: ["csv"],
        defaultFor: ["csv"],
        readOnly: true,
    });

    const factoryjson = new PerspectiveJSONFactory({
        name: FACTORY_JSON,
        fileTypes: ["json", "jsonl"],
        defaultFor: ["json", "jsonl"],
        readOnly: true,
    });

    try {
        app.docRegistry.addFileType({
            name: "arrow",
            displayName: "arrow",
            extensions: [".arrow"],
            mimeTypes: ["application/octet-stream"],
            contentType: "file",
            fileFormat: "base64",
        });
    } catch (_a) {
        // do nothing
    }

    const factoryarrow = new PerspectiveArrowFactory({
        name: FACTORY_ARROW,
        fileTypes: ["arrow"],
        defaultFor: ["arrow"],
        readOnly: true,
        modelName: "base64",
    });

    const trackercsv = new WidgetTracker({
        namespace: "csvperspective",
    });

    const trackerjson = new WidgetTracker({
        namespace: "jsonperspective",
    });

    const trackerarrow = new WidgetTracker({
        namespace: "arrowperspective",
    });

    if (restorer) {
        void restorer.restore(trackercsv, {
            command: "docmanager:open",
            args: (widget) => ({
                path: widget.context.path,
                factory: FACTORY_CSV,
            }),
            name: (widget) => widget.context.path,
        });

        void restorer.restore(trackerjson, {
            command: "docmanager:open",
            args: (widget) => ({
                path: widget.context.path,
                factory: FACTORY_JSON,
            }),
            name: (widget) => widget.context.path,
        });

        void restorer.restore(trackerarrow, {
            command: "docmanager:open",
            args: (widget) => ({
                path: widget.context.path,
                factory: FACTORY_ARROW,
            }),
            name: (widget) => widget.context.path,
        });
    }

    app.docRegistry.addWidgetFactory(factorycsv);
    app.docRegistry.addWidgetFactory(factoryjson);
    app.docRegistry.addWidgetFactory(factoryarrow);
    const ftcsv = app.docRegistry.getFileType("csv");
    const ftjson = app.docRegistry.getFileType("json");
    const ftarrow = app.docRegistry.getFileType("arrow");
    factorycsv.widgetCreated.connect((sender, widget) => {
        void trackercsv.add(widget);
        widget.context.pathChanged.connect(() => {
            void trackercsv.save(widget);
        });

        if (ftcsv) {
            widget.title.iconClass = ftcsv.iconClass || "";
            widget.title.iconLabel = ftcsv.iconLabel || "";
        }
    });

    factoryjson.widgetCreated.connect((sender, widget) => {
        void trackerjson.add(widget);
        widget.context.pathChanged.connect(() => {
            void trackerjson.save(widget);
        });

        if (ftjson) {
            widget.title.iconClass = ftjson.iconClass || "";
            widget.title.iconLabel = ftjson.iconLabel || "";
        }
    });

    factoryarrow.widgetCreated.connect((sender, widget) => {
        void trackerarrow.add(widget);
        widget.context.pathChanged.connect(() => {
            void trackerarrow.save(widget);
        });

        if (ftarrow) {
            widget.title.iconClass = ftarrow.iconClass || "";
            widget.title.iconLabel = ftarrow.iconLabel || "";
        }
    });

    const updateThemes = () => {
        const isLight =
            themeManager && themeManager.theme
                ? themeManager.isLight(themeManager.theme)
                : true;

        const theme = isLight ? "Pro Light" : "Pro Dark";
        trackercsv.forEach((pspDocWidget) => {
            pspDocWidget.psp.theme = theme;
        });

        trackerjson.forEach((pspDocWidget) => {
            pspDocWidget.psp.theme = theme;
        });

        trackerarrow.forEach((pspDocWidget) => {
            pspDocWidget.psp.theme = theme;
        });
    };

    if (themeManager) {
        themeManager.themeChanged.connect(updateThemes);
    }
}

export const PerspectiveRenderers = {
    activate: activate,
    id: "@perspective-dev/jupyterlab-renderers",
    requires: [],
    optional: [ILayoutRestorer, IThemeManager],
    autoStart: true,
};
