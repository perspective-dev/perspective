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

import "/node_modules/@perspective-dev/viewer/dist/cdn/perspective-viewer.js";
import "/node_modules/@perspective-dev/viewer-datagrid/dist/cdn/perspective-viewer-datagrid.js";
import "/node_modules/@perspective-dev/viewer-charts/dist/cdn/perspective-viewer-charts.js";

import perspective from "/node_modules/@perspective-dev/client/dist/cdn/perspective.js";

const MSG_BATCH_TIMEOUT = 50;
const MSG_PER_BATCH = 10;
const MSG_TIME_DELTA = 20 * (100 / MSG_PER_BATCH);
const MARKET_OPEN_PRICE = 20;
const MARKET_MAX_TRADES = 20000;
const MARKET_MIN_TRADES = 5000;
const MARKET_OPEN = performance.now();
const TRADE_EXPIRATION = 10;

const SCHEMA = {
    id: "integer",
    side: "string",
    security: "string",
    price: "float",
    timestamp: "datetime",
    status: "string",
};

async function query_columns(table, config) {
    const view = await table.view(config);
    const columns = await view.to_columns();
    await view.delete();
    return columns;
}

class OrderBook {
    constructor(table, side) {
        this._memo = undefined;
        this._side = side;
        this._table = table;
        this._price_view = table.view({
            columns: ["price"],
            group_by: ["security"],
            aggregates: { price: side === "buy" ? "max" : "min" },
            filter: [
                ["side", "==", side],
                ["status", "==", "open"],
            ],
        });
    }

    async best_open_price() {
        if (this._memo === undefined) {
            const view = await this._price_view;
            const { price } = await view.to_columns({ leaves_only: true });
            this._memo = price.length === 0 ? MARKET_OPEN_PRICE : price[0];
        }

        return this._memo;
    }

    async matched_orders(price) {
        const sort_dir = this._side === "buy" ? "desc" : "asc";
        const op = this._side === "buy" ? ">" : "<";
        return await query_columns(this._table, {
            columns: ["id"],
            filter: [
                ["side", "==", this._side],
                ["status", "==", "open"],
                ["price", op, price],
            ],
            sort: [
                ["price", sort_dir],
                ["timestamp", "asc"],
            ],
        });
    }

    reset() {
        this._memo = undefined;
    }
}

class Channel {
    async consume() {
        await new Promise((resolve) => {
            this._resolve = resolve;
        });
    }

    emit() {
        if (this._resolve) {
            this._resolve();
            this._resolve = undefined;
        }
    }
}

class Market {
    constructor(table, model) {
        this._id = 1;
        this._table = table;
        this._model = model;
        this._buy_book = new OrderBook(table, "buy");
        this._sell_book = new OrderBook(table, "sell");
        this._stop_signal = new Channel();
    }

    async stop() {
        if (this._id < MARKET_MAX_TRADES) {
            this._id = MARKET_MAX_TRADES;
            await this._stop_signal.consume();
        }

        this._id = 1;
    }

    async poll(progress) {
        await this._run_market_step();
        while (this._id < MARKET_MIN_TRADES) {
            await this._run_market_step(progress);
        }

        progress?.();
        this._stop_signal.emit();
        if (this._id < MARKET_MAX_TRADES) {
            setTimeout(this.poll.bind(this), MSG_BATCH_TIMEOUT);
        }
    }

    async _run_market_step(progress) {
        if (await this._generate_trades()) {
            await this._clear_trades();
            await this._expire_trades();
        }

        this._buy_book.reset();
        this._sell_book.reset();
        progress?.(this._id / MARKET_MIN_TRADES);
    }

    async _generate_trades() {
        const trades = [];
        const timestamp = new Date(MARKET_OPEN + this._id * MSG_TIME_DELTA);
        for (let i = 0; i < MSG_PER_BATCH; i++) {
            const { side, discount } = this._model();
            const book = side === "buy" ? this._sell_book : this._buy_book;
            const best_open_price = await book.best_open_price();
            trades.push({
                security: "Prospective Co",
                status: "open",
                id: this._id++,
                price: discount + best_open_price,
                side,
                timestamp,
            });
        }

        if (trades.length > 0) {
            await this._table.update(trades);
            return true;
        }
    }

