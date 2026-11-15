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

import { UNIVERSE_ATTRIBUTES } from "./market.js";
import UNIVERSE from "./symbols.json";

export const ORDER_QUANTITY = 100;

const SIDES = {
    buy: "Buy",
    sell: "Sell",
};

export function parse_restricted(text) {
    return new Set(
        text
            .split(",")
            .map((symbol) => symbol.trim().toUpperCase())
            .filter((symbol) => symbol.length > 0),
    );
}

function group_members(group_by, row_path) {
    const levels = group_by.slice(0, row_path.length);
    if (!levels.every((level) => UNIVERSE_ATTRIBUTES.includes(level))) {
        return undefined;
    }

    return UNIVERSE.filter((security) =>
        levels.every(
            (level, i) => String(security[level]) === String(row_path[i]),
        ),
    ).map((security) => security.symbol);
}

/**
 * What a command context's hit stands for: one `security`, or a `group` of
 * them (a rollup row, a mark over a group, or the grand total), with its
 * member symbols when the view's `group_by` columns are universe attributes.
 */
export function resolve_target(context) {
    const hit = context.hit;
    if (hit === undefined || hit.kind === "column") {
        return undefined;
    }

    const group_by = context.view_config?.group_by ?? [];
    if (group_by.length === 0) {
        const symbol = hit.id?.[0];
        return typeof symbol === "string"
            ? { kind: "security", symbol, label: symbol }
            : undefined;
    }

    const depth = group_by.indexOf("symbol");
    if (depth >= 0 && depth < hit.row_path.length) {
        const symbol = String(hit.row_path[depth]);
        return { kind: "security", symbol, label: symbol };
    }

    return {
        kind: "group",
        label:
            hit.row_path.length === 0
                ? "All securities"
                : hit.row_path.map(String).join(" / "),
        members: group_members(group_by, hit.row_path),
    };
}

function order_command(side, target, tradable) {
    const verb = SIDES[side];
    if (target.kind === "security") {
        return {
            label: verb,
            title: `${verb} ${ORDER_QUANTITY} ${target.symbol}`,
        };
    }

    if (tradable === undefined) {
        return {
            label: `${verb} all`,
            title: `${verb} every security in ${target.label}`,
        };
    }

    return {
        label: `${verb} (${tradable.length})`,
        title: `${verb} ${tradable.length} securities in ${target.label}`,
    };
}

/**
 * A command schema offering Buy and Sell for the security or group under the
 * hit, disabled for symbols in `restricted`, plus Restrict / Unrestrict in
 * the context menu.
 */
export function create_command_schema(restricted) {
    return (context) => {
        const target = resolve_target(context);
        if (target === undefined) {
            return { commands: [] };
        }

        const tradable =
            target.kind === "security"
                ? restricted.has(target.symbol)
                    ? []
                    : [target.symbol]
                : target.members?.filter((symbol) => !restricted.has(symbol));

        const disabled = tradable !== undefined && tradable.length === 0;
        const commands = Object.keys(SIDES).map((side) => ({
            kind: "Command",
            key: side,
            icon: side,
            disabled,
            ...order_command(side, target, tradable),
        }));

        if (context.location === "context-menu" && target.kind === "security") {
            const is_restricted = restricted.has(target.symbol);
            commands.push({
                kind: "Command",
                key: is_restricted ? "unrestrict" : "restrict",
                label: `${is_restricted ? "Unrestrict" : "Restrict"} ${target.symbol}`,
            });
        }

        return { commands };
    };
}

/**
 * Build an order ticket for `side` against the target of `context`, reading
 * the legs' current prices through one `View` over the hit's selecting config.
 */
export async function build_ticket(viewer, side, context, restricted) {
    const target = resolve_target(context);
    const table = await viewer.getTable({ panel: context.panel });
    const view = await table.view({
        ...context.hit.config,
        columns: ["symbol", "name", "price"],
        sort: [["symbol", "asc"]],
    });

    const rows = await view.to_json();
    await view.delete();
    const legs = rows
        .filter((row) => !restricted.has(row.symbol))
        .map((row) => ({
            symbol: row.symbol,
            name: row.name,
            quantity: ORDER_QUANTITY,
            price: row.price,
        }));

    return {
        side,
        target: target.label,
        bulk: target.kind === "group",
        legs,
        excluded: rows
            .filter((row) => restricted.has(row.symbol))
            .map((row) => row.symbol),
        notional: legs.reduce((sum, leg) => sum + leg.quantity * leg.price, 0),
        source: `${context.plugin ?? "viewer"} · ${context.location}`,
        time: new Date(),
    };
}
