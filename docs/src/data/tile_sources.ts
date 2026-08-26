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

import { registerTileSource } from "@perspective-dev/viewer-charts";

/**
 * The CARTO basemaps, registered through the public `viewer-charts`
 * tile-source API so the docs site's map examples offer them alongside
 * the bundled providers. They live here rather than in the library's
 * bundled metadata — this file doubles as the worked example for the
 * "Map tile sources" guide page (how_to/javascript/map_tile_sources.md);
 * keep the two in sync, except the guide's templates append a
 * placeholder `?api_key=CARTO_API_KEY` to illustrate keyed providers —
 * these live registrations stay key-less (the public CARTO basemaps
 * don't require one).
 */
const CARTO_TILE_SOURCES = [
    {
        id: "carto-positron",
        label: "Light (Positron)",
        template: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        subdomains: ["a", "b", "c", "d"],
        attribution: "© OpenStreetMap contributors © CARTO",
        tile_size: 256,
        max_zoom: 19,
    },
    {
        id: "carto-dark-matter",
        label: "Dark Matter",
        template: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        subdomains: ["a", "b", "c", "d"],
        attribution: "© OpenStreetMap contributors © CARTO",
        tile_size: 256,
        max_zoom: 19,
    },
    {
        id: "carto-voyager",
        label: "Voyager",
        template:
            "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
        subdomains: ["a", "b", "c", "d"],
        attribution: "© OpenStreetMap contributors © CARTO",
        tile_size: 256,
        max_zoom: 19,
    },
];

export function registerCartoTileSources(): void {
    for (const spec of CARTO_TILE_SOURCES) {
        registerTileSource(spec);
    }
}