    async _clear_trades() {
        const sell_price = await this._sell_book.best_open_price();
        const buy_price = await this._buy_book.best_open_price();
        const { id: buys } = await this._buy_book.matched_orders(sell_price);
        const { id: sells } = await this._sell_book.matched_orders(buy_price);
        const num_clear = Math.min(buys.length, sells.length);
        const status = Array(num_clear * 2).fill("closed");
        const id = buys.slice(0, num_clear).concat(sells.slice(0, num_clear));
        if (id.length > 0) {
            await this._table.update({ status, id });
        }
    }

    async _expire_trades() {
        const expired = await query_columns(this._table, {
            columns: ["id"],
            filter: [
                ["status", "==", "open"],
                ["id", "<", this._id - MSG_PER_BATCH * TRADE_EXPIRATION],
            ],
        });

        if (expired.id.length > 0) {
            expired.status = Array(expired.id.length).fill("expired");
            await this._table.update(expired);
        }
    }
}

const SKEW_MODEL_OFFSET = 2;
const SKEW_MODEL_STDDEV = 2;
const SKEW_MODEL_SKEW = 0;

function random_skew_normal(bias) {
    const u3 = Math.random(),
        u2 = Math.random();
    const R = Math.sqrt(-2.0 * Math.log(u3));
    const O = 2.0 * Math.PI * u2;
    const u0 = R * Math.cos(O);
    const v = R * Math.sin(O);
    if (SKEW_MODEL_SKEW === 0) {
        return bias * SKEW_MODEL_OFFSET + SKEW_MODEL_STDDEV * u0;
    } else {
        const n = -bias * SKEW_MODEL_SKEW;
        const s = n / Math.sqrt(1 + Math.pow(SKEW_MODEL_SKEW, 2));
        const u1 = s * u0 + Math.sqrt(1 - s * s) * v;
        const z = u0 >= 0 ? u1 : -u1;
        return bias * SKEW_MODEL_OFFSET + SKEW_MODEL_STDDEV * z;
    }
}

function skew_model() {
    const [side, bias] = Math.random() > 0.5 ? ["buy", -1] : ["sell", 1];
    const discount = random_skew_normal(bias);
    return { side, discount };
}

function progress(x) {
    const button = document.querySelector("button");
    if (x !== undefined) {
        const y = (x * 10).toFixed(0) * 10;
        button.textContent = `Generating trades ${y}%`;
    } else {
        button.textContent = "Reset";
    }
}

async function reset_tables(market, market_table, gui_table) {
    await market.stop();
    await gui_table.size();
    await market_table.clear();
    await gui_table.clear();
    await market.poll(progress);
}

async function init_tables() {
    const market_worker = await perspective.worker();
    const gui_worker = await perspective.worker();
    const market_table = await market_worker.table(SCHEMA, { index: "id" });
    const market_view = await market_table.view();
    const gui_table = await gui_worker.table(market_view, {
        index: "id",
        name: "gui",
    });

    return { market_table, gui_table, gui_worker };
}

async function init_layouts() {
    const req = await fetch("layouts.json");
    return await req.json();
}

const INIT_TASK = [init_tables(), init_layouts()];

const [{ market_table, gui_table, gui_worker }, layouts] =
    await Promise.all(INIT_TASK);
const market = new Market(market_table, skew_model);
const settings = !/(iPad|iPhone|iPod)/g.test(navigator.userAgent);
const select = document.querySelector("select");
const button = document.querySelector("button");
const viewer = document.querySelector("perspective-viewer");
viewer.load(gui_worker);
viewer.restore({ theme: "Pro Dark", table: "gui", settings, ...layouts[0] });
await market.poll(progress);
for (const layout of layouts) {
    const option = document.createElement("option");
    option.value = layout.title;
    option.textContent = layout.title;
    select.appendChild(option);
}

button.addEventListener("click", () => {
    reset_tables(market, market_table, gui_table);
});

select.addEventListener("change", async (event) => {
    const layout = layouts.find((x) => x.title === event.target.value);
    await viewer.restore(layout);
});
