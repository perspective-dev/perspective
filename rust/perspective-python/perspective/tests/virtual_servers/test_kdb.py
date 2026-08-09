#  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
#  ┃ ██████ ██████ ██████       █      █      █      █      █ █▄  ▀███ █       ┃
#  ┃ ▄▄▄▄▄█ █▄▄▄▄▄ ▄▄▄▄▄█  ▀▀▀▀▀█▀▀▀▀▀ █ ▀▀▀▀▀█ ████████▌▐███ ███▄  ▀█ █ ▀▀▀▀▀ ┃
#  ┃ █▀▀▀▀▀ █▀▀▀▀▀ █▀██▀▀ ▄▄▄▄▄ █ ▄▄▄▄▄█ ▄▄▄▄▄█ ████████▌▐███ █████▄   █ ▄▄▄▄▄ ┃
#  ┃ █      ██████ █  ▀█▄       █ ██████      █      ███▌▐███ ███████▄ █       ┃
#  ┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
#  ┃ Copyright (c) 2017, the Perspective Authors.                              ┃
#  ┃ ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ ┃
#  ┃ This file is part of the Perspective library, distributed under the terms ┃
#  ┃ of the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0). ┃
#  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

"""Tests for the kdb+ virtual server.

`TestKdb*` are integration tests against a real q process. Start one with

    q -p 5001

and point `PSP_KDB_HOST` / `PSP_KDB_PORT` at it; they skip otherwise.
"""

import os
import socket
import tempfile
import urllib.request

import pytest

from perspective.virtual_servers.kdb import (
    Columns,
    marker_columns,
    q_aggregate,
    q_constraints,
    q_column,
    q_dict,
    q_expression_types,
    q_hosted_tables,
    q_list,
    q_string,
    q_symbol,
    q_table_make_view,
    q_table_schema,
    q_table_size,
    q_view_delete,
    q_view_min_max,
    q_view_slice,
    q_window,
    q_window_body,
    q_window_types,
    q_windows,
    sanitize,
    sort_specs,
    window_specs,
)

# A stand-in for a q `meta`, covering the types whose Perspective mapping is
# non-obvious: `j` (64-bit, so `float`), `C` (a column of strings) and the
# cast-through types `g` / `z` / `m`.
SCHEMA = {
    "Region": "s",
    "City": "s",
    "Sales": "f",
    "Quantity": "j",
    "Order Date": "d",
    "Stamp": "p",
    "Note": "C",
    "Flag": "b",
    "Id": "g",
    "Month": "m",
    "Local": "z",
}


def columns(schema=None, expressions=None, expression_types=None):
    return Columns(
        schema if schema is not None else SCHEMA, expressions, expression_types
    )


def make_view(config, schema=None, cols=None):
    query, _ = q_table_make_view(
        "trades", ".psp.v1", config, cols if cols is not None else columns(schema)
    )
    return query


def columns_of(config, schema=None, cols=None):
    _, view_columns = q_table_make_view(
        "trades", ".psp.v1", config, cols if cols is not None else columns(schema)
    )
    return view_columns


class TestKdbQueryLiterals:
    def test_symbol_uses_identifier_form(self):
        assert q_symbol("Sales") == "`Sales"

    def test_symbol_falls_back_for_non_identifiers(self):
        # q identifiers must start with a letter and cannot contain a space,
        # which is why the whole builder emits functional qSQL.
        assert q_symbol("Product Name") == '`$"Product Name"'
        assert q_symbol("Sub-Category") == '`$"Sub-Category"'
        assert q_symbol("_leading") == '`$"_leading"'
        assert q_symbol("__ROW_PATH_0__") == '`$"__ROW_PATH_0__"'

    def test_string_escapes(self):
        assert q_string('a"b') == '"a\\"b"'
        assert q_string("a\\b") == '"a\\\\b"'
        assert q_string("a\nb") == '"a\\nb"'

    def test_symbol_escapes_injection(self):
        # The payload has to stay inside the string literal.
        assert q_symbol('x"; delete from `t; /') == '`$"x\\"; delete from `t; /"'

    def test_list_parenthesizes_enlist(self):
        # Unparenthesized, q's right-to-left application would let `enlist`
        # swallow the following operator.
        assert q_list([]) == "()"
        assert q_list(["`a"]) == "(enlist `a)"
        assert q_list(["`a", "`b"]) == "(`a;`b)"

    def test_dict(self):
        assert q_dict([], []) == "()!()"
        assert q_dict(["`a"], ["1"]) == "(enlist `a)!(enlist 1)"
        assert q_dict(["`a", "`b"], ["1", "2"]) == "(`a;`b)!(1;2)"

    def test_column_projections_cast_to_the_declared_type(self):
        assert q_column("Sales", columns()) == "`Sales"
        assert q_column("Id", columns()) == "(string;`Id)"
        assert q_column("Local", columns()) == '($;"p";`Local)'
        assert q_column("Month", columns()) == '($;"d";`Month)'
        assert q_column("Note", columns()) == "`Note"

    def test_sanitize(self):
        assert sanitize("view-1/2 3") == "view_1_2_3"
        assert sanitize("a" * 64) == "a" * 32

    def test_marker_columns(self):
        assert marker_columns(0, False) == []
        assert marker_columns(2, False) == ["pspGid", "pspRp0", "pspRp1"]
        # Flat mode has no rollup rows, so no discriminator.
        assert marker_columns(2, True) == ["pspRp0", "pspRp1"]

    def test_sort_specs_drops_inactive_and_column_sorts(self):
        specs = sort_specs(
            {
                "sort": [
                    ["a", "desc"],
                    ["b", "none"],
                    ["c", "col asc"],
                    ["d", "asc abs"],
                ]
            }
        )
        assert specs == [("a", "desc", False), ("d", "asc", True)]


