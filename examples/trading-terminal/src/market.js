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

import UNIVERSE from "./symbols.json";

export const UNIVERSE_ATTRIBUTES = ["symbol", "name", "sector", "exchange"];

export const SCHEMA = {
    symbol: "string",
    name: "string",
    sector: "string",
    exchange: "string",
    price: "float",
    open: "float",
    change: "float",
    bid: "float",
    ask: "float",
    volume: "integer",
    last_updated: "datetime",
};

function gaussian() {
    const u = 1 - Math.random();
    const v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function round(value, places) {
    const factor = 10 ** places;
    return Math.round(value * factor) / factor;
}

function quote(security, price, volume, now) {
    const spread = Math.max(0.01, round(price * 0.0006, 2));
    return {
        symbol: security.symbol,
        name: security.name,
        sector: security.sector,
        exchange: security.exchange,
        price: round(price, 2),
        open: security.open,
        change: round(price - security.open, 2),
        bid: round(price - spread / 2, 2),
        ask: round(price + spread / 2, 2),
        volume,
        last_updated: now,
    };
}

export function opening_rows(now = new Date()) {
    return UNIVERSE.map((security) =>
        quote(
            security,
            security.open,
            Math.floor(10_000 + Math.random() * 90_000),
            now,
        ),
    );
}

/**
 * Tick `table` once every `interval` milliseconds, moving a random subset of
 * securities along a random walk; returns a function that stops the market.
 */
export function start_market(table, { interval = 500, fraction = 0.7 } = {}) {
    const state = new Map(
        opening_rows().map((row) => [row.symbol, { ...row }]),
    );

    let timer = setInterval(async () => {
        const now = new Date();
        const rows = [];
        for (const security of UNIVERSE) {
            if (Math.random() > fraction) {
                continue;
            }

            const last = state.get(security.symbol);
            const price = Math.max(0.5, last.price * (1 + gaussian() * 0.004));
            const volume = last.volume + Math.floor(Math.random() * 5000);
            const row = quote(security, price, volume, now);
            state.set(security.symbol, row);
            rows.push(row);
        }

        if (rows.length > 0) {
            try {
                await table.update(rows);
            } catch (e) {
                clearInterval(timer);
            }
        }
    }, interval);

    return () => clearInterval(timer);
}
