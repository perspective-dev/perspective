# Datagrid column styles

When the Datagrid plugin is active, each entry of a panel's `columns_config`
styles one column, keyed by column name. Which keys a column accepts depends on
its type, and a key or mode the column's type does not accept rejects the
`restore()` call. The Style tab, and the agent's `get_style_schema` tool, expose
the same declaration at runtime.

```javascript
await viewer.restore({
    plugin: "Datagrid",
    columns_config: {
        Sales: {
            number_format: { style: "currency", currency: "USD" },
            fg_mode: "bar",
        },
        "Order Date": { date_format: { dateStyle: "medium", timeZone: "UTC" } },
        Region: { fg_mode: "series" },
    },
});
```

Values equal to the plugin's default are left out of `save()`, so an unedited
column saves nothing. To change a default for every viewer on the page, see
[Configuration defaults](./config_defaults.md).

## Keys by column type

| Key                    | Column types          | Value                                                                           |
| ---------------------- | --------------------- | ------------------------------------------------------------------------------- |
| `fg_mode`              | numeric, string, date | Foreground treatment (see [Color modes](#color-modes))                          |
| `bg_mode`              | numeric, string, date | Background treatment (see [Color modes](#color-modes))                          |
| `fg_color`             | numeric, string, date | CSS color, palette or gradient string, read according to `fg_mode`              |
| `bg_color`             | numeric, string, date | As `fg_color`, read according to `bg_mode`                                      |
| `fg_gradient`          | numeric               | Absolute value at which `"bar"` and `"label-bar"` reach full scale              |
| `bg_gradient`          | numeric               | Absolute value at which `"gradient"` background reaches full scale              |
| `number_format`        | numeric               | `Intl.NumberFormat`-style options (see [Number formats](#number-formats))       |
| `date_format`          | date, datetime        | `Intl.DateTimeFormat`-style options (see [Datetime formats](#datetime-formats)) |
| `link`                 | string                | `true` renders each value as a hyperlink to itself (not editable)               |
| `align`                | all                   | `"left"`, `"center"`, `"right"`, or a corner or edge such as `"top-left"`       |
| `font_family`          | all                   | Font family, overriding `plugin_config.font_family`                             |
| `font_size`            | all                   | Font size in CSS pixels, overriding `plugin_config.font_size`                   |
| `bold` / `italic`      | all                   | Overrides `plugin_config.bold` / `plugin_config.italic`                         |
| `word_wrap`            | all                   | `true` wraps clipped text, `false` clips it with an ellipsis                    |
| `column_size_override` | all                   | Pixel width, written when a user drag-resizes the column                        |
| `aggregate_depth`      | all                   | Group-by rollup depth for this column in `Rollup` mode                          |

"Numeric" means `integer` and `float` columns; "date" means `date` and
`datetime` columns. Boolean columns accept no color modes.

## Color modes

| Column type | `fg_mode`                                                 | `bg_mode`                                                  |
| ----------- | --------------------------------------------------------- | ---------------------------------------------------------- |
| numeric     | `"color"` (default), `"bar"`, `"label-bar"`, `"disabled"` | `"disabled"` (default), `"color"`, `"gradient"`, `"pulse"` |
| string      | `"disabled"` (default), `"color"`, `"series"`             | `"disabled"` (default), `"color"`, `"series"`              |
| date        | `"disabled"` (default), `"color"`                         | `"disabled"` (default), `"color"`                          |

- Numeric `"color"` colors text (or fills the background) by sign; `"bar"` draws
  a bar proportional to the value, and `"label-bar"` adds the label;
  `"gradient"` scales the fill to the value; `"pulse"` flashes the cell when its
  value changes.
- String `"series"` assigns one palette entry to each distinct value, in the
  order values are encountered.

The `fg_color` and `bg_color` string grammar for each mode, and how to reference
theme colors with `var(--psp-user--…)`, is described in
[Colors, palettes and gradients](./save_restore.md#colors-palettes-and-gradients).

## Number formats

`number_format` is a subset of
[`Intl.NumberFormat` options](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat/NumberFormat),
using the same camelCase names:

| Option                                                 | Values                                                                                                                                                          |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `style`                                                | `"decimal"` (default), `"currency"`, `"percent"`, `"unit"`                                                                                                      |
| `currency`, `currencyDisplay`, `currencySign`          | With `style: "currency"`. `currencyDisplay`: `"symbol"` (default), `"narrowSymbol"`, `"code"`, `"name"`. `currencySign`: `"standard"` (default), `"accounting"` |
| `unit`, `unitDisplay`                                  | With `style: "unit"`. `unitDisplay`: `"short"` (default), `"narrow"`, `"long"`                                                                                  |
| `minimumIntegerDigits`                                 | Number                                                                                                                                                          |
| `minimumFractionDigits`, `maximumFractionDigits`       | Number                                                                                                                                                          |
| `minimumSignificantDigits`, `maximumSignificantDigits` | Number                                                                                                                                                          |
| `roundingPriority`                                     | `"auto"`, `"morePrecision"`, `"lessPrecision"`                                                                                                                  |
| `roundingIncrement`, `roundingMode`                    | As in `Intl.NumberFormat`                                                                                                                                       |
| `trailingZeroDisplay`                                  | `"auto"`, `"stripIfInteger"`                                                                                                                                    |
| `notation`                                             | `"standard"`, `"scientific"`, `"engineering"`, `"compact"` (with `compactDisplay`: `"short"` or `"long"`)                                                       |
| `useGrouping`                                          | `"always"`, `"auto"`, `"min2"`, or `false`                                                                                                                      |
| `signDisplay`                                          | `"auto"`, `"always"`, `"exceptZero"`, `"negative"`, `"never"`                                                                                                   |

```javascript
await viewer.restore({
    columns_config: {
        Profit: {
            number_format: {
                style: "currency",
                currency: "USD",
                currencySign: "accounting",
                maximumFractionDigits: 0,
            },
        },
        Discount: { number_format: { style: "percent" } },
    },
});
```

## Datetime formats

`date_format` uses either the `dateStyle` / `timeStyle` presets (`"full"`,
`"long"`, `"medium"`, `"short"`) or per-part fields, never both, plus optional
`timeZone` (an IANA name such as `"America/New_York"`) and `hour12`:

| Field                      | Values                                        |
| -------------------------- | --------------------------------------------- |
| `weekday`                  | `"long"`, `"short"`, `"narrow"`               |
| `year`, `day`              | `"numeric"`, `"2-digit"`                      |
| `month`                    | `"numeric"`, `"2-digit"`, `"long"`, `"short"` |
| `hour`, `minute`, `second` | `"numeric"`, `"2-digit"`                      |
| `fractionalSecondDigits`   | `1`, `2` or `3`                               |

A display field that is left out is not shown. See
[Datetime formats](./save_restore.md#datetime-formats) for how column formats
inherit from the plugin's and how older saved formats are migrated.