class TestKdbQueryAggregates:
    """The advertised aggregate names are q's own primitives, emitted as
    written. There is no translation table mapping Perspective's or DuckDB's
    vocabulary onto q's."""

    def test_q_primitives_are_emitted_as_written(self):
        for name in ["sum", "avg", "count", "min", "max", "first", "last", "prd"]:
            assert q_aggregate(name, "Sales", columns()) == f"({name};`Sales)"

    def test_population_and_sample_are_distinct_choices(self):
        # A kdb+ user picks between these deliberately; collapsing them onto
        # one `stddev` would hide half of q's model.
        assert q_aggregate("dev", "Sales", columns()) == "(dev;`Sales)"
        assert q_aggregate("sdev", "Sales", columns()) == "(sdev;`Sales)"
        assert q_aggregate("var", "Sales", columns()) == "(var;`Sales)"
        assert q_aggregate("svar", "Sales", columns()) == "(svar;`Sales)"

    def test_median_is_med(self):
        assert q_aggregate("med", "Sales", columns()) == "(med;`Sales)"

    def test_boolean_predicates(self):
        assert q_aggregate("any", "Flag", columns()) == "(any;`Flag)"
        assert q_aggregate("all", "Flag", columns()) == "(all;`Flag)"

    def test_count_distinct_is_the_one_compound_spelling(self):
        assert q_aggregate("count distinct", "City", columns()) == (
            "(count;(distinct;`City))"
        )

    def test_weighted_aggregates_take_a_second_column(self):
        # `Quantity wavg Sales` — the reason a lot of people run kdb+.
        assert q_aggregate(["wavg", ["Quantity"]], "Sales", columns()) == (
            "(wavg;`Quantity;`Sales)"
        )
        assert q_aggregate(["wsum", ["Quantity"]], "Sales", columns()) == (
            "(wsum;`Quantity;`Sales)"
        )

    def test_correlation_and_covariance(self):
        assert q_aggregate(["cor", ["Quantity"]], "Sales", columns()) == (
            "(cor;`Quantity;`Sales)"
        )
        assert q_aggregate(["cov", ["Quantity"]], "Sales", columns()) == (
            "(cov;`Quantity;`Sales)"
        )

    def test_multi_aggregate_resolves_an_expression_argument(self):
        cols = columns(expressions={"E": "Sales*2"}, expression_types={"E": "f"})
        assert q_aggregate(["wavg", ["E"]], "Sales", cols) == (
            '(wavg;(parse "Sales*2");`Sales)'
        )

    def test_foreign_vocabulary_is_rejected(self):
        # Names from the other backends are not q, and are not silently
        # translated into it.
        for name in ["stddev", "median", "product", "any_value", "distinct_count"]:
            with pytest.raises(ValueError, match="Unknown aggregate"):
                q_aggregate(name, "Sales", columns())

    def test_the_advertised_set_is_an_allowlist(self):
        # Emitting the name verbatim would otherwise be a way to name any q
        # function at all.
        with pytest.raises(ValueError, match="Unknown aggregate"):
            q_aggregate("system", "Sales", columns())

    def test_default_aggregate_is_q_native(self):
        query = make_view({"columns": ["Sales", "City"], "group_rollup_mode": "total"})
        assert "(sum;`Sales)" in query
        assert "(count;`City)" in query


class TestKdbQueryFilters:
    def constraint(self, column, op, value, cols=None):
        return q_constraints(
            {"filter": [[column, op, value]]}, cols if cols is not None else columns()
        )

    def test_symbol_equality_enlists_the_constant(self):
        # A bare symbol in a parse tree is a *column reference*; enlisting it
        # is what makes q read it as a constant.
        assert self.constraint("City", "==", "Boston") == ["(in;`City;enlist `Boston)"]

    def test_symbol_inequality(self):
        assert self.constraint("City", "!=", "Boston") == [
            "(not;(in;`City;enlist `Boston))"
        ]

    def test_like_is_qs_like_with_qs_wildcards(self):
        # q's pattern language, not SQL's rewritten into it — `*` and `?` are
        # the wildcards, and `%` / `_` are literal characters.
        assert self.constraint("City", "like", "Bos*") == ['(like;`City;"Bos*")']
        assert self.constraint("City", "like", "B?s") == ['(like;`City;"B?s")']
        assert self.constraint("City", "like", "50%*") == ['(like;`City;"50%*")']

    def test_in_takes_a_vector(self):
        # A q vector is already a parse-tree constant, so no `enlist` dance.
        assert self.constraint("City", "in", ["Boston", "Austin"]) == [
            "(in;`City;(`Boston;`Austin))"
        ]
        assert self.constraint("Sales", "in", [1, 2.5]) == ["(in;`Sales;(1.0;2.5))"]

    def test_in_with_one_value_still_enlists(self):
        assert self.constraint("City", "in", ["Boston"]) == [
            "(in;`City;(enlist `Boston))"
        ]

    def test_not_in(self):
        assert self.constraint("City", "not in", ["Boston"]) == [
            "(not;(in;`City;(enlist `Boston)))"
        ]

    def test_in_over_char_lists(self):
        assert self.constraint("Note", "in", ["a", "b"]) == ['(in;`Note;("a";"b"))']

    def test_in_requires_a_non_empty_list(self):
        assert self.constraint("City", "in", []) == []
        assert self.constraint("City", "in", "Boston") == []

    def test_numeric(self):
        assert self.constraint("Sales", ">", 5) == ["(>;`Sales;5.0)"]
        assert self.constraint("Quantity", "==", 3) == ["(=;`Quantity;3)"]

    def test_boolean(self):
        assert self.constraint("Flag", "==", True) == ["(=;`Flag;1b)"]

    def test_date_is_epoch_arithmetic(self):
        assert self.constraint("Order Date", "<", 86_400_000.0) == [
            '(<;`$"Order Date";(1970.01.01+1))'
        ]

    def test_datetime_is_epoch_arithmetic(self):
        assert self.constraint("Stamp", ">=", 1000.0) == [
            "(>=;`Stamp;(1970.01.01D00:00:00.000000000+1000000000))"
        ]

    def test_char_list_equality_uses_in(self):
        # `=` over a column of char lists compares character-wise.
        assert self.constraint("Note", "==", "hello") == ['(in;`Note;enlist "hello")']

    def test_char_list_ordering_casts_to_symbol(self):
        assert self.constraint("Note", ">", "m") == ["(>;({[x] `$x};`Note);enlist `m)"]

    def test_filter_on_cast_column_uses_the_projection(self):
        assert self.constraint("Id", "==", "abc") == ['(in;(string;`Id);enlist "abc")']

    def test_value_injection_is_escaped(self):
        assert self.constraint("City", "==", '"; delete') == [
            '(in;`City;enlist `$"\\"; delete")'
        ]

    def test_null_and_array_operands_are_dropped(self):
        assert q_constraints({"filter": [["City", "==", None]]}, columns()) == []
        assert q_constraints({"filter": [["City", "==", ["a", "b"]]]}, columns()) == []


