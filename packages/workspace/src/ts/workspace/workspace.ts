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

import { find, toArray } from "@lumino/algorithm";
import { CommandRegistry } from "@lumino/commands";

import { SplitPanel, Panel, DockPanel } from "@lumino/widgets";
import uniqBy from "lodash/uniqBy";
import { DebouncedFunc, DebouncedFuncLeading, isEqual } from "lodash";
import { throttle } from "lodash";
import debounce from "lodash/debounce";
import type {
    HTMLPerspectiveViewerElement,
    ViewerConfigUpdate,
} from "@perspective-dev/viewer";
import type * as psp from "@perspective-dev/client";
import type * as psp_viewer from "@perspective-dev/viewer";
import injectedStyles from "../../../build/css/injected.css";
import { PerspectiveDockPanel } from "./dockpanel";
import { WorkspaceMenu } from "./menu";
import { createCommands } from "./commands";
import { PerspectiveViewerWidget } from "./widget";

class AsyncMutex {
    _lock: Promise<unknown> | null;

    constructor() {
        this._lock = null;
    }

    lock<A>(continuation: () => Promise<A>): Promise<A> {
        if (this._lock !== null) {
            return this._lock.then(() => this.lock(continuation));
        }

        this._lock = new Promise((x, y) =>
            continuation()
                .then((z) => {
                    this._lock = null;
                    x(z);
                })
                .catch((e) => {
                    this._lock = null;
                    y(e);
                }),
        );

        return this._lock as Promise<A>;
    }
}

export type PerspectiveSplitArea = {
    type: "split-area";
    sizes: number[];
    orientation: "horizontal" | "vertical";
    children: PerspectiveLayout[];
};

export type PerspectiveTabArea = {
    type: "tab-area";
    currentIndex: number;
    widgets: string[];
};

export type PerspectiveLayout = PerspectiveSplitArea | PerspectiveTabArea;

export interface PerspectiveWorkspaceConfig {
    sizes: number[];
    viewers: Record<string, psp_viewer.ViewerConfigUpdate>;
    detail: { main: PerspectiveLayout | null };
    master?: {
        sizes: number[];
        widgets: string[];
    };
}

const DEFAULT_WORKSPACE_SIZE = [1, 3];
let ID_COUNTER = 0;

export function genId(workspace: PerspectiveWorkspaceConfig) {
    let i = `PERSPECTIVE_GENERATED_ID_${ID_COUNTER++}`;
    if (Object.keys(workspace.viewers).includes(i)) {
        i = genId(workspace);
    }
    return i;
}

/// This function takes a workspace config and viewer config and adds the
/// viewer config to the workspace config, returning a new workspace config.
/// This is a slightly different algorithm from the Lumino one,
/// which will be used on internal workspace actions (such as duplication).
/// It currently attaches the viewer using a split-right style,
/// (see Lumino docklayout.ts for documentation on insert modes).
export function addViewer(
    workspace: PerspectiveWorkspaceConfig,
    config: psp_viewer.ViewerConfigUpdate,
    id: string,
): PerspectiveWorkspaceConfig {
    const GOLDEN_RATIO = 0.618;
    /// ensures that the sum of the input is 1
    /// keeps the relative size of the elements
    function normalize(sizes: number[]) {
        const sum = sizes.reduce((a, b) => a + b, 0);
        return sum === 1 ? sizes : sizes.map((size) => size / sum);
    }

    if (workspace.detail.main === null) {
        return {
            sizes: workspace.sizes,
            viewers: {
                ...workspace.viewers,
                [id]: config,
            },
            detail: {
                main: {
                    type: "split-area",
                    sizes: [1],
                    orientation: "horizontal",
                    children: [
                        {
                            type: "tab-area",
                            currentIndex: 0,
                            widgets: [id],
                        },
                    ],
                },
            },
            master: workspace.master,
        };
    } else if (
        workspace.detail.main.type === "tab-area" ||
        (workspace.detail.main.type === "split-area" &&
            workspace.detail.main.orientation === "vertical")
    ) {
        return {
            sizes: workspace.sizes,
            viewers: {
                ...workspace.viewers,
                [id]: config,
            },
            detail: {
                main: {
                    type: "split-area",
                    sizes: [0.5, 0.5],
                    orientation: "horizontal",
                    children: [
                        workspace.detail.main,
                        {
                            type: "tab-area",
                            currentIndex: 0,
                            widgets: [id],
                        },
                    ],
                },
            },
            master: workspace.master,
        };
    } else if (
        workspace.detail.main.type === "split-area" &&
        workspace.detail.main.orientation === "horizontal"
    ) {
        return {
            sizes: workspace.sizes,
            viewers: {
                ...workspace.viewers,
                [id]: config,
            },
            detail: {
                main: {
                    type: "split-area",
                    sizes: normalize([
                        ...normalize(workspace.detail.main.sizes),
                        GOLDEN_RATIO,
                    ]),
                    orientation: "horizontal",
                    children: [
                        ...workspace.detail.main.children,
                        {
                            type: "tab-area",
                            currentIndex: 0,
                            widgets: [id],
                        },
                    ],
                },
            },
            master: workspace.master,
        };
    } else {
        throw new Error("Unknown workspace state");
    }
}

