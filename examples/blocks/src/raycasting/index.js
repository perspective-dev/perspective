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

import perspective from "/node_modules/@finos/perspective/dist/cdn/perspective.js";

const RESOLUTION = 100;

const EXPRESSION = `
// Scene constants
var resolution := ${RESOLUTION};
var fov := 30 * (pi / 180);
var camera[3] := {0, 0, -600};
var light[3] := {0.5, 1, 0};

// Torus constants
var radius := 1;
var tube := 0.4;
var radialSegments := 12;
var tubularSegments := 16;
var rotation := 40 * (pi / 180);

// Mesh
var arc := pi * 2;
var vs[663];
for (var j := 0; j <= radialSegments; j += 1) {
    for (var i := 0; i <= tubularSegments; i += 1) {

        // Vertex
        var u := (i / tubularSegments) * arc;
        var v := (j / radialSegments) * pi * 2;
        var i0 := j * 3 * (tubularSegments + 1) + (i * 3);
        vs[i0] := (radius + tube * cos(v)) * cos(u) * 100;
        vs[i0 + 1] := (radius + tube * cos(v)) * sin(u) * 100;
        vs[i0 + 2] := tube * sin(v) * 100;

        // Rotate
        var b := vs[i0 + 1];
        var bcos := cos(rotation);
        var bsin := sin(rotation);
        vs[i0 + 1] := vs[i0 + 1] * bcos - vs[i0 + 2] * bsin;
        vs[i0 + 2] := b * bsin + vs[i0 + 2] * bcos;
        b := vs[i0];
        vs[i0] := vs[i0] * bcos - vs[i0 + 2] * bsin;
        vs[i0 + 2] := b * bsin + vs[i0 + 2] * bcos;
    }
}

// Render scene
var scale := resolution / (tan(fov / 2) * 400);
var x := (floor(index() / resolution) - resolution / 2) / scale;
var y := (index() % resolution - resolution / 2) / scale;
var d[3] := {x, y, 200};
var color := 0;
var depth := inf;
var light_norm := norm3(light);
for (var j := 1; j <= radialSegments; j += 1) {
    for (var i := 1; i <= tubularSegments; i += 1) {

        // Index
        var aa := (tubularSegments + 1) * j + i - 1;
        var b := (tubularSegments + 1) * (j - 1) + i - 1;
        var c := (tubularSegments + 1) * (j - 1) + i;
        var dd := (tubularSegments + 1) * j + i;
        var face[6] := {aa, b, dd, b, c, dd};
        for (var ii:= 0; ii < 2; ii += 1) {
            var i0 := face[ii * 3];
            var i1 := face[ii * 3 + 1];
            var i2 := face[ii * 3 + 2];
            var v0[3] := {vs[i0 * 3], vs[i0 * 3 + 1], vs[i0 * 3 + 2]};
            var v1[3] := {vs[i1 * 3], vs[i1 * 3 + 1], vs[i1 * 3 + 2]};
            var v2[3] := {vs[i2 * 3], vs[i2 * 3 + 1], vs[i2 * 3 + 2]};

            // Render triangle
            var e1[3] := v1 - v0;
            var e2[3] := v2 - v0;
            var h[3];
            cross_product3(d, e2, h);
            var a := dot_product3(e1, h);
            if (a != 0) {
                var f := 1 / a;
                var s[3] := camera - v0;
                var u := f * dot_product3(s, h);
                if (u > 0 and u < 1) {
                    var q[3];
                    cross_product3(s, e1, q);
                    var v := f * dot_product3(d, q);
                    if (v > 0 and u + v < 1) {
                        var t := f * dot_product3(e2, q);
                        if (t >= 0) {
                            var t2 := 1 - u - v;
                            var d1[3] := v0 * t2 + v1 * u + v2 * v;
                            var dist := norm3(d1 - camera);
                            if (dist < depth) {
                                depth := dist;

                                // Lighting
                                var n[3];
                                cross_product3(v0 - v1, v2 - v1, n);
                                color := acos(dot_product3(light, n) / (light_norm * norm3(n)))
                            }
                        }
                    }
                }
            }
        }
    }
};

color;
`.trim();

const LAYOUT = {
    title: "Raycasting",
    plugin: "Heatmap",
    group_by: [`x`],
    split_by: [`y`],
    columns: ["color"],
    expressions: {
        color: EXPRESSION,
        x: `floor(index() / ${RESOLUTION}) - ${RESOLUTION} / 2`,
        y: `index() % ${RESOLUTION} - ${RESOLUTION} / 2`,
    },
    settings: true,
    theme: "Pro Dark",
};

const heatmap_plugin = await window.viewer.getPlugin("Heatmap");
heatmap_plugin.max_cells = 100000;
const worker = await perspective.worker();
const index = new Array(Math.pow(RESOLUTION, 2)).fill(0);
const table = worker.table({ index });
window.viewer.load(table);
await window.viewer.restore(LAYOUT);
