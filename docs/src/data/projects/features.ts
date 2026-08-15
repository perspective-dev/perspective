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

// @ts-ignore - plain JS data module, predates this TypeScript tree
import FEATURES from "../features.js";
import { SUPERSTORE } from "./blocks.js";
import { type Project, singlePanel, slug } from "./types.js";

interface FeatureEntry {
    name: string;
    description?: string;
    config: Record<string, unknown>;
}

const ENTRIES = FEATURES as FeatureEntry[];

/**
 * A feature variant's `ViewerConfig`, by the name `features.js` gives it.
 *
 * @param name the variant's `name`; unknown names throw at module load.
 */
export function featureByName(name: string): Record<string, unknown> {
    const found = ENTRIES.find((f) => f.name === name);
    if (!found) {
        throw new Error(`Unknown feature variant "${name}"`);
    }

    return found.config;
}

/**
 * The single-panel variants that drove the retired docs feature montage,
 * re-expressed as Projects over one shared dataset. Several entries share a
 * `name`, so an id is disambiguated by position — it names a thumbnail file,
 * where a collision would silently overwrite.
 */
export const FEATURE_PROJECTS: Project[] = ENTRIES.map((feature, index) => ({
    id: `feature-${String(index).padStart(2, "0")}-${slug(feature.name)}`,
    title: feature.name,
    description: feature.description,
    source: SUPERSTORE,
    workspace: singlePanel({ ...feature.config, theme: null }),
}));
