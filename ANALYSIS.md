## Revised Analysis: Test Failures from PubSub-to-Props Refactor

After analyzing the `git diff`, the initial 159 failures stemmed from **prop-threading timing/completeness issues** introduced by replacing PubSub subscriptions with value-semantic props snapshotted in the root `PerspectiveViewer` component. Below are the 6 root causes, their fixes (where applied), and current status.

**Current test results:** 18 failing, 141 passing, 16 skipped.

---

### Issue A: `settings_open` prop is not synchronized with internal `self.settings_open` — FIXED

**Groups affected:** 1 (snapshot mismatches), 3 (`#sub-columns` missing), 4 (`#settings_close_button` missing)

**Root cause:** The root component computed `is_settings_open` from **two different sources**:

```rust
// For SettingsPanel rendering:
let is_settings_open = self.settings_open && self.session_props.has_table;
// For MainPanel prop:
let is_settings_open = self.presentation_props.is_settings_open;
```

`self.settings_open` is toggled synchronously by `ToggleSettingsComplete`, while `self.presentation_props.is_settings_open` is updated asynchronously by the `UpdateSettingsOpen` message from a PubSub subscription. These were out of sync — `MainPanel` received the stale `false` value from the PubSub-derived prop, rendering in "settings-closed" mode (missing the status bar menu, reset button, etc.).

**Fix applied:** Unified to use `self.settings_open && self.session_props.has_table` for both `SettingsPanel` rendering and the `MainPanel` prop in `viewer.rs`.

---

### Issue B: Initial `session_props` snapshot misses table state + stale metadata reads — FIXED

**Groups affected:** 2 (`.expression-edit-button` missing), 3 (`#sub-columns` missing)

**Root cause:** Two layers:

1. **PartialEq gap:** `ActiveColumn` and `InactiveColumn` read `session.metadata()` directly in their `view()` methods to determine `col_type`, `is_expression`, and `show_edit_btn`. Since these values weren't part of the components' props, metadata changes after `view_created` didn't trigger re-renders through Yew's prop diffing.

2. **Metadata staleness:** `SessionProps` didn't capture any metadata-derived state, so when the `view_created` PubSub fired and expression columns were validated in metadata, the props didn't change → no re-render → `ColumnsIteratorSet::expression()` returned empty → `#sub-columns` not rendered.

**Fix applied (two parts):**

- Added `num_expression_columns: usize` to `SessionProps` (in `state.rs`), populated from `self.metadata().get_expression_columns().count()` in `Session::to_props()`. This ensures metadata changes after expression validation trigger a prop diff and re-render.

- Threaded `num_expression_columns` through the full chain: `viewer.rs` → `SettingsPanelProps` → `ColumnSelectorProps`, with `PartialEq` updated at each level.

- Computed `col_type`, `is_expression`, and `show_edit_btn` in the parent `ColumnSelector::view()` and passed them as explicit props to `ActiveColumn` and `InactiveColumn`, replacing direct `session.metadata()` reads in child components.

---

### Issue C: `render_limits` prop shape mismatch (snapshot tests) — RESOLVED (side effect of A+B fixes)

**Groups affected:** 1 (snapshot mismatches)

**Root cause:** The initial `renderer_props.render_limits` is `None` (because `to_props(None)` is called in `create()`), and only populates when the renderer has actually drawn. This is correct behavior — the `bool` is properly stripped at the root — but snapshot tests compared the entire shadow DOM, amplifying differences caused by Issues A and B.

**Status:** The snapshot mismatches that were attributed to this issue were actually caused by Issues A and B. With those fixed, the snapshot tests now pass. No separate fix was needed.

---

### Issue D: `available_themes` initially empty → theme selector missing — FIXED

**Groups affected:** 1 (snapshot mismatches), theme tests

**Root cause:** The initial `PresentationProps` in `create()` seeded `available_themes` with an empty `Vec`:

```rust
let presentation_props = ctx.props().presentation.to_props(Rc::new(vec![]));
```

