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

import perspective from "@perspective-dev/client";
import perspective_viewer from "@perspective-dev/viewer";
import "@perspective-dev/viewer-datagrid";
import "@perspective-dev/viewer-charts";

import WORKSPACE from "./layout.json";

import "@perspective-dev/viewer/dist/css/themes.css";
import "./index.css";

import SERVER_WASM from "@perspective-dev/server/dist/wasm/perspective-server.wasm";
import CLIENT_WASM from "@perspective-dev/viewer/dist/wasm/perspective-viewer.wasm";

import { SCHEMA, opening_rows, start_market } from "./market.js";
import {
    build_ticket,
    create_command_schema,
    parse_restricted,
    resolve_target,
} from "./orders.js";

const TABLE_NAME = "securities";

const money = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
});

const price = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const time = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
});

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) {
        node.className = className;
    }

    if (text !== undefined) {
        node.textContent = text;
    }

    return node;
}

function render_ticket(ticket) {
    const item = element("li", `ticket ${ticket.side}`);
    const head = element("div", "ticket-head");
    head.append(
        element("span", "ticket-side", ticket.side.toUpperCase()),
        element("span", "ticket-target", ticket.target),
        element("span", "ticket-time", time.format(ticket.time)),
    );

    const legs = ticket.legs.length;
    const summary = ticket.bulk
        ? `Bulk order · ${legs} ${legs === 1 ? "security" : "securities"} · ${money.format(ticket.notional)}`
        : `${ticket.legs[0]?.quantity ?? 0} shares @ ${price.format(ticket.legs[0]?.price ?? 0)} · ${money.format(ticket.notional)}`;

    item.append(
        head,
        element("div", "ticket-summary", `${summary} · ${ticket.source}`),
    );
    if (ticket.excluded.length > 0) {
        item.append(
            element(
                "div",
                "ticket-excluded",
                `Restricted, not ordered: ${ticket.excluded.join(", ")}`,
            ),
        );
    }

    if (ticket.bulk && legs > 0) {
        const details = element("details", "ticket-legs");
        details.append(element("summary", undefined, "Legs"));
        const table = element("table");
        for (const leg of ticket.legs) {
            const row = element("tr");
            row.append(
                element("td", undefined, leg.symbol),
                element("td", undefined, String(leg.quantity)),
                element("td", undefined, price.format(leg.price)),
            );
            table.append(row);
        }

        details.append(table);
        item.append(details);
    }

    return item;
}

await perspective_viewer.init({
    server: fetch(SERVER_WASM),
    viewer: fetch(CLIENT_WASM),
});

const viewer = document.getElementById("viewer");
const restricted_input = document.getElementById("restricted");
const tickets = document.getElementById("tickets");
const ticket_count = document.getElementById("ticket-count");
const restricted = parse_restricted(restricted_input.value);

const worker = await perspective.worker();
const table = await worker.table(SCHEMA, {
    index: "symbol",
    name: TABLE_NAME,
});

await table.update(opening_rows());
await viewer.load(worker);
await viewer.setCommandSchema(create_command_schema(restricted), {
    scopes: ["context-menu", "datagrid-row", "chart-tooltip"],
});

await viewer.restoreWorkspace(await WORKSPACE);

function apply_restricted(symbols) {
    restricted.clear();
    for (const symbol of symbols) {
        restricted.add(symbol);
    }

    return viewer.invalidate();
}

restricted_input.addEventListener("input", () => {
    apply_restricted(parse_restricted(restricted_input.value));
});

document.getElementById("clear-tickets").addEventListener("click", () => {
    tickets.replaceChildren();
    ticket_count.textContent = "0";
});

viewer.addEventListener("perspective-command", async (event) => {
    const { key, context } = event.detail;
    switch (key) {
        case "buy":
        case "sell": {
            const ticket = await build_ticket(viewer, key, context, restricted);
            tickets.prepend(render_ticket(ticket));
            ticket_count.textContent = String(tickets.children.length);
            break;
        }
        case "restrict":
        case "unrestrict": {
            const { symbol } = resolve_target(context);
            const symbols = [...restricted].filter((s) => s !== symbol);
            if (key === "restrict") {
                symbols.push(symbol);
            }

            restricted_input.value = symbols.join(", ");
            await apply_restricted(symbols);
            break;
        }
    }
});

start_market(table);
