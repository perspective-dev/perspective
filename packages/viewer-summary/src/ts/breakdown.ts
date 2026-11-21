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

import type { BreakdownPoint } from "./types.ts";

const SVG_NS = "http://www.w3.org/2000/svg";
const SIZE = 100;
const LINE_INSET = 4;
const BAR_FILL = 0.8;

function svg_element(name: string, attrs: Record<string, string | number>) {
    const elem = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attrs)) {
        elem.setAttribute(key, String(value));
    }

    return elem;
}

function titled(elem: SVGElement, point: BreakdownPoint): SVGElement {
    const title = document.createElementNS(SVG_NS, "title");
    title.textContent = `${point.label}: ${point.text}`;
    elem.appendChild(title);
    return elem;
}

function draw_bars(svg: SVGSVGElement, points: BreakdownPoint[]): void {
    const values = points.map((x) => x.value ?? 0);
    const lo = Math.min(0, ...values);
    const hi = Math.max(0, ...values);
    const span = hi - lo || 1;
    const band = SIZE / points.length;
    const y = (v: number) => SIZE - ((v - lo) / span) * SIZE;
    points.forEach((point, index) => {
        const value = point.value ?? 0;
        const top = y(Math.max(value, 0));
        const bottom = y(Math.min(value, 0));
        svg.appendChild(
            titled(
                svg_element("rect", {
                    class: "mark bar",
                    "data-index": index,
                    x: index * band + (band * (1 - BAR_FILL)) / 2,
                    y: top,
                    width: band * BAR_FILL,
                    height: Math.max(bottom - top, 1),
                }),
                point,
            ),
        );
    });
}

function draw_line(svg: SVGSVGElement, points: BreakdownPoint[]): void {
    const present = points.flatMap((x) => (x.value === null ? [] : [x.value]));
    const lo = Math.min(...present);
    const hi = Math.max(...present);
    const span = hi - lo || 1;
    const last = Math.max(points.length - 1, 1);
    const x = (i: number) =>
        points.length === 1 ? SIZE / 2 : (i / last) * SIZE;
    const y = (v: number) =>
        SIZE - LINE_INSET - ((v - lo) / span) * (SIZE - 2 * LINE_INSET);

    const coords = points.flatMap((point, index) =>
        point.value === null ? [] : [[x(index), y(point.value)]],
    );

    if (coords.length > 0) {
        const path = coords.map(([px, py]) => `${px},${py}`).join(" ");
        const first = coords[0][0];
        const end = coords[coords.length - 1][0];
        svg.appendChild(
            svg_element("polygon", {
                class: "area",
                points: `${first},${SIZE} ${path} ${end},${SIZE}`,
            }),
        );

        svg.appendChild(
            svg_element("polyline", {
                class: "line",
                points: path,
                "vector-effect": "non-scaling-stroke",
            }),
        );
    }

    const band = SIZE / points.length;
    points.forEach((point, index) => {
        svg.appendChild(
            titled(
                svg_element("rect", {
                    class: "mark hit",
                    "data-index": index,
                    x: index * band,
                    y: 0,
                    width: band,
                    height: SIZE,
                }),
                point,
            ),
        );
    });
}

/** Redraw `svg` as the breakdown of `points`, or empty it when there are none. */
export function draw_breakdown(
    svg: SVGSVGElement,
    points: BreakdownPoint[] | undefined,
    kind: "line" | "bar" | undefined,
): void {
    svg.replaceChildren();
    if (points === undefined || points.length === 0) {
        return;
    }

    if (kind === "line") {
        draw_line(svg, points);
    } else {
        draw_bars(svg, points);
    }
}

/** A new, empty breakdown `<svg>` that stretches to its box. */
export function create_breakdown(): SVGSVGElement {
    return svg_element("svg", {
        class: "breakdown",
        viewBox: `0 0 ${SIZE} ${SIZE}`,
        preserveAspectRatio: "none",
    }) as SVGSVGElement;
}
