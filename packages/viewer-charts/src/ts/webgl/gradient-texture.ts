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

import { buildGradientLUT, type GradientStop } from "../theme/gradient";
import type { WebGLContextManager } from "./context-manager";

const LUT_SIZE = 256;

export interface GradientTextureCache {
    texture: WebGLTexture;
    // The `GradientStop[]` reference last uploaded. `resolveTheme` returns a
    // fresh object per render, so comparing the array reference is enough to
    // detect a theme change and skip the upload otherwise.
    lastStops: GradientStop[] | null;
}

/**
 * Allocate a 256×1 RGBA8 texture (once) and re-upload the LUT only when
 * `stops` has changed since the last call. Typical render path: zero
 * GPU work beyond binding an already-uploaded texture.
 */
export function ensureGradientTexture(
    glManager: WebGLContextManager,
    cache: GradientTextureCache | null,
    stops: GradientStop[],
): GradientTextureCache {
    const gl = glManager.gl;

    let texture: WebGLTexture;
    if (cache?.texture) {
        texture = cache.texture;
        if (cache.lastStops === stops) return cache; // no-op fast path
    } else {
        texture = gl.createTexture()!;
    }

    const lut = buildGradientLUT(stops, LUT_SIZE);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        LUT_SIZE,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        lut,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    return { texture, lastStops: stops };
}

/**
 * Bind `texture` to a texture unit and set the sampler uniform. Call after
 * `useProgram`.
 */
export function bindGradientTexture(
    glManager: WebGLContextManager,
    texture: WebGLTexture,
    samplerLoc: WebGLUniformLocation | null,
    unit: number = 0,
): void {
    const gl = glManager.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(samplerLoc, unit);
}