class TestKdbQueryFlat:
    def test_flat_select(self):
        assert make_view({"columns": ["City", "Sales"]}) == (
            ".psp.v1 set (`City;`Sales) xcols "
            "?[`trades;();0b;(`City;`Sales)!(`City;`Sales)];"
        )

    def test_flat_select_defaults_to_every_column(self):
        assert columns_of({"columns": []}, {"a": "j", "b": "s"}) == ["a", "b"]

    def test_flat_sort_drops_its_scratch_column(self):
        query = make_view({"columns": ["Sales"], "sort": [["Sales", "desc"]]})
        assert query == (
            ".psp.v1 set (enlist `Sales) xcols "
            "![(enlist `pspSrt0) xdesc "
            "?[`trades;();0b;(`Sales;`pspSrt0)!(`Sales;`Sales)];"
            "();0b;(enlist `pspSrt0)];"
        )

    def test_total_is_an_aggregate_with_no_by(self):
        # `0b` with aggregate expressions collapses to a single row.
        assert make_view(
            {
                "columns": ["Sales"],
                "group_rollup_mode": "total",
                "aggregates": {"Sales": "sum"},
            }
        ) == (
            ".psp.v1 set (enlist `Sales) xcols "
            "?[`trades;();0b;(enlist `Sales)!(enlist (sum;`Sales))];"
        )

    def test_aggregate_chain(self):
        query = make_view(
            {
                "columns": ["City"],
                "group_rollup_mode": "total",
                "aggregates": {"City": "count distinct"},
            }
        )
        assert "(count;(distinct;`City))" in query

    def test_unknown_aggregate_raises(self):
        with pytest.raises(ValueError, match="Unknown aggregate"):
            make_view(
                {
                    "columns": ["Sales"],
                    "group_rollup_mode": "total",
                    "aggregates": {"Sales": "median_absolute_deviation"},
                }
            )

    def test_default_aggregate_is_type_aware(self):
        query = make_view({"columns": ["Sales", "City"], "group_rollup_mode": "total"})
        assert "(sum;`Sales)" in query
        assert "(count;`City)" in query


class TestKdbQueryGroupBy:
    def test_single_level_rollup(self):
        assert make_view(
            {
                "columns": ["Sales"],
                "group_by": ["Region"],
                "aggregates": {"Sales": "sum"},
            }
        ) == (
            ".psp.v1 set (`pspGid;`pspRp0;`Sales) xcols "
            "![(`pspOrd0;`pspRp0) xasc raze ("
            "(`pspGid;`pspRp0;`pspOrd0;`Sales) xcols "
            "{[t] t,'flip (`pspRp0;`pspGid;`pspOrd0)!"
            "(count[t]#`;count[t]#1;count[t]#0)}"
            "[?[`trades;();0b;(enlist `Sales)!(enlist (sum;`Sales))]];"
            "(`pspGid;`pspRp0;`pspOrd0;`Sales) xcols "
            "{[t] t,'flip (`pspGid;`pspOrd0)!(count[t]#0;count[t]#1)}"
            "[0!?[`trades;();(enlist `pspRp0)!(enlist `Region);"
            "(enlist `Sales)!(enlist (sum;`Sales))]]"
            ");();0b;(enlist `pspOrd0)];"
        )

    def test_rollup_emits_one_level_per_depth(self):
        query = make_view(
            {
                "columns": ["Sales"],
                "group_by": ["Region", "City"],
                "aggregates": {"Sales": "sum"},
            }
        )
        # Three levels: total, Region, Region x City.
        assert query.count("?[`trades;") == 3
        assert "(enlist `pspRp0)!(enlist `Region)" in query
        assert "(`pspRp0;`pspRp1)!(`Region;`City)" in query

    def test_grouping_id_encodes_depth(self):
        query = make_view(
            {
                "columns": ["Sales"],
                "group_by": ["Region", "City"],
                "aggregates": {"Sales": "sum"},
            }
        )
        # `GROUPING_ID` is a bitmask of the columns aggregated away, so a
        # level retaining `k` of `n` columns is `2 ** (n - k) - 1`. That is
        # what `VirtualDataSlice` decodes each row's depth from.
        assert "count[t]#3" in query  # total
        assert "count[t]#1" in query  # Region
        assert "count[t]#0" in query  # leaf

    def test_row_path_padding_is_typed(self):
        # Untyped nulls would not concatenate across levels.
        assert "count[t]#`" in make_view({"columns": ["Sales"], "group_by": ["Region"]})
        assert "count[t]#0Nd" in make_view(
            {"columns": ["Sales"], "group_by": ["Order Date"]}
        )
        assert "count[t]#0Nj" in make_view(
            {"columns": ["Sales"], "group_by": ["Quantity"]}
        )

    def test_row_path_padding_matches_the_projected_type(self):
        # `Month` projects through a `"d"$` cast, so its pad must be a date
        # null and not a month null.
        query = make_view({"columns": ["Sales"], "group_by": ["Month"]})
        assert "count[t]#0Nd" in query
        assert "0Nm" not in query

    def test_flat_mode_is_a_single_level(self):
        assert make_view(
            {
                "columns": ["Sales"],
                "group_by": ["Region"],
                "group_rollup_mode": "flat",
                "aggregates": {"Sales": "sum"},
            }
        ) == (
            ".psp.v1 set (`pspRp0;`Sales) xcols (enlist `pspRp0) xasc "
            "(`pspRp0;`Sales) xcols "
            "0!?[`trades;();(enlist `pspRp0)!(enlist `Region);"
            "(enlist `Sales)!(enlist (sum;`Sales))];"
        )

    def test_flat_mode_has_no_grouping_id(self):
        query = make_view(
            {
                "columns": ["Sales"],
                "group_by": ["Region"],
                "group_rollup_mode": "flat",
            }
        )
        assert "pspGid" not in query
        assert "pspOrd" not in query

    def test_view_columns_exclude_metadata(self):
        assert columns_of({"columns": ["Sales"], "group_by": ["Region", "City"]}) == [
            "Sales"
        ]


