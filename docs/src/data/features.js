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

export default [
    // {
    //     name: "Default",
    //     description: "Data grid",
    //     config: {
    //         plugin: "Datagrid",
    //         title: "Default",
    //     },
    // },
    {
        name: "Group By 1",
        description: "Data grid with 1 level of groups for rows",
        config: {
            plugin: "Datagrid",
            title: "Group By 1",
            group_by: ["Sub-Category"],
        },
        aggregates: "dominant",
    },
    {
        name: "Group By 2",
        description: "Data grid with 2 levels of groups for rows",
        config: {
            plugin: "Datagrid",
            title: "Group By 2",
            group_by: ["Category", "Sub-Category"],
        },
    },
    {
        name: "Split By",
        description: "Data grid with 1 level of categories for columns",
        config: {
            plugin: "Datagrid",
            title: "Split By",
            split_by: ["Category"],
            columns: ["Sales", "Quantity", "Discount", "Profit"],
        },
    },
    {
        name: "Split By 2",
        description: "Data grid with 2 levels of categories and columns",
        config: {
            plugin: "Datagrid",
            title: "Split By 2",
            split_by: ["Category", "Sub-Category"],
            columns: ["Sales", "Quantity", "Discount", "Profit"],
        },
    },
    {
        name: "Both",
        description: "Data grid with grouped rows and categorized columns",
        config: {
            plugin: "Datagrid",
            title: "Both",
            group_by: ["Region"],
            split_by: ["Category"],
            columns: ["Sales", "Quantity", "Discount", "Profit"],
        },
    },
    {
        name: "Both 2",
        description:
            "Data grid with 2 levels of groups and 2 levels of categories",
        config: {
            plugin: "Datagrid",
            title: "Both 2",
            group_by: ["Region", "State"],
            split_by: ["Category", "Sub-Category"],
            columns: ["Sales", "Quantity", "Discount", "Profit"],
        },
    },
    {
        name: "Flat Group By 1",
        description:
            "Flat data grid with 1 level of groups for rows, no rollup rows",
        config: {
            title: "Flat Group By 1",
            group_by: ["Sub-Category"],
            group_rollup_mode: "flat",
        },
    },
    {
        name: "Flat Group By 2",
        description:
            "Flat data grid with 2 levels of groups for rows, no rollup rows",
        config: {
            title: "Flat Group By 2",
            group_by: ["Category", "Sub-Category"],
            group_rollup_mode: "flat",
        },
    },
    {
        name: "Flat Both",
        description:
            "Flat data grid with grouped rows and categorized columns, no rollup rows",
        config: {
            title: "Flat Both",
            group_by: ["Region"],
            split_by: ["Category"],
            columns: ["Sales", "Quantity", "Discount", "Profit"],
            group_rollup_mode: "flat",
        },
    },
    {
        name: "Flat Both 2",
        description:
            "Flat data grid with 2 levels of groups and 2 levels of categories, no rollup rows",
        config: {
            title: "Flat Both 2",
            group_by: ["Region", "State"],
            split_by: ["Category", "Sub-Category"],
            columns: ["Sales", "Quantity", "Discount", "Profit"],
            group_rollup_mode: "flat",
        },
    },
    {
        name: "Background Row And Split By",
        description:
            "Data grid with groups, categories, and solid color conditional highlighting",
        config: {
            title: "Background Row And Split By",
            group_by: ["State"],
            split_by: ["Sub-Category"],
            columns: ["Profit"],
            sort: [["Profit", "col asc"]],
            columns_config: {
                Profit: {
                    number_bg_mode: "color",
                },
            },
        },
    },
    {
        name: "Gradient Row And Split By",
        description:
            "Data grid with groups, categories, and gradient conditional highlighting",
        config: {
            title: "Gradient Row And Split By",
            group_by: ["State"],
            split_by: ["Sub-Category"],
            columns: ["Profit"],
            sort: [["Profit", "col asc"]],
            columns_config: {
                Profit: {
                    number_bg_mode: "gradient",
                    bg_gradient: 1600,
                },
            },
        },
    },
    {
        name: "Background Row And Split By",
        description: "Data grid with groups, categories, and a bar chart",
        config: {
            title: "Background Row And Split By",
            group_by: ["State"],
            split_by: ["Sub-Category"],
            columns: ["Sales"],
            aggregates: { Sales: "avg" },
            columns_config: {
                Sales: {
                    number_fg_mode: "bar",
                    fg_gradient: 600,
                },
            },
        },
    },
    {
        name: "Foreground Colors",
        description:
            "Data grid with 6 categories. 3 categories have conditional formatting using foreground colors.",
        config: {
            title: "Foreground Colors",
            columns: [
                "Category",
                "Sales",
                "Discount",
                "Profit",
                "Sub-Category",
                "Order Date",
            ],
            columns_config: {
                Profit: {
                    pos_fg_color: "#32cd82",
                    neg_fg_color: "#f50fed",
                },
                Sales: {
                    pos_fg_color: "#780aff",
                    neg_fg_color: "#f5ac0f",
                },
                Discount: {
                    pos_fg_color: "#f5ac0f",
                    neg_fg_color: "#780aff",
                },
            },
            sort: [["Sub-Category", "desc"]],
        },
    },
    {
        name: "Background Colors",
        description:
            "Data grid with 6 categories. 3 categories have custom, solid color conditional formatting.",
        config: {
            title: "Background Colors",
            plugin: "Datagrid",
            columns_config: {
                Discount: {
                    neg_bg_color: "#780aff",
                    number_bg_mode: "color",
                    number_fg_mode: "disabled",
                    pos_bg_color: "#f5ac0f",
                },
                Profit: {
                    neg_bg_color: "#f50fed",
                    number_bg_mode: "color",
                    number_fg_mode: "disabled",
                    pos_bg_color: "#32cd82",
                },
                Sales: {
                    neg_bg_color: "#f5ac0f",
                    number_bg_mode: "color",
                    number_fg_mode: "disabled",
                    pos_bg_color: "#780aff",
                },
            },
            plugin_config: {
                scroll_lock: true,
            },
            columns: [
                "Category",
                "Sales",
                "Discount",
                "Profit",
                "Sub-Category",
                "Order Date",
            ],
            sort: [["Sub-Category", "desc"]],
        },
    },

    {
        name: "Gradient Colors",
        description:
            "Data grid with 6 categories. 3 categories have custom, gradient color conditional formatting.",
        config: {
            title: "Gradient Colors",
            columns: [
                "Category",
                "Sales",
                "Discount",
                "Profit",
                "Sub-Category",
                "Order Date",
            ],
            columns_config: {
                Profit: {
                    number_bg_mode: "gradient",
                    bg_gradient: 600,
                    pos_bg_color: "#32cd82",
                    neg_bg_color: "#f50fed",
                },
                Sales: {
                    number_bg_mode: "gradient",
                    bg_gradient: 2268,
                    pos_bg_color: "#780aff",
                    neg_bg_color: "#f5ac0f",
                },
                Discount: {
                    number_bg_mode: "gradient",
                    bg_gradient: 0.8,
                    pos_bg_color: "#f5ac0f",
                    neg_bg_color: "#780aff",
                },
            },
            sort: [["Sub-Category", "desc"]],
        },
    },
    {
        name: "Bar Colors",
        description:
            "Data grid with 6 categories. 3 categories have custom colored bars.",
        config: {
            title: "Bar Colors",
            columns: [
                "Category",
                "Sales",
                "Discount",
                "Profit",
                "Sub-Category",
                "Order Date",
            ],
            columns_config: {
                Profit: {
                    number_fg_mode: "bar",
                    fg_gradient: 600,
                    pos_fg_color: "#32cd82",
                    neg_fg_color: "#f50fed",
                },
                Sales: {
                    number_fg_mode: "bar",
                    fg_gradient: 2268,
                    pos_fg_color: "#780aff",
                    neg_fg_color: "#f5ac0f",
                },
                Discount: {
                    number_fg_mode: "bar",
                    fg_gradient: 0.8,
                    pos_fg_color: "#f5ac0f",
                    neg_fg_color: "#780aff",
                },
            },
            sort: [["Sub-Category", "desc"]],
        },
    },
    {
        name: "Label Bar",
        description:
            "Data grid with 6 categories. 3 categories have label bars showing the value overlaid on the bar.",
        config: {
            title: "Label Bar",
            columns: [
                "Category",
                "Sales",
                "Discount",
                "Profit",
                "Sub-Category",
                "Order Date",
            ],
            columns_config: {
                Profit: {
                    number_fg_mode: "label-bar",
                    fg_gradient: 600,
                },
                Sales: {
                    number_fg_mode: "label-bar",
                    fg_gradient: 2268,
                },
                Discount: {
                    number_fg_mode: "label-bar",
                    fg_gradient: 0.8,
                },
            },
            sort: [["Sub-Category", "desc"]],
        },
    },
    {
        name: "Label Bar Colors",
        description:
            "Data grid with 6 categories. 3 categories have custom colored label bars.",
        config: {
            title: "Label Bar Colors",
            columns: [
                "Category",
                "Sales",
                "Discount",
                "Profit",
                "Sub-Category",
                "Order Date",
            ],
            columns_config: {
                Profit: {
                    number_fg_mode: "label-bar",
                    fg_gradient: 600,
                    pos_fg_color: "#32cd82",
                    neg_fg_color: "#f50fed",
                },
                Sales: {
                    number_fg_mode: "label-bar",
                    fg_gradient: 2268,
                    pos_fg_color: "#780aff",
                    neg_fg_color: "#f5ac0f",
                },
                Discount: {
                    number_fg_mode: "label-bar",
                    fg_gradient: 0.8,
                    pos_fg_color: "#f5ac0f",
                    neg_fg_color: "#780aff",
                },
            },
            sort: [["Sub-Category", "desc"]],
        },
    },
    {
        name: "Thermometer",
        description:
            "Data grid with 1 group and 3 columns. 2 columns use bars and 1 column uses gradient conditional highlighting.",
        config: {
            title: "Thermometer",
            group_by: ["State"],
            columns: ["Profit (-)", "Profit", "Profit (+)"],
            columns_config: {
                "Profit (-)": {
                    number_fg_mode: "bar",
                    fg_gradient: 10000,
                },
                Profit: {
                    number_bg_mode: "gradient",
                    bg_gradient: 10000,
                },
                "Profit (+)": {
                    number_fg_mode: "bar",
                    fg_gradient: 10000,
                },
            },
            expressions: {
                [`Profit (-)`]: `if("Profit"<0){"Profit"}else{0}`,
                [`Profit (+)`]: `if("Profit">0){"Profit"}else{0}`,
            },
        },
    },
    {
        name: "Y Bar",
        description:
            "Bar chart with 17 bars. X is 'Sub-Category', and Y is 'Sales'.",
        config: {
            title: "Y Bar",
            plugin: "Y Bar",
            group_by: ["Sub-Category"],
            columns: ["Sales"],
        },
    },
    {
        name: "Y Bar, Sorted Desc By Y-Axis",
        description:
            "Bar chart with 17 bars sorted descending. X is 'Sub-Category', and Y is 'Sales'.",
        config: {
            title: "Y Bar, Sorted Desc By Y-Axis",
            plugin: "Y Bar",
            group_by: ["Sub-Category"],
            columns: ["Sales"],
            sort: [["Sales", "desc"]],
        },
    },
    {
        name: "Y Bar - Row And Split By",
        description:
            "Stacked bar chart with 17 bars. X is 'Sub-Category', Y is 'Sales', and subgroup is 'Ship Mode'",
        config: {
            title: "Y Bar - Row And Split By",
            plugin: "Y Bar",
            group_by: ["Sub-Category"],
            split_by: ["Ship Mode"],
            columns: ["Sales"],
        },
    },

    {
        name: "Y Bar - Group By 2 Sorted",
        description:
            "Bar chart with 3 categories and 17 total subcategories, sorted descending within each category.",
        config: {
            title: "Y Bar - Group By 2 Sorted",
            plugin: "Y Bar",
            group_by: ["Category", "Sub-Category"],
            columns: ["Sales"],
            sort: [["Sales", "desc"]],
        },
    },
    {
        name: "Y Bar - Group By 2 And Split By Sorted",
        description:
            "Bar chart with 3 colored categories and 17 total subcategories, sorted descending within each category.",
        config: {
            title: "Y Bar - Group By 2 And Split By Sorted",
            plugin: "Y Bar",
            group_by: ["Category", "Sub-Category"],
            split_by: ["Category"],
            columns: ["Sales"],
            sort: [["Sales", "desc"]],
        },
    },
    {
        name: "Y Bar - Group By 2 And 2 Split By Sorted",
        description:
            "Stacked bar chart with 3 categories and 17 total subcategories, sorted descending within each category. X is 'Category, Sub-Category', y is 'Sales', subgroup is 'Region'",
        config: {
            title: "Y Bar - Group By 2 And 2 Split By Sorted",
            plugin: "Y Bar",
            group_by: ["Category", "Sub-Category"],
            split_by: ["Category", "Region"],
            columns: ["Sales"],
            sort: [["Sales", "desc"]],
        },
    },
    {
        name: "Y Bar - Group By 2 And 2 Split By Sorted 2",
        description:
            "Bar chart. X is 'State', Y is 'Profit'. Each state has, when applicable, 2 bars: Profit and Loss. States are sorted by Net.",
        config: {
            title: "Y Bar - Group By 2 And 2 Split By Sorted 2",
            plugin: "Y Bar",
            group_by: ["State"],
            split_by: ["Profit (-/+)"],
            columns: ["Profit"],
            expressions: { "Profit (-/+)": `if("Profit"<0){1}else{0}` },
            sort: [["Profit", "desc"]],
        },
        viewport: { width: 600, height: 450 },
    },
    {
        name: "Y Bar Multi Axis",
        description:
            "Groupd bar chart. X is 'Sub-Category', Y is 'Quantity' and 'Sales'. Each X value has 2 bars.",
        config: {
            title: "Y Bar Multi Axis",
            plugin: "Y Bar",
            group_by: ["Sub-Category"],
            columns: ["Quantity", "Sales"],
            aggregates: { Sales: "avg" },
            sort: [["Sales", "desc"]],
        },
    },
    {
        name: "Y Bar Multi Axis - SPlit",
        description:
            "Groupd bar chart. X is 'Sub-Category', Y is 'Quantity', and the second Y is 'Sales'. Each X value has 2 bars.",
        config: {
            title: "Y Bar Multi Axis - SPlit",
            plugin: "Y Bar",
            group_by: ["Sub-Category"],
            columns: ["Quantity", "Sales"],
            sort: [["Sales", "desc"]],
            aggregates: { Sales: "avg" },
            plugin_config: { splitMainValues: ["Sales"] },
        },
    },
    {
        name: "X Bar",
        description:
            "Horizontal bar chart with 17 bars. X is 'Sub-Category' and Y is 'Sales'.",
        config: {
            title: "X Bar",
            plugin: "X Bar",
            group_by: ["Sub-Category"],
            columns: ["Sales"],
        },
    },
    {
        name: "X Bar",
        description:
            "Grouped horizontal bar chart. X is 'Sub-Category' and Y is 'Quantity, Profit'.",
        config: {
            title: "X Bar",
            plugin: "X Bar",
            group_by: ["Sub-Category"],
            columns: ["Quantity", "Profit"],
        },
    },
    {
        name: "X Bar, Sorted Desc By X-Axis",
        description:
            "Sorted horizontal bar chart. X is 'Sub-Category' and Y is 'Sales'.",
        config: {
            title: "X Bar, Sorted Desc By X-Axis",
            plugin: "X Bar",
            group_by: ["Sub-Category"],
            columns: ["Sales"],
            sort: [["Sales", "asc"]],
        },
    },
    {
        name: "X Bar - Row And Split By",
        description:
            "Stacked horizontal bar chart. X is 'Sub-Category', Y is 'Sales', and subgroup is 'Region'",
        config: {
            title: "X Bar - Row And Split By",
            plugin: "X Bar",
            group_by: ["Sub-Category"],
            split_by: ["Region"],
            columns: ["Sales"],
        },
    },
    {
        name: "X Bar - Row And Split By",
        description:
            "Sorted stacked horizontal bar chart. X is 'Sub-Category', Y is 'Sales', and subgroup is 'Region'",
        config: {
            title: "X Bar - Row And Split By",
            plugin: "X Bar",
            group_by: ["Sub-Category"],
            split_by: ["Region"],
            columns: ["Sales"],
            sort: [["Sales", "asc"]],
        },
    },
    {
        name: "Y Line - Datetime Axis",
        description:
            "Line chart. X is Order Date from January 2014 to December 2017. Y is 'Sales'.",
        config: {
            title: "Y Line - Datetime Axis",
            plugin: "Y Line",
            group_by: ["Order Date"],
            columns: ["Sales"],
        },
    },
    {
        name: "Y Line - Datetime Axis",
        description:
            "Line chart with 3 lines. X is Order Date, Y is Sales, and the lines are 'Consumer', 'Corporate', and 'Home Office'.",
        config: {
            title: "Y Line - Datetime Axis",
            plugin: "Y Line",
            group_by: ["Order Date"],
            split_by: ["Segment"],
            columns: ["Sales"],
        },
    },
    {
        name: "Y Line - Datetime Axis Computed",
        description:
            "Line Chart. X is 'Order Date', summarized by month. Y is 'Sales'",
        config: {
            title: "Y Line - Datetime Axis Computed",
            plugin: "Y Line",
            group_by: ["bucket(\"Order Date\", 'M')"],
            expressions: {
                "bucket(\"Order Date\", 'M')": "bucket(\"Order Date\", 'M')",
            },
            columns: ["Sales"],
        },
    },
    {
        name: "Y Line - Datetime Axis",
        description:
            "Line Chart with 4 lines. X is 'Order Date' from January 2014 to December 2017. Y is 'Sales'. Each line is for each year.",
        config: {
            title: "Y Line - Datetime Axis",
            plugin: "Y Line",
            group_by: ["bucket(\"Order Date\", 'M')"],
            split_by: ["bucket(\"Order Date\", 'Y')"],
            expressions: {
                "bucket(\"Order Date\", 'M')": "bucket(\"Order Date\", 'M')",
                "bucket(\"Order Date\", 'Y')": "bucket(\"Order Date\", 'Y')",
            },
            columns: ["Sales"],
        },
    },
    {
        name: "Y Line - Datetime Axis And Split By",
        description:
            "Line Chart with 4 lines. X is Order Date, Y is Sales, and the lines track different regions.",
        config: {
            title: "Y Line - Datetime Axis And Split By",
            plugin: "Y Line",
            group_by: ["bucket(\"Order Date\", 'M')"],
            split_by: ["Region"],
            expressions: {
                "bucket(\"Order Date\", 'M')": "bucket(\"Order Date\", 'M')",
            },
            columns: ["Sales"],
        },
    },
    {
        name: "Y Line - Category Axis",
        description: "Line Chart. X is State and Y is Sales.",
        config: {
            title: "Y Line - Category Axis",
            plugin: "Y Line",
            group_by: ["State"],
            columns: ["Sales"],
        },
        viewport: { width: 600, height: 450 },
    },
    {
        name: "Y Line - Category Axis",
        description:
            "Line Chart. X is State and Y is Sales. Sorted descending.",
        config: {
            title: "Y Line - Category Axis",
            plugin: "Y Line",
            group_by: ["State"],
            columns: ["Sales"],
            sort: [["Sales", "desc"]],
        },
        viewport: { width: 600, height: 450 },
    },
    {
        name: "Y Line - Row and Split By",
        description:
            "Line chart with 3 lines. X is State, Y is Sales, and each line tracks a customer segment. States are sorted descending by total sales.",
        config: {
            title: "Y Line - Row and Split By",
            plugin: "Y Line",
            group_by: ["State"],
            split_by: ["Segment"],
            columns: ["Sales"],
            sort: [["Sales", "desc"]],
        },
        viewport: { width: 600, height: 450 },
    },
    {
        name: "Y Line - Multi Axis Split",
        description:
            "Line chart with 2 lines. X is State, Y is Profit, and second Y is Sales. States are sorted descending by Sales.",
        config: {
            title: "Y Line - Multi Axis Split",
            plugin: "Y Line",
            group_by: ["State"],
            columns: ["Sales", "Profit"],
            plugin_config: { splitMainValues: ["Sales"] },
            sort: [["Sales", "desc"]],
        },
        viewport: { width: 600, height: 450 },
    },
    {
        name: "Y Line - Multi Axis Split",
        description:
            "Line chart with 2 lines. X is State, Y is Profit, second Y is Sales, and each line is profit/sales for each customer segment. States are sorted descending by total Sales.",
        config: {
            title: "Y Line - Multi Axis Split",
            plugin: "Y Line",
            group_by: ["State"],
            split_by: ["Segment"],
            columns: ["Sales", "Profit"],
            plugin_config: { splitMainValues: ["Sales"] },
            sort: [["Sales", "desc"]],
        },
        viewport: { width: 600, height: 450 },
    },
    {
        name: "Y Area - Datetime Axis Computed",
        description:
            "Area chart. X is 'Order Date', bucketed by month. Y is Sales.",
        config: {
            title: "Y Area - Datetime Axis Computed",
            plugin: "Y Area",
            group_by: ["bucket(\"Order Date\", 'M')"],
            expressions: {
                "bucket(\"Order Date\", 'M')": "bucket(\"Order Date\", 'M')",
            },
            columns: ["Sales"],
        },
    },
    {
        name: "Y Area - Datetime Axis",
        description:
            "Area chart. X is 'Order Date', bucketed by month. Y is sales. Each year is its own color and area.",
        config: {
            title: "Y Area - Datetime Axis",
            plugin: "Y Area",
            group_by: ["bucket(\"Order Date\", 'M')"],
            split_by: ["bucket(\"Order Date\", 'Y')"],
            expressions: {
                "bucket(\"Order Date\", 'M')": "bucket(\"Order Date\", 'M')",
                "bucket(\"Order Date\", 'Y')": "bucket(\"Order Date\", 'Y')",
            },
            columns: ["Sales"],
        },
    },
    {
        name: "Y Area - Datetime Axis And Split By",
        description:
            "Stacked area chart. X is 'Order Date', bucketed by month. Y is sales. Subgroup is Region.",
        config: {
            title: "Y Area - Datetime Axis And Split By",
            plugin: "Y Area",
            group_by: ["bucket(\"Order Date\", 'M')"],
            split_by: ["Region"],
            expressions: {
                "bucket(\"Order Date\", 'M')": "bucket(\"Order Date\", 'M')",
            },
            columns: ["Sales"],
        },
    },
    {
        name: "Y Area - Category Axis",
        description: "Area chart. X is 'State'. Y is Sales.",
        config: {
            title: "Y Area - Category Axis",
            plugin: "Y Area",
            group_by: ["State"],
            columns: ["Sales"],
        },
        viewport: { width: 600, height: 450 },
    },
    {
        name: "Y Area - Row and Split By",
        description:
            "Stacked area chart. X is 'State'. Y is 'Sales'. Subgroup is customer segment.",
        config: {
            title: "Y Area - Row and Split By",
            plugin: "Y Area",
            group_by: ["State"],
            split_by: ["Ship Mode"],
            columns: ["Sales"],
        },
        viewport: { width: 600, height: 450 },
    },
    {
        name: "Y Area - 2 Group By",
        description:
            "Grouped area chart. X is State, grouped by Region. Y is sales. Sorted descending by Sales for each region.",
        config: {
            title: "Y Area - 2 Group By",
            plugin: "Y Area",
            group_by: ["Region", "State"],
            columns: ["Sales"],
            sort: [["Sales", "desc"]],
        },
        viewport: { width: 600, height: 450 },
    },
    {
        name: "Y Area - Row and Split By",
        description:
            "Grouped area chart. X is State, grouped by Region. Y is sales. Sorted descending by Sales for each region. Each group is a different color.",
        config: {
            title: "Y Area - Row and Split By",
            plugin: "Y Area",
            group_by: ["Region", "State"],
            split_by: ["Region"],
            columns: ["Sales"],
            sort: [["Sales", "desc"]],
        },
        viewport: { width: 600, height: 450 },
    },
    {
        name: "Y Area - Row and Split By 2",
        description:
            "Stacked grouped area chart. X is State, grouped by Region. Y is sales. Subgroup is customer segment. Sorted descending by total sales.",
        config: {
            title: "Y Area - Row and Split By 2",
            plugin: "Y Area",
            group_by: ["Region", "State"],
            split_by: ["Ship Mode"],
            columns: ["Sales"],
            sort: [["Sales", "desc"]],
        },
        viewport: { width: 600, height: 450 },
    },
    {
        name: "X/Y Scatter",
        description: "Scatter plot. X is Sales. Y is Quantity.",
        config: {
            title: "X/Y Scatter",
            plugin: "X/Y Scatter",
            group_by: ["City"],
            columns: ["Sales", "Quantity"],
            aggregates: { Sales: "avg", Profit: "avg", Quantity: "avg" },
        },
    },
    {
        name: "X/Y Scatter - Split By",
        description:
            "Grouped Scatter plot. X is Sales. Y is Quantity. Group is Region.",
        config: {
            title: "X/Y Scatter - Split By",
            plugin: "X/Y Scatter",
            group_by: ["City"],
            split_by: ["Region"],
            columns: ["Sales", "Quantity"],
            aggregates: { Sales: "avg", Profit: "avg", Quantity: "avg" },
        },
    },
    {
        name: "X/Y Scatter - Color By Float",
        description:
            "Scatter plot. X is Sales. Y is Quantity. Each dot is colored by Profit.",
        config: {
            title: "X/Y Scatter - Color By Float",
            plugin: "X/Y Scatter",
            group_by: ["State"],
            columns: ["Sales", "Quantity", "Profit"],
            aggregates: { Sales: "avg", Profit: "avg", Quantity: "avg" },
            sort: [["Profit", "desc"]],
        },
    },
    {
        name: "X/Y Scatter - Bubble",
        description: "Bubble plot. X is Sales. Y is Quantity. Size is Profit.",
        config: {
            title: "X/Y Scatter - Bubble",
            plugin: "X/Y Scatter",
            group_by: ["Sub-Category"],
            columns: ["Sales", "Quantity", null, "Profit"],
            aggregates: { Sales: "avg", Profit: "avg", Quantity: "avg" },
        },
        viewport: { width: 600, height: 450 },
    },
    {
        name: "X/Y Scatter - Bubble",
        description:
            "Grouped bubble plot. X is Sales. Y is Quantity. Size is Profit. Group is Product Sub-Category.",
        config: {
            title: "X/Y Scatter - Bubble",
            plugin: "X/Y Scatter",
            group_by: ["Sub-Category"],
            split_by: ["Category"],
            columns: ["Sales", "Quantity", null, "Profit"],
            aggregates: { Sales: "avg", Profit: "avg", Quantity: "avg" },
        },
        viewport: { width: 600, height: 450 },
    },
    {
        name: "X/Y Scatter - Bubble",
        description:
            "Colored bubble plot. X is Sales. Y is Quantity. Size is Row ID. Color is Profit.",
        config: {
            title: "X/Y Scatter - Bubble",
            plugin: "X/Y Scatter",
            group_by: ["Sub-Category"],
            columns: ["Sales", "Quantity", "Profit", "Row ID"],
            sort: [["Profit", "desc"]],
            aggregates: {
                Sales: "avg",
                Profit: "sum",
                Quantity: "avg",
                "Row ID": "avg",
            },
        },
        viewport: { width: 600, height: 450 },
    },

    {
        name: "X/Y Scatter - Category Y Axis",
        description:
            "Horizontal Bubble plot. X is State. Y is Profit. Size is Quantity.",
        config: {
            title: "X/Y Scatter - Category Y Axis",
            plugin: "X/Y Scatter",
            columns: ["Profit", "State", null, "Quantity"],
            group_by: ["City"],
            aggregates: {
                State: "dominant",
            },
        },
        viewport: { width: 600, height: 450 },
    },

    {
        name: "X/Y Scatter - Category Y Axis And Size And Color",
        description:
            "Colored Bubble plot. X is State. Y is product sub-category. Size is Sales. Color is Quantity.",
        config: {
            title: "X/Y Scatter - Category Y Axis And Size And Color",
            plugin: "X/Y Scatter",
            columns: ["State", "Sub-Category", "Quantity", "Sales", null],
            group_by: ["State", "Sub-Category"],
            aggregates: {
                State: "dominant",
                "Sub-Category": "dominant",
                Profit: "low",
            },
        },
        viewport: { width: 600, height: 450 },
    },

    {
        name: "X/Y Scatter - Label",
        description:
            "Labeled scatter plot. X is Sales. Y is Quantity. Each dot is labeled by Sub-Category.",
        config: {
            title: "X/Y Scatter - Label",
            plugin: "X/Y Scatter",
            group_by: ["Sub-Category"],
            columns: ["Sales", "Quantity", null, null, null, "Sub-Category"],
            aggregates: {
                Sales: "avg",
                Quantity: "avg",
                "Sub-Category": "dominant",
            },
        },
        viewport: { width: 600, height: 450 },
    },
    {
        name: "X/Y Scatter - Label And Color",
        description:
            "Labeled colored scatter plot. X is Sales. Y is Quantity. Color is Profit. Each dot is labeled by State.",
        config: {
            title: "X/Y Scatter - Label And Color",
            plugin: "X/Y Scatter",
            group_by: ["State"],
            columns: ["Sales", "Quantity", "Profit", null, null, "State"],
            aggregates: {
                Sales: "avg",
                Profit: "avg",
                Quantity: "avg",
                State: "dominant",
            },
            sort: [["Profit", "desc"]],
        },
        viewport: { width: 600, height: 450 },
    },
    {
        name: "X/Y Scatter - Label And Size",
        description:
            "Labeled bubble plot. X is Sales. Y is Quantity. Size is Profit. Each bubble is labeled by Sub-Category.",
        config: {
            title: "X/Y Scatter - Label And Size",
            plugin: "X/Y Scatter",
            group_by: ["Sub-Category"],
            columns: [
                "Sales",
                "Quantity",
                null,
                "Profit",
                null,
                "Sub-Category",
            ],
            aggregates: {
                Sales: "avg",
                Profit: "avg",
                Quantity: "avg",
                "Sub-Category": "dominant",
            },
        },
        viewport: { width: 600, height: 450 },
    },
    {
        name: "X/Y Line",
        description:
            "Line chart with 4 lines. X is Sales. Y is Profit. Each line represents a region.",
        config: {
            title: "X/Y Line",
            columns: ["Sales", "Profit"],
            plugin: "X/Y Line",
            aggregates: {
                "Order Date": "dominant",
                Sales: "avg",
                Profit: "avg",
            },
            group_by: ["State"],
            sort: [
                ["Profit", "desc"],
                ["Sales", "desc"],
            ],
            split_by: ["Region"],
        },
    },
    {
        name: "Treemap",
        description:
            "Treemap with 1-level hierarchy and 17 tiles. Each tile is a product sub-category, and the tile's size represents sales",
        config: {
            title: "Treemap",
            plugin: "Treemap",
            group_by: ["Sub-Category"],
            columns: ["Sales"],
        },
    },
    {
        name: "Treemap - 2 Group By",
        description:
            "Treemap with 2-level hierarchies for Category and Sub-Category. Size is Sales.",
        config: {
            title: "Treemap - 2 Group By",
            plugin: "Treemap",
            group_by: ["Category", "Sub-Category", "Segment"],
            columns: ["Sales"],
        },
    },
    {
        name: "Treemap - Float Color",
        description:
            "Colored treemap with 2-level hierarchies for Category and Sub-Category. Size is Sales. Color is Quantity.",
        config: {
            title: "Treemap - Float Color",
            plugin: "Treemap",
            group_by: ["Category", "Sub-Category"],
            columns: ["Sales", "Quantity"],
            sort: [["Quantity", "desc"]],
        },
    },
    {
        name: "Treemap - Category Color",
        description:
            "Treemap with 2-level hierarchies for Category and Sub-Category, with each Category colored differently. Size is Sales.",
        config: {
            title: "Treemap - Category Color",
            plugin: "Treemap",
            group_by: ["Category", "Sub-Category"],
            columns: ["Sales", "Category"],
            aggregates: { Category: "dominant" },
        },
    },
    {
        name: "Treemap - Row And Split By Float Color",
        description:
            "Colored treemap with 3-level hierarchies for Region, Category, and Sub-Category. Size is Sales. Color is Quantity.",
        config: {
            title: "Treemap - Row And Split By Float Color",
            plugin: "Treemap",
            group_by: ["Category", "Sub-Category"],
            split_by: ["Region"],
            columns: ["Sales", "Quantity"],
            sort: [["Quantity", "desc"]],
        },
        viewport: { width: 800, height: 600 },
    },
    {
        name: "Treemap - Row And Split By Category Color",
        description:
            "Treemap with 3-level hierarchies for Region, Category, and Sub-Category, with each Region colored differently. Size is Sales.",
        config: {
            title: "Treemap - Row And Split By Category Color",
            plugin: "Treemap",
            group_by: ["Category", "Sub-Category"],
            split_by: ["Region"],
            columns: ["Sales", "Region"],
            aggregates: { Region: "dominant" },
        },
        viewport: { width: 800, height: 600 },
    },
    {
        name: "Treemap - Row And Split By Category Color 2",
        description:
            "Treemap with 3-level hierarchies for Region, Category, and Sub-Category, with each Category colored differently. Size is Sales.",
        config: {
            title: "Treemap - Row And Split By Category Color 2",
            plugin: "Treemap",
            group_by: ["Category", "Sub-Category"],
            split_by: ["Region"],
            columns: ["Sales", "Category"],
            aggregates: { Category: "dominant" },
        },
        viewport: { width: 800, height: 600 },
    },
    {
        name: "Treemap - Row And Split By Category Color 2",
        description:
            "Treemap with 3-level hierarchies for Region, Category, and Sub-Category, with each Category colored differently. Size is Sales.",
        config: {
            plugin: "Treemap",
            theme: null,
            title: "Treemap - Category Color 2",
            group_by: ["State", "City"],
            columns: ["Sales", "State", null],
            aggregates: {
                State: "dominant",
            },
        },
        viewport: { width: 800, height: 600 },
    },
    {
        name: "Sunburst",
        description:
            "Sunburst with 1-level hierarchy. Hierarchy is Category. Size is Sales.",
        config: {
            title: "Sunburst",
            plugin: "Sunburst",
            group_by: ["Sub-Category"],
            columns: ["Sales"],
        },
    },
    {
        name: "Sunburst - 2 Group By",
        description:
            "Sunburst with 3-level hierarchy. Hierarchies are Category, Sub-category, and Customer Segment.",
        config: {
            title: "Sunburst - 2 Group By",
            plugin: "Sunburst",
            group_by: ["Category", "Sub-Category", "Segment"],
            columns: ["Sales"],
        },
    },
    {
        name: "Sunburst - Float Color",
        description:
            "Colored sunburst with 2-level hierarchy. Hierarchies are Category and Sub-category. Size is Quantity. Color is Sales.",
        config: {
            title: "Sunburst - Float Color",
            plugin: "Sunburst",
            group_by: ["Category", "Sub-Category"],
            columns: ["Quantity", "Sales"],
            sort: [["Quantity", "desc"]],
        },
    },
    {
        name: "Sunburst - Category Color",
        description:
            "Colored sunburst with 2-level hierarchy. Hierarchies are Category and Sub-category. Size is Sales. Color is also Category.",
        config: {
            title: "Sunburst - Category Color",
            plugin: "Sunburst",
            group_by: ["Category", "Sub-Category"],
            columns: ["Sales", "Category"],
            aggregates: { Category: "dominant" },
        },
    },
    {
        name: "Sunburst - Row And Split By",
        description:
            "Grouped sunbursts with 2-level hierarchy. Hierarchies are Category and Sub-category. Size is Sales. Each sunburst is a different region.",
        config: {
            title: "Sunburst - Row And Split By",
            plugin: "Sunburst",
            group_by: ["Category", "Sub-Category"],
            split_by: ["Region"],
            columns: ["Sales"],
        },
        viewport: { width: 600, height: 450 },
    },
    {
        name: "Sunburst - Row And Split By Float Color",
        description:
            "Grouped colored sunbursts with 2-level hierarchy. Hierarchies are Category and Sub-category. Size is Sales. Color is Quantity. Each sunburst is a different region.",
        config: {
            title: "Sunburst - Row And Split By Float Color",
            plugin: "Sunburst",
            group_by: ["Category", "Sub-Category"],
            split_by: ["Region"],
            columns: ["Sales", "Quantity"],
        },
        viewport: { width: 600, height: 450 },
    },
    {
        name: "Sunburst - Row And Split By Category Color",
        description:
            "Grouped sunbursts with 2-level hierarchy. Hierarchies are Category and Sub-category. Size is Sales. Each sunburst is a different region and color.",
        config: {
            title: "Sunburst - Row And Split By Category Color",
            plugin: "Sunburst",
            group_by: ["Category", "Sub-Category"],
            split_by: ["Region"],
            columns: ["Sales", "Region"],
            aggregates: { Region: "dominant" },
        },
        viewport: { width: 600, height: 450 },
    },
    {
        name: "Sunburst - Row And Split By Category Color 2",
        description:
            "Grouped sunbursts with 2-level hierarchy. Hierarchies are Category and Sub-category. Size is Sales. Each sunburst is a different region, and each category is colored.",
        config: {
            title: "Sunburst - Row And Split By Category Color 2",
            plugin: "Sunburst",
            group_by: ["Category", "Sub-Category"],
            split_by: ["Region"],
            columns: ["Sales", "Category"],
            aggregates: { Category: "dominant" },
        },
        viewport: { width: 600, height: 450 },
    },
    {
        name: "Heatmap",
        description:
            "Heatmap. Columns are Sub-Category. Rows are Region. Color is Profit.",
        config: {
            title: "Heatmap",
            plugin: "Heatmap",
            group_by: ["Sub-Category"],
            split_by: ["Region"],
            columns: ["Profit"],
            sort: [
                ["Profit", "desc"],
                ["Profit", "col desc"],
            ],
        },
    },
    {
        name: "Heatmap 2",
        description:
            "Heatmap. Columns are State. Rows are Sub-Category. Color is Profit.",
        config: {
            title: "Heatmap 2",
            plugin: "Heatmap",
            group_by: ["State"],
            split_by: ["Sub-Category"],
            columns: ["Profit"],
            sort: [
                ["Profit", "desc"],
                ["Profit", "col desc"],
            ],
        },
        viewport: { width: 600, height: 450 },
    },
    {
        name: "Heatmap 3",
        description:
            "Heatmaps. Columns are order date, bucketed by month. Rows are Sub-Category. Color is Discount.",
        config: {
            title: "Heatmap 3",
            columns: ["Discount"],
            plugin: "Heatmap",
            expressions: {
                "bucket(\"Order Date\", 'M')": "bucket(\"Order Date\", 'M')",
            },
            aggregates: {
                "Order Date": "dominant",
                Sales: "avg",
            },
            split_by: ["Sub-Category"],
            group_by: ["bucket(\"Order Date\", 'M')"],
            sort: [["Discount", "col asc"]],
        },
        viewport: { width: 600, height: 450 },
    },
    {
        name: "Heatmap 4",
        description:
            "Heatmap. Columns are order date, bucketed by month. Rows are Profit, bucketed by 100. Color is Profit.",
        config: {
            title: "Heatmap 4",
            plugin: "Heatmap",
            columns: ["Profit"],
            expressions: {
                'bucket("Profit", 100)': 'bucket("Profit", 100)',
                "bucket(\"Order Date\", 'M')": "bucket(\"Order Date\", 'M')",
            },
            group_by: ["bucket(\"Order Date\", 'M')"],
            split_by: ['bucket("Profit", 100)'],
        },
        viewport: { width: 600, height: 450 },
    },
];
