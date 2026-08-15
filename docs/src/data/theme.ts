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

import type { HTMLPerspectiveViewerElement } from "@perspective-dev/viewer";
import { signal } from "./signal.js";

const STORAGE_KEY = "perspective-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

export type Theme = "light" | "dark";

/** The `perspective-viewer` theme each color scheme selects. */
const VIEWER_THEMES: Record<Theme, string> = {
    light: "Pro Light",
    dark: "Pro Dark",
};

const THEME = signal<Theme>(stored() ?? preferred());

function stored(): Theme | undefined {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === "light" || raw === "dark" ? raw : undefined;
}

function preferred(): Theme {
    return matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

/**
 * Stamp the docs chrome's color scheme.
 *
 * `data-theme` is written only once the user has CHOSEN — until then the
 * attribute stays absent and `style.css` resolves the palette from
 * `prefers-color-scheme` alone, so the first paint is never a flash of the
 * wrong theme waiting on this module to load.
 */
function stampChrome(theme: Theme, explicit: boolean) {
    if (explicit) {
        document.documentElement.dataset.theme = theme;
    }
}

/**
 * Re-order the viewer's theme registry so this scheme's theme is the default.
 *
 * The registry's FIRST entry is the default, which is what every panel
 * carrying `theme: null` resolves to — so ordering it is what makes the
 * corpus follow the toggle without pinning a theme into any config.
 *
 * @param viewer the app's `perspective-viewer`.
 */
let pending = 0;
async function stampViewer(viewer: HTMLPerspectiveViewerElement, theme: Theme) {
    const generation = ++pending;
    const want = VIEWER_THEMES[theme];
    const themes: string[] = await viewer.getThemes();
    if (generation !== pending || !themes.includes(want)) {
        return;
    }

    await viewer.resetThemes([want, ...themes.filter((x) => x !== want)]);

    // A zero-panel viewer has nothing to restore INTO — `restore()` without
    // a `table` rejects there — and needs nothing: `resetThemes` above
    // re-stamped the default every future panel adopts.
    if (viewer.getPanelNames().length > 0) {
        await viewer.restore({ theme: want }).catch(() => {});
    }
}

/** The active color scheme. */
export function currentTheme(): Theme {
    return THEME.get();
}

/**
 * Subscribe to theme changes, invoked immediately with the current theme.
 *
 * @param listener called with the theme on every change.
 */
export function subscribeTheme(listener: (theme: Theme) => void): () => void {
    return THEME.subscribe(listener);
}

/**
 * Bind the theme to the viewer and adopt the stored or preferred scheme.
 *
 * @param viewer the app's `perspective-viewer`.
 */
export async function initTheme(viewer: any) {
    stampChrome(THEME.get(), stored() !== undefined);
    matchMedia(DARK_QUERY).addEventListener("change", (event) => {
        if (stored() === undefined) {
            setTheme(event.matches ? "dark" : "light", false);
        }
    });

    await customElements.whenDefined("perspective-viewer");
    subscribeTheme((theme) => void stampViewer(viewer, theme));
}

/**
 * Switch the color scheme and notify every subscriber.
 *
 * @param theme the scheme to adopt.
 * @param persist whether this is a user choice, which outranks the OS
 * preference from here on.
 */
export function setTheme(theme: Theme, persist = true) {
    if (theme === THEME.get()) {
        return;
    }

    if (persist) {
        localStorage.setItem(STORAGE_KEY, theme);
    }

    stampChrome(theme, persist || stored() !== undefined);
    THEME.set(theme);
}
