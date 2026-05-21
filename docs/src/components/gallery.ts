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

import EXAMPLES from "../data/features.js";
import { WORKER, SUPERSTORE_TABLE } from "../data/superstore.js";
import { getColorMode, getPerspectiveTheme } from "./theme.js";

function showOverlay(index: number) {
    const overlay = document.createElement("div");
    overlay.className = "gallery-overlay";

    const viewer = document.createElement("perspective-viewer") as any;
    viewer.setAttribute("theme", getPerspectiveTheme());
    overlay.appendChild(viewer);

    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) {
            overlay.remove();
        }
    });

    document.body.appendChild(overlay);

    SUPERSTORE_TABLE.then((table: any) => {
        viewer.load(WORKER);
        viewer.restore({
            plugin: "Datagrid",
            table: "superstore",
            group_by: [],
            expressions: {},
            split_by: [],
            sort: [],
            aggregates: {},
            ...EXAMPLES[index].config,
            settings: true,
        });
    });
}

interface MontageMap {
    tile_width: number;
    tile_height: number;
    columns: number;
    order: number[];
}

export async function initGallery(container: HTMLElement) {
    const resp = await fetch("/features/montage_map.json");
    const map: MontageMap = await resp.json();
    const rows = Math.ceil(map.order.length / map.columns);
    const isDark = getColorMode() === "dark";
    const img = document.createElement("img");
    img.alt = "Perspective feature gallery";
    img.src = `/features/montage${isDark ? "_dark" : "_light"}.png`;
    img.addEventListener("click", (event: MouseEvent) => {
        const col = Math.floor((event.offsetX / img.offsetWidth) * map.columns);
        const row = Math.floor((event.offsetY / img.offsetHeight) * rows);
        const tileIndex = row * map.columns + col;
        const featureIndex = map.order[tileIndex];
        if (featureIndex === undefined) {
            return;
        }

        showOverlay(featureIndex);
    });

    container.appendChild(img);
}
