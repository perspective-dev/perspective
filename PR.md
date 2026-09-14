# Datagrid text, row and alignment options; `wait_for_table` restore option

Adds a set of grid-wide and per-column text/layout settings to
`perspective-viewer-datagrid`, exposed through two new host-owned control
kinds (`Font`, `Alignment`), and makes column width overrides a path-keyed
source of truth reconciled per fetched window. Also adds a `wait_for_table`
option to the `restore()` family so a config naming a not-yet-hosted table
pends instead of erroring.

## `plugin_config` (Datagrid)

New keys, all optional and elided from `save()` at their default. They are
rendered in the Plugin tab as two groups, `font` and `rows`, after the
existing `edit_mode` / `scroll_lock` / `column_menus` fields.

- `column_menus` (`boolean`, default `true`): hides the per-column edit-button header row while settings are open. Only `false` is serialized.
- `font_family` (`string`, default `"inherit"`): a CSS generic family or a local font family name (Local Font Access).
- `font_size` (`number`, default: theme font size in px).
- `bold` (`boolean`, default `false`).
- `italic` (`boolean`, default `false`).
- `word_wrap` (`boolean`, default `false`): wraps clipped cells (only columns narrower than their content) instead of ellipsis; rows never grow past `row_height`.
- `align` (`Align`, unset by default): one of the nine `top-left` … `bottom-right` tokens. Unset = numbers right, else left, vertically centered.
- `row_height` (`number`, default: theme row height in px): reported to `regular-table` as the data model's `row_height`.
- `zebra_rows` (`number`, default `0`, off): alternates every `zebra_rows` rows between plain and `zebra_color`.
- `zebra_color` (`string`, default: theme-derived blend): only advertised (and kept in the config) while `zebra_rows >= 1`.

Grid font/size/bold/italic are applied inline on the `regular-table` with
`!important` so a host page's `::part(regular-table)` theme rule cannot
override the user's choice.

## `columns_config` (Datagrid)

### New keys

Each new per-column key overrides the matching `plugin_config` key for that
column's body cells only (header cells keep the grid font). The column
schema's defaults are the grid's *current* `plugin_config` values, so a
column carries a key only when it differs from the grid.

- `font_family` (`string`).
- `font_size` (`number`): also clamps the wrap line count for that column.
- `bold` (`boolean`).
- `italic` (`boolean`).
- `word_wrap` (`boolean`): overrides the grid in both directions.
- `align` (`Align`): unset follows `plugin_config.align`, then the type default.
- `link` (`boolean`, string columns only): renders each value as an anchor to itself (new tab); linked cells are not editable.

### Renamed / removed keys (breaking)

String and datetime foreground and background styling are now independent,
each with its own mode and value keys. The old single-mode keys are no
longer read, so existing configs using them lose those settings.

- `string_color_mode` (`foreground` / `background` / `series`) → `string_fg_mode` + `string_bg_mode`, each `disabled` / `color` / `series`.
- `datetime_color_mode` (`foreground` / `background`) → `datetime_fg_mode` + `datetime_bg_mode`, each `disabled` / `color`.
- `color` → `fg_color` / `bg_color`.
- `palette` → `fg_palette` / `bg_palette`.
- `format` (`"link"`, `"bold"`, …) → `link`, `bold`, `italic` booleans.

The `StringFormat` control spec and the viewer-side `StringColumnStyle`
component are deleted along with these keys.

### `column_size_override`

Column widths are now a single path-keyed map owned by the plugin and
reconciled against `regular-table`'s size-key-keyed override map on every
fetched window (three-way merge against what the plugin last projected).
This fixes restored overrides not applying on first paint or being dropped
on a later `draw()`, and a drag deleting other columns' persisted widths.
After a drag or double-click reset the plugin echoes only the changed
columns back to the host. The resize listener is now capture-phase so it
survives a plugin swap. Widths under `split_by` remain live-only.

## Viewer / plugin API

- **`ControlSpec::Font`** — `{ kind: "Font", key, default, size?, bold?, italic? }`. The host owns the Local Font Access permission probe and prompt and the family list (with a measured web-safe fallback when unsupported or denied); the plugin receives plain values under each bound key.
- **`ControlSpec::Alignment`** — `{ kind: "Alignment", key, default?, corners? }`, a 3×3 anchor picker. `corners: true` limits it to the four corners; charts' `legend_anchor` now uses it instead of an `Enum`.
- **`plugin_config_schema(view_config, current_value)`** — the schema is now queried with the pending merged `plugin_config`, so a plugin can gate one field on another (`zebra_color` on `zebra_rows`) and the host drops keys the resulting schema no longer advertises.
- **Modified-column indicator** — `RendererProps.columns_config` and a `columns_config_changed` channel let the column selector mark active columns whose `columns_config` entry holds overridden keys.
- **`wait_for_table`** on `RestoreOptions`, new `RestoreWorkspaceOptions` and `AddPanelOptions`. By default an unknown `table` name is a hard error that leaves the panel untouched. With `wait_for_table: true` the panel is left unbound and pending (with a pending status icon) and binds when the table is created. A rebind probes the incoming table before the outgoing binding is dropped. The React `<PerspectiveViewer>` passes `wait_for_table: true` since props carry no ordering between table creation and config.
- **Debug panel** — an un-hosted `table` in the JSON editor is reported as a validation error anchored at the `"table"` key rather than pending; the editor keeps its text and error across the panel's own failed apply.

## Tests

New specs: `plugin_config_options`, `column_size_override`,
`alignment_control`, `font_family_local_fonts`, `modified_indicator`,
`debug_panel`; `table_lifecycle` extended for `wait_for_table`.
`column_style` and `column_settings` updated for the renamed keys.
