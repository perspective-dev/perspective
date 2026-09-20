# Implementing a custom Virtual Server

You can connect Perspective to any data source by implementing the
`VirtualServerHandler` interface and passing it to `createMessageHandler()`.

For background on virtual servers, see the
[Virtual Servers overview](../../../explanation/virtual_servers.md).

## Example

```typescript
import perspective from "@perspective-dev/client";
import type {
    VirtualServerHandler,
    ColumnType,
    TableDescription,
    ViewConfig,
    ViewWindow,
    VirtualDataSlice,
} from "@perspective-dev/client";

const handler = {
    async getHostedTables(): Promise<string[]> {
        return ["my_table"];
    },

    async tableSchema(tableId: string): Promise<Record<string, ColumnType>> {
        return { name: "string", price: "float", date: "date" };
    },

    async tableSize(tableId: string): Promise<number> {
        return 1000;
    },

    async tableMakeView(
        tableId: string,
        viewId: string,
        config: ViewConfig,
    ): Promise<void> {
        // Translate `config` (group_by, sort, filter, etc.) into a query
        // against your data source. Store the query keyed by `viewId`
        // for later data retrieval.
    },

    async tableDescribe(
        tableId: string,
        config: ViewConfig,
    ): Promise<TableDescription> {
        // Validate `config` against `tableId` and report the schema the view
        // would have, WITHOUT creating it: `{ expression_schema, view_schema }`
        // when valid, `{ expression_schema, expression_errors }` when an
        // expression is invalid, or `{ config_error }` otherwise.
        return { expression_schema: {}, view_schema: { name: "string", price: "float" } };
    },

    async viewDelete(viewId: string): Promise<void> {
        // Clean up resources for this view
    },

    async viewGetData(
        viewId: string,
        config: ViewConfig,
        schema: Record<string, ColumnType>,
        viewport: ViewWindow,
        dataSlice: VirtualDataSlice,
    ): Promise<void> {
        // Query your data source using `config` and `viewport` for the
        // row/column window. Push columnar results via `dataSlice.setCol()`.
    },

    getFeatures() {
        return {
            group_by: true,
            sort: true,
            filter_ops: {
                string: ["==", "!=", "contains", "is null", "is not null"],
                float: ["==", "!=", ">", "<", ">=", "<="],
            },
            aggregates: {
                float: ["sum", "avg", "count", "min", "max"],
                string: ["count", "any"],
            },
        };
    },
} satisfies VirtualServerHandler;

// Create a message handler and use it like a worker
const messageHandler = perspective.createMessageHandler(handler);
const client = await perspective.worker(messageHandler);
const table = await client.open_table("my_table");
document.getElementById("viewer").load(table);
```