class TestKdbQueryGroupBySort:
    def config(self, group_by, direction="desc"):
        return {
            "columns": ["Sales"],
            "group_by": group_by,
            "aggregates": {"Sales": "sum"},
            "sort": [["Sales", direction]],
        }

    def test_single_level_sorts_on_its_own_aggregate(self):
        query = make_view(self.config(["Region"]))
        # Depth first, then the sort, then the row path — the tuple that puts
        # the total row above its children.
        assert (
            "(enlist `pspOrd0) xasc (enlist `pspSrt0) xdesc (enlist `pspRp0) xasc"
            in query
        )
        assert " lj " not in query

    def test_multi_level_orders_children_under_their_parent(self):
        query = make_view(self.config(["Region", "City"]))
        assert (
            "(enlist `pspOrd0) xasc (enlist `pspAnc0_0) xdesc "
            "(`pspRp0;`pspOrd1) xasc (enlist `pspSrt0) xdesc "
            "(enlist `pspRp1) xasc" in query
        )

    def test_multi_level_joins_the_ancestor_aggregate(self):
        # A row sorts by its *parent's* aggregate before its own, so sibling
        # subtrees stay contiguous.
        query = make_view(self.config(["Region", "City"]))
        assert (
            "lj (?[`trades;();(enlist `pspRp0)!(enlist `Region);"
            "(enlist `pspAnc0_0)!(enlist (sum;`Sales))])" in query
        )

    def test_ancestor_join_is_skipped_without_sorts(self):
        query = make_view(
            {
                "columns": ["Sales"],
                "group_by": ["Region", "City"],
                "aggregates": {"Sales": "sum"},
            }
        )
        assert " lj " not in query
        assert "(`pspOrd0;`pspRp0;`pspOrd1;`pspRp1) xasc" in query

    def test_scratch_columns_are_dropped(self):
        query = make_view(self.config(["Region", "City"]))
        assert query.endswith("();0b;(`pspSrt0;`pspOrd0;`pspOrd1;`pspAnc0_0)];")

    def test_abs_sort_wraps_the_aggregate(self):
        query = make_view(self.config(["Region"], "desc abs"))
        assert "(abs;(sum;`Sales))" in query

    def test_ascending(self):
        query = make_view(self.config(["Region"], "asc"))
        assert "(`pspOrd0;`pspSrt0;`pspRp0) xasc" in query


class TestKdbQueryExpressions:
    """Expressions are q, passed through verbatim. `parse` is the bridge from
    expression text to the parse tree functional qSQL takes."""

    def cols(self, expressions, expression_types):
        return columns(expressions=expressions, expression_types=expression_types)

    def test_expression_passes_q_through_parse(self):
        cols = self.cols({"Net": "Sales*0.9"}, {"Net": "f"})
        assert q_column("Net", cols) == '(parse "Sales*0.9")'

    def test_expression_is_selectable(self):
        cols = self.cols({"Net": "Sales*0.9"}, {"Net": "f"})
        query = make_view({"columns": ["Net"]}, cols=cols)
        assert query == (
            ".psp.v1 set (enlist `Net) xcols "
            '?[`trades;();0b;(enlist `Net)!(enlist (parse "Sales*0.9"))];'
        )

    def test_expression_text_is_escaped(self):
        cols = self.cols({"E": 'x like "a\\"b"'}, {"E": "b"})
        assert q_column("E", cols) == '(parse "x like \\"a\\\\\\"b\\"")'

    def test_expression_shadows_a_source_column(self):
        # Matching the SQL handlers, whose `col_name` resolves an alias before
        # falling back to quoting it as an identifier.
        cols = self.cols({"Sales": "2*Sales"}, {"Sales": "f"})
        assert q_column("Sales", cols) == '(parse "2*Sales")'

    def test_expression_is_groupable_and_pads_by_its_own_type(self):
        cols = self.cols({"Bucket": "10 xbar Sales"}, {"Bucket": "f"})
        query = make_view({"columns": ["Quantity"], "group_by": ["Bucket"]}, cols=cols)
        assert '(enlist `pspRp0)!(enlist (parse "10 xbar Sales"))' in query
        # `f` is a float, so its row-path pad is a float null.
        assert "count[t]#0n" in query

    def test_expression_is_filterable_by_its_resolved_type(self):
        cols = self.cols({"Net": "Sales*0.9"}, {"Net": "f"})
        assert q_constraints({"filter": [["Net", ">", 5]]}, cols) == [
            '(>;(parse "Sales*0.9");5.0)'
        ]

    def test_expression_of_string_type_filters_as_a_string(self):
        cols = self.cols({"Upper": "upper City"}, {"Upper": "s"})
        assert q_constraints({"filter": [["Upper", "==", "BOSTON"]]}, cols) == [
            '(in;(parse "upper City");enlist `BOSTON)'
        ]

    def test_expression_default_aggregate_follows_its_type(self):
        cols = self.cols({"Net": "Sales*0.9"}, {"Net": "f"})
        query = make_view({"columns": ["Net"], "group_by": ["Region"]}, cols=cols)
        assert '(sum;(parse "Sales*0.9"))' in query

    def test_untyped_expression_defaults_to_string(self):
        # A missing type must not crash the builder; `string` is the safe
        # default, as it is for an unknown source column.
        cols = self.cols({"E": "x"}, {})
        assert q_constraints({"filter": [["E", "==", "a"]]}, cols) == [
            '(in;(parse "x");enlist `a)'
        ]

    def test_expression_types_probe(self):
        assert q_expression_types("trades", {"Net": "Sales*0.9"}) == (
            "{[m] m`t}[0!meta ?[(1 sublist get `trades);();0b;"
            '(enlist `Net)!(enlist (parse "Sales*0.9"))]]'
        )

    def test_expression_types_probe_is_ordered(self):
        query = q_expression_types("trades", {"A": "1+1", "B": "2+2"})
        assert '(`A;`B)!((parse "1+1");(parse "2+2"))' in query

    def test_names_excludes_expression_aliases(self):
        # `columns()` defaulting must not re-select an alias as a source
        # column — it is not one.
        cols = self.cols({"Net": "Sales*0.9"}, {"Net": "f"})
        assert "Net" not in cols.names()
        assert columns_of({"columns": []}, cols=cols) == [
            c for c in SCHEMA if c != "Net"
        ]