export class PerspectiveWorkspace extends SplitPanel {
    private dockpanel: PerspectiveDockPanel;
    private detailPanel: Panel;
    private masterPanel: SplitPanel;
    client: psp.Client[];
    element: HTMLElement;
    menu_elem: HTMLElement;
    private listeners: WeakMap<PerspectiveViewerWidget, () => void>;
    private indicator: HTMLElement;
    private commands: CommandRegistry;
    private _menu?: WorkspaceMenu;
    private _minimizedLayoutSlots?: Promise<DockPanel.ILayoutConfig>;
    private _minimizedLayout?: DockPanel.ILayoutConfig;
    private _maximizedWidget?: PerspectiveViewerWidget;
    private _last_updated_state?: PerspectiveWorkspaceConfig;
    _mutex: AsyncMutex;
    // private _context_menu?: Menu & { init_overlay?: () => void };

    constructor(element: HTMLElement) {
        super({ orientation: "horizontal" });
        this.addClass("perspective-workspace");
        this.dockpanel = new PerspectiveDockPanel(this);
        this.detailPanel = new Panel();
        this.detailPanel.layout!.fitPolicy = "set-no-constraint";
        this.detailPanel.addClass("perspective-scroll-panel");
        this.detailPanel.addWidget(this.dockpanel);
        this.masterPanel = new SplitPanel({ orientation: "vertical" });
        this.masterPanel.addClass("master-panel");
        this._mutex = new AsyncMutex();
        this.dockpanel.layoutModified.connect(() => {
            this.workspaceUpdated();
        });

        this.addWidget(this.detailPanel);
        this.element = element;
        this.listeners = new WeakMap();
        this.client = [];
        this.indicator = this.init_indicator();
        this.commands = createCommands(this, this.indicator);
        this.menu_elem = document.createElement("perspective-workspace-menu");
        this.menu_elem.attachShadow({ mode: "open" });
        this.menu_elem.shadowRoot!.innerHTML = `<style>:host{position:absolute;}${injectedStyles}</style>`;

        this.element.shadowRoot!.insertBefore(
            this.menu_elem,
            this.element.shadowRoot!.lastElementChild!,
        );

        element.addEventListener("contextmenu", (event) =>
            this.showContextMenu(null, event),
        );
    }

    get_context_menu(): WorkspaceMenu | undefined {
        return this._menu;
    }

    get_dock_panel(): PerspectiveDockPanel {
        return this.dockpanel;
    }

    init_indicator() {
        const exists = document.querySelector("body > perspective-indicator");
        if (exists) {
            return exists as HTMLElement;
        }
        const indicator = document.createElement("perspective-indicator");
        indicator.style.position = "fixed";
        indicator.style.pointerEvents = "none";
        document.body.appendChild(indicator);
        return indicator;
    }

    apply_indicator_theme() {
        const theme_name = JSON.parse(
            window
                .getComputedStyle(this.element)
                .getPropertyValue("--theme-name")
                .trim(),
        );

        this.indicator.setAttribute("theme", theme_name);
    }

    /***************************************************************************
     *
     * `<perspective-workspace>` Public API
     *
     */

