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
 * Serial-checked async tooltip cache.
 *
 * Every chart family that paints tooltip text from a lazy row fetch
 * needs the same dance: each hover (or pin) bumps a serial; the async
 * line-build resolves later; if the user has moved on by then the
 * resolved lines must be discarded so we don't paint stale text.
 *
 * Hit-test logic stays per-chart — that genuinely diverges (spatial
 * grid for cartesian, walk-visible-nodes for treemap, angular for
 * sunburst). The serial discipline is what was getting copy-pasted.
 *
 * `Target` is whatever identity the chart uses for hover/pin (flat
 * slot index, node id, etc.); it's stored on `hoveredTarget` so the
 * render path can tell whether cached `lines` belong to the currently
 * hovered entity (some charts paint tooltip text only when both
 * agree).
 */
export class LazyTooltip<Target> {
    /**
     * Cached lines for the latest committed hover, or `null`.
     */
    lines: string[] | null = null;

    /**
     * Identity of the entity `lines` describe. `null` when cleared.
     */
    hoveredTarget: Target | null = null;

    private _hoverSerial = 0;
    private _pinSerial = 0;

    /**
     * Begin a new hover. Call this only when the hovered entity has
     * actually changed. Clears the cached lines, records the new
     * target, bumps the hover serial, and returns the new value — pass
     * it back to {@link commitHover} from your async resolver to gate
     * the write.
     */
    beginHover(target: Target): number {
        this.lines = null;
        this.hoveredTarget = target;
        return ++this._hoverSerial;
    }

    /**
     * Commit a freshly-resolved line list for `serial`. Returns true
     * when the write happened (caller should repaint), false when the
     * serial was stale.
     */
    commitHover(serial: number, lines: string[]): boolean {
        if (serial !== this._hoverSerial) {
            return false;
        }

        this.lines = lines;
        return true;
    }

    /**
     * Clear hover state (mouse left, view changed, etc.).
     */
    clearHover(): void {
        this.lines = null;
        this.hoveredTarget = null;
        this._hoverSerial++;
    }

    /**
     * Begin a pin operation. Returns the serial; pass it to
     * {@link isPinFresh} from your async resolver.
     */
    beginPin(): number {
        return ++this._pinSerial;
    }

    /**
     * True when `serial` still names the latest pin attempt.
     */
    isPinFresh(serial: number): boolean {
        return serial === this._pinSerial;
    }

    /**
     * Bump the pin serial without starting a new pin (e.g. dismiss).
     */
    invalidatePin(): void {
        this._pinSerial++;
    }
}