class TestKdbQueryWindows:
    """Windows are computed on the source before filtering and grouping, so a
    window alias is an ordinary column everywhere downstream — mirroring the
    SQL translation's `__PSP_WINDOW_SRC__` subquery."""

    def window(self, **spec):
        spec.setdefault("column", "Sales")
        return {"W": spec}

    def cols(self, type_char="f"):
        # The handler folds resolved window types into the source schema.
        return columns({**SCHEMA, "W": type_char})

    def body(self, **spec):
        spec.setdefault("column", "Sales")
        return q_window_body(spec)

    def test_running_and_moving_are_one_aggregate(self):
        # q spells the running and moving forms of an aggregate differently;
        # the frame chooses between them rather than the menu.
        assert self.body(aggregate="msum") == "sums v"
        assert self.body(aggregate="msum", rows=4) == "5 msum v"
        assert self.body(aggregate="mavg") == "avgs v"
        assert self.body(aggregate="mmin") == "mins v"
        assert self.body(aggregate="mmax") == "maxs v"

    def test_rows_frame_is_one_wider_than_perspectives(self):
        # Perspective frames `rows` *preceding* plus the current row; q counts
        # the current row as one of its `n`.
        assert self.body(aggregate="msum", rows=4) == "5 msum v"
        assert self.body(aggregate="mavg", rows=0) == "1 mavg v"

    def test_mcount(self):
        # `mcount` is q's moving count of non-nulls; the running case has no
        # primitive and accumulates the same predicate.
        assert self.body(aggregate="mcount", rows=2) == "3 mcount v"
        assert self.body(aggregate="mcount") == "sums `long$not null v"

    def test_mdev_is_the_primitive_not_an_alias(self):
        # The menu says `mdev`, so a q developer already knows it is a
        # *population* deviation — no rename, no re-derivation.
        assert self.body(aggregate="mdev", rows=4) == "5 mdev v"
        assert self.body(aggregate="mvar", rows=4) == "{[d] d*d} 5 mdev v"

    def test_cumulative_deviation_is_derived_to_match_mdev(self):
        # q has no running `mdev`, so the cumulative case is derived — as a
        # population statistic, to agree with the framed case above.
        assert self.body(aggregate="mvar") == (
            "{[s1;s2;n] (s2%n)-(s1%n) xexp 2}"
            "[sums v;sums (v*v);sums (`long$not null v)]"
        )
        assert self.body(aggregate="mdev").startswith("sqrt {[s1;s2;n]")

    def test_xprev_and_xnext(self):
        assert self.body(aggregate="xprev", offset=3) == "3 xprev v"
        # q has no `xnext` primitive; a negative shift is one.
        assert self.body(aggregate="xnext", offset=2) == "-2 xprev v"

    def test_deltas(self):
        # `deltas` is the 1-step difference; a wider offset spells out.
        assert self.body(aggregate="deltas") == "deltas v"
        assert self.body(aggregate="deltas", offset=3) == "v-3 xprev v"

    def test_offset_defaults_to_one(self):
        assert self.body(aggregate="xprev") == "1 xprev v"

    def test_ema_is_native(self):
        # The SQL translation rejects `ema` outright as recursive — q has it
        # as a primitive, under its own name.
        assert self.body(aggregate="ema", alpha=0.3) == "0.3 ema v"

    def test_ema_requires_alpha(self):
        with pytest.raises(ValueError, match="requires an `alpha`"):
            self.body(aggregate="ema")

    def test_range_frame_is_rejected(self):
        with pytest.raises(ValueError, match="`range` frames are not supported"):
            self.body(aggregate="msum", range=5.0)

    def test_first_is_supported(self):
        # The SQL translation rejects `first`; q does it as plain indexing.
        assert self.body(aggregate="first") == "first v"
        assert self.body(aggregate="first", rows=4) == "v 0|(til count v)-4"

    def test_foreign_vocabulary_is_rejected(self):
        # Perspective's and DuckDB's window names are not q's, and are not
        # silently translated into it.
        for name in ["sum", "stddev", "lag", "lead", "diff", "rate"]:
            with pytest.raises(ValueError, match="Unknown window aggregate"):
                self.body(aggregate=name)

    def test_window_is_a_lambda_applied_to_its_column(self):
        cols = self.cols()
        assert q_window(self.window(aggregate="msum")["W"], cols) == (
            "({[v] sums v};`Sales)"
        )

    def test_window_over_an_expression(self):
        cols = columns(expressions={"E": "Sales*2"}, expression_types={"E": "f"})
        assert q_window({"column": "E", "aggregate": "msum"}, cols) == (
            '({[v] sums v};(parse "Sales*2"))'
        )

    def test_source_is_a_value_not_a_symbol(self):
        # `![`trades;…]` would update the user's table *in place*.
        query = make_view(
            {"columns": ["W"], "windows": self.window(aggregate="msum")},
            cols=self.cols(),
        )
        assert "![(get `trades);" in query
        assert "![`trades;" not in query

    def test_unpartitioned_unordered_window(self):
        assert make_view(
            {"columns": ["W"], "windows": self.window(aggregate="msum")},
            cols=self.cols(),
        ) == (
            ".psp.v1 set {[pspSrc] (enlist `W) xcols "
            "?[pspSrc;();0b;(enlist `W)!(enlist `W)]}"
            "[![(get `trades);();0b;(enlist `W)!(enlist ({[v] sums v};`Sales))]];"
        )

    def test_partition_by_uses_update_by(self):
        # `update … by …` broadcasts within each partition and preserves row
        # order; `select … by …` would not.
        query = make_view(
            {
                "columns": ["W"],
                "windows": self.window(aggregate="msum", partition_by=["Region"]),
            },
            cols=self.cols(),
        )
        assert "![(get `trades);();(enlist `Region)!(enlist `Region);" in query

    def test_order_by_sorts_then_restores_row_order(self):
        # A window's `order_by` orders rows within the frame only — it must
        # not reorder the view.
        query = make_view(
            {
                "columns": ["W"],
                "windows": self.window(aggregate="msum", order_by=["Stamp", "desc"]),
            },
            cols=self.cols(),
        )
        assert "(enlist `pspIdx)!(enlist `i)" in query
        assert "(enlist `Stamp) xdesc" in query
        assert "(enlist `pspIdx) xasc" in query
        assert query.count("();0b;(enlist `pspIdx)]") == 1

    def test_no_index_stamp_without_an_order_by(self):
        query = make_view(
            {"columns": ["W"], "windows": self.window(aggregate="msum")},
            cols=self.cols(),
        )
        assert "pspIdx" not in query

    def test_windows_sharing_a_frame_compute_in_one_pass(self):
        query = make_view(
            {
                "columns": ["A", "B"],
                "windows": {
                    "A": {"column": "Sales", "aggregate": "msum"},
                    "B": {"column": "Quantity", "aggregate": "mmax"},
                },
            },
            cols=columns({**SCHEMA, "A": "f", "B": "j"}),
        )
        assert "(`A;`B)!(({[v] sums v};`Sales);({[v] maxs v};`Quantity))" in query

    def test_windows_are_emitted_in_alias_order(self):
        # The map is unordered; sorting by alias keeps the q deterministic.
        query = make_view(
            {
                "columns": ["A", "B"],
                "windows": {
                    "B": {"column": "Quantity", "aggregate": "mmax"},
                    "A": {"column": "Sales", "aggregate": "msum"},
                },
            },
            cols=columns({**SCHEMA, "A": "f", "B": "j"}),
        )
        assert "(`A;`B)!(({[v] sums v};`Sales);({[v] maxs v};`Quantity))" in query

    def test_differing_partitions_get_their_own_pass(self):
        query = make_view(
            {
                "columns": ["A", "B"],
                "windows": {
                    "A": {"column": "Sales", "aggregate": "msum"},
                    "B": {
                        "column": "Sales",
                        "aggregate": "msum",
                        "partition_by": ["Region"],
                    },
                },
            },
            cols=columns({**SCHEMA, "A": "f", "B": "f"}),
        )
        assert "();0b;(enlist `A)!" in query
        assert "();(enlist `Region)!(enlist `Region);(enlist `B)!" in query

    def test_windowed_source_is_bound_once_for_a_rollup(self):
        # A rollup references its source once per level; inlining the windowed
        # source would recompute the windows for each.
        query = make_view(
            {
                "columns": ["W"],
                "group_by": ["Region"],
                "aggregates": {"W": "sum"},
                "windows": self.window(aggregate="msum"),
            },
            cols=self.cols(),
        )
        assert query.count("{[v] sums v}") == 1
        assert query.count("?[pspSrc;") == 2  # one select per rollup level

    def test_window_is_groupable_and_pads_by_its_resolved_type(self):
        query = make_view(
            {
                "columns": ["Sales"],
                "group_by": ["W"],
                "windows": self.window(aggregate="msum"),
            },
            cols=self.cols(),
        )
        assert "(enlist `pspRp0)!(enlist `W)" in query
        assert "count[t]#0n" in query

    def test_window_is_filterable_by_its_resolved_type(self):
        assert q_constraints({"filter": [["W", ">", 100]]}, self.cols()) == [
            "(>;`W;100.0)"
        ]

    def test_window_types_probe(self):
        assert q_window_types(
            "trades", [("W", {"column": "Sales", "aggregate": "msum"})], columns()
        ) == (
            "{[m] m`t}[0!meta (enlist `W)#![(1 sublist get `trades);();0b;"
            "(enlist `W)!(enlist ({[v] sums v};`Sales))]]"
        )

    def test_specs_are_sorted_by_alias(self):
        specs = window_specs({"windows": {"b": {"column": "x"}, "a": {"column": "y"}}})
        assert [alias for alias, _ in specs] == ["a", "b"]

    def test_no_windows_leaves_the_source_alone(self):
        assert q_windows("`trades", [], columns()) == "`trades"