    async save(): Promise<PerspectiveWorkspaceConfig> {
        return await this._mutex.lock(async () => {
            const is_settings = this.dockpanel.mode === "single-document";
            let detail = is_settings
                ? await this._minimizedLayoutSlots
                : await PerspectiveDockPanel.mapWidgets(
                      async (widget) =>
                          (
                              widget as PerspectiveViewerWidget
                          ).viewer.getAttribute("slot"),
                      this.dockpanel.saveLayout(),
                  );

            const layout: PerspectiveWorkspaceConfig = {
                sizes: [...this.relativeSizes()],
                detail: detail as { main: PerspectiveLayout },
                viewers: {},
                master: undefined as
                    | { widgets: string[]; sizes: number[] }
                    | undefined,
            };

            if (this.masterPanel.isAttached) {
                const master = {
                    widgets: this.masterPanel.widgets.map(
                        (widget) =>
                            (
                                widget as PerspectiveViewerWidget
                            ).viewer.getAttribute("slot")!,
                    ),
                    sizes: [...this.masterPanel.relativeSizes()],
                };

                layout.master = master;
            }

            // const viewers: Record<string, ViewerConfigUpdate> = {};
            for (const widget of this.masterPanel.widgets) {
                const psp_widget = widget as PerspectiveViewerWidget;
                layout.viewers[psp_widget.viewer.getAttribute("slot")!] =
                    await psp_widget.save();
            }

            const widgets = PerspectiveDockPanel.getWidgets(
                is_settings
                    ? this._minimizedLayout!
                    : this.dockpanel.saveLayout(),
            );

            await Promise.all(
                widgets.map(async (widget) => {
                    const psp_widget = widget as PerspectiveViewerWidget;
                    const slot = psp_widget.viewer.getAttribute("slot")!;
                    layout.viewers[slot] = await psp_widget.save();
                    layout.viewers[slot]!.settings = false;
                }),
            );

            return layout;
        });
    }

    async restore(value: PerspectiveWorkspaceConfig) {
        await this._mutex.lock(async () => {
            const {
                sizes,
                master,
                detail,
                viewers: viewer_configs = {},
            } = structuredClone(value);

            if (master && master.widgets!.length > 0) {
                this.setupMasterPanel(sizes || DEFAULT_WORKSPACE_SIZE);
            } else {
                if (this.masterPanel.isAttached) {
                    this.detailPanel.removeClass("has-master-panel");
                    this.masterPanel.close();
                }

                this.addWidget(this.detailPanel);
            }

            let tasks: Promise<void>[] = [];

            // Using ES generators as context managers ..
            for (const viewers of this._capture_viewers()) {
                for (const widgets of this._capture_widgets()) {
                    for (const v of viewers) {
                        v.removeAttribute("class");
                    }

                    const callback = this._restore_callback.bind(
                        this,
                        viewer_configs,
                        viewers,
                        widgets,
                    );

                    if (detail) {
                        const detailLayout =
                            await PerspectiveDockPanel.mapWidgets(
                                (name: string) =>
                                    callback.bind(this, false)(name),
                                detail,
                            );

                        this.dockpanel.mode = "multiple-document";
                        this.dockpanel.restoreLayout(detailLayout);
                        tasks = tasks.concat(
                            PerspectiveDockPanel.getWidgets(detailLayout).map(
                                (x) =>
                                    (
                                        x as PerspectiveViewerWidget
                                    ).viewer.flush(),
                            ),
                        );
                    }

                    if (master) {
                        // tasks = tasks.concat(

                        const tasks2: any[] = [],
                            names: string[] = [];
                        master.widgets!.map((name) => {
                            names.push(name);
                            tasks2.push(callback.bind(this, true)(name));
                            return name;
                        });

                        // return name;
                        tasks.push(
                            Promise.all(tasks2).then((x) => {
                                master.widgets = master.widgets!.map((name) => {
                                    const idx = names.indexOf(name);
                                    const task = x[idx];
                                    return task;
                                });
                            }),
                        );

                        // const widgets = await Promise.all(tasks);

                        // );

                        master.sizes &&
                            this.masterPanel.setRelativeSizes(master.sizes);
                    }
                }
            }

            await Promise.all(tasks);
        });
    }

    *_capture_widgets() {
        const widgets = this.getAllWidgets();
        yield widgets;
        for (const widget of widgets) {
            if (!widget.node.isConnected) {
                widget.close();
            }
        }
    }

