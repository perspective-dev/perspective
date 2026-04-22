# Plugin render limits

`<perspective-viewer>` plugins (especially charts) may in some cases generate
extremely large output which may lock up the browser. In order to prevent
accidents (which generally require a browser refresh to fix), each plugin has a
`max_cells` and `max_columns` heuristic which requires the user to opt-in to
fully rendering `View`s which exceed these limits. To override this behavior,
set these values for each plugin type individually, _before_ the plugin itself
is rendered (e.g. calling `HTMLPerspectiveViewerElement::restore` with the
respective `plugin` name).

If you have a `<perspective-viewer>` instance, you can configure plugins via
`HTMLPerspectiveViewerElement::getPlugin` and
`HTMLPerspectiveViewerElement::getAllPlugins`:

```javascript
const viewer = document.querySelector("perspective-viewer");
const plugin = viewer.getPlugin("Treemap");
plugin.max_cells = 1_000_000;
plugin.max_columns = 1000;
```

... Or alternatively, you can look up the Custom Element classes and set the
static variants if you know the element name (you can e.g. look this up in your
browser's DOM inspector):

```javascript
const plugin = customElements.get("perspective-viewer-charts-treemap");
plugin.max_cells = 1_000_000;
plugin.max_columns = 1000;
```