class TestKdbQueryViews:
    def test_hosted_tables(self):
        assert q_hosted_tables() == "tables[]"

    def test_table_schema(self):
        assert q_table_schema("trades") == "{[m] (m`c;m`t)}[0!meta `trades]"
        assert q_table_schema("my table") == '{[m] (m`c;m`t)}[0!meta `$"my table"]'

    def test_table_size(self):
        assert q_table_size("trades") == "count get `trades"

    def test_view_slice(self):
        assert q_view_slice(".psp.v1", ["pspGid", "Product Name"], 10, 100) == (
            '(`pspGid;`$"Product Name")#(10;100) sublist .psp.v1'
        )

    def test_view_delete_is_protected(self):
        # A view the UI has already lost is not an error.
        assert q_view_delete("v1_abc") == ("@[{![`.psp;();0b;enlist x]};`v1_abc;()]")

    def test_min_max_numeric(self):
        assert q_view_min_max(".psp.v1", "Sales", "f") == (
            "{[c] {[v] `float$v} each (min c;max c)}[flip[.psp.v1][`Sales]]"
        )

    def test_min_max_projects_temporals_to_epoch_millis(self):
        # `Scalar` has no temporal variant, so a `datetime` would otherwise
        # degrade to null crossing into Rust.
        assert '(`float$"j"$v)*86400000' in q_view_min_max(".psp.v1", "d", "d")
        assert '(`float$"j"$v)%1e6' in q_view_min_max(".psp.v1", "p", "p")

    def test_min_max_is_undefined_for_strings(self):
        assert q_view_min_max(".psp.v1", "City", "s") is None