    *_capture_viewers() {
        const viewers = Array.from(
            this.element.children,
        ) as HTMLPerspectiveViewerElement[];

        yield viewers;
        const ending_widgets = this.getAllWidgets();
        for (const viewer of viewers) {
            let widget = ending_widgets.find((x) => {
                const psp_widget = x as PerspectiveViewerWidget;
                return psp_widget.viewer === viewer;
            });

            if (
                !widget &&
                Array.from(this.element.children).indexOf(viewer) > -1
            ) {
                this.element.removeChild(viewer);
                viewer.delete();
                viewer.free();
            }
        }
    }

    async _restore_callback(
        viewers: Record<string, psp_viewer.ViewerConfigUpdate>,
        starting_viewers: HTMLPerspectiveViewerElement[],
        starting_widgets: PerspectiveViewerWidget[],
        master: boolean,
        widgetName: string,
    ) {
        let viewer_config;
        viewer_config = viewers[widgetName];

        let viewer =
            !!widgetName &&
            starting_viewers.find((x) => x.getAttribute("slot") === widgetName);

        let widget;
        if (viewer) {
            widget = starting_widgets.find((x) => x.viewer === viewer);
            if (widget) {
                await widget.restore({ ...viewer_config });
            } else {
                widget = await this._createWidget({
                    config: { ...viewer_config },
                    viewer,
                });
            }
        } else if (viewer_config) {
            widget = await this._createWidgetAndNode({
                config: { ...viewer_config },
                slot: widgetName,
            });
        } else {
            throw new Error(
                `Could not find or create <perspective-viewer> for slot "${widgetName}"`,
            );
        }

        if (master) {
            widget.viewer.classList.add("workspace-master-widget");
            widget.viewer.toggleAttribute("selectable", true);
            widget.viewer.addEventListener(
                "perspective-select",
                this.onPerspectiveSelect.bind(this),
            );

            // TODO remove event listener
            this.masterPanel.addWidget(widget);
        }

        return widget;
    }

    _validate(table: any) {
        if (!table || !("view" in table) || typeof table?.view !== "function") {
            throw new Error(
                "Only `perspective.Table()` instances can be added to `tables`",
            );
        }
        return table;
    }

    _set_listener(name: string, table: psp.Table | Promise<psp.Table>) {
        if (table instanceof Promise) {
            table = table.then(this._validate);
        } else {
            this._validate(table);
        }
    }

    _delete_listener(name: string) {
        this.getAllWidgets().some((widget) => {
            const psp_widget = widget as PerspectiveViewerWidget;
            if (psp_widget.viewer.getAttribute("table") === name) {
                psp_widget.viewer.eject();
            }
        });
    }

    async update_widget_for_viewer(viewer: HTMLPerspectiveViewerElement) {
        let slot_name = viewer.getAttribute("slot");
        if (!slot_name) {
            slot_name = this._gen_id();
            viewer.setAttribute("slot", slot_name);
        }

        const table_name = viewer.getAttribute("table");
        if (table_name) {
            const slot = this.node.querySelector(`slot[name=${slot_name}]`);
            if (!slot) {
                console.warn(
                    `Undocked ${viewer.outerHTML}, creating default layout`,
                );

                const widget = await this._createWidget({
                    // config: {},
                    viewer,
                });

                this.dockpanel.addWidget(widget);
                this.dockpanel.activateWidget(widget);
            }
        } else {
            console.warn(`No table set for ${viewer.outerHTML}`);
        }
    }

    remove_unslotted_widgets(viewers: HTMLPerspectiveViewerElement[]) {
        const widgets = this.getAllWidgets();
        for (const widget of widgets) {
            const psp_widget = widget as PerspectiveViewerWidget;
            let missing = viewers.indexOf(psp_widget.viewer) === -1;
            if (missing) {
                psp_widget.close();
            }
        }
    }

    update_details_panel(viewers: HTMLPerspectiveViewerElement[]) {
        if (this.masterPanel.widgets.length === 0) {
            this.masterPanel.close();
        }
    }

    /***************************************************************************
     *
     * Workspace-level contextmenu actions
     *
     */

