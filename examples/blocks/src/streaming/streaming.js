// ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
// ┃ ██████ ██████ ██████       █      █      █      █      █ █▄  ▀███ █       ┃
// ┃ ▄▄▄▄▄█ █▄▄▄▄▄ ▄▄▄▄▄█  ▀▀▀▀▀█▀▀▀▀▀ █ ▀▀▀▀▀█ ████████▌▐███ ███▄  ▀█ █ ▀▀▀▀▀ ┃
// ┃ █▀▀▀▀▀ █▀▀▀▀▀ █▀██▀▀ ▄▄▄▄▄ █ ▄▄▄▄▄█ ▄▄▄▄▄█ ████████▌▐███ █████▄   █ ▄▄▄▄▄ ┃
// ┃ █      ██████ █  ▀█▄       █ ██████      █      ███▌▐███ ███████▄ █       ┃
// ┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
// ┃ Copyright (c) 2017, the Perspective Authors.                              ┃
// ┃ ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ ┃
// ┃ This file is part of the Perspective library, distributed under the terms ┃
// ┃ of the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0). ┃
// ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

import perspective from "/node_modules/@finos/perspective/dist/cdn/perspective.js";

var SECURITIES = [
    "AAPL.N",
    "AMZN.N",
    "QQQ.N",
    "NVDA.N",
    "TSLA.N",
    "FB.N",
    "MSFT.N",
    "TLT.N",
    "XIV.N",
    "YY.N",
    "CSCO.N",
    "GOOGL.N",
    "PCLN.N",
];

var CLIENTS = [
    "Homer",
    "Marge",
    "Bart",
    "Lisa",
    "Maggie",
    "Moe",
    "Lenny",
    "Carl",
    "Krusty",
];

// Create 5 random rows of data.
function newRows() {
    var rows = [];
    for (var x = 0; x < 50; x++) {
        rows.push({
            name: SECURITIES[Math.floor(Math.random() * SECURITIES.length)],
            client: CLIENTS[Math.floor(Math.random() * CLIENTS.length)],
            lastUpdate: new Date(),
            chg: Math.random() * 20 - 10,
            bid: Math.random() * 10 + 90,
            ask: Math.random() * 10 + 100,
            vol: Math.random() * 10 + 100,
        });
    }
    return rows;
}

// Get element from the DOM.
var elem = document.getElementsByTagName("perspective-viewer")[0];

// Create a new Perspective WebWorker instance.
var worker = await perspective.worker();

// Create a new Perspective table in our `worker`, and limit it it 500 rows.
var table = await worker.table(newRows(), {
    limit: 500,
});

// Load the `table` in the `<perspective-viewer>` DOM reference.
await elem.load(Promise.resolve(table));

elem.restore({
    plugin: "Datagrid",
    columns_config: {
        "(+)chg": { fg_gradient: 7.93, number_fg_mode: "bar" },
        "(-)chg": { fg_gradient: 8.07, number_fg_mode: "bar" },
        chg: { bg_gradient: 9.97, number_bg_mode: "gradient" },
    },
    plugin_config: {
        editable: false,
        scroll_lock: true,
    },
    settings: true,
    theme: "Pro Light",
    group_by: ["name"],
    split_by: ["client"],
    columns: ["(-)chg", "chg", "(+)chg"],
    filter: [],
    sort: [["chg", "desc"]],
    expressions: {
        "(-)chg": 'if("chg"<0){"chg"}else{0}',
        "(+)chg": 'if("chg">0){"chg"}else{0}',
    },
    aggregates: { "(-)chg": "avg", chg: "avg", "(+)chg": "avg" },
});

// Add more rows every 50ms using the `update()` method on the `table` directly.
(function postRow() {
    table.update(newRows());
    setTimeout(postRow, 10);
})();
