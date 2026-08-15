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

export interface SplitterOptions {
    /** The dragged size in px implied by a pointer position. */
    toPx(event: PointerEvent): number;

    /** The current size in px, the base for keyboard nudges. */
    current(): number;

    /** The arrow key that grows the panel; its axis partner shrinks it. */
    growKey: "ArrowRight" | "ArrowUp";
    shrinkKey: "ArrowLeft" | "ArrowDown";

    /** Clamp, apply and persist a proposed size. */
    apply(px: number): void;
}

/**
 * Pointer and keyboard wiring shared by every draggable splitter: a
 * pointer-captured drag that feeds `apply`, and ±16px arrow-key nudges.
 * Clamping, persistence and axis specifics stay with the caller.
 *
 * @param splitter the `role="separator"` element.
 * @param opts the axis-specific behavior.
 */
export function initSplitter(splitter: HTMLElement, opts: SplitterOptions) {
    splitter.addEventListener("pointerdown", (event: PointerEvent) => {
        splitter.setPointerCapture(event.pointerId);
        const move = (e: PointerEvent) => opts.apply(opts.toPx(e));
        const up = (e: PointerEvent) => {
            splitter.releasePointerCapture(e.pointerId);
            splitter.removeEventListener("pointermove", move);
            splitter.removeEventListener("pointerup", up);
        };

        splitter.addEventListener("pointermove", move);
        splitter.addEventListener("pointerup", up);
    });

    splitter.addEventListener("keydown", (event: KeyboardEvent) => {
        const delta =
            event.key === opts.growKey
                ? 16
                : event.key === opts.shrinkKey
                  ? -16
                  : 0;

        if (!delta) {
            return;
        }

        event.preventDefault();
        opts.apply(opts.current() + delta);
    });
}
