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

import { createSource } from "../data/create_source.js";
import { PROJECTS, projectById } from "../data/projects/corpus.js";
import { type Project, thumbnailUrl } from "../data/projects/types.js";
import {
    addSource,
    listSources,
    nextSourceId,
    subscribeSources,
} from "../data/sources.js";
import { currentTheme, subscribeTheme } from "../data/theme.js";
import { errorText, escape, html, query } from "./dom.js";

const PROJECT_PARAM = "project";
const BASE_TITLE = document.title;

const TEMPLATE = `<div class="projects">
    <button
        type="button"
        class="projects__close"
        aria-label="Close project gallery"
    >×</button>
    <div class="projects__grid"></div>
    <div class="projects__status" aria-live="polite"></div>
</div>`;

/**
 * How a route change relates to the history stack. `push` is a user
 * selection (a NEW entry); `replace` corrects the entry already showing
 * (deep-link boot, popstate, a stage emptied by deleting its last source);
 * `none` is the thumbnail harness, which drives loads that are not
 * navigation at all.
 */
type RouteMode = "push" | "replace" | "none";

export interface ProjectGalleryHandle {
    /** Show the gallery as a modal — for browsing after a source is loaded. */
    openModal(): void;
}

function currentRouteId(): string | null {
    return new URLSearchParams(location.search).get(PROJECT_PARAM);
}

function route(project: Project | null, mode: RouteMode): void {
    if (mode === "none") {
        return;
    }

    document.title = project ? `${project.title} — ${BASE_TITLE}` : BASE_TITLE;
    const url = new URL(location.href);
    if (project) {
        url.searchParams.set(PROJECT_PARAM, project.id);
    } else {
        url.searchParams.delete(PROJECT_PARAM);
    }

    if (url.href === location.href) {
        return;
    }

    if (mode === "push") {
        history.pushState(null, "", url);
    } else {
        history.replaceState(null, "", url);
    }
}

function retarget(workspace: any, table: string): any {
    const panels: Record<string, any> = {};
    for (const [id, panel] of Object.entries(workspace.panels ?? {})) {
        panels[id] = { ...(panel as object), table };
    }

    return { ...workspace, panels };
}

function cardMarkup(project: Project): string {
    const title = project.description
        ? ` title="${escape(project.description)}"`
        : "";

    return `<button
        type="button"
        class="projects__card"
        data-project="${escape(project.id)}"${title}
    >
        <img
            class="projects__thumb"
            loading="lazy"
            decoding="async"
            alt=""
            src="${escape(thumbnailUrl(project.id, currentTheme()))}"
        />
        <span class="projects__title">${escape(project.title)}</span>
    </button>`;
}

/**
 * Create a Project's source and restore its layout over it.
 *
 * @param viewer the `perspective-viewer` to restore into.
 * @param project the corpus entry to load.
 */
export async function loadProject(viewer: any, project: Project) {
    const source = project.source;
    const engine =
        source.kind === "generated" || source.kind === "eval"
            ? "perspective-server"
            : source.engine;

    const existing = listSources().find(
        (s) => s.engine === engine && s.label === source.name,
    );

    const created = existing ?? (await createSource(source));
    await viewer.restoreWorkspace(retarget(project.workspace, created.table));
    if (!existing) {
        addSource({
            id: nextSourceId(),
            engine,
            table: created.table,
            label: created.label,
            kind: source.kind,
        });
    }
}

/**
 * The gallery of saved starting points, and the app's `?project=<id>` router.
 *
 * @param shell the app shell the gallery stands in the viewer's place within.
 * @param viewer the `perspective-viewer` a chosen Project is restored into.
 */