    async duplicate(widget: PerspectiveViewerWidget): Promise<void> {
        if (this.dockpanel.mode === "single-document") {
            const _task =
                await this._maximizedWidget!.viewer.toggleConfig(false);

            this._unmaximize();
        }

        const config = await widget.save();
        config.settings = false;
        config.title = config.title ? `${config.title} (*)` : "";
        const duplicate = await this._createWidgetAndNode({
            config,
            slot: undefined,
        });

        this.dockpanel.addWidget(duplicate, {
            mode: "split-right",
            ref: widget,
        });

        await duplicate.viewer.flush();
    }

    toggleMasterDetail(widget: PerspectiveViewerWidget) {
        const isGlobalFilter = widget.parent !== this.dockpanel;
        this.element.dispatchEvent(
            new CustomEvent("workspace-toggle-global-filter", {
                detail: {
                    widget,
                    isGlobalFilter: !isGlobalFilter,
                },
            }),
        );

        if (isGlobalFilter) {
            this.makeDetail(widget);
        } else {
            if (this.dockpanel.mode === "single-document") {
                this.toggleSingleDocument(widget);
            }
            this.makeMaster(widget);
        }
    }

    _maximize(widget: PerspectiveViewerWidget) {
        widget.viewer.classList.add("widget-maximize");
        if (!this._minimizedLayout) {
            this._minimizedLayout = this.dockpanel.saveLayout();
            this._minimizedLayoutSlots = PerspectiveDockPanel.mapWidgets(
                async (widget: PerspectiveViewerWidget) =>
                    widget.viewer.getAttribute("slot"),
                this.dockpanel.saveLayout(),
            );
        }

        this._maximizedWidget = widget;
        this.dockpanel.mode = "single-document";
        this.dockpanel.activateWidget(widget);
    }

    _unmaximize() {
        this._maximizedWidget!.viewer.classList.remove("widget-maximize");
        this.dockpanel.mode = "multiple-document";
        this.dockpanel.restoreLayout(this._minimizedLayout!);
        this._minimizedLayout = undefined;
    }

    toggleSingleDocument(widget: PerspectiveViewerWidget) {
        if (this.dockpanel.mode !== "single-document") {
            this._maximize(widget);
        } else {
            this._unmaximize();
        }
    }

    async _filterViewer(
        viewer: HTMLPerspectiveViewerElement,
        filters: [string, string, string][],
        candidates: Set<string>,
    ) {
        const config = await viewer.save();
        const table = await viewer.getTable();
        const availableColumns = Object.keys(await table.schema());
        const currentFilters = config.filter || [];
        const columnAvailable = (filter: [string, string, any]) =>
            filter[0] && availableColumns.includes(filter[0]);

        const validFilters = filters.filter(columnAvailable);
        validFilters.push(
            ...currentFilters.filter(
                (x: [string, ..._: string[]]) => !candidates.has(x[0]),
            ),
        );

        const newFilters = uniqBy(validFilters, (item) => item[0]);
        await viewer.restore({ filter: newFilters });
    }

    async onPerspectiveSelect(event: CustomEvent) {
        const config = await (
            event.target as HTMLPerspectiveViewerElement
        ).save();

        const candidates = new Set([
            ...(config["group_by"] || []),
            ...(config["split_by"] || []),
            ...(config.filter || []).map((x: [string, string, any]) => x[0]),
        ]);

        const filters = [...event.detail.config.filter];
        toArray(this.dockpanel.widgets()).forEach((widget) => {
            this._filterViewer(
                (widget as PerspectiveViewerWidget).viewer,
                filters,
                candidates,
            );
        });
    }

    async makeMaster(widget: PerspectiveViewerWidget) {
        if (widget.viewer.hasAttribute("settings")) {
            await widget.toggleConfig();
        }

        widget.viewer.classList.add("workspace-master-widget");
        widget.viewer.toggleAttribute("selectable", true);
        if (!this.masterPanel.isAttached) {
            this.detailPanel.close();
            this.setupMasterPanel(DEFAULT_WORKSPACE_SIZE);
        }

        this.masterPanel.addWidget(widget);
        widget.isHidden && widget.show();
        widget.viewer.restyleElement();
        widget.viewer.addEventListener(
            "perspective-select",
            this.onPerspectiveSelect.bind(this),
        );
    }

