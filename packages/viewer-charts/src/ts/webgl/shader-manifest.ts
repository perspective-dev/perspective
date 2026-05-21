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

import barVert from "../shaders/bar.vert.glsl";
import barFrag from "../shaders/bar.frag.glsl";
import lineVert from "../shaders/line.vert.glsl";
import lineFrag from "../shaders/line.frag.glsl";
import scatterVert from "../shaders/scatter.vert.glsl";
import scatterFrag from "../shaders/scatter.frag.glsl";
import areaVert from "../shaders/area.vert.glsl";
import areaFrag from "../shaders/area.frag.glsl";
import lineUniformVert from "../shaders/line-uniform.vert.glsl";
import lineUniformFrag from "../shaders/line-uniform.frag.glsl";
import yScatterVert from "../shaders/y-scatter.vert.glsl";
import yScatterFrag from "../shaders/y-scatter.frag.glsl";
import candlestickBodyVert from "../shaders/candlestick-body.vert.glsl";
import candlestickBodyFrag from "../shaders/candlestick-body.frag.glsl";
import heatmapVert from "../shaders/heatmap.vert.glsl";
import heatmapFrag from "../shaders/heatmap.frag.glsl";
import sunburstArcVert from "../shaders/sunburst-arc.vert.glsl";
import sunburstArcFrag from "../shaders/sunburst-arc.frag.glsl";
import treemapVert from "../shaders/treemap.vert.glsl";
import treemapFrag from "../shaders/treemap.frag.glsl";
import densitySplatVert from "../shaders/density-splat.vert.glsl";
import densitySplatFrag from "../shaders/density-splat.frag.glsl";
import densityExtremeFrag from "../shaders/density-extreme.frag.glsl";
import densityMrtVert from "../shaders/density-mrt.vert.glsl";
import densityMrtFrag from "../shaders/density-mrt.frag.glsl";
import densityResolveVert from "../shaders/density-resolve.vert.glsl";
import densityResolveFrag from "../shaders/density-resolve.frag.glsl";
import tileVert from "../shaders/tile.vert.glsl";
import tileFrag from "../shaders/tile.frag.glsl";

/**
 * One shader program in the build's static manifest. The `name` is the
 * cache key consumed by `ShaderRegistry.getOrCreate(name, ...)` —
 * call sites must pass the same name (and the same vert/frag source)
 * for the cache to hit. The single source of truth for both fields is
 * this file; glyph code re-imports from here so the manifest and the
 * call sites can never drift.
 */
export interface ShaderSpec {
    name: string;
    vert: string;
    frag: string;
}

/**
 * Every WebGL program the build ships, keyed by cache name. Used by
 * `ShaderRegistry.precompile(SHADER_MANIFEST)` to compile + link all
 * programs eagerly during renderer construction so the first-frame
 * path doesn't pay the compile cost inline.
 *
 * Names mirror the existing `getOrCreate` keys at each call site —
 * the lazy path stays valid; precompile just primes the cache early.
 */
export const SHADER_MANIFEST: readonly ShaderSpec[] = [
    { name: "bar", vert: barVert, frag: barFrag },
    { name: "line", vert: lineVert, frag: lineFrag },
    { name: "scatter", vert: scatterVert, frag: scatterFrag },
    { name: "bar-area", vert: areaVert, frag: areaFrag },
    { name: "bar-scatter", vert: yScatterVert, frag: yScatterFrag },

    // Shared by series-line glyph (`bar-line` consolidated here),
    // candlestick wicks, and OHLC. One compile per context.
    { name: "line-uniform", vert: lineUniformVert, frag: lineUniformFrag },
    {
        name: "candlestick-body",
        vert: candlestickBodyVert,
        frag: candlestickBodyFrag,
    },
    { name: "heatmap", vert: heatmapVert, frag: heatmapFrag },
    { name: "sunburst-arc", vert: sunburstArcVert, frag: sunburstArcFrag },
    { name: "treemap", vert: treemapVert, frag: treemapFrag },
    {
        name: "density-splat",
        vert: densitySplatVert,
        frag: densitySplatFrag,
    },
    {
        name: "density-extreme",
        vert: densitySplatVert,
        frag: densityExtremeFrag,
    },
    {
        name: "density-resolve",
        vert: densityResolveVert,
        frag: densityResolveFrag,
    },
    // The MRT variant declares `#extension GL_EXT_draw_buffers :
    // require` and only compiles on contexts that advertise it. The
    // glyph compiles it lazily after probing `OES_draw_buffers_indexed`
    // — adding it here would crash precompile on hardware without
    // multi-render-target support.

    // Map tile basemap (textured quad in Mercator space). Compiled
    // unconditionally because the program is GLSL 100 and links on
    // every WebGL1/2 context; the loader only kicks in when a map
    // plugin tag activates.
    { name: "map-tile", vert: tileVert, frag: tileFrag },
];

// Re-export each shader source so glyph modules can import their
// source from the manifest rather than from `../shaders/*.glsl`
// directly. This keeps the manifest's vert/frag fields and the
// `getOrCreate` call sites pointing at exactly the same string
// constants — module dedup ensures reference identity, so cache
// hits work even on the lazy path.
export {
    barVert,
    barFrag,
    lineVert,
    lineFrag,
    scatterVert,
    scatterFrag,
    areaVert,
    areaFrag,
    lineUniformVert,
    lineUniformFrag,
    yScatterVert,
    yScatterFrag,
    candlestickBodyVert,
    candlestickBodyFrag,
    heatmapVert,
    heatmapFrag,
    sunburstArcVert,
    sunburstArcFrag,
    treemapVert,
    treemapFrag,
    densitySplatVert,
    densitySplatFrag,
    densityExtremeFrag,
    densityMrtVert,
    densityMrtFrag,
    densityResolveVert,
    densityResolveFrag,
    tileVert,
    tileFrag,
};
