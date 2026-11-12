# Letting the agent load data with scripts

The `execute_code` entitlement lets the agent bring new data into the viewer by
writing JavaScript. The agent writes an ES module that fetches or streams data
and loads it with `psp.emit()`, and `run_script` hosts the result as a named
table that panels can display. The feature is **experimental** and is never
granted by default:

```javascript
viewer.agentConfig({
    ...providers.anthropic,
    apiKey: "sk-ant-...",
    docs,
    entitlements: [
        "read_view",
        "configure_view",
        "manage_layout",
        "read_docs",
        "execute_code",
    ],
});

await viewer.agentPrompt(
    "Create a chart of the NY Giants NFL point record by year",
);
```

| Tool           | What it does                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------- |
| `run_script`   | Runs a module in a new sandbox and creates (or replaces) the table `name` from what it emits.   |
| `list_scripts` | Lists the scripts, with their status, table schema, row count, last error and recent log lines. |
| `stop_script`  | Stops a script, keeping its table unless `drop_table` is set.                                   |

## The sandbox

Each script runs in a module Web Worker owned by a hidden
`<iframe sandbox="allow-scripts">`. The iframe gives the script an opaque
(`null`) origin, and the worker keeps it off the page's main thread so it can be
terminated at any time. The script never receives a Perspective object: it posts
data to the viewer, and the viewer creates and updates the table.

A script **can**:

- `fetch()` any server whose CORS headers allow every origin
  (`Access-Control-Allow-Origin: *`).
- Open a `WebSocket` to any server.
- `import()` ES modules from a CDN that serves them with permissive CORS, such
  as `esm.sh`, `cdn.jsdelivr.net` or `unpkg.com`.
- Use timers, `TextDecoder`, `crypto` and the other APIs available to a worker.

A script **cannot**:

- Read the page's DOM, cookies, `localStorage` or JavaScript state.
- Send the page's cookies or credentials, so same-origin APIs that need a login
  are unreachable.
- Use `document`, `window` or `DOMParser`, because a worker has no DOM. Read
  HTML with a parser imported from a CDN instead.

Consider before granting `execute_code`:

- The code is written by the model and runs in the user's browser. It can reach
  any CORS-open server or WebSocket that the browser can reach, including hosts
  on the user's private network.
- Row data stays in the browser. The model sees each table's schema and row
  count, plus anything the script writes with `psp.log()` or `console.log()`.
- A host page whose Content-Security-Policy forbids `blob:` workers or sandboxed
  frames blocks scripts. `run_script` then fails with an error naming the
  policy.

## The `psp` API

A script is a whole ES module, so top-level `await` and static `import` both
work and `psp` is a global. It is not a function body: a top-level `return` is a
syntax error, and data reaches the table only through `psp.emit()`.

| Member                            | Behavior                                                                                                                                     |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `psp.emit(data)`                  | Loads rows. `data` is an array of row objects, an object of column arrays, a CSV string, or Arrow IPC bytes (`ArrayBuffer` or `Uint8Array`). |
| `psp.emit(data, {replace: true})` | Replaces the table's entire contents with `data`.                                                                                            |
| `psp.log(...values)`              | Adds a line to the script log returned to the model. `console.log` and the other `console` methods do the same.                              |

The first emit creates the table, with column types inferred the same way as
`client.table(data)`. Later emits append rows, or update rows in place when the
table has an `index`. An exception thrown after the first emit is recorded as
the script's `last_error`, and the script keeps running.

`run_script` takes `table` options for the created table:

- `index` is a column name, or a list of names, keying each row. Re-emitted rows
  with the same key update the existing row instead of appending.
- `limit` is the maximum number of rows kept. The oldest rows are dropped first.

## Script lifetime

`run_script` returns as soon as the first emit has been loaded, reporting the
table's schema and row count. It fails if the script throws, finishes without
emitting, or emits nothing within `start_timeout_ms` (30 seconds by default),
and the error includes the script log so the model can fix the module.