    makeDetail(widget: PerspectiveViewerWidget) {
        widget.viewer.classList.remove("workspace-master-widget");
        widget.viewer.toggleAttribute("selectable", false);
        this.dockpanel.addWidget(widget, { mode: `split-left` });
        if (this.masterPanel.widgets.length === 0) {
            this.detailPanel.close();
            this.masterPanel.close();
            this.detailPanel.removeClass("has-master-panel");
            this.addWidget(this.detailPanel);
        }

        widget.viewer.restyleElement();
        widget.viewer.removeEventListener(
            "perspective-select",
            this.onPerspectiveSelect.bind(this),
        );
    }

    /***************************************************************************
     *
     * Context Menu
     *
     */

    createContextMenu(widget: PerspectiveViewerWidget | null) {
        this._menu = new WorkspaceMenu(
            this.menu_elem.shadowRoot!,
            this.element,
            {
                commands: this.commands,
            },
        );

        const tabbar = find(
            this.dockpanel.tabBars(),
            (bar) => bar.currentTitle?.owner === widget,
        );

        this._menu.init_overlay = () => {
            if (widget) {
                widget.addClass("context-focus");
                widget.viewer.classList.add("context-focus");
                tabbar && tabbar.node.classList.add("context-focus");
                this.element.classList.add("context-menu");
                this.addClass("context-menu");
                if (
                    widget.viewer.classList.contains("workspace-master-widget")
                ) {
                    this._menu!.node.classList.add("workspace-master-menu");
                } else {
                    this._menu!.node.classList.remove("workspace-master-menu");
                }
            }
        };

        if (widget?.parent === this.dockpanel || widget === null) {
            this._menu.addItem({
                type: "submenu",
                command: "workspace:newmenu",
                submenu: (() => {
                    const submenu = new WorkspaceMenu(
                        this.menu_elem.shadowRoot!,
                        this.element,
                        {
                            commands: this.commands,
                        },
                    );

                    (async () => {
                        const names = await Promise.all(
                            this.client.map((c) => c.get_hosted_table_names()),
                        ).then((x) => x.flat());

                        for (const table of names) {
                            let args;
                            if (widget !== null) {
                                args = {
                                    table,
                                    widget_name:
                                        widget.viewer.getAttribute("slot"),
                                };
                            } else {
                                args = { table };
                            }

                            submenu.insertItem(0, {
                                command: "workspace:new",
                                args,
                            });
                        }
                    })();

                    const widgets = PerspectiveDockPanel.getWidgets(
                        this.dockpanel.saveLayout(),
                    );

                    if (widgets.length > 0) {
                        submenu.addItem({ type: "separator" });
                    }

                    let seen = new Set();
                    for (const target_widget of widgets) {
                        if (!seen.has(target_widget.title.label)) {
                            let args;
                            if (widget !== null) {
                                args = {
                                    target_widget_name:
                                        target_widget.viewer.getAttribute(
                                            "slot",
                                        ),
                                    widget_name:
                                        widget.viewer.getAttribute("slot"),
                                };
                            } else {
                                args = {
                                    target_widget_name:
                                        target_widget.viewer.getAttribute(
                                            "slot",
                                        ),
                                };
                            }

                            submenu.addItem({
                                command: "workspace:newview",
                                args,
                            });

                            seen.add(target_widget.title.label);
                        }
                    }

                    submenu.title.label = "New Table";
                    return submenu;
                })(),
            });
        }

        if (widget) {
            const widget_name = widget.viewer.getAttribute("slot");
            if (widget?.parent === this.dockpanel) {
                this._menu.addItem({ type: "separator" });
            }

            this._menu.addItem({
                command: "workspace:duplicate",
                args: { widget_name },
            });

            this._menu.addItem({
                command: "workspace:master",
                args: { widget_name },
            });

            this._menu.addItem({ type: "separator" });

            this._menu.addItem({
                command: "workspace:settings",
                args: { widget_name },
            });

            this._menu.addItem({
                command: "workspace:reset",
                args: { widget_name },
            });
            this._menu.addItem({
                command: "workspace:export",
                args: { widget_name },
            });
            this._menu.addItem({
                command: "workspace:copy",
                args: { widget_name },
            });

            this._menu.addItem({ type: "separator" });

            this._menu.addItem({
                command: "workspace:close",
                args: { widget_name },
            });
            this._menu.addItem({
                command: "workspace:help",
            });
        }

        this._menu.aboutToClose.connect(() => {
            if (widget) {
                this.element.classList.remove("context-menu");
                this.removeClass("context-menu");
                widget.removeClass("context-focus");
                tabbar?.node?.classList.remove("context-focus");
            }
        });

        return this._menu;
    }

