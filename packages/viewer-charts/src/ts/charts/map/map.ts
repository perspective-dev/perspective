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

import { CartesianChart } from "../cartesian/cartesian";
import { PointGlyph } from "../cartesian/glyphs/points";
import { LineGlyph } from "../cartesian/glyphs/lines";
import { DensityGlyph } from "../cartesian/glyphs/density";
import type { Glyph } from "../cartesian/glyph";
import type { WebGLContextManager } from "../../webgl/context-manager";
import type { PlotLayout } from "../../layout/plot-layout";
import type { Theme } from "../../theme/theme";
import type { Canvas2D, Context2D } from "../canvas-types";
import type { ZoomConfig } from "../../interaction/zoom-controller";
import type { PluginConfig } from "../chart";
import { TileLayer } from "../../map/tile-layer";
import { tileSourceFor, type TileProviderId } from "../../map/tile-source";
import { lonLatToMercator } from "../../map/mercator";
import { getScaledContext } from "../../axis/canvas";

/**
 * Map-mode base for cartesian charts. Reuses the entire cartesian
 * pipeline (build, hit-test, zoom controller, lazy tooltips, faceting,
 * theme, gradient texture) and swaps three behaviors:
 *
 *  - `projectPoint(lon, lat)` Mercator-projects incoming columns so
 *    the rest of the pipeline operates in meter-space (linear
 *    projection matrix, screen-space splat radius, hit-test grid all
 *    "just work").
 *  - `_renderMode = "map"` flips the render-frame branches to skip
 *    cartesian gridlines and axes, insert a basemap layer before the
 *    glyph draw, and use the map-specific chrome (attribution).
 *  - `getZoomConfig()` returns `lockAspect: true` so wheel zoom keeps
 *    `dataPerPixel` uniform on both axes (required: Mercator
 *    preserves angle, glyphs distort otherwise).
 *
 * Concrete map plugin tags (`map-scatter`, `map-line`, `map-density`)
 * pin a glyph in their nullary constructor exactly like the cartesian
 * convenience subclasses.
 */
export class MapChart extends CartesianChart {
    override _renderMode = "map" as const;

    private _tileLayer: TileLayer;

    constructor(glyph: Glyph) {
        super(glyph);
        this._tileLayer = new TileLayer();
        this._tileLayer.setOnTileLoad(() => {
            // Tile arrival schedules a fresh frame through the shared
            // render scheduler; no-ops if a frame is already pending.
            if (this._glManager) {
                this.requestRender(this._glManager);
            }
        });
    }

    override projectPoint(lon: number, lat: number): [number, number] {
        return lonLatToMercator(lon, lat);
    }

    protected override getZoomConfig(): ZoomConfig {
        return { lockAspect: true };
    }

    override setPluginConfig(cfg: PluginConfig): void {
        super.setPluginConfig(cfg);
        if (this._glManager) {
            this._tileLayer.setSource(
                this._glManager.gl,
                tileSourceFor(cfg.map_tile_provider as TileProviderId),
            );
        }

        this._tileLayer.setAlpha(cfg.map_tile_alpha);
    }

    override renderBackground(
        glManager: WebGLContextManager,
        layout: PlotLayout,
        projection: Float32Array,
        domain: { xMin: number; xMax: number; yMin: number; yMax: number },
        xOrigin: number,
        yOrigin: number,
    ): void {
        // Lazy source bind — `setPluginConfig` runs before
        // `_glManager` is wired in some host bootstraps, so we
        // re-attempt on first render if needed.
        if (!this._tileLayer.source) {
            this._tileLayer.setSource(
                glManager.gl,
                tileSourceFor(
                    this._pluginConfig.map_tile_provider as TileProviderId,
                ),
            );
            this._tileLayer.setAlpha(this._pluginConfig.map_tile_alpha);
        }

        this._tileLayer.render(
            glManager,
            layout,
            projection,
            domain,
            xOrigin,
            yOrigin,
        );
    }

    override renderMapChrome(
        canvas: Canvas2D | null,
        layout: PlotLayout,
        theme: Theme,
        dpr: number,
    ): void {
        if (!canvas) {
            return;
        }

        const ctx = getScaledContext(canvas, dpr) as Context2D | null;
        if (!ctx) {
            return;
        }

        const attribution = this._tileLayer.source?.attribution ?? "";
        if (!attribution) {
            return;
        }

        const plot = layout.plotRect;
        ctx.save();
        ctx.font = `10px ${theme.fontFamily}`;
        ctx.textAlign = "right";
        ctx.textBaseline = "bottom";

        // Pill background so attribution stays legible over any tile.
        const padding = 4;
        const metrics = ctx.measureText(attribution);
        const textW = metrics.width;
        const textH = 12;
        const x = plot.x + plot.width - 4;
        const y = plot.y + plot.height - 4;
        ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
        ctx.fillRect(
            x - textW - padding * 2,
            y - textH - padding,
            textW + padding * 2,
            textH + padding,
        );
        ctx.fillStyle = theme.labelColor;
        ctx.fillText(attribution, x - padding, y - padding / 2);
        ctx.restore();
    }

    protected override destroyInternal(): void {
        if (this._glManager) {
            this._tileLayer.destroy(this._glManager.gl);
        }

        super.destroyInternal();
    }
}

/**
 * Map Scatter — Mercator scatter on a raster basemap. Same glyph as
 * `X/Y Scatter`; only projection and chrome differ.
 */
export class MapScatterChart extends MapChart {
    constructor() {
        super(new PointGlyph());
    }
}

/**
 * Map Line — Mercator polyline on a raster basemap. Same glyph as
 * `X/Y Line`.
 */
export class MapLineChart extends MapChart {
    constructor() {
        super(new LineGlyph());
    }
}

/**
 * Map Density — Mercator KDE on a raster basemap. Same glyph as
 * `Density`; the four `gradient_color_mode` variants
 * (density/mean/extreme/signed) are all available on the map too
 * because the glyph reads `_pluginConfig` directly.
 */
export class MapDensityChart extends MapChart {
    constructor() {
        super(new DensityGlyph());
    }
}
