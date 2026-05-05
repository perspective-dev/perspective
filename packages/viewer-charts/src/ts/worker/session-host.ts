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
    ControlEnvelope,
    InitMsg,
    WorkerEnvelope,
    WorkerMsg,
} from "../transport/protocol";
import type { WorkerRenderer } from "./renderer.worker";
import { dispatch } from "./dispatch";

const RENDERERS = new Map<number, WorkerRenderer>();

function postSession(
    sessionId: number,
    msg: WorkerMsg,
    transfer?: Transferable[],
): void {
    const envelope = { sessionId, msg } satisfies WorkerEnvelope;
    if (transfer && transfer.length > 0) {
        (self as unknown as MessagePort).postMessage(envelope, transfer);
    } else {
        (self as unknown as MessagePort).postMessage(envelope);
    }
}

/**
 * Adapter that satisfies the `MessagePort` shape `WorkerRenderer`
 * expects (it only ever calls `.postMessage` on it). Outgoing posts
 * get session-tagged on the way out so the host can route them to
 * the right `RendererTransport` instance.
 *
 * The receive direction is handled exclusively by the worker-scope
 * `self.addEventListener("message", …)` installed by `installSessionHost`;
 * this adapter does not own a real port pair.
 */
export function makeSessionPort(sessionId: number): MessagePort {
    return {
        postMessage: (msg: WorkerMsg, transfer?: Transferable[]) =>
            postSession(sessionId, msg, transfer),
        addEventListener: () => {},
        removeEventListener: () => {},
        start: () => {},
        close: () => {},
        dispatchEvent: () => false,
        onmessage: null,
        onmessageerror: null,
    } as unknown as MessagePort;
}

/**
 * Install the shared message handler on the worker scope. One worker
 * process hosts many `WorkerRenderer` instances, one per `sessionId`
 * allocated by the host's `RendererTransport`; this listener
 * demultiplexes incoming `ControlEnvelope`s and routes them to the
 * matching renderer.
 *
 * The `bootstrap` callback constructs a `WorkerRenderer` from an
 * `InitMsg` and a session-tagged port. It's injected so this module
 * doesn't need to import `renderer.worker` for runtime bindings (avoids
 * a runtime cycle — `renderer.worker` imports this module).
 */
export function installSessionHost(
    bootstrap: (msg: InitMsg, port: MessagePort) => Promise<WorkerRenderer>,
): void {
    self.addEventListener("message", function (e: MessageEvent) {
        const env = e.data as ControlEnvelope;
        const { sessionId, msg } = env;

        if (msg.kind === "init") {
            if (RENDERERS.has(sessionId)) {
                // Should never happen.
                postSession(sessionId, {
                    kind: "error",
                    message: `sessionId ${sessionId} already initialized`,
                });
                return;
            }

            bootstrap(msg as InitMsg, makeSessionPort(sessionId))
                .then((r) => {
                    RENDERERS.set(sessionId, r);
                })
                .catch((err) => {
                    postSession(sessionId, {
                        kind: "error",
                        message: String(err),
                    });
                });
            return;
        }

        if (msg.kind === "destroy") {
            const r = RENDERERS.get(sessionId);
            if (r) {
                dispatch(r, msg);
                RENDERERS.delete(sessionId);
            }

            return;
        }

        const r = RENDERERS.get(sessionId);
        if (r) {
            dispatch(r, msg);
        }
    });
}
