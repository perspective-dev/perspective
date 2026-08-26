# Map tile sources

The map plugins (`Map Scatter`, `Map Line`, `Map Density`) draw their glyphs
over a raster XYZ basemap. Which basemap is used is controlled by the
`map_tile_provider` `plugin_config` field, an enum of _tile sources_ — each a
small metadata record describing where to fetch tiles and how to attribute them.
Two providers ship with `@perspective-dev/viewer-charts`:

- `osm` OpenStreetMap's standard raster tiles (the default)
- `versatiles-satellite` Global satellite imagery from
  [VersaTiles](https://versatiles.org)

## Registering a custom tile source

Any raster XYZ provider can be added at runtime with `registerTileSource`,
exported from the `@perspective-dev/viewer-charts` module. Registered sources
appear in the settings panel's "Map provider" control alongside the bundled ones
and are available to every current and future map chart. For example, the
[CARTO](https://carto.com) basemaps:

```javascript
import { registerTileSource } from "@perspective-dev/viewer-charts";

for (const [id, label, path] of [
    ["carto-positron", "Light (Positron)", "light_all"],
    ["carto-dark-matter", "Dark Matter", "dark_all"],
    ["carto-voyager", "Voyager", "rastertiles/voyager"],
]) {
    registerTileSource({
        id,
        label,
        template: `https://{s}.basemaps.cartocdn.com/${path}/{z}/{x}/{y}.png?api_key=CARTO_API_KEY`,
        subdomains: ["a", "b", "c", "d"],
        attribution: "© OpenStreetMap contributors © CARTO",
        tile_size: 256,
        max_zoom: 19,
    });
}
```

If you consume the plugin as a registered Custom Element rather than an ES
module, the same function is available as a static on the plugin element class:

```javascript
customElements
    .get("perspective-viewer-charts-map-scatter")
    .registerTileSource({ ... });
```

`tileSources()` (also exported, and available as a static) returns the current
list of registered specs.
