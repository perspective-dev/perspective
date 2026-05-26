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

import type {
    DismissTooltipMsg,
    PinTooltipMsg,
    SetCursorMsg,
    UserClickMsg,
    UserSelectMsg,
} from "../transport/protocol";
import type {
    CssBounds,
    HostSink,
    UserClickPayload,
    UserSelectPayload,
} from "./tooltip-controller";

/**
 * The subset of `WorkerMsg`s that flow chart → host through a
 * `MessageHostSink`. Identical to the worker-side post payloads so the
 * sink can ship them straight to `WorkerRenderer.post` with no
 * intermediate translation.
 */
export type HostSinkEnvelope =
    | PinTooltipMsg
    | DismissTooltipMsg
    | SetCursorMsg
    | UserClickMsg
    | UserSelectMsg;

/**
 * `HostSink` that posts pin / dismiss / setCursor / user-event intents
 * over a `postMessage`-style channel as `WorkerMsg`s. The host-side
 * transport listens for these and drives a `DomHostSink` for
 * pin/dismiss and dispatches `CustomEvent`s on the viewer for user
 * events.
 */
export class MessageHostSink implements HostSink {
    private _send: (msg: HostSinkEnvelope) => void;

    constructor(send: (msg: HostSinkEnvelope) => void) {
        this._send = send;
    }

    pin(
        lines: string[],
        pos: { px: number; py: number },
        bounds: CssBounds,
    ): void {
        this._send({ kind: "pinTooltip", lines, pos, bounds });
    }

    dismiss(): void {
        this._send({ kind: "dismissTooltip" });
    }

    setCursor(cursor: string): void {
        this._send({ kind: "setCursor", cursor });
    }

    emitUserClick(payload: UserClickPayload): void {
        // `UserClickPayload` is structurally identical to
        // `PerspectiveClickDetail`; the cast carries the `config`
        // field's looser inner shape without affecting runtime data.
        this._send({ kind: "userClick", detail: payload as any });
    }

    emitUserSelect(payload: UserSelectPayload): void {
        this._send({
            kind: "userSelect",
            selected: payload.selected,
            row: payload.row,
            column_names: payload.column_names,
            insertConfig: payload.insertConfig as any,
        });
    }
}