The old code had `StatusBar` subscribe directly to `theme_config_updated` and call `fetch_initial_theme()` in its `create()`. The new code removed both. If the `theme_config_updated` PubSub fired before the root component's subscription was registered (a race), the theme list stayed empty permanently.

**Fix applied:** Added an initial async theme fetch in the root component's `create()` that spawns a task calling `presentation.get_available_themes()` and dispatches `UpdatePresentation` with the result. This ensures themes are populated regardless of PubSub timing.

---

### Issue E: Plugin registration not propagated to `PluginSelector` (1 test) — NOT YET FIXED

**Group affected:** Plugin priority order test

**Root cause:** `PluginSelector` was rewritten to be stateless, receiving `available_plugins: Rc<Vec<String>>` as a prop. The test registers a custom `HighPriority` plugin then calls `viewer.reset()`. If the renderer's `reset()` clears plugin state and `to_props()` is snapshotted before re-registration, the plugin list won't include the custom plugin. The error "Unknown plugin 'HighPriority'" indicates the `restore()` path can't find the plugin.

**Remaining tests:** 1 (`plugins.spec.js`)

---

### Issue F: Hidden expression columns not in inactive list — NOT YET FIXED (subsumed by remaining failures)

**Group affected:** Expression column visibility in inactive list

**Root cause:** `ColumnsIteratorSet::expression()` calls `self.metadata.get_expression_columns()` which reads from session metadata. In the new code, re-renders are driven by `view_config` prop changes, but `get_expression_columns()` reads from metadata (which tracks validated/registered expressions), not from the `ViewConfig`. Hidden expressions (in `config.expressions` but not `config.columns`) may not appear if the `view_created` event hasn't triggered a `SessionProps` update that flows down.

**Note:** The `num_expression_columns` fix partially addresses this by ensuring metadata changes trigger re-renders, but the underlying data source (`metadata.get_expression_columns()` vs `config.expressions`) has not been changed.

---

### Remaining Failures (18 tests)

After fixing Issues A, B, and D, the remaining 18 failures break down as:

| Category | Count | Description |
|----------|-------|-------------|
| Column settings sidebar tabs | 12 | `interactions.spec.ts` — sidebar tab state (`#Style` tab not visible when expected after activate/aggregate/groupby actions on expr_col) |
| Attributes tab | 2 | `attributes_tab.spec.ts` — expression name editing and delete button |
| Column settings tabs | 2 | `column_settings.spec.ts` — tab click and tab persistence across column manipulation |
| Load idempotency | 1 | `load.spec.js` — "Load called twice with the same Table should be inert" |
| Plugin priority | 1 | `plugins.spec.js` — Issue E, custom plugin registration |

The 12 interaction test failures share a pattern: after an action (activate, aggregate, groupby) on an expression column, the column settings sidebar opens but doesn't show the expected `#Style` tab. This suggests the sidebar's tab resolution logic doesn't detect the column type correctly post-action, likely because `ColumnSettingsPanel` reads column metadata that hasn't been updated via props yet.

---

### Summary

| Issue | Root Cause | Tests Fixed | Status |
|-------|-----------|-------------|--------|
| **A** | Dual `is_settings_open` sources | ~100 | **FIXED** — unified to `self.settings_open` |
| **B** | Stale metadata reads + missing `num_expression_columns` prop | ~37 | **FIXED** — threaded metadata-derived props |
| **C** | Initial `render_limits = None` | ~0 (side effect) | **RESOLVED** — no separate fix needed |
| **D** | `available_themes` starts empty, no initial fetch | 4 | **FIXED** — added initial async theme fetch |
| **E** | Plugin snapshot timing during `reset()` | 0 | **NOT FIXED** — 1 test remaining |
| **F** | Expression metadata source | 0 | **PARTIALLY ADDRESSED** — `num_expression_columns` helps but root cause remains |

**Progress:** 159 failures → 18 failures (141 tests fixed).
