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
    CssBounds,
    HostSink,
    UserClickPayload,
    UserSelectPayload,
} from "./tooltip-controller";

/**
 * Envelope shape sent by `MessageHostSink`. The transport translates
 * each one into a corresponding `WorkerMsg` (`pinTooltip` /
 * `dismissTooltip` / `setCursor` / `userClick` / `userSelect`).
 */
export type HostSinkEnvelope =
    | {
          kind: "pin";
          payload: {
              lines: string[];
              pos: { px: number; py: number };
              bounds: CssBounds;
          };
      }
    | { kind: "dismiss" }
    | { kind: "setCursor"; cursor: string }
    | { kind: "userClick"; payload: UserClickPayload }
    | { kind: "userSelect"; payload: UserSelectPayload };

/**
 * `HostSink` that posts pin / dismiss / setCursor / user-event intents
 * over a `postMessage`-style channel. The host-side transport listens
 * for these envelopes and drives a `DomHostSink` for pin/dismiss and
 * dispatches `CustomEvent`s on the viewer for user events.
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
        this._send({ kind: "pin", payload: { lines, pos, bounds } });
    }

    dismiss(): void {
        this._send({ kind: "dismiss" });
    }

    setCursor(cursor: string): void {
        this._send({ kind: "setCursor", cursor });
    }

    emitUserClick(payload: UserClickPayload): void {
        this._send({ kind: "userClick", payload });
    }

    emitUserSelect(payload: UserSelectPayload): void {
        this._send({ kind: "userSelect", payload });
    }
}