################################################################################
#
# Integration — requires a running q process.

KDB_HOST = os.environ.get("PSP_KDB_HOST", "localhost")
KDB_PORT = int(os.environ.get("PSP_KDB_PORT", "5001"))

_SUPERSTORE_LOCAL = os.path.join(
    os.path.dirname(__file__),
    "..",
    "..",
    "..",
    "node_modules",
    "superstore-arrow",
    "superstore.parquet",
)

_SUPERSTORE_URL = (
    "https://cdn.jsdelivr.net/npm/superstore-arrow@3.2.0/superstore.parquet"
)


def _get_superstore_parquet():
    if os.path.exists(_SUPERSTORE_LOCAL):
        return _SUPERSTORE_LOCAL
    path = os.path.join(tempfile.gettempdir(), "superstore.parquet")
    if not os.path.exists(path):
        urllib.request.urlretrieve(_SUPERSTORE_URL, path)
    return path


def _have_pykx():
    try:
        import pykx  # noqa: F401
    except ImportError:
        return False
    return True


def _q_is_reachable():
    try:
        with socket.create_connection((KDB_HOST, KDB_PORT), timeout=1):
            return True
    except OSError:
        return False


# Gated per-class rather than per-module: the golden tests above are the ones
# that cover the q translation in CI, and they must run everywhere.
requires_q = pytest.mark.skipif(
    not _have_pykx() or not _q_is_reachable(),
    reason=f"needs PyKX and a q process at {KDB_HOST}:{KDB_PORT} (`q -p {KDB_PORT}`)",
)


@pytest.fixture(scope="module")
def client():
    import pyarrow.parquet as pq
    import pykx

    from perspective import Client
    from perspective.virtual_servers.kdb import KdbVirtualServer

    db = pykx.SyncQConnection(host=KDB_HOST, port=KDB_PORT)
    arrow_table = pq.read_table(_get_superstore_parquet())
    db(
        "{[name;cols] (`$name) set flip (`$key cols)!value cols}",
        "superstore",
        {name: arrow_table[name].to_pylist() for name in arrow_table.column_names},
    )

    server = KdbVirtualServer(db)

    def handle_request(msg):
        session.handle_request(msg)

    def handle_response(msg):
        c.handle_response(msg)

    session = server.new_session(handle_response)
    c = Client(handle_request)
    return c


@requires_q
class TestKdbClient:
    def test_get_hosted_table_names(self, client):
        assert "superstore" in client.get_hosted_table_names()


@requires_q
class TestKdbTable:
    def test_schema(self, client):
        schema = client.open_table("superstore").schema()
        assert schema["Sales"] == "float"
        assert schema["City"] == "string"
        assert schema["Order Date"] == "date"
        # `j` is 64-bit, so it maps to `float` rather than `integer`.
        assert schema["Row ID"] in ("integer", "float")

    def test_size(self, client):
        assert client.open_table("superstore").size() == 9994