export function initProjectGallery(
    shell: HTMLElement,
    viewer: any,
): ProjectGalleryHandle {
    const bootRoute = currentRouteId();
    const root = html(TEMPLATE);
    const grid = query(root, ".projects__grid");
    const status = query(root, ".projects__status");
    const dialog = html<HTMLDialogElement>(
        `<dialog class="modal modal--projects"></dialog>`,
    );

    shell.appendChild(root);
    document.body.appendChild(dialog);

    let inModal = false;
    let stageEmpty = true;
    let loading = false;

    /**
     * `loading` puts the viewer on stage BEFORE the source and layout exist,
     * so it is attached, sized and painting while they load rather than
     * being revealed fully-formed afterwards. A failed load leaves
     * `stageEmpty` true, which returns the gallery.
     */
    function syncStage() {
        const onStage = loading || !stageEmpty;
        shell.dataset.stage = onStage ? "viewer" : "projects";
        root.hidden = inModal ? false : onStage;
    }

    function openModal() {
        if (inModal) {
            return;
        }

        inModal = true;
        root.classList.add("projects--modal");
        dialog.appendChild(root);
        syncStage();
        dialog.showModal();
    }

    /**
     * Return the gallery to the stage, SYNCHRONOUSLY. `dialog.close()` only
     * queues its `close` event, so a caller that closes and then re-opens
     * within the same turn would otherwise race the handler; doing the work
     * here and letting the event re-enter as a no-op removes the ordering
     * question entirely.
     */
    function leaveModal() {
        if (!inModal) {
            return;
        }

        inModal = false;
        root.classList.remove("projects--modal");
        shell.appendChild(root);
        dialog.close();
        syncStage();
    }

    async function open(id: string, mode: RouteMode = "push") {
        const project = projectById(id);
        if (!project) {
            if (currentRouteId() !== null) {
                route(null, "replace");
            }

            return;
        }

        const fromModal = inModal;
        root.classList.add("projects--busy");
        status.textContent = `Loading ${project.title}…`;
        loading = true;
        leaveModal();
        syncStage();
        try {
            await loadProject(viewer, project);
            status.textContent = "";
            route(project, mode);
        } catch (err) {
            // The modal was dismissed optimistically; bring it back, or a
            // failure reported into the hidden gallery is never seen.
            status.textContent = errorText(err);
            if (fromModal) {
                openModal();
            }
        } finally {
            loading = false;
            root.classList.remove("projects--busy");
            syncStage();
        }
    }

    dialog.addEventListener("close", leaveModal);

    dialog.addEventListener("click", (event) => {
        if (event.target === dialog) {
            dialog.close();
        }
    });

    query(root, ".projects__close").addEventListener("click", () =>
        dialog.close(),
    );

    grid.addEventListener("click", (event) => {
        const id = (event.target as HTMLElement).closest<HTMLElement>(
            ".projects__card",
        )?.dataset.project;

        if (id) {
            void open(id);
        }
    });

    grid.addEventListener(
        "load",
        (event) => {
            (event.target as HTMLElement).classList.add(
                "projects__thumb--ready",
            );
        },
        true,
    );

    grid.addEventListener(
        "error",
        (event) => {
            const image = event.target as HTMLImageElement;
            image
                .closest(".projects__card")
                ?.classList.add("projects__card--untitled");

            image.remove();
        },
        true,
    );

    let sawSource = false;
    subscribeSources((sources) => {
        stageEmpty = sources.length === 0;
        if (stageEmpty && sawSource && currentRouteId() !== null) {
            route(null, "replace");
        }

        sawSource = sawSource || !stageEmpty;
        syncStage();
    });

    window.addEventListener("popstate", () => {
        const id = currentRouteId();
        if (id) {
            void open(id, "replace");
            return;
        }

        route(null, "replace");
        if (!stageEmpty) {
            openModal();
        }
    });

    grid.innerHTML = PROJECTS.map(cardMarkup).join("");

    subscribeTheme((theme) => {
        for (const image of grid.querySelectorAll<HTMLImageElement>(
            ".projects__thumb",
        )) {
            const id =
                image.closest<HTMLElement>(".projects__card")?.dataset.project;

            if (id) {
                image.src = thumbnailUrl(id, theme);
            }
        }
    });

    (window as any).__loadProject = (id: string) => open(id, "none");
    (window as any).__projectIds = () => PROJECTS.map((p) => p.id);

    stageEmpty = listSources().length === 0;
    syncStage();

    if (bootRoute) {
        void open(bootRoute, "replace");
    }

    return { openModal };
}