After that the script keeps running for as long as it has timers or open
sockets, so a polling or streaming table stays live. Scripts survive later
prompts, `agentReset()` and `agentConfig()`, and they stop on `stop_script`,
`viewer.delete()`, or when `run_script` is called again with the same `name`.

Re-running a `name` replaces the old script and its table. If a panel is still
displaying that table, the table cannot be deleted, so its contents are replaced
in place and it keeps its original columns. Use a new `name` to change the
columns of a table that is on screen.

Script tables are ordinary hosted tables. `saveWorkspace()` does not record the
scripts that produce them, so a restored workspace that references one shows the
table only while its script is running.

## Recipes

### Polling a JSON endpoint

Fetch the whole document on a timer and re-emit it with `replace: true` when it
is a snapshot with no key column. Map fields to flat, Perspective-friendly rows
first.

```javascript
async function load() {
    const response = await fetch("https://example.com/api/quotes.json");
    const json = await response.json();
    return json.data.items.map((item) => ({
        symbol: item.ticker,
        price: Number(item.quote.last),
        updated: new Date(item.quote.time * 1000),
    }));
}

psp.emit(await load());
setInterval(async () => psp.emit(await load(), { replace: true }), 60_000);
```

If each row has a stable key, create the table with `table: {index: "symbol"}`
and emit without `replace`, so rows update in place.

### Streaming from a WebSocket

Send any control messages once the socket opens, then emit each decoded frame.
Arrow frames can be emitted directly.

```javascript
const socket = new WebSocket("wss://example.com/feed");
socket.binaryType = "arraybuffer";
socket.onopen = () => {
    socket.send(JSON.stringify({ op: "auth", token: "public" }));
    socket.send(JSON.stringify({ op: "subscribe", channel: "trades" }));
};

socket.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) {
        psp.emit(event.data);
    } else {
        const message = JSON.parse(event.data);
        if (message.type === "trade") {
            psp.emit([{ id: message.id, price: message.p, size: message.q }]);
        }
    }
};

socket.onerror = () => psp.log("socket error");
```

`run_script` waits for the first emit, so a feed that is quiet at first needs a
larger `start_timeout_ms`. Pass `table: {limit: 100000}` to bound an append-only
stream.

### Importing a client library from a CDN

Import the library's browser ES module build, then emit what it returns.

```javascript
import { createClient } from "https://esm.sh/@example/data-client@2";

const client = createClient({ endpoint: "https://data.example.com" });
const rows = await client.query("SELECT * FROM prices LIMIT 1000");
psp.emit(rows);
```

### Reading an HTML table from Wikipedia

Wikipedia's article URLs do not allow cross-origin requests, but the MediaWiki
API does when it is called with `origin=*`. Its `parse` action returns the
article HTML as a string. A worker has no `DOMParser`, so parse the HTML with
`node-html-parser` from a CDN.

```javascript
import { parse } from "https://esm.sh/node-html-parser@6";

const page = "New_York_Giants_seasons";
const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${page}&prop=text&format=json&formatversion=2&origin=*`;
const json = await (await fetch(url)).json();
const table = parse(json.parse.text).querySelector("table.wikitable");
const cells = table
    .querySelectorAll("tr")
    .map((tr) => tr.querySelectorAll("th, td").map((x) => x.text.trim()));

const [header, ...body] = cells;
psp.log("columns:", header);
const toNumber = (x) => Number(x.replace(/[^0-9.-]/g, "")) || null;
psp.emit(
    body
        .filter((row) => row.length === header.length)
        .map((row) => ({
            Season: toNumber(row[0]),
            "Points For": toNumber(row[header.indexOf("PF")]),
            "Points Against": toNumber(row[header.indexOf("PA")]),
        })),
);
```

Pages often hold several `wikitable`s, and header rows can span two lines.
Logging the header first, as above, shows the model which columns exist when the
first attempt picks the wrong table.