@requires_q
class TestKdbView:
    def test_flat_columns(self, client):
        table = client.open_table("superstore")
        view = table.view(columns=["Sales"])
        assert view.to_columns(start_row=0, end_row=3)["Sales"] == pytest.approx(
            [261.96, 731.94, 14.62]
        )

    def test_single_group_by(self, client):
        table = client.open_table("superstore")
        view = table.view(
            columns=["Sales"], group_by=["Region"], aggregates={"Sales": "sum"}
        )
        assert view.to_records() == [
            {"__ROW_PATH__": [], "Sales": pytest.approx(2297200.860299955)},
            {"__ROW_PATH__": ["Central"], "Sales": pytest.approx(501239.8908000005)},
            {"__ROW_PATH__": ["East"], "Sales": pytest.approx(678781.2399999979)},
            {"__ROW_PATH__": ["South"], "Sales": pytest.approx(391721.9050000003)},
            {"__ROW_PATH__": ["West"], "Sales": pytest.approx(725457.8245000006)},
        ]

    def test_multi_level_group_by_is_depth_first(self, client):
        table = client.open_table("superstore")
        view = table.view(
            columns=["Sales"],
            group_by=["Region", "Category"],
            aggregates={"Sales": "sum"},
        )
        paths = [row["__ROW_PATH__"] for row in view.to_records()]
        assert paths[:5] == [
            [],
            ["Central"],
            ["Central", "Furniture"],
            ["Central", "Office Supplies"],
            ["Central", "Technology"],
        ]

    def test_group_by_sorted_keeps_subtrees_contiguous(self, client):
        table = client.open_table("superstore")
        view = table.view(
            columns=["Sales"],
            group_by=["Region", "Category"],
            aggregates={"Sales": "sum"},
            sort=[["Sales", "desc"]],
        )
        records = view.to_records()
        assert records[0]["__ROW_PATH__"] == []
        # Regions descend by total, and each region's categories follow it.
        regions = [
            r["__ROW_PATH__"][0] for r in records[1:] if len(r["__ROW_PATH__"]) == 1
        ]
        assert regions == ["West", "East", "Central", "South"]
        for index, row in enumerate(records):
            if len(row["__ROW_PATH__"]) == 1:
                children = records[index + 1 : index + 4]
                assert all(len(c["__ROW_PATH__"]) == 2 for c in children)

    def test_filter(self, client):
        table = client.open_table("superstore")
        view = table.view(
            columns=["Sales"],
            group_by=["Region"],
            aggregates={"Sales": "sum"},
            filter=[["Region", "==", "West"]],
        )
        assert [r["__ROW_PATH__"] for r in view.to_records()] == [[], ["West"]]

    def test_expression_passthrough(self, client):
        table = client.open_table("superstore")
        view = table.view(
            columns=["Net"],
            expressions={"Net": "Sales*0.9"},
        )
        assert view.to_columns(start_row=0, end_row=2)["Net"] == pytest.approx(
            [261.96 * 0.9, 731.94 * 0.9]
        )

    def test_expression_group_by(self, client):
        table = client.open_table("superstore")
        view = table.view(
            columns=["Net"],
            group_by=["Region"],
            expressions={"Net": "Sales*0.9"},
            aggregates={"Net": "sum"},
        )
        records = view.to_records()
        assert records[0]["__ROW_PATH__"] == []
        assert records[0]["Net"] == pytest.approx(2297200.860299955 * 0.9)

    def test_validate_expression_types(self, client):
        table = client.open_table("superstore")
        assert table.validate_expressions({"a": "Sales*2"})["expression_schema"] == {
            "a": "float"
        }

    def test_validate_expression_reports_errors(self, client):
        table = client.open_table("superstore")
        result = table.validate_expressions({"a": "this is not q ("})
        assert "a" in result["errors"]

    def test_weighted_average_aggregate(self, client):
        # A q aggregate with no DuckDB counterpart in the menu.
        table = client.open_table("superstore")
        view = table.view(
            columns=["Sales"],
            group_by=["Region"],
            aggregates={"Sales": ["wavg", ["Quantity"]]},
        )
        records = view.to_records()
        assert records[0]["__ROW_PATH__"] == []
        # A weighted mean lies within the range of the values it weights.
        assert 0 < records[0]["Sales"] < 10000

    def test_population_and_sample_deviation_differ(self, client):
        table = client.open_table("superstore")

        def deviation(name):
            view = table.view(
                columns=["Sales"],
                group_by=["Region"],
                aggregates={"Sales": name},
            )
            return view.to_records()[0]["Sales"]

        population, sample = deviation("dev"), deviation("sdev")
        assert population != sample
        assert population < sample

    def test_in_filter(self, client):
        table = client.open_table("superstore")
        view = table.view(
            columns=["Sales"],
            group_by=["Region"],
            aggregates={"Sales": "sum"},
            filter=[["Region", "in", ["West", "East"]]],
        )
        assert [r["__ROW_PATH__"] for r in view.to_records()] == [
            [],
            ["East"],
            ["West"],
        ]

    def test_like_uses_q_wildcards(self, client):
        table = client.open_table("superstore")
        view = table.view(
            columns=["Sales"],
            group_by=["Region"],
            aggregates={"Sales": "sum"},
            filter=[["Region", "like", "*est"]],
        )
        assert [r["__ROW_PATH__"] for r in view.to_records()] == [[], ["West"]]

    def test_window_cumulative_sum(self, client):
        table = client.open_table("superstore")
        view = table.view(
            columns=["Sales", "Cum"],
            windows={"Cum": {"column": "Sales", "aggregate": "msum"}},
        )
        data = view.to_columns(start_row=0, end_row=3)
        assert data["Cum"] == pytest.approx(
            [261.96, 261.96 + 731.94, 261.96 + 731.94 + 14.62]
        )

    def test_window_rows_frame_includes_the_current_row(self, client):
        # Perspective frames `rows` preceding *plus* the current row, so a
        # `rows: 1` moving sum pairs each row with its predecessor.
        table = client.open_table("superstore")
        view = table.view(
            columns=["Moving"],
            windows={
                "Moving": {"column": "Sales", "aggregate": "msum", "rows": 1},
            },
        )
        data = view.to_columns(start_row=0, end_row=3)
        assert data["Moving"] == pytest.approx(
            [261.96, 261.96 + 731.94, 731.94 + 14.62]
        )

    def test_window_lag(self, client):
        table = client.open_table("superstore")
        view = table.view(
            columns=["Prev"],
            windows={"Prev": {"column": "Sales", "aggregate": "xprev"}},
        )
        data = view.to_columns(start_row=0, end_row=3)
        assert data["Prev"][0] is None
        assert data["Prev"][1:] == pytest.approx([261.96, 731.94])

    def test_window_ema_has_no_sql_counterpart(self, client):
        # `ema` is a q primitive; the SQL translation rejects it as recursive.
        table = client.open_table("superstore")
        view = table.view(
            columns=["Ema"],
            windows={
                "Ema": {"column": "Sales", "aggregate": "ema", "alpha": 0.5},
            },
        )
        data = view.to_columns(start_row=0, end_row=3)
        first = 261.96
        second = 0.5 * 731.94 + 0.5 * first
        third = 0.5 * 14.62 + 0.5 * second
        assert data["Ema"] == pytest.approx([first, second, third])

    def test_window_order_by_does_not_reorder_the_view(self, client):
        # A window's `order_by` orders rows within the frame only.
        table = client.open_table("superstore")
        plain = table.view(columns=["Row ID"]).to_columns(start_row=0, end_row=5)
        windowed = table.view(
            columns=["Row ID"],
            windows={
                "W": {
                    "column": "Sales",
                    "aggregate": "msum",
                    "order_by": ["Sales", "desc"],
                }
            },
        ).to_columns(start_row=0, end_row=5)
        assert windowed["Row ID"] == plain["Row ID"]

    def test_window_partition_by(self, client):
        table = client.open_table("superstore")
        view = table.view(
            columns=["Region", "Cum"],
            windows={
                "Cum": {
                    "column": "Sales",
                    "aggregate": "msum",
                    "partition_by": ["Region"],
                }
            },
        )
        data = view.to_columns()
        # Each region's running sum ends at that region's total.
        totals = {}
        for region, value in zip(data["Region"], data["Cum"]):
            totals[region] = value
        assert totals["West"] == pytest.approx(725457.8245000006)

    def test_window_is_groupable(self, client):
        table = client.open_table("superstore")
        view = table.view(
            columns=["Cum"],
            group_by=["Region"],
            aggregates={"Cum": "max"},
            windows={"Cum": {"column": "Sales", "aggregate": "msum"}},
        )
        assert view.to_records()[0]["__ROW_PATH__"] == []

    def test_nulls_are_not_sentinels(self, client):
        # q nulls are in-band; without scrubbing an empty long renders as
        # -9223372036854775808.
        table = client.open_table("superstore")
        view = table.view(columns=["Sales"], group_by=["Region"])
        for value in view.to_columns()["Sales"]:
            assert value is None or abs(value) < 1e17
