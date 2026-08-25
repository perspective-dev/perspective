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

import {
    type EngineInfo,
    engine as getEngine,
    subscribeEngines,
} from "../data/engines.js";
import {
    type Source,
    listSources,
    removeSource,
    subscribeSources,
} from "../data/sources.js";
import { currentTheme, setTheme, subscribeTheme } from "../data/theme.js";
import { escape, html, query } from "./dom.js";
import { initSplitter } from "./splitter.js";

const WIDTH_KEY = "perspective-sidebar-width";
const COLLAPSED_KEY = "perspective-sidebar-collapsed";
const MIN_WIDTH = 180;
const DEFAULT_WIDTH = 350;

/** Keep in sync with `--sidebar-gutter` in `app_shell.css`. */
const GUTTER_WIDTH = 24;

const TEMPLATE = `<aside class="sidebar">
    <button type="button" class="sidebar__gutter" aria-label="Expand sidebar">
        <span class="sidebar__gutter-label">Sources</span>
    </button>
    <div class="sidebar__brand">
        <a class="sidebar__logo" href="/">
            <img alt="Perspective" src="/svg/perspective-logo-dark.svg" />
        </a>
        <div class="sidebar__brand-right">
            <ul class="sidebar__links">
                <li><a href="/guide/index.html">Docs</a></li>
                <li>
                    <a href="https://github.com/perspective-dev/perspective">
                        GitHub
                    </a>
                </li>
            </ul>
            <button type="button" class="sidebar__theme"></button>
            <button
                type="button"
                class="sidebar__collapse"
                aria-label="Collapse sidebar"
            ></button>
        </div>
    </div>
    <button
        type="button"
        id="create_source"
        class="sidebar__action sidebar__action--browse"
    >Import Data</button>
    <button
        type="button"
        id="browse_projects"
        class="sidebar__action sidebar__action--browse"
    >Browse Projects</button>
    <div class="sidebar__tree"></div>
    <div class="sidebar__footer">
        <button
            type="button"
            id="configure_agent"
            class="sidebar__action"
        >Configure Agent</button>
    </div>
</aside>`;

const SPLITTER = `<div
    class="sidebar__splitter"
    role="separator"
    aria-orientation="vertical"
    tabindex="0"
></div>`;

export interface SidebarHandles {
    /** Opens the "Create Data Source" modal. */
    createSource: HTMLButtonElement;

    /** Opens the Project gallery as a modal. */
    browseProjects: HTMLButtonElement;

    /** Opens the agent configuration dialog. */
    configureAgent: HTMLButtonElement;
}

export interface SidebarActions {
    /** Toggle the DuckDB SQL drawer; renders a `SQL` button on that engine. */
    openSql?: () => void;
}

function statusText(info: EngineInfo, sources: number): string {
    switch (info.status) {
        case "ready":
            // return `ready · ${sources} source${sources === 1 ? "" : "s"}`;
            return "ready";
        case "failed":
            return "failed";
        case "starting":
            return "starting…";
        default:
            return "not started";
    }
}

function sourceMarkup(source: Source, panels: number, active: boolean): string {
    return `<li class="source${active ? " source--active" : ""}"
        data-source="${escape(source.id)}">
        <span class="source__label" title="${escape(source.table)}"
            >${escape(source.label)}</span>
        <span class="source__count" title="${panels} panel(s)"
            >${panels || ""}</span>
        <button
            type="button"
            class="source__delete"
            aria-label="Delete ${escape(source.label)}"
        >×</button>
    </li>`;
}

function engineMarkup(
    info: EngineInfo,
    sources: string[],
    sql: boolean,
): string {
    const status = `<div class="engine__status engine__status--${info.status}"
        ${info.error ? `title="${escape(info.error)}"` : ""}
        >${escape(statusText(info, sources.length))}</div>`;

    const body = sources.length
        ? `<ul class="engine__sources">${sources.join("")}</ul>`
        : `<div class="engine__empty">No sources loaded</div>`;

    const sql_button = sql
        ? `<button
            type="button"
            class="engine__sql"
            aria-label="Toggle the DuckDB SQL panel"
        >SQL</button>`
        : "";

    return `<section class="engine">
        <div class="engine__name">
            <span>${escape(info.label)}</span>
            ${sql_button}
            ${status}
        </div>
        ${body}
    </section>`;
}

function newResizer(
    shell: HTMLElement,
    viewer: any,
    splitter: HTMLElement,
): (width: number) => void {
    let frame = 0;
    function presize(width: number) {
        if (frame) {
            return;
        }

        // frame = requestAnimationFrame(() => {
        //     frame = 0;
        //     viewer.resize?.({
        //         dimensions: {
        //             width: shell.clientWidth - width,
        //             height: viewer.clientHeight,
        //         },
        //     });
        // });
    }

    function applyWidth(px: number): number {
        const max = Math.max(MIN_WIDTH, shell.clientWidth * 0.5);
        const clamped = Math.min(Math.max(px, MIN_WIDTH), max);
        shell.style.setProperty("--sidebar-width", `${clamped}px`);
        localStorage.setItem(WIDTH_KEY, String(clamped));
        return clamped;
    }

    initSplitter(splitter, {
        toPx: (e) => e.clientX - shell.getBoundingClientRect().left,
        current: () => {
            const current = parseInt(
                getComputedStyle(shell).getPropertyValue("--sidebar-width"),
                10,
            );

            return Number.isNaN(current) ? DEFAULT_WIDTH : current;
        },
        growKey: "ArrowRight",
        shrinkKey: "ArrowLeft",
        apply: (px) => presize(applyWidth(px)),
    });

    applyWidth(Number(localStorage.getItem(WIDTH_KEY) ?? DEFAULT_WIDTH));
    return presize;
}

