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
 * The Webcam sampler from `examples/blocks/src/webcam/webcam.js`, as an
 * `eval` source: an 80×60 frame inverted-luminance-sampled at 20fps, where
 * the width 80 is BAKED INTO the layouts' expressions.
 */
export const WEBCAM = `async (api) => {
    const WIDTH = 80;
    const HEIGHT = 60;
    const FRAME_TIMEOUT = 50;
    const SCREENSHOT = !!globalThis.__PERSPECTIVE_SCREENSHOT__;

    let stopped = false;
    let stream = null;

    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const video = document.createElement("video");
    video.width = WIDTH;
    video.height = HEIGHT;
    video.muted = true;
    video.setAttribute("playsinline", "");

    function sample(tdata) {
        const data = context.getImageData(0, 0, WIDTH, HEIGHT);
        for (let i = 0; i < data.data.byteLength / 4; i++) {
            const r = data.data[i * 4];
            const g = data.data[i * 4 + 1];
            const b = data.data[i * 4 + 2];
            tdata.color[i] = 255 - (0.21 * r + 0.72 * g + 0.07 * b);
        }
    }

    async function draw_placeholder() {
        await new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                context.drawImage(img, 0, 0, WIDTH, HEIGHT);
                resolve(undefined);
            };

            img.onerror = () => {
                context.fillStyle = "#808080";
                context.fillRect(0, 0, WIDTH, HEIGHT);
                resolve(undefined);
            };

            img.src = "/img/dogs-playing-poker.png";
        });
    }

    const tdata = { index: [], color: [] };
    for (let i = 0; i < WIDTH * HEIGHT; i++) {
        tdata.index[i] = i;
        tdata.color[i] = 0;
    }

    const table = await api.client.table(tdata, {
        index: "index",
        name: api.name,
    });

    await table.on_delete(() => {
        stopped = true;
        if (stream) {
            for (const track of stream.getTracks()) {
                track.stop();
            }
        }
    });

    let live = false;
    if (
        !SCREENSHOT &&
        navigator.mediaDevices &&
        navigator.mediaDevices.getUserMedia
    ) {
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: true,
            });

            video.srcObject = stream;
            await video.play();
            live = true;
        } catch (e) {
            live = false;
        }
    }

    if (!live) {
        await draw_placeholder();
    }

    async function frame() {
        if (stopped) {
            return;
        }

        try {
            if (live) {
                context.drawImage(video, 0, 0, WIDTH, HEIGHT);
            }

            sample(tdata);
            await table.update(tdata);
        } catch (e) {
            stopped = true;
            return;
        }

        if (live) {
            schedule();
        }
    }

    function schedule() {
        setTimeout(
            () => {
                if (stopped) {
                    return;
                }

                if (document.hidden) {
                    schedule();
                    return;
                }

                void frame();
            },
            document.hidden ? 1000 : FRAME_TIMEOUT,
        );
    }

    await frame();
}`;
