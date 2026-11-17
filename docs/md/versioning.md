# Versioning

<!-- description: Perspective's release numbering and compatibility guarantees for packages, the client/server protocol and saved viewer and workspace configs. -->

Every Perspective package is released together under one version: the
`@perspective-dev/*` npm packages, the `perspective-python` wheel and the
`perspective*` Rust crates. `major.minor` is the compatibility boundary.
Perspective does not follow strict semver: a minor release may contain breaking
changes.

| Release                   | May contain                                                                                                                                                                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Patch (`5.9.1` → `5.9.2`) | Fixes and additive features. No breaking API changes, no client/server protocol changes and no saved-config schema changes.                                                                                                                                                                      |
| Minor (`5.8.0` → `5.9.0`) | Breaking changes to any public API, the client/server protocol, the saved-config schema, defaults, and the minimum supported Node.js, Python or browser versions. Each is listed under **Breaking** in the [changelog](https://github.com/perspective-dev/perspective/blob/master/CHANGELOG.md). |
| Major (`4.x` → `5.0.0`)   | Changes to architecture or packaging which need more than a config migration to adopt.                                                                                                                                                                                                           |

Removed APIs are not deprecated first: a removal ships in the minor release that
replaces it. Saved configs are covered by
[`perspective-migrate`](./how_to/rust/migrate.md) instead.

## Mixing versions

Use the same version of every Perspective package in an application. Within a
`major.minor`, mixing is tolerated:

- **Package ranges.** The `@perspective-dev/*` npm packages depend on each other
  with `~x.y.z` ranges, and the `perspective*` crates with `~x.y.z`
  requirements, so a package manager never pairs releases of different minors.
  `@perspective-dev/client` pins `@perspective-dev/server` exactly, because the
  client's JavaScript loads the server's WebAssembly directly.
- **One `major.minor` per page.** In the browser, copies of Perspective of the
  same `major.minor` share one registry of WebAssembly binaries and runtimes.
  Each copy of another patch release logs a console warning when it loads, and
  Perspective's `init()` functions throw when a release of another `major.minor`
  has registered on the same page.
- **Client and server.** A client and a server of the same `major.minor`
  interoperate over a WebSocket, whatever their patch versions. The protocol has
  no version handshake, so a mismatch across minor releases is not detected up
  front: it surfaces as a decode error or as missing fields.
- **Python and Jupyter.** `PerspectiveWidget` loads the
  `@perspective-dev/viewer` release matching the installed `perspective-python`,
  and treats `version` stamps of the same `major.minor` as equal.

## Saved configs

`save()` and `saveWorkspace()` stamp the `version` that wrote the token.

- **Same `major.minor`.** `restore()`, `restoreWorkspace()` and `addPanel()`
  accept a token saved by any release of the same `major.minor`, older or newer
  patch. They validate the config's shape and do not check `version`; when a
  token fails to restore and was saved by a release of another `major.minor`,
  the error names that release.
- **Older releases.** `migrate()` upgrades a config written by any release since
  2.0.0 to the current schema, and reports what it could not carry over as
  `notices`. It keeps information, not behavior: changed defaults are not
  reversed.
- **Newer patch releases.** `migrate()` passes a config from a newer patch of
  its own `major.minor` through unmigrated and with its `version` unchanged,
  with a `NewerPatch` notice. The config must still validate against the current
  types.
- **Newer minor or major releases.** `migrate()` rejects the config with a
  `FromFuture` error.
- **`validate()`** checks a config's shape against the current types and ignores
  `version`.
