# Migrating saved configs

`<perspective-viewer>`'s `restore()`, `addPanel()` and `restoreWorkspace()`
accept only the current config schema: a config which fails validation (for
example, a key the format does not define) is rejected, and when it is stamped
with another release's `version` the error names that release. Engine
`ViewConfig`s passed to `table.view()` likewise accept only the current form
(for example, `expressions` must be a map of names to expressions).

Configs persisted by an older release — `save()` and `saveWorkspace()` tokens,
`view.get_config()` output, or hand-written `ViewConfig`s — are upgraded by
`migrate()`, which rewrites any JSON config written by a release since 2.0.0
into the current schema. It is available from `@perspective-dev/client` (in the
browser and in Node.js), from `@perspective-dev/viewer`, from the `perspective`
Python package, and as the `perspective-migrate` Rust crate.

## Usage

The release that wrote a config is read from its `version` field, which `save()`
and `saveWorkspace()` have stamped since 2.7.0. A config without one takes the
optional `from_version` argument, and without either it is treated as written by
2.0.0. Each workspace panel's own `version` decides how that panel is upgraded,
so a 2.x–4.x `<perspective-workspace>` layout, whose envelope was never stamped,
needs no `from_version` when its panels were.

In the browser, the migration WebAssembly binary is registered alongside the
engine binaries and downloaded only by the first `migrate()` call (the CDN
bundles register it automatically):

```javascript
import perspective from "@perspective-dev/client";
import perspective_viewer from "@perspective-dev/viewer";

perspective.init_server({
    wasm32: () => fetch(SERVER_WASM),
    wasm64: () => fetch(SERVER_WASM64),
    migrate: () => fetch(MIGRATE_WASM),
});

await perspective_viewer.init_client({
    viewer: () => fetch(VIEWER_WASM),
    migrate: () => fetch(MIGRATE_WASM),
});

const { value, notices } = await perspective_viewer.migrate("workspace", saved);
await viewer.restoreWorkspace(value);
```

`MIGRATE_WASM` is
`@perspective-dev/client/dist/wasm/perspective-migrate-js.wasm`. In Node.js,
`perspective.migrate()` needs no registration.

```python
import perspective

result = perspective.migrate("viewer", token)
viewer_config = result["value"]
```

```bash
cargo add perspective-migrate
```

```rust
use perspective_migrate::{Kind, Migrator};

let migrated = Migrator::new().migrate(Kind::Viewer, None, token)?;
for notice in &migrated.notices {
    eprintln!("{notice:?}");
}

save(migrated.value);
```

The first argument names the document being upgraded (`Kind` in Rust):

| JavaScript / Python | Rust              | Document                                                          |
| ------------------- | ----------------- | ----------------------------------------------------------------- |
| `"view"`            | `Kind::View`      | An engine `ViewConfig`, as passed to `table.view()`               |
| `"viewer"`          | `Kind::Viewer`    | A `<perspective-viewer>` `save()` / `restore()` token             |
| `"workspace"`       | `Kind::Workspace` | A `saveWorkspace()` token, or a 2.x–4.x `<perspective-workspace>` |

Viewer and workspace output is stamped with the current `version`, so migrating
it again changes nothing; `ViewConfig`s have no `version`, but every
`ViewConfig` upgrade leaves a current config unchanged. Each upgrade also
reports `notices` for information which has no current representation
(`Dropped`, with the removed value) or which could only be approximated
(`Approximated`), and `steps`, the ids of the schema changes that applied.

A config is rejected with a `MigrateError` only when no valid current form
exists — for example a pre-5.2 workspace panel with no `table`, or a 2.x
`ViewConfig` which names both an alias and its canonical key (`row_pivot` and
`group_by`).

## Third-party plugins

A plugin's `plugin_config` and `columns_config` payloads are migrated by a
`PluginMigration`, keyed by the Perspective release that wrote the token:

```rust
use perspective_migrate::{Migrator, PluginMigration, Step, Version};

struct Sparkline;

impl PluginMigration for Sparkline {
    fn plugins(&self) -> &[&'static str] {
        &["Sparkline"]
    }

    fn steps(&self) -> Vec<Step> {
        vec![Step {
            at: Version::new(3, 0, 0),
            id: "sparkline.line_width",
            apply: rename_width,
        }]
    }
}

let migrator = Migrator::new().with_plugin(Sparkline);
```

## What is not migrated

`perspective-migrate` produces a config which is _valid_ for the current release
and keeps the information the old config expressed. Changes to defaults and
behavior are not reversed, so a migrated config renders as a new config with the
same settings would today:

- Engine: 2.x ignored filters with a `null` term; date filter terms captured
  from 3.0.x – 3.4.2 `get_config()` used seconds and 0-based months; an
  all-`null` group's `sum` is `null` rather than `0` since 5.6.0 (use
  `sum or zero`).
- Column styles: string `"series"` colors derived from a hue rotation (before
  5.3.0); float fraction-digit defaults merged rather than replaced (5.3.1).
- Charts: the `domain_mode`, `interpolate`, `facet_mode` and `legend_mode`
  defaults, and the map `numeric_axes` default.
- Derived tables created from grouped views before 5.6.0, whose key columns were
  named `"<column> (Group by N)"`.
- Binary `"string"` / `"arraybuffer"` tokens written by 2.0 – 4.0, which must be
  re-saved as JSON by the release that wrote them.
