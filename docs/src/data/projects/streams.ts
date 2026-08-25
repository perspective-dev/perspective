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

import { MARKET } from "./market.js";
// @ts-ignore
import MARKET_LAYOUTS_JSON from "./market_layouts.json";
import { WEBCAM } from "./webcam.js";
// @ts-ignore
import WEBCAM_LAYOUTS_JSON from "./webcam_layouts.json";
import {
    type Project,
    type ProjectSource,
    singlePanel,
    slug,
} from "./types.js";

export interface LayoutEntry {
    title: string;
    [key: string]: unknown;
}

/**
 * Copied VERBATIM from `examples/blocks/src/{market,webcam}/layouts.json` —
 * the blocks stay canonical for themselves, since a cross-tree source import
 * would quietly re-couple the builds.
 */
export const MARKET_LAYOUTS = MARKET_LAYOUTS_JSON as LayoutEntry[];

export const WEBCAM_LAYOUTS = WEBCAM_LAYOUTS_JSON as LayoutEntry[];

/**
 * One shared streaming source per family — `loadProject`'s share-by-name rule
 * reuses the running feed rather than spawning a second simulation.
 */
export const MARKET_SOURCE: ProjectSource = {
    kind: "eval",
    name: "market",
    code: MARKET,
};

export const WEBCAM_SOURCE: ProjectSource = {
    kind: "eval",
    name: "webcam",
    code: WEBCAM,
};

/**
 * A layout by the title its `layouts.json` gives it.
 *
 * @param layouts the family's layout list.
 * @param title the layout's `title`; unknown titles throw at module load.
 */
export function layoutByTitle(
    layouts: LayoutEntry[],
    title: string,
): Record<string, unknown> {
    const found = layouts.find((l) => l.title === title);
    if (!found) {
        throw new Error(`Unknown layout "${title}"`);
    }

    return found;
}

/** Every Market layout, over one simulated order feed. */
export const MARKET_PROJECTS: Project[] = MARKET_LAYOUTS.map((layout) => ({
    id: `market-${slug(layout.title)}`,
    title: `Market — ${layout.title}`,
    description:
        "Simulated real-time order flow: a stateful matching engine on " +
        "a private worker, view-mirrored to the UI.",
    source: MARKET_SOURCE,
    workspace: singlePanel({ theme: null, ...layout }),
}));

/**
 * Every Webcam layout, over one camera sampler. Under the thumbnail harness
 * it samples a placeholder image, not a camera.
 */
export const WEBCAM_PROJECTS: Project[] = WEBCAM_LAYOUTS.map((layout) => ({
    id: `webcam-${slug(layout.title)}`,
    title: `Webcam — ${layout.title}`,
    description:
        "Live webcam luminance sampled into a Perspective table at 20fps " +
        "(falls back to a placeholder image without a camera).",
    source: WEBCAM_SOURCE,
    workspace: singlePanel(layout),
}));
