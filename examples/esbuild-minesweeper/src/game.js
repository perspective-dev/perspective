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

import { flood_from } from "./expressions.js";

/** Squares per board row. */
export const WIDTH = 16;

/** Board rows. */
export const HEIGHT = 16;

/** Mines placed on the first reveal, which must leave room for its 3x3 safe zone. */
export const MINES = 40;

/** The `Table` holding the board, one row per square. */
export const TABLE_NAME = "minesweeper";

const SCHEMA = {
    index: "integer",
    mine: "boolean",
    revealed: "boolean",
    flagged: "boolean",
};

const SQUARES = Array.from({ length: WIDTH * HEIGHT }, (_, index) => index);

function neighbours(index) {
    const row = Math.floor(index / WIDTH);
    const col = index % WIDTH;
    const result = [];
    for (
        let r = Math.max(row - 1, 0);
        r <= Math.min(row + 1, HEIGHT - 1);
        r++
    ) {
        for (
            let c = Math.max(col - 1, 0);
            c <= Math.min(col + 1, WIDTH - 1);
            c++
        ) {
            if (r !== row || c !== col) {
                result.push(r * WIDTH + c);
            }
        }
    }

    return result;
}

function place_mines(safe) {
    const zone = new Set([safe, ...neighbours(safe)]);
    const pool = SQUARES.filter((index) => !zone.has(index));
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    return new Set(pool.slice(0, MINES));
}

/**
 * A game of Minesweeper, which owns its state and writes the whole board to a
 * `Table` after every move, reading back only the flood fill.
 */
export class Minesweeper {
    #table;
    #mines = new Set();
    #revealed = new Set();
    #flagged = new Set();
    state = "ready";

    static async create(client) {
        const table = await client.table(SCHEMA, {
            index: "index",
            name: TABLE_NAME,
        });

        const game = new Minesweeper(table);
        await game.#write();
        return game;
    }

    constructor(table) {
        this.#table = table;
    }

    get live() {
        return this.state === "ready" || this.state === "playing";
    }

    get flags() {
        return this.#flagged.size;
    }

    /** What square `index` shows the player: `"flagged"`, `"mine"`, `"revealed"` or `"hidden"`. */
    square(index) {
        if (this.#flagged.has(index)) {
            return "flagged";
        } else if (this.state === "lost" && this.#mines.has(index)) {
            return "mine";
        } else if (this.#revealed.has(index)) {
            return "revealed";
        }

        return "hidden";
    }

    new_game() {
        this.state = "ready";
        this.#mines.clear();
        this.#revealed.clear();
        this.#flagged.clear();
        return this.#write();
    }

    async reveal(index) {
        if (!this.live || this.square(index) !== "hidden") {
            return;
        }

        if (this.state === "ready") {
            this.#mines = place_mines(index);
            this.state = "playing";
            await this.#write();
        }

        if (this.#mines.has(index)) {
            this.#revealed.add(index);
            this.state = "lost";
        } else {
            for (const square of await this.#flood(index)) {
                this.#revealed.add(square);
            }

            if (this.#revealed.size === SQUARES.length - MINES) {
                this.#flagged = new Set(this.#mines);
                this.state = "won";
            }
        }

        await this.#write();
    }

    toggle_flag(index) {
        if (!this.live || this.#revealed.has(index)) {
            return;
        }

        if (!this.#flagged.delete(index)) {
            this.#flagged.add(index);
        }

        return this.#write();
    }

    async #flood(start) {
        const view = await this.#table.view({
            columns: ["index"],
            expressions: { flood: flood_from(WIDTH, HEIGHT, start) },
            filter: [["flood", "==", true]],
        });

        try {
            const { index } = await view.to_columns();
            return index ?? [];
        } finally {
            await view.delete();
        }
    }

    #write() {
        return this.#table.update({
            index: SQUARES,
            mine: SQUARES.map((index) => this.#mines.has(index)),
            revealed: SQUARES.map((index) => this.#revealed.has(index)),
            flagged: SQUARES.map((index) => this.#flagged.has(index)),
        });
    }
}