    showContextMenu(widget: PerspectiveViewerWidget | null, event: MouseEvent) {
        if (!event.shiftKey) {
            const menu = this.createContextMenu(widget);
            menu.init_overlay?.();
            const rect = this.element.getBoundingClientRect();
            menu.open(event.clientX - rect.x, event.clientY - rect.y, {
                host: this.menu_elem.shadowRoot as unknown as HTMLElement,
            });

            event.preventDefault();
            event.stopPropagation();
        }
    }

    /***************************************************************************
     *
     * Context Menu
     *
     */

    clearLayout() {
        this.getAllWidgets().forEach((widget) => widget.close());
        this.widgets.forEach((widget) => widget.close());
        this.detailPanel.close();
        if (this.masterPanel.isAttached) {
            this.detailPanel.removeClass("has-master-panel");
            this.masterPanel.close();
        }
    }

    setupMasterPanel(sizes: number[]) {
        this.detailPanel.addClass("has-master-panel");
        this.addWidget(this.masterPanel);
        this.addWidget(this.detailPanel);
        this.setRelativeSizes(sizes);
    }

    async addViewer(
        config: psp_viewer.ViewerConfigUpdate,
        is_global_filter?: boolean,
    ) {
        await this._mutex.lock(async () => {
            if (this.dockpanel.mode === "single-document") {
                const _task = this._maximizedWidget!.viewer.toggleConfig(false);
                this._unmaximize();
            }

            const widget = await this._createWidgetAndNode({ config });
            if (is_global_filter) {
                if (!this.masterPanel.isAttached) {
                    this.setupMasterPanel(DEFAULT_WORKSPACE_SIZE);
                }

                this.masterPanel.addWidget(widget);
            } else {
                if (!this.detailPanel.isAttached) {
                    this.addWidget(this.detailPanel);
                }
                this.dockpanel.addWidget(widget, { mode: "split-right" });
            }

            this.update();
        });
    }

    /*********************************************************************
     * Widget helper methods
     */

    async _createWidgetAndNode({
        config,
        slot: slotname,
    }: {
        config: psp_viewer.ViewerConfigUpdate;
        slot?: string;
    }) {
        const node = this._createNode(slotname);
        const table = config.table;
        const viewer = document.createElement("perspective-viewer");
        viewer.setAttribute(
            "slot",
            node!.querySelector("slot")!.getAttribute("name")!,
        );

        if (table) {
            viewer.setAttribute("table", table);
        }

        for (const client of this.client) {
            const tables = await client.get_hosted_table_names();
            if (table && tables.indexOf(table) > -1) {
                await viewer.load(client);
                return await this._createWidget({
                    config,
                    elem: node as HTMLElement,
                    viewer,
                });
            }
        }

        throw new Error(`Table "${table}" not found`);
    }

    _gen_id() {
        let genId = `PERSPECTIVE_GENERATED_ID_${ID_COUNTER++}`;
        if (this.element.querySelector(`[slot=${genId}]`)) {
            genId = this._gen_id();
        }
        return genId;
    }

    _createNode(slotname?: string): HTMLElement {
        let node = this.node.querySelector(`slot[name=${slotname}]`);
        if (slotname === undefined || !node) {
            const slot = document.createElement("slot");
            slotname = slotname || this._gen_id();
            slot.setAttribute("name", slotname);
            const div = document.createElement("div");
            div.classList.add("viewer-container");
            div.appendChild(slot);
            node = document.createElement("div");
            node.classList.add("workspace-widget");
            node.appendChild(div);
        } else {
            node = node.parentElement!.parentElement;
        }

        return node as HTMLElement;
    }

    async _createWidget({
        config,
        elem,
        viewer,
    }: {
        config?: psp_viewer.ViewerConfigUpdate;
        elem?: Element;
        viewer: HTMLPerspectiveViewerElement;
    }) {
        let node: HTMLElement = elem as HTMLElement;
        if (!node) {
            const slotname = viewer.getAttribute("slot") || undefined;
            node = this.node.querySelector(`slot[name=${slotname}]`)!;
            if (!node) {
                node = this._createNode(slotname)!;
            } else {
                node = node.parentElement!.parentElement!;
            }
        }

        const onAttach = () => {
            if (widget.viewer.parentElement !== this.element) {
                this.element.appendChild(widget.viewer);
            }

            const event = new CustomEvent("workspace-new-view", {
                detail: { config, widget },
            });

            this.element.dispatchEvent(event);
        };

        const widget = new PerspectiveViewerWidget({ node, viewer, onAttach });
        if (config) {
            await widget.restore(config);
        }

        widget.title.closable = true;
        this._addWidgetEventListeners(widget);
        return widget;
    }

