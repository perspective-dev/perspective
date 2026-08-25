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

/**
 * The Market simulation from `examples/blocks/src/market/market.js`, as an
 * `eval` source: a matching engine on a private worker, view-mirrored to the
 * shared client so panel queries never contend with it. The table is a
 * fixed-size RING of `MARKET_MAX_TRADES` rows — filled in one uninterrupted
 * pass at load, then run continuously forever, each new order overwriting
 * the slot of the (long-settled) order `MARKET_MAX_TRADES` back. The ring
 * lives on the `id` index rather than a `limit` table because the matching
 * engine flips `status` by keyed update, which `limit` tables cannot
 * express. Under the thumbnail harness both of its entropy sources — the
 * order model and the clock the `timestamp` column is derived from — are
 * pinned and the sim stops at the fill, so the series is byte-reproducible;
 * live, it runs off `Math.random` and `performance.now`.
 */
export const MARKET = `async (api) => {
    const MSG_BATCH_TIMEOUT = 50;
    const MSG_PER_BATCH = 10;
    const MSG_TIME_DELTA = 20 * (100 / MSG_PER_BATCH);
    const MARKET_OPEN_PRICE = 20;
    const MARKET_MAX_TRADES = 20000;
    const TRADE_EXPIRATION = 10;
    const SEED = 0x5eed;

    const FAST = !!globalThis.__PERSPECTIVE_SCREENSHOT__;

    function mulberry32(seed) {
        let state = seed;
        return () => {
            state = (state + 0x6d2b79f5) | 0;
            let t = Math.imul(state ^ (state >>> 15), 1 | state);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    const random = FAST ? mulberry32(SEED) : Math.random;
    const MARKET_OPEN = FAST ? 0 : performance.now();

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

    let stopped = false;

    class Market {
        constructor(table, model) {
            this._seq = 0;
            this._table = table;
            this._model = model;
            this._buy_book = new OrderBook(table, "buy");
            this._sell_book = new OrderBook(table, "sell");
        }

        async poll() {
            if (stopped) {
                return;
            }

            if (!FAST && document.hidden && this._seq >= MARKET_MAX_TRADES) {
                setTimeout(() => void this.poll(), 1000);
                return;
            }

            try {
                // The first wake fills the ENTIRE ring in one uninterrupted
                // pass; every later wake runs a single paced step.
                await this._run_market_step();
                while (this._seq < MARKET_MAX_TRADES && !stopped) {
                    await this._run_market_step();
                }
            } catch (e) {
                stopped = true;
                return;
            }

            // Runs forever, live; the thumbnail harness stops at the fill
            // for byte-reproducible screenshots.
            if (!FAST && !stopped) {
                setTimeout(() => void this.poll(), MSG_BATCH_TIMEOUT);
            }
        }

        async _run_market_step() {
            if (await this._generate_trades()) {
                await this._clear_trades();
                await this._expire_trades();
            }

            this._buy_book.reset();
            this._sell_book.reset();
        }

        async _generate_trades() {
            const trades = [];
            const timestamp = new Date(MARKET_OPEN + this._seq * MSG_TIME_DELTA);
            for (let i = 0; i < MSG_PER_BATCH; i++) {
                const { side, discount } = this._model();
                const book = side === "buy" ? this._sell_book : this._buy_book;
                const best_open_price = await book.best_open_price();
                trades.push({
                    security: "Prospective Co",
                    status: "open",
                    // Ring allocation: the keyed write REPLACES the row from
                    // \`MARKET_MAX_TRADES\` trades ago, capping the table at
                    // exactly that size forever.
                    id: this._seq++ % MARKET_MAX_TRADES,
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
            // By TIMESTAMP, not id — ids wrap (the ring), the clock doesn't.
            const cutoff = new Date(
                MARKET_OPEN +
                    (this._seq - MSG_PER_BATCH * TRADE_EXPIRATION) *
                        MSG_TIME_DELTA,
            );

            const expired = await query_columns(this._table, {
                columns: ["id"],
                filter: [
                    ["status", "==", "open"],
                    ["timestamp", "<", cutoff.toISOString()],
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
        const u3 = random(),
            u2 = random();
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
        const parts = random() > 0.5 ? ["buy", -1] : ["sell", 1];
        const discount = random_skew_normal(parts[1]);
        return { side: parts[0], discount };
    }

    const market_client = await api.worker();
    const market_table = await market_client.table(SCHEMA, { index: "id" });
    const market_view = await market_table.view();
    const gui_table = await api.client.table(market_view, {
        index: "id",
        name: api.name,
    });

    await gui_table.on_delete(() => {
        stopped = true;
        market_table.delete().catch(() => {});
        if (typeof market_client.terminate === "function") {
            market_client.terminate();
        }
    });

    const market = new Market(market_table, skew_model);
    void market.poll();

    await new Promise((resolve) => {
        const check = async () => {
            try {
                if ((await gui_table.size()) > 0) {
                    resolve(undefined);
                    return;
                }
            } catch (e) {
                resolve(undefined);
                return;
            }

            setTimeout(() => void check(), 100);
        };

        void check();
    });
}`;
