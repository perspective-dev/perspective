### Serializing data

The `view()` allows for serialization of data to JavaScript through the
`to_json()`, `to_ndjson()`, `to_columns()`, `to_csv()`, and `to_arrow()` methods
(the same data formats supported by the `Client::table` factory function). These
methods return a `promise` for the calculated data:

```javascript
const view = await table.view({ group_by: ["State"], columns: ["Sales"] });

// JavaScript Objects
console.log(await view.to_json());
console.log(await view.to_columns());

// String
console.log(await view.to_csv());
console.log(await view.to_ndjson());

// ArrayBuffer
console.log(await view.to_arrow());
```

`to_arrow()` writes an uncompressed Arrow IPC stream by default; pass
`compression` to apply LZ4 or ZSTD body compression, which `Client::table` reads
back transparently:

```javascript
const compressed = await view.to_arrow({ compression: "zstd" });
const table2 = await client.table(compressed);
```