    _addWidgetEventListeners(widget: PerspectiveViewerWidget) {
        if (this.listeners.has(widget)) {
            this.listeners.get(widget)!();
        }

        const contextMenu = (event: MouseEvent) =>
            this.showContextMenu(widget, event);

        const updated = async (event: CustomEvent) => {
            this.workspaceUpdated();
            // Sometimes plugins or other external code fires this event and
            //  does not populate this field!
            const config =
                typeof event.detail === "undefined"
                    ? await widget.viewer.save()
                    : event.detail;

            widget.title.label = config.title;
            widget._title = config.title;
            widget._is_pivoted = config.group_by?.length > 0;
        };

        widget.node.addEventListener("contextmenu", contextMenu);

        // Settings
        const settings_before = (event: CustomEvent) => {
            if (event.detail && this.dockpanel.mode !== "single-document") {
                this._maximize(widget);
            }
        };

        const settings_after = (event: CustomEvent) => {
            if (!event.detail && this.dockpanel.mode === "single-document") {
                this._unmaximize();
            }
        };

        widget.viewer.addEventListener(
            "perspective-status-indicator-click",
            (event) => {
                widget._titlebar_callback?.(event as MouseEvent);
            },
        );

        widget.viewer.addEventListener(
            "perspective-toggle-settings-before",
            settings_before,
        );

        widget.viewer.addEventListener(
            "perspective-toggle-settings",
            settings_after,
        );

        const delete_before = () => {
            if (!widget._deleted) {
                widget._deleted = true;
                widget.close();
            }
        };

        const delete_after = (event: CustomEvent) => {
            widget._titlebar?.handleEvent(event.detail as PointerEvent);
        };

        widget.viewer.addEventListener(
            "perspective-table-delete-before",
            delete_before,
        );

        widget.viewer.addEventListener(
            "perspective-statusbar-pointerdown",
            delete_after,
        );

        // @ts-ignore
        widget.viewer.addEventListener("perspective-config-update", updated);

        this.listeners.set(widget, () => {
            widget.node.removeEventListener("contextmenu", contextMenu);
            widget.viewer.removeEventListener(
                "perspective-table-delete-before",
                delete_before,
            );

            widget.viewer.removeEventListener(
                "perspective-table-delete",
                delete_after,
            );

            widget.viewer.removeEventListener(
                "perspective-toggle-settings",
                settings_before,
            );

            widget.viewer.removeEventListener(
                "perspective-toggle-settings",
                settings_after,
            );

            // @ts-ignore
            widget.viewer.removeEventListener(
                "perspective-config-update",
                updated,
            );
        });
    }

    getWidgetByName(name: string): PerspectiveViewerWidget | null {
        return (
            this.getAllWidgets().find(
                (x) => x.viewer.getAttribute("slot") === name,
            ) || null
        );
    }

    getAllWidgets(): PerspectiveViewerWidget[] {
        return [
            ...(this.masterPanel.widgets as PerspectiveViewerWidget[]),
            ...toArray(this.dockpanel.widgets()),
        ] as PerspectiveViewerWidget[];
    }

    /***************************************************************************
     *
     * `workspace-layout-update` event
     *
     */

    _throttle?: DebouncedFuncLeading<() => Promise<void>>;

    async workspaceUpdated() {
        // if (!this._throttle) {
        // this._throttle = throttle(async () => {
        const layout = await this.save();
        if (layout) {
            if (this._last_updated_state) {
                if (isEqual(this._last_updated_state, layout)) {
                    return;
                }
            }

            this._last_updated_state =
                layout as any as PerspectiveWorkspaceConfig;

            this.element.dispatchEvent(
                new CustomEvent("workspace-layout-update", {
                    detail: { layout },
                }),
            );
        }
        // }, 0);
        // }

        // this._throttle();
    }
}