function newThemeToggle(aside: HTMLElement) {
    const button = query<HTMLButtonElement>(aside, ".sidebar__theme");
    const logo = query<HTMLImageElement>(aside, ".sidebar__logo img");
    subscribeTheme((theme) => {
        const dark = theme === "dark";
        const label = `Switch to the ${dark ? "light" : "dark"} theme`;
        button.title = label;
        button.setAttribute("aria-label", label);
        logo.src = `/svg/perspective-logo-${dark ? "dark" : "light"}.svg`;
    });

    button.addEventListener("click", () =>
        setTheme(currentTheme() === "dark" ? "light" : "dark"),
    );
}

function newCollapse(
    shell: HTMLElement,
    aside: HTMLElement,
    presize: (width: number) => void,
) {
    function setCollapsed(collapsed: boolean) {
        shell.dataset.sidebar = collapsed ? "collapsed" : "expanded";
        localStorage.setItem(COLLAPSED_KEY, String(collapsed));
        presize(
            collapsed
                ? GUTTER_WIDTH
                : Number(localStorage.getItem(WIDTH_KEY) ?? DEFAULT_WIDTH),
        );
    }

    query(aside, ".sidebar__collapse").addEventListener("click", () =>
        setCollapsed(true),
    );

    query(aside, ".sidebar__gutter").addEventListener("click", () =>
        setCollapsed(false),
    );

    setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "true");
}

/**
 * The engine tree, site chrome and primary actions.
 *
 * @param shell the app shell the sidebar is prepended to.
 * @param viewer the `perspective-viewer` whose panels bind sources.
 * @param actions optional chrome the sidebar surfaces per engine.
 */
export function initSidebar(
    shell: HTMLElement,
    viewer: any,
    actions: SidebarActions = {},
): SidebarHandles {
    const aside = html(TEMPLATE);
    const splitter = html(SPLITTER);
    const tree = query(aside, ".sidebar__tree");
    const browseProjects = query<HTMLButtonElement>(aside, "#browse_projects");
    shell.prepend(aside, splitter);

    let panelTables = new Map<string, string>();
    let activePanel: string | null = null;
    let engines: EngineInfo[] = [];
    let sources: Source[] = listSources();

    function panelsFor(source: Source): string[] {
        return [...panelTables.entries()]
            .filter(([, table]) => table === source.table)
            .map(([id]) => id);
    }

    function render() {
        tree.innerHTML = engines
            .map((info) =>
                engineMarkup(
                    info,
                    sources
                        .filter((s) => s.engine === info.id)
                        .map((source) => {
                            const panels = panelsFor(source);
                            return sourceMarkup(
                                source,
                                panels.length,
                                panels.includes(activePanel ?? ""),
                            );
                        }),
                    info.id === "duckdb-wasm" && !!actions.openSql,
                ),
            )
            .join("");
    }

    async function panelTable(id: string): Promise<string | undefined> {
        try {
            const config = await viewer.save({ panel: id });
            return config?.table ?? undefined;
        } catch {
            return undefined;
        }
    }

    async function refreshPanelIndex(ids: string[]) {
        const next = new Map<string, string>();
        await Promise.all(
            ids.map(async (id) => {
                const table = await panelTable(id);
                if (table) {
                    next.set(id, table);
                }
            }),
        );

        panelTables = next;
        render();
    }

    async function dependentsOf(source: Source): Promise<string[]> {
        const ids: string[] = viewer.getPanelNames();
        const bound = await Promise.all(
            ids.map(async (id) =>
                (await panelTable(id)) === source.table ? id : undefined,
            ),
        );

        return bound.filter((id): id is string => !!id);
    }

    async function destroy(id: string) {
        const source = sources.find((s) => s.id === id);
        if (!source) {
            return;
        }

        const dependents = await dependentsOf(source);
        if (dependents.length > 0) {
            const plural = dependents.length === 1 ? "panel" : "panels";
            const ok = confirm(
                `Delete "${source.label}"? This closes ${dependents.length} ${plural}.`,
            );

            if (!ok) {
                return;
            }
        }

        for (const panel of dependents) {
            await viewer.removePanel(panel);
        }

        try {
            const engine = await getEngine(source.engine);
            await engine.drop(source.table.replace(/^memory\./, ""));
        } catch (err) {
            console.error(`Could not drop ${source.table}`, err);
            return;
        }

        removeSource(source.id);
    }

    tree.addEventListener("click", (event) => {
        const target = event.target as HTMLElement;
        if (target.closest(".engine__sql")) {
            actions.openSql?.();
            return;
        }

        const id = target
            .closest(".source__delete")
            ?.closest<HTMLElement>(".source")?.dataset.source;

        if (id) {
            void destroy(id);
        }
    });

    viewer.addEventListener(
        "perspective-layout-update",
        (event: CustomEvent) => {
            void refreshPanelIndex(event.detail?.panels ?? []);
        },
    );

    viewer.addEventListener(
        "perspective-active-panel-update",
        (event: CustomEvent) => {
            activePanel = event.detail?.panel ?? null;
            render();
        },
    );

    subscribeEngines((info) => {
        engines = info;
        render();
    });

    subscribeSources((next) => {
        sources = next;
        browseProjects.disabled = next.length === 0;
        browseProjects.title = browseProjects.disabled
            ? "The project gallery is already showing"
            : "";

        render();
    });

    newThemeToggle(aside);
    newCollapse(shell, aside, newResizer(shell, viewer, splitter));

    return {
        createSource: query<HTMLButtonElement>(aside, "#create_source"),
        browseProjects,
        configureAgent: query<HTMLButtonElement>(aside, "#configure_agent"),
    };
}
