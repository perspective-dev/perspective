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

import type { CssBounds, HostSink } from "./tooltip-controller";

/**
 * Envelope shape sent by `MessageHostSink`. The transport translates
 * each one into a corresponding `WorkerMsg` (`pinTooltip` /
 * `dismissTooltip` / `setCursor`).
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
    | { kind: "setCursor"; cursor: string };

/**
 * `HostSink` that posts pin / dismiss / setCursor intents over a
 * `postMessage`-style channel. The host-side transport listens for
 * these envelopes and drives a `DomHostSink` on the host document —
 * the renderer scope has no DOM in worker mode and uses the same
 * channel in-process for symmetry.
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
}
