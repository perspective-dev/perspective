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

import type { PlotLayout } from "../layout/plot-layout";
import { MAX_ZOOM, MIN_ZOOM, type ZoomController } from "./zoom-controller";

/**
 * Resolver that maps a cursor position to `{ controller, layout }` —
 * returns `null` when the cursor is not inside any facet. In
 * independent-zoom mode the facet under the cursor owns its events; in
 * shared-zoom mode the resolver always returns the same controller for
 * every plot rect in the grid.
 */
export interface ZoomTarget {
    controller: ZoomController;
    layout: PlotLayout;
}

/**
 * Apply a wheel-zoom delta to the resolved target. The worker
 * dispatches interaction events forwarded from the host's
 * `RawEventForwarder` and calls this directly.
 */
export function applyWheel(
    target: ZoomTarget,
    mouseX: number,
    mouseY: number,
    deltaY: number,
): void {
    const { controller, layout } = target;
    const plot = layout.plotRect;

    const domain = controller.getVisibleDomain();
    const dataX =
        domain.xMin +
        ((mouseX - plot.x) / plot.width) * (domain.xMax - domain.xMin);
    const dataY =
        domain.yMax -
        ((mouseY - plot.y) / plot.height) * (domain.yMax - domain.yMin);

    const factor = Math.pow(1.1, -deltaY / 100);
    const locked = controller.lockedAxis;
    if (locked !== "x") {
        controller.scaleX = Math.max(
            MIN_ZOOM,
            Math.min(MAX_ZOOM, controller.scaleX * factor),
        );
    }

    if (locked !== "y") {
        controller.scaleY = Math.max(
            MIN_ZOOM,
            Math.min(MAX_ZOOM, controller.scaleY * factor),
        );
    }

    const newDomain = controller.getVisibleDomain();
    const newDataX =
        newDomain.xMin +
        ((mouseX - plot.x) / plot.width) * (newDomain.xMax - newDomain.xMin);
    const newDataY =
        newDomain.yMax -
        ((mouseY - plot.y) / plot.height) * (newDomain.yMax - newDomain.yMin);

    const bxRange = controller.baseXRange;
    const byRange = controller.baseYRange;
    if (locked !== "x" && bxRange > 0) {
        controller.normTranslateX += (dataX - newDataX) / bxRange;
    }

    if (locked !== "y" && byRange > 0) {
        controller.normTranslateY += (dataY - newDataY) / byRange;
    }
}

/**
 * Apply a drag-pan delta to the resolved target. Exported for the
 * same reason as {@link applyWheel}: worker-mode interaction
 * dispatch reuses the math without owning DOM listeners.
 */
export function applyPan(target: ZoomTarget, dx: number, dy: number): void {
    const { controller, layout } = target;
    const domain = controller.getVisibleDomain();
    const plot = layout.plotRect;
    const dataPerPixelX = (domain.xMax - domain.xMin) / plot.width;
    const dataPerPixelY = (domain.yMax - domain.yMin) / plot.height;

    const locked = controller.lockedAxis;
    const bxRange = controller.baseXRange;
    const byRange = controller.baseYRange;
    if (locked !== "x" && bxRange > 0) {
        controller.normTranslateX -= (dx * dataPerPixelX) / bxRange;
    }

    if (locked !== "y" && byRange > 0) {
        controller.normTranslateY += (dy * dataPerPixelY) / byRange;
    }
}
