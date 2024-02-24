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

import {
    IPerspectiveViewerPlugin,
    PerspectiveColumnConfig,
} from "@finos/perspective-viewer";

export interface Element {
    msMatchesSelector(selectors: string): boolean;
}

export interface Chart {
    (container: HTMLSelection, settings: Settings): void;
    plugin?: {
        name: string;
        category: string;
        max_cells: number;
        max_columns: number;
        render_warning: boolean;
        initial: {
            type?: string;
            count?: number;
            names: string[];
        };
        selectMode?: string;
    };
    can_render_column_styles?: (type: Type, group?: string) => boolean;
    // TODO: Generate the type for the column style schema.
    column_style_controls?: (type: Type, group?: string) => unknown;
}

export type PadUnit = "percent" | "domain";
export type Pad = [number, number];

export interface PaddingStrategy {
    (extent: any): any;

    pad(): Pad;
    pad(nextPad: Pad): this;

    padUnit(): PadUnit;
    padUnit(nextPadUnit: PadUnit): this;
}

export type Axis = [number, number];

export type GradientPair = [number, string];

export type GradientKey = string; // full, negative, positive

export type ColorStyles = {
    scheme: string[];
    gradient?: Record<GradientKey, GradientPair[]>; // Should this be optional?
    interpolator: { [key: string]: (value: number) => string };
    grid: { gridLineColor?: string };
    opacity?: number;
    series?: string;
    [key: `series-${number}`]: string;
};

export type TextStyles = Record<string, string>; // Should this be optional?

export type DataRowsWithKey = any[] & {
    key?: string;
};

export type MainValue = {
    name: string;
    type: any;
};

// NOTE: Should these props be optional?
export type TreemapValue = {
    treemapLevel?: number;
    treemapRoute?: any[]; // string[]?
};

export type Settings = {
    hideKeys?: any[];
    agg_paths?: any; // any[]?
    axisMemo: Axis[];
    colorStyles?: ColorStyles;
    crossValues: any[]; // string[]?
    data: any[];
    filter: any[];
    mainValues: MainValue[];
    splitMainValues?: string[];
    realValues: string[];
    size: DOMRect;
    splitValues: any[];
    textStyles: TextStyles;
    sunburstLevel?: any;
    columns_config?: PerspectiveColumnConfig;
    treemaps?: Record<string, TreemapValue>;
};

export type Orientation = "vertical" | "horizontal" | "both";
export type Orient = "left" | "right" | "top" | "bottom";

export type SettingNameValues = "crossValues" | "mainValues" | "splitValues";
export type ValueName =
    | "crossValue"
    | "mainValue"
    | "lowValue"
    | "highValue"
    | "colorValue";

export interface Domain {
    (data: any[]): any;

    valueName(): ValueName;
    valueName(nextValueName: ValueName): this;

    valueNames(): ValueName[];
    valueNames(nextValueNames: ValueName[]): this;

    orient(): Orientation;
    orient(nextOrient: Orientation): this;

    pad(): Pad;
    pad(nextPad: Pad): this;

    padUnit(): PadUnit;
    padUnit(nextPadUnit: PadUnit): this;
}

export type DomainTuple = [number, number];

export interface ComponentData {
    bottom: any;
    left: any;
    top: any;
    right: any;
    size?: string;
    decorate?: (s, data, index) => void;
}

export interface Component {
    (): ComponentData;

    domain(): Domain;
    domain(nextDomain: Domain): this;

    orient(): Orientation;
    orient(nextOrient: Orientation): this;

    settingName(): SettingNameValues;
    settingName(nextSettingName: SettingNameValues): this;
}

export interface ScaleSequential extends d3.ScaleSequential<string> {
    (arg: any): any;
}
// TODO: Figure out the other types of scales that this could be.
export type D3Scale = d3.ScaleOrdinal<string, unknown> | ScaleSequential;

export type NodeRect = {
    top: number;
    right: number;
    bottom: number;
    left: number;
};

export type HTMLSelection<E extends d3.BaseType = HTMLElement> = d3.Selection<
    E,
    unknown,
    undefined,
    unknown
>;

export interface ChartElement extends IPerspectiveViewerPlugin {
    _chart: Chart | null;
    _settings: Settings | null;
    render_warning: boolean;
    _initialized: boolean;
    _container: HTMLElement;

    get category(): string;

    get max_cells(): number;
    set max_cells(value: number);

    get max_columns(): number;
    set max_columns(value: number);

    _draw(): void;

    getContainer(): HTMLElement;
}
