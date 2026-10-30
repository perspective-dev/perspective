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

use serde::{Deserialize, Serialize};
use strum::{Display, EnumIter};
use ts_rs::TS;

// NOTE: These should probably be pulled from a server somewhere.

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat/NumberFormat#currency_2
#[derive(Clone, Copy, Debug, Default, PartialEq, Display, EnumIter, Serialize, Deserialize, TS)]
pub enum CurrencyCode {
    AED,
    AFN,
    ALL,
    AMD,
    ANG,
    AOA,
    ARS,
    AUD,
    AWG,
    AZN,
    BAM,
    BBD,
    BDT,
    BGN,
    BHD,
    BIF,
    BMD,
    BND,
    BOB,
    BOV,
    BRL,
    BSD,
    BTN,
    BWP,
    BYR,
    BZD,
    CAD,
    CDF,
    CHE,
    CHF,
    CHW,
    CLF,
    CLP,
    CNY,
    COP,
    COU,
    CRC,
    CUC,
    CUP,
    CVE,
    CZK,
    DJF,
    DKK,
    DOP,
    DZD,
    EGP,
    ERN,
    ETB,
    EUR,
    FJD,
    FKP,
    GBP,
    GEL,
    GHS,
    GIP,
    GMD,
    GNF,
    GTQ,
    GYD,
    HKD,
    HNL,
    HRK,
    HTG,
    HUF,
    IDR,
    ILS,
    INR,
    IQD,
    IRR,
    ISK,
    JMD,
    JOD,
    JPY,
    KES,
    KGS,
    KHR,
    KMF,
    KPW,
    KRW,
    KWD,
    KYD,
    KZT,
    LAK,
    LBP,
    LKR,
    LRD,
    LSL,
    LTL,
    LVL,
    LYD,
    MAD,
    MDL,
    MGA,
    MKD,
    MMK,
    MNT,
    MOP,
    MRO,
    MUR,
    MVR,
    MWK,
    MXN,
    MXV,
    MYR,
    MZN,
    NAD,
    NGN,
    NIO,
    NOK,
    NPR,
    NZD,
    OMR,
    PAB,
    PEN,
    PGK,
    PHP,
    PKR,
    PLN,
    PYG,
    QAR,
    RON,
    RSD,
    RUB,
    RWF,
    SAR,
    SBD,
    SCR,
    SDG,
    SEK,
    SGD,
    SHP,
    SLL,
    SOS,
    SRD,
    SSP,
    STD,
    SYP,
    SZL,
    THB,
    TJS,
    TMT,
    TND,
    TOP,
    TRY,
    TTD,
    TWD,
    TZS,
    UAH,
    UGX,
    #[default]
    USD,
    USN,
    USS,
    UYI,
    UYU,
    UZS,
    VEF,
    VND,
    VUV,
    WST,
    XAF,
    XAG,
    XAU,
    XBA,
    XBB,
    XBC,
    XBD,
    XCD,
    XDR,
    XFU,
    XOF,
    XPD,
    XPF,
    XPT,
    XTS,
    XXX,
    YER,
    ZAR,
    ZMW,
}

// https://tc39.es/ecma402/#table-sanctioned-single-unit-identifiers
#[derive(Clone, Copy, Debug, Default, PartialEq, Display, EnumIter, Serialize, Deserialize, TS)]
// #[serde(rename_all = "kebab-case")]
pub enum Unit {
    #[serde(rename = "acre")]
    Acre,
    #[serde(rename = "bit")]
    Bit,
    #[serde(rename = "byte")]
    Byte,
    #[serde(rename = "celsius")]
    Celsius,
    #[serde(rename = "centimeter")]
    Centimeter,
    #[serde(rename = "day")]
    Day,
    #[serde(rename = "degree")]
    Degree,
    #[serde(rename = "fahrenheit")]
    Fahrenheit,
    #[serde(rename = "fluid-ounce")]
    FluidOunce,
    #[serde(rename = "foot")]
    Foot,
    #[serde(rename = "gallon")]
    Gallon,
    #[serde(rename = "gigabit")]
    Gigabit,
    #[serde(rename = "gigabyte")]
    Gigabyte,
    #[serde(rename = "gram")]
    Gram,
    #[serde(rename = "hectare")]
    Hectare,
    #[serde(rename = "hour")]
    Hour,
    #[serde(rename = "inch")]
    Inch,
    #[serde(rename = "kilobit")]
    Kilobit,
    #[serde(rename = "kilobyte")]
    Kilobyte,
    #[serde(rename = "kilogram")]
    Kilogram,
    #[serde(rename = "kilometer")]
    Kilometer,
    #[serde(rename = "liter")]
    Liter,
    #[serde(rename = "megabit")]
    Megabit,
    #[serde(rename = "megabyte")]
    Megabyte,
    #[serde(rename = "meter")]
    Meter,
    #[serde(rename = "microsecond")]
    Microsecond,
    #[serde(rename = "mile")]
    Mile,
    #[serde(rename = "mile-scandinavian")]
    MileScandinavian,
    #[serde(rename = "milliliter")]
    Milliliter,
    #[serde(rename = "millimeter")]
    Millimeter,
    #[serde(rename = "millisecond")]
    Millisecond,
    #[serde(rename = "minute")]
    Minute,
    #[serde(rename = "month")]
    Month,
    #[serde(rename = "nanosecond")]
    Nanosecond,
    #[serde(rename = "ounce")]
    Ounce,
    #[serde(rename = "percent")]
    #[default]
    Percent,
    #[serde(rename = "petabyte")]
    Petabyte,
    #[serde(rename = "pound")]
    Pound,
    #[serde(rename = "second")]
    Second,
    #[serde(rename = "stone")]
    Stone,
    #[serde(rename = "terabit")]
    Terabit,
    #[serde(rename = "terabyte")]
    Terabyte,
    #[serde(rename = "week")]
    Week,
    #[serde(rename = "yard")]
    Yard,
    #[serde(rename = "year")]
    Year,
}
