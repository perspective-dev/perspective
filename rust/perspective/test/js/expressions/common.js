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

import * as arrows from "../test_arrows";

export const data = [
    { x: 1, y: "a", z: true },
    { x: 2, y: "b", z: false },
    { x: 3, y: "c", z: true },
    { x: 4, y: "d", z: false },
];

export const int_float_data = [
    { w: 1.5, x: 1, y: "a", z: true },
    { w: 2.5, x: 2, y: "b", z: false },
    { w: 3.5, x: 3, y: "c", z: true },
    { w: 4.5, x: 4, y: "d", z: false },
];

export const int_float_subtract_data = [
    { u: 2.5, v: 2, w: 1.5, x: 1, y: "a", z: true },
    { u: 3.5, v: 3, w: 2.5, x: 2, y: "b", z: false },
    { u: 4.5, v: 4, w: 3.5, x: 3, y: "c", z: true },
    { u: 5.5, v: 5, w: 4.5, x: 4, y: "d", z: false },
];

export const comparison_data = [
    { u: 0, v: 1.5, w: 1.5, x: 1, x2: 1, y: "a", z: true },
    { u: 1, v: 2.55, w: 2.5, x: 2, x2: 10, y: "b", z: false },
    { u: 0, v: 3.5, w: 3.5, x: 3, x2: 3, y: "c", z: true },
    { u: 1, v: 4.55, w: 4.5, x: 4, x2: 10, y: "d", z: false },
];

export const cols = [
    "i8",
    "ui8",
    "i16",
    "ui16",
    "i32",
    "ui32",
    "i64",
    "ui64",
    "f32",
    "f64",
];
export const arrow = arrows.numbers_arrow;
export const all_types_arrow = arrows.all_types_arrow;
export const all_types_multi_arrow = arrows.all_types_multi_arrow;

export const days_of_week = [
    "1 Sunday",
    "2 Monday",
    "3 Tuesday",
    "4 Wednesday",
    "5 Thursday",
    "6 Friday",
    "7 Saturday",
];
export const months_of_year = [
    "01 January",
    "02 February",
    "03 March",
    "04 April",
    "05 May",
    "06 June",
    "07 July",
    "08 August",
    "09 September",
    "10 October",
    "11 November",
    "12 December",
];

export const second_bucket = function (val, multiplicity) {
    if (multiplicity === undefined) {
        multiplicity = 1;
    }
    const mult = 1000 * multiplicity;
    return new Date(Math.floor(new Date(val).getTime() / mult) * mult);
};

export const minute_bucket = function (val, multiplicity) {
    if (multiplicity === undefined) {
        multiplicity = 1;
    }
    let date = new Date(val);
    date.setSeconds(0);
    date.setMilliseconds(0);
    date.setMinutes(
        Math.floor(date.getMinutes() / multiplicity) * multiplicity
    );
    return date;
};

export const hour_bucket = function (val, multiplicity) {
    if (multiplicity === undefined) {
        multiplicity = 1;
    }
    let date = new Date(val);
    date.setMinutes(0);
    date.setSeconds(0);
    date.setMilliseconds(0);
    date.setHours(Math.floor(date.getHours() / multiplicity) * multiplicity);
    return date;
};

export const day_bucket = function (val) {
    let date = new Date(val);
    date.setHours(0);
    date.setMinutes(0);
    date.setSeconds(0);
    date.setMilliseconds(0);
    return date;
};

export const week_bucket = function (val) {
    let date = new Date(val);
    let day = date.getDay();
    let diff = date.getDate() - day + (day == 0 ? -6 : 1);
    date.setHours(0);
    date.setMinutes(0);
    date.setSeconds(0);
    date.setDate(diff);
    return date;
};

export const month_bucket = function (val, multiplicity) {
    if (multiplicity === undefined) {
        multiplicity = 1;
    }
    let date = new Date(val);
    date.setHours(0);
    date.setMinutes(0);
    date.setSeconds(0);
    date.setDate(1);
    date.setMonth(Math.floor(date.getMonth() / multiplicity) * multiplicity);
    return date;
};

export const year_bucket = function (val, multiplicity) {
    if (multiplicity === undefined) {
        multiplicity = 1;
    }
    let date = new Date(val);
    date.setHours(0);
    date.setMinutes(0);
    date.setSeconds(0);
    date.setDate(1);
    date.setMonth(0);
    date.setFullYear(
        Math.floor(date.getFullYear() / multiplicity) * multiplicity
    );
    return date;
};
