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

import re
from random import random, randint, choices
from string import ascii_letters
from pytest import raises
from datetime import date, datetime
from time import mktime
from perspective import Table, PerspectiveCppError
import pytest
from .test_view import compare_delta


def randstr(length, input=ascii_letters):
    return "".join(choices(input, k=length))


class TestViewExpression(object):
    def test_expression_conversion(self):
        table = Table({"a": [1, 2, 3, 4], "b": [5, 6, 7, 8]})
        test_expressions_str = [
            '// x\n"a"',
            '// y\n"b" * 0.5',
            "// c\n'abcdefg'",
            "// d\ntrue and false",
            '// e\nfloat("a") > 2 ? null : 1',
            "// f\ntoday()",
            "// g\nnow()",
            "// h\nlength(123)",
        ]

        test_expressions_dict = {
            "x": '"a"',
            "y": '"b" * 0.5',
            "c": "'abcdefg'",
            "d": "true and false",
            "e": 'float("a") > 2 ? null : 1',
            "f": "today()",
            "g": "now()",
            "h": "length(123)",
        }

        str_validated = table.validate_expressions(test_expressions_str)
        dict_validated = table.validate_expressions(test_expressions_dict)
        assert str_validated["errors"] == dict_validated["errors"]
        assert str_validated["expression_schema"] == dict_validated["expression_schema"]
        assert (
            str_validated["expression_alias"].keys()
            == dict_validated["expression_alias"].keys()
        )
        for dict_key, dict_val in dict_validated["expression_alias"].items():
            str_alias = str_validated["expression_alias"]
            matched_val = "// {}\n{}".format(dict_key, dict_val)
            assert str_alias[dict_key] == matched_val

    def test_table_validate_expressions_empty(self):
        table = Table({"a": [1, 2, 3, 4], "b": [5, 6, 7, 8]})
        validate = table.validate_expressions([])
        assert validate["expression_schema"] == {}
        assert validate["expression_alias"] == {}
        assert validate["errors"] == {}

    def test_view_expression_schema_empty(self):
        table = Table({"a": [1, 2, 3, 4], "b": [5, 6, 7, 8]})
        view = table.view()
        assert view.to_columns() == {"a": [1, 2, 3, 4], "b": [5, 6, 7, 8]}
        assert view.expression_schema() == {}

    def test_view_validate_expressions_alias_map_errors(self):
        table = Table({"a": [1, 2, 3, 4], "b": [5, 6, 7, 8]})
        expressions = {
            "x": '"a"',
            "y": '"b" * 0.5',
            "c": "'abcdefg'",
            "d": "true and false",
            "e": 'float("a") > 2 ? null : 1',
            "f": "today()",
            "g": "now()",
            "h": "length(123)",
        }

        validated = table.validate_expressions(expressions)
        aliases = ["x", "y", "c", "d", "e", "f", "g", "h"]

        # Errored should also be in aliases
        for alias in aliases:
            assert validated["expression_alias"][alias] == expressions[alias]

    def test_view_validate_expressions_alias_map(self):
        table = Table({"a": [1, 2, 3, 4], "b": [5, 6, 7, 8]})
        expressions = {
            "x": '"a"',
            "y": '"b" * 0.5',
            "c": "'abcdefg'",
            "d": "true and false",
            "e": 'float("a") > 2 ? null : 1',
            "f": "today()",
            "g": "now()",
            "h": "length('abcd')",
        }

        validated = table.validate_expressions(expressions)
        aliases = ["x", "y", "c", "d", "e", "f", "g", "h"]
        for alias in aliases:
            assert validated["expression_alias"][alias] == expressions[alias]

    def test_view_expression_schema_all_types(self):
        table = Table({"a": [1, 2, 3, 4], "b": [5, 6, 7, 8]})
        expressions = [
            '"a"',
            '"b" * 0.5',
            "'abcdefg'",
            "true and false",
            'float("a") > 2 ? null : 1',
            "today()",
            "now()",
            "length('abcd')",
        ]

        view = table.view(expressions=expressions)
        assert view.expression_schema() == {
            '"a"': int,
            '"b" * 0.5': float,
            "'abcdefg'": str,
            "true and false": bool,
            'float("a") > 2 ? null : 1': float,
            "today()": date,
            "now()": datetime,
            "length('abcd')": float,
        }

        result = view.to_columns()
        today = datetime(date.today().year, date.today().month, date.today().day)
        del result["now()"]  # no need to match datetime.now()

        assert result == {
            "a": [1, 2, 3, 4],
            "b": [5, 6, 7, 8],
            '"a"': [1, 2, 3, 4],
            '"b" * 0.5': [2.5, 3, 3.5, 4],
            "'abcdefg'": ["abcdefg" for _ in range(4)],
            "true and false": [False for _ in range(4)],
            'float("a") > 2 ? null : 1': [1, 1, None, None],
            "today()": [today for _ in range(4)],
            "length('abcd')": [4 for _ in range(4)],
        }

        validated = table.validate_expressions(expressions)

        for expr in expressions:
            assert validated["expression_alias"][expr] == expr

    def test_table_validate_expressions_with_errors(self):
        table = Table({"a": [1, 2, 3, 4], "b": [5, 6, 7, 8]})
        expressions = ['"Sales" + "Profit"', "datetime()", "string()", "for () {}"]
        validate = table.validate_expressions(expressions)
        assert validate["expression_schema"] == {}
        assert validate["expression_alias"] == {expr: expr for expr in expressions}
        assert validate["errors"] == {
            '"Sales" + "Profit"': {
                "column": 0,
                "error_message": 'Value Error - Input column "Sales" does not exist.',
                "line": 0,
            },
            "datetime()": {
                "column": 10,
                "error_message": "Zero parameter call to generic function: datetime not allowed",
                "line": 0,
            },
            "for () {}": {
                "column": 5,
                "error_message": "Premature end of expression[2]",
                "line": 0,
            },
            "string()": {
                "column": 8,
                "error_message": "Zero parameter call to generic function: string not allowed",
                "line": 0,
            },
        }

    def test_view_expression_create(self):
        table = Table({"a": [1, 2, 3, 4], "b": [5, 6, 7, 8]})
        view = table.view(expressions={"computed": ' "a" + "b"'})
        assert view.to_columns() == {
            "a": [1, 2, 3, 4],
            "b": [5, 6, 7, 8],
            "computed": [6, 8, 10, 12],
        }
        assert view.expression_schema() == {"computed": float}

    def test_view_expression_string_per_page(self):
        table = Table({"a": [i for i in range(100)]})
        big_strings = [randstr(6400) for _ in range(4)]
        view = table.view(
            expressions={
                "computed{}".format(i): "var x := '{}'; lower(x)".format(big_strings[i])
                for i in range(4)
            }
        )

        result = view.to_columns()
        schema = view.expression_schema()

        for i in range(4):
            name = "computed{}".format(i)
            res = big_strings[i].lower()
            assert schema[name] == str
            assert result[name] == [res for _ in range(100)]

    def test_view_expression_string_page_stress(self):
        table = Table({"a": [i for i in range(100)]})
        big_strings = [
            "".join(["a" for _ in range(640)]),
            "".join(["b" for _ in range(640)]),
            "".join(["c" for _ in range(640)]),
            "".join(["d" for _ in range(640)]),
        ]

        view = table.view(
            expressions={
                "computed": "var a := '{}'; var b := '{}'; var c := '{}'; var d := '{}'; concat(a, b, c, d)".format(
                    *big_strings
                )
            }
        )

        result = view.to_columns()
        schema = view.expression_schema()
        assert schema == {"computed": str}
        assert result["computed"] == ["".join(big_strings) for _ in range(100)]

    def test_view_expression_new_vocab_page(self):
        table = Table({"a": [randstr(100) for _ in range(100)]})

        def make_expression(idx):
            expr = ["//computed{}".format(idx)]
            num_vars = randint(1, 26)
            concat_cols = []
            concat_result = []

            for i in range(num_vars):
                name = ascii_letters[i]
                string_literal = randstr(randint(100, 1000))

                if random() > 0.5:
                    result = string_literal.upper()
                    string_literal = "upper('{}')".format(string_literal)
                else:
                    result = string_literal.lower()
                    string_literal = "lower('{}')".format(string_literal)

                concat_cols.append(name)
                concat_result.append(result)

                expr.append("var {} := {};".format(name, string_literal))

            expr.append('concat("a", {})'.format(", ".join(concat_cols)))

            return {
                "expression_name": expr[0][2:],
                "expression": "\n".join(expr),
                "output": "".join(concat_result),
            }

        expressions = [make_expression(i) for i in range(10)]

        view = table.view(expressions=[expr["expression"] for expr in expressions])

        result = view.to_columns()
        schema = view.expression_schema()

        for expr in expressions:
            name = expr["expression_name"]
            assert schema[name] == str

            for i in range(100):
                val = result["a"][i]
                assert result[name][i] == val + expr["output"]

    def test_view_expression_collide_local_var(self):
        """Make sure that strings declared under the same var name in
        different expressions do not collide."""
        table = Table({"a": [1, 2, 3, 4]})
        strings = [randstr(50) for _ in range(8)]

        view = table.view(
            expressions={
                "computed": " var w := '{}'; var x := '{}'; var y := '{}'; var z := '{}'; concat(w, x, y, z)".format(
                    *strings[:4]
                ),
                "computed2": " var w := '{}'; var x := '{}'; var y := '{}'; var z := '{}'; concat(w, x, y, z)".format(
                    *strings[4:]
                ),
            }
        )

        result = view.to_columns()
        schema = view.expression_schema()
        assert schema == {"computed": str, "computed2": str}
        assert result["computed"] == ["".join(strings[:4]) for _ in range(4)]
        assert result["computed2"] == ["".join(strings[4:]) for _ in range(4)]

    def test_view_random_expressions(self):
        def make_expression():
            """Create a random expression with a few local string vars that
            are too long to be stored in-place."""
            expression_name = randstr(10)
            expression = ""
            num_vars = randint(1, 26)
            output_var_name = ""
            output_str = ""
            for i in range(num_vars):
                name = ascii_letters[i]
                string_literal = randstr(randint(15, 100))
                expression += "var {} := '{}';\n".format(name, string_literal)
                if i == num_vars - 1:
                    output_var_name = name
                    output_str = string_literal

            expression += output_var_name
            return {
                "expression_name": expression_name,
                "expression": expression,
                "output": output_str,
            }

        table = Table({"a": [1, 2, 3, 4]})

        for _ in range(5):
            exprs = [make_expression() for _ in range(5)]
            output_map = {expr["expression_name"]: expr["output"] for expr in exprs}
            view = table.view(
                expressions={
                    expr["expression_name"]: expr["expression"] for expr in exprs
                }
            )
            expression_schema = view.expression_schema()
            result = view.to_columns()
            for expr in output_map.keys():
                assert expression_schema[expr] == str
                assert result[expr] == [output_map[expr] for _ in range(4)]

    def test_view_expression_string_literal_compare(self):
        table = Table({"a": [1, 2, 3, 4], "b": [5, 6, 7, 8]})
        validated = table.validate_expressions({"computed": " 'a' == 'a'"})

        assert validated["expression_schema"] == {"computed": "boolean"}

        view = table.view(expressions={"computed": " 'a' == 'a'"})

        assert view.to_columns() == {
            "a": [1, 2, 3, 4],
            "b": [5, 6, 7, 8],
            "computed": [True, True, True, True],
        }

        assert view.expression_schema() == {"computed": bool}

    def test_view_expression_string_literal_compare_null(self):
        table = Table({"a": [1, 2, 3, 4], "b": [5, 6, 7, 8]})
        validated = table.validate_expressions({"computed": " 'a' == null"})

        assert validated["expression_schema"] == {"computed": "float"}

        view = table.view(expressions={"computed": " 'a' == null"})

        assert view.to_columns() == {
            "a": [1, 2, 3, 4],
            "b": [5, 6, 7, 8],
            "computed": [0, 0, 0, 0],
        }

        assert view.expression_schema() == {"computed": float}

    def test_view_expression_string_literal_compare_column(self):
        table = Table({"a": ["a", "a", "b", "c"]})
        validated = table.validate_expressions({"computed": " \"a\" == 'a'"})
        assert validated["expression_schema"] == {"computed": "boolean"}
        view = table.view(expressions={"computed": " \"a\" == 'a'"})
        assert view.to_columns() == {
            "a": ["a", "a", "b", "c"],
            "computed": [True, True, False, False],
        }

        assert view.expression_schema() == {"computed": bool}

    def test_view_expression_string_literal_compare_column_null(self):
        table = Table({"a": ["a", None, "b", "c", None]})
        validated = table.validate_expressions({"computed": " \"a\" == 'a'"})
        assert validated["expression_schema"] == {"computed": "boolean"}
        view = table.view(expressions={"computed": " \"a\" == 'a'"})
        assert view.to_columns() == {
            "a": ["a", None, "b", "c", None],
            "computed": [True, False, False, False, False],
        }

        assert view.expression_schema() == {"computed": bool}

    def test_view_expression_string_literal_compare_column_null_long(self):
        table = Table(
            {
                "a": [
                    "abcdefghijklmnopqrstuvwxyz",
                    None,
                    "abcdefghijklmnopqrstuvwxyz",
                    "aabcdefghijklmnopqrstuvwxyz",
                    None,
                ]
            }
        )
        validated = table.validate_expressions(
            {"computed": " \"a\" == 'abcdefghijklmnopqrstuvwxyz'"}
        )
        assert validated["expression_schema"] == {"computed": "boolean"}
        view = table.view(
            expressions={"computed": "\"a\" == 'abcdefghijklmnopqrstuvwxyz'"}
        )
        result = view.to_columns()
        assert result["computed"] == [True, False, True, False, False]
        assert view.expression_schema() == {"computed": bool}

    def test_view_expression_string_literal_compare_column_null_long_var(self):
        table = Table(
            {
                "a": [
                    "abcdefghijklmnopqrstuvwxyz",
                    None,
                    "abcdefghijklmnopqrstuvwxyz",
                    "aabcdefghijklmnopqrstuvwxyz",
                    None,
                ]
            }
        )
        validated = table.validate_expressions(
            {"computed": " var xyz := 'abcdefghijklmnopqrstuvwxyz'; \"a\" == xyz"}
        )
        assert validated["expression_schema"] == {"computed": "boolean"}
        view = table.view(
            expressions={
                "computed": "var xyz := 'abcdefghijklmnopqrstuvwxyz'; \"a\" == xyz"
            }
        )
        result = view.to_columns()
        assert result["computed"] == [True, False, True, False, False]
        assert view.expression_schema() == {"computed": bool}

    def test_view_expression_string_literal_compare_if(self):
        table = Table({"a": ["a", "a", "b", "c"]})
        validated = table.validate_expressions({"computed": " if(\"a\" == 'a', 1, 2)"})
        assert validated["expression_schema"] == {"computed": "float"}
        view = table.view(expressions={"computed": "if(\"a\" == 'a', 1, 2)"})
        assert view.to_columns() == {
            "a": ["a", "a", "b", "c"],
            "computed": [1, 1, 2, 2],
        }

        assert view.expression_schema() == {"computed": float}

    @pytest.mark.skip
    def test_view_expression_string_literal_var(self):
        table = Table({"a": [1, 2, 3]})

        for _ in range(10):
            view = table.view(
                expressions=[
                    "var x := 'Eabcdefghijklmn'; var y := '0123456789'; concat(x, y)"
                ]
            )
            assert view.to_columns() == {
                "a": [1, 2, 3],
                "var x := 'Eabcdefghijklmn'; var y := '0123456789'; concat(x, y)": [
                    "Eabcdefghijklmn0123456789",
                    "Eabcdefghijklmn0123456789",
                    "Eabcdefghijklmn0123456789",
                ],
            }

    def test_view_streaming_expression(self):
        def data():
            return [{"a": random()} for _ in range(50)]

        table = Table(data())
        view = table.view(expressions=["123"])

        for _ in range(5):
            table.update(data())

        assert table.size() == 300
        result = view.to_dict()
        assert result["123"] == [123 for _ in range(300)]

    def test_view_streaming_expression_limit(self):
        def data():
            return [{"a": random()} for _ in range(55)]

        table = Table(data(), limit=50)
        view = table.view(expressions=["123"])

        for _ in range(5):
            table.update(data())

        assert table.size() == 50
        result = view.to_dict()
        assert result["123"] == [123 for _ in range(50)]

    def test_view_streaming_expression_one(self):
        def data():
            return [{"a": random()} for _ in range(50)]

        table = Table(data())
        view = table.view(group_by=["c0"], expressions={"c0": '"a" * 2'})
        for _ in range(5):
            table.update(data())

        assert table.size() == 300
        assert view.expression_schema() == {"c0": float}

    def test_view_streaming_expression_two(self):
        def data():
            return [{"a": random()} for _ in range(50)]

        table = Table(data())
        view = table.view(
            group_by=["c0"],
            split_by=["c1"],
            expressions={"c0": '"a" * 2', "c1": "'new string'"},
        )
        for i in range(5):
            table.update(data())

        assert table.size() == 300
        assert view.expression_schema() == {"c0": float, "c1": int}  # pivoted

    def test_view_expression_create_no_alias(self):
        table = Table({"a": [1, 2, 3, 4], "b": [5, 6, 7, 8]})
        view = table.view(expressions=['"a" + "b"'])
        assert view.to_columns() == {
            "a": [1, 2, 3, 4],
            "b": [5, 6, 7, 8],
            '"a" + "b"': [6, 8, 10, 12],
        }

        assert view.expression_schema() == {'"a" + "b"': float}

    def test_view_expression_should_not_overwrite_real(self):
        table = Table({"a": [1, 2, 3, 4], "b": [5, 6, 7, 8]})
        with raises(PerspectiveCppError) as ex:
            table.view(expressions={"a": 'upper("a")'})

        assert (
            str(ex.value)
            == "View creation failed: cannot create expression column 'a' that overwrites a column that already exists.\n"
        )

    def test_legacy_view_duplicate_expression_should_resolve_to_last_alias(self):
        table = Table({"a": [1, 2, 3, 4], "b": [5, 6, 7, 8]})
        view = table.view(
            columns=["abc"],
            expressions=['//abc\n"a" + "b"', '//abc\n"a" - "b"'],
        )

        assert view.to_columns() == {"abc": [-4, -4, -4, -4]}

    def test_view_expression_multiple_alias(
        self,
    ):
        table = Table({"a": [1, 2, 3, 4], "b": [5, 6, 7, 8]})
        view = table.view(
            expressions={
                "computed": '"a" + "b"',
                "computed2": '"a" + "b"',
                "computed3": '"a" + "b"',
                "computed4": '"a" + "b"',
            }
        )

        assert view.schema() == {
            "a": int,
            "b": int,
            "computed": float,
            "computed2": float,
            "computed3": float,
            "computed4": float,
        }

        assert view.expression_schema() == {
            "computed": float,
            "computed2": float,
            "computed3": float,
            "computed4": float,
        }

    def test_view_expression_multiple_views_with_the_same_alias_should_not_overwrite(
        self,
    ):
        table = Table({"a": [1, 2, 3, 4], "b": [5, 6, 7, 8]})
        view = table.view(expressions={"computed": ' "a" + "b"'})
        view2 = table.view(expressions={"computed": ' "a" * "b"'})
        assert view.expression_schema() == {"computed": float}
        assert view2.expression_schema() == {
            "computed": float,
        }

        assert view.to_dict()["computed"] == [6, 8, 10, 12]
        assert view2.to_dict()["computed"] == [5, 12, 21, 32]

    def test_view_expression_multiple_views_with_the_same_alias_pivoted(
        self,
    ):
        table = Table({"a": [1, 2, 3, 4], "b": [5, 6, 7, 8]})
        view = table.view(
            group_by=["computed"],
            aggregates={"computed": ["weighted mean", "b"]},
            expressions={"computed": ' "a" + "b"'},
        )
        view2 = table.view(
            group_by=["computed"],
            aggregates={"computed": "last"},
            expressions={"computed": "concat('abc', ' ', 'def')"},
        )
        assert view.expression_schema() == {"computed": float}
        assert view2.expression_schema() == {
            "computed": str,
        }

        result = view.to_dict()
        result2 = view2.to_dict()

        assert result["__ROW_PATH__"] == [[], [6], [8], [10], [12]]
        assert result2["__ROW_PATH__"] == [[], ["abc def"]]

        assert result["computed"] == [9.384615384615385, 6, 8, 10, 12]
        assert result2["computed"] == ["abc def", "abc def"]

    def test_view_expression_multiple_views_with_the_same_alias_all_types(
        self,
    ):
        now = datetime.now()
        today = date.today()

        month_bucketed = datetime(today.year, today.month, 1)
        minute_bucketed = datetime(
            now.year, now.month, now.day, now.hour, now.minute, 0, 0
        )

        table = Table(
            {
                "a": [1, 2, 3, 4],
                "b": [5.5, 6.5, 7.5, 8.5],
                "c": [datetime.now() for _ in range(4)],
                "d": [date.today() for _ in range(4)],
                "e": [True, False, True, False],
                "f": ["a", "b", "c", "d"],
            }
        )

        view = table.view(
            expressions={
                "computed": '"a" + "b"',
                "computed2": "bucket(\"c\", 'M')",
                "computed3": "concat('a', 'b', 'c')",
                "computed4": "'new string'",
            }
        )

        view2 = table.view(
            expressions={
                "computed": 'upper("f")',
                "computed2": '20 + ("b" * "a")',
                "computed4": "bucket(\"c\", 'm')",
            }
        )

        assert view.expression_schema() == {
            "computed": float,
            "computed2": date,
            "computed3": str,
            "computed4": str,
        }

        assert view2.expression_schema() == {
            "computed": str,
            "computed2": float,
            "computed4": datetime,
        }

        result = view.to_dict()
        result2 = view2.to_dict()

        assert result["computed"] == [6.5, 8.5, 10.5, 12.5]
        assert result2["computed"] == ["A", "B", "C", "D"]

        assert result["computed2"] == [month_bucketed for _ in range(4)]
        assert result2["computed2"] == [25.5, 33, 42.5, 54]

        assert result["computed3"] == ["abc", "abc", "abc", "abc"]
        assert "computed3" not in result2

        assert result["computed4"] == ["new string" for _ in range(4)]
        assert result2["computed4"] == [minute_bucketed for _ in range(4)]

    def test_view_expression_create_no_columns(self):
        table = Table({"a": [1, 2, 3, 4], "b": [5, 6, 7, 8]})
        view = table.view(columns=[], expressions={"computed": ' "a" + "b"'})
        assert view.to_columns() == {}
        assert view.schema() == {}

        # computed column should still exist
        assert view.expression_schema() == {"computed": float}

    def test_view_expression_create_columns(self):
        table = Table({"a": [1, 2, 3, 4], "b": [5, 6, 7, 8]})
        view = table.view(columns=["computed"], expressions={"computed": ' "a" + "b"'})
        assert view.to_columns() == {"computed": [6, 8, 10, 12]}
        assert view.schema() == {"computed": float}
        # computed column should still exist
        assert view.expression_schema() == {"computed": float}

    def test_view_expression_create_clear(self):
        table = Table({"a": [1, 2, 3, 4], "b": [5, 6, 7, 8]})
        view = table.view(expressions={"computed": ' "a" + "b"'})
        assert view.to_columns() == {
            "a": [1, 2, 3, 4],
            "b": [5, 6, 7, 8],
            "computed": [6, 8, 10, 12],
        }
        table.clear()
        assert view.schema() == {"a": int, "b": int, "computed": float}
        assert view.to_columns() == {"a": [], "b": [], "computed": []}

    def test_view_expression_create_replace(self):
        table = Table({"a": [1, 2, 3, 4], "b": [5, 6, 7, 8]})
        view = table.view(expressions={"computed": ' "a" + "b"'})
        assert view.to_columns() == {
            "a": [1, 2, 3, 4],
            "b": [5, 6, 7, 8],
            "computed": [6, 8, 10, 12],
        }
        table.replace({"a": [10, 20, 30, 40], "b": [50, 60, 70, 80]})
        assert view.schema() == {"a": int, "b": int, "computed": float}
        assert view.to_columns() == {
            "a": [10, 20, 30, 40],
            "b": [50, 60, 70, 80],
            "computed": [60, 80, 100, 120],
        }

    def test_view_expression_multiple_dependents_replace(self):
        table = Table({"a": [1, 2, 3, 4], "b": [5, 6, 7, 8]})
        view = table.view(
            expressions={"computed": '"a" + "b"', "final": '("a" + "b") ^ 2'}
        )
        assert view.to_columns() == {
            "a": [1, 2, 3, 4],
            "b": [5, 6, 7, 8],
            "computed": [6, 8, 10, 12],
            "final": [36, 64, 100, 144],
        }
        table.replace({"a": [10, 20, 30, 40], "b": [50, 60, 70, 80]})
        assert view.schema() == {
            "a": int,
            "b": int,
            "computed": float,
            "final": float,
        }
        assert view.to_columns() == {
            "a": [10, 20, 30, 40],
            "b": [50, 60, 70, 80],
            "computed": [60, 80, 100, 120],
            "final": [3600, 6400, 10000, 14400],
        }

    def test_view_expression_multiple_views_should_not_conflate(self):
        table = Table({"a": [1, 2, 3, 4], "b": [5, 6, 7, 8]})
        view = table.view(
            expressions={
                "computed": '"a" + "b"',
            }
        )

        view2 = table.view(expressions={"computed2": ' "a" - "b"'})
        assert view.schema() == {"a": int, "b": int, "computed": float}
        assert view2.schema() == {"a": int, "b": int, "computed2": float}
        assert view.to_columns() == {
            "a": [1, 2, 3, 4],
            "b": [5, 6, 7, 8],
            "computed": [6, 8, 10, 12],
        }

        assert view2.to_columns() == {
            "a": [1, 2, 3, 4],
            "b": [5, 6, 7, 8],
            "computed2": [-4, -4, -4, -4],
        }

    def test_view_expression_multiple_views_should_all_clear(self):
        table = Table({"a": [1, 2, 3, 4], "b": [5, 6, 7, 8]})

        view = table.view(
            expressions={
                "computed": '"a" + "b"',
            }
        )

        view2 = table.view(expressions={"computed2": ' "a" - "b"'})
        assert view.schema() == {"a": int, "b": int, "computed": float}
        assert view2.schema() == {"a": int, "b": int, "computed2": float}
        assert view.to_columns() == {
            "a": [1, 2, 3, 4],
            "b": [5, 6, 7, 8],
            "computed": [6, 8, 10, 12],
        }

        assert view2.to_columns() == {
            "a": [1, 2, 3, 4],
            "b": [5, 6, 7, 8],
            "computed2": [-4, -4, -4, -4],
        }

        table.clear()

        assert view.schema() == {"a": int, "b": int, "computed": float}

        assert view2.schema() == {"a": int, "b": int, "computed2": float}

        assert view.to_columns() == {"a": [], "b": [], "computed": []}

        assert view2.to_columns() == {"a": [], "b": [], "computed2": []}

    def test_view_expression_multiple_views_should_all_replace(self):
        table = Table({"a": [1, 2, 3, 4], "b": [5, 6, 7, 8]})
        view = table.view(
            expressions={
                "computed": '"a" + "b"',
            }
        )

        view2 = table.view(expressions={"computed2": ' "a" - "b"'})
        assert view.schema() == {"a": int, "b": int, "computed": float}
        assert view2.schema() == {"a": int, "b": int, "computed2": float}
        assert view.to_columns() == {
            "a": [1, 2, 3, 4],
            "b": [5, 6, 7, 8],
            "computed": [6, 8, 10, 12],
        }

        assert view2.to_columns() == {
            "a": [1, 2, 3, 4],
            "b": [5, 6, 7, 8],
            "computed2": [-4, -4, -4, -4],
        }

        table.replace({"a": [10, 20, 30, 40], "b": [50, 60, 70, 80]})
        assert view.to_columns() == {
            "a": [10, 20, 30, 40],
            "b": [50, 60, 70, 80],
            "computed": [60, 80, 100, 120],
        }

        assert view2.to_columns() == {
            "a": [10, 20, 30, 40],
            "b": [50, 60, 70, 80],
            "computed2": [-40, -40, -40, -40],
        }

    def test_view_expression_delete_and_create(self):
        table = Table({"a": [1, 2, 3, 4], "b": [5, 6, 7, 8]})
        view = table.view(
            expressions={
                "computed": '"a" + "b"',
            }
        )

        assert view.schema() == {"a": int, "b": int, "computed": float}
        assert view.to_columns() == {
            "a": [1, 2, 3, 4],
            "b": [5, 6, 7, 8],
            "computed": [6, 8, 10, 12],
        }

        view.delete()
        view2 = table.view(expressions={"computed": ' "a" - "b"'})
        assert view2.schema() == {"a": int, "b": int, "computed": float}
        assert view2.to_columns() == {
            "a": [1, 2, 3, 4],
            "b": [5, 6, 7, 8],
            "computed": [-4, -4, -4, -4],
        }

    def test_view_expression_delete_and_create_with_updates(self):
        table = Table({"a": [1, 2, 3, 4], "b": [5, 6, 7, 8]})
        view = table.view(
            expressions={
                "computed": ' "a" + "b"',
                "upper(concat('abc', 'def'))": "upper(concat('abc', 'def'))",
            }
        )
        assert view.schema() == {
            "a": int,
            "b": int,
            "computed": float,
            "upper(concat('abc', 'def'))": str,
        }
        table.update({"a": [5, 6], "b": [9, 10]})
        assert view.to_columns() == {
            "a": [1, 2, 3, 4, 5, 6],
            "b": [5, 6, 7, 8, 9, 10],
            "computed": [6, 8, 10, 12, 14, 16],
            "upper(concat('abc', 'def'))": ["ABCDEF" for _ in range(6)],
        }
        view.delete()
        view2 = table.view(
            expressions={
                "computed2": '"a" - "b"',
            }
        )

        assert view2.schema() == {"a": int, "b": int, "computed2": float}
        table.update({"a": [5, 6], "b": [9, 10]})
        table.update({"a": [5, 6], "b": [9, 10]})
        assert view2.to_columns() == {
            "a": [1, 2, 3, 4, 5, 6, 5, 6, 5, 6],
            "b": [5, 6, 7, 8, 9, 10, 9, 10, 9, 10],
            "computed2": [-4, -4, -4, -4, -4, -4, -4, -4, -4, -4],
        }

    def test_view_expression_append(self):
        table = Table({"a": [1, 2, 3, 4], "b": [5, 6, 7, 8]})

        view = table.view(
            expressions={
                "computed": '"a" + "b"',
            }
        )

        assert view.schema() == {"a": int, "b": int, "computed": float}
        assert view.to_columns() == {
            "a": [1, 2, 3, 4],
            "b": [5, 6, 7, 8],
            "computed": [6, 8, 10, 12],
        }

        table.update({"a": [5, 6], "b": [9, 10]})

        assert view.to_columns() == {
            "a": [1, 2, 3, 4, 5, 6],
            "b": [5, 6, 7, 8, 9, 10],
            "computed": [6, 8, 10, 12, 14, 16],
        }

    def test_view_expression_delta_zero(self, util):
        table = Table({"a": [1, 2, 3, 4], "b": [5, 6, 7, 8]})

        view = table.view(
            expressions={
                "computed": '"a" + "b"',
            }
        )

        assert view.schema() == {"a": int, "b": int, "computed": float}

        assert view.to_columns() == {
            "a": [1, 2, 3, 4],
            "b": [5, 6, 7, 8],
            "computed": [6, 8, 10, 12],
        }

        def updater(port, delta):
            compare_delta(delta, {"a": [5, 6], "b": [9, 10]})

        table.update({"a": [5, 6], "b": [9, 10]})

        assert view.to_columns() == {
            "a": [1, 2, 3, 4, 5, 6],
            "b": [5, 6, 7, 8, 9, 10],
            "computed": [6, 8, 10, 12, 14, 16],
        }

    def test_view_delete_with_scope(self):
        """Tests that `View`'s `__del__` method, when called by the Python
        reference counter, leaves an empty `Table` in a clean state.
        """
        table = Table(
            {"id": int, "msg": str, "val": float},
            index="id",
        )

        table.view(
            expressions={
                "inverted": '1 / "val"',
            },
            columns=["inverted"],
        )
        table.update(
            [
                {
                    "id": 1,
                    "msg": "test",
                    "val": 1.0,
                }
            ]
        )

    def test_view_expression_with_custom_columns(self):
        table = Table({"a": [1, 2, 3, 4], "b": [5, 6, 7, 8]})
        view = table.view(
            columns=["computed", "b"],
            expressions={
                "computed": '"a" + "b"',
            },
        )
        assert view.to_columns() == {
            "b": [5, 6, 7, 8],
            "computed": [6, 8, 10, 12],
        }

    def test_view_expression_with_group_by(self):
        table = Table({"a": [1, 2, 3, 4], "b": [5, 6, 7, 8]})
        view = table.view(
            group_by=["computed"],
            expressions={
                "computed": '"a" + "b"',
            },
        )
        assert view.to_columns() == {
            "__ROW_PATH__": [[], [6], [8], [10], [12]],
            "a": [10, 1, 2, 3, 4],
            "b": [26, 5, 6, 7, 8],
            "computed": [36.0, 6.0, 8.0, 10.0, 12.0],
        }

    def test_view_expression_with_group_by_clear(self):
        table = Table({"a": [1, 2, 3, 4], "b": [5, 6, 7, 8]})

        view = table.view(
            group_by=["computed"],
            expressions={
                "computed": '"a" + "b"',
            },
        )

        assert view.to_columns() == {
            "__ROW_PATH__": [[], [6], [8], [10], [12]],
            "a": [10, 1, 2, 3, 4],
            "b": [26, 5, 6, 7, 8],
            "computed": [36.0, 6.0, 8.0, 10.0, 12.0],
        }

        table.clear()

        assert view.to_columns() == {
            "__ROW_PATH__": [[]],
            "a": [None],
            "b": [None],
            "computed": [None],
        }

    def test_view_expression_with_group_by_replace(self):
        table = Table({"a": [1, 2, 3, 4], "b": [5, 6, 7, 8]})

        view = table.view(
            group_by=["computed"],
            expressions={
                "computed": '"a" + "b"',
            },
        )

        assert view.to_columns() == {
            "__ROW_PATH__": [[], [6], [8], [10], [12]],
            "a": [10, 1, 2, 3, 4],
            "b": [26, 5, 6, 7, 8],
            "computed": [36.0, 6.0, 8.0, 10.0, 12.0],
        }

        table.replace({"a": [10, 20, 30, 40], "b": [50, 60, 70, 80]})

        assert view.to_columns() == {
            "__ROW_PATH__": [[], [60], [80], [100], [120]],
            "a": [100, 10, 20, 30, 40],
            "b": [260, 50, 60, 70, 80],
            "computed": [360.0, 60.0, 80.0, 100.0, 120.0],
        }

    def test_view_expression_with_split_by(self):
        table = Table({"a": [1, 2, 3, 4], "b": [5, 6, 7, 8]})
        view = table.view(
            split_by=["computed"],
            expressions={
                "computed": '"a" + "b"',
            },
        )
        assert view.to_columns() == {
            "6|a": [1, None, None, None],
            "6|b": [5, None, None, None],
            "6|computed": [6, None, None, None],
            "8|a": [None, 2, None, None],
            "8|b": [None, 6, None, None],
            "8|computed": [None, 8, None, None],
            "10|a": [None, None, 3, None],
            "10|b": [None, None, 7, None],
            "10|computed": [None, None, 10.0, None],
            "12|a": [None, None, None, 4],
            "12|b": [None, None, None, 8],
            "12|computed": [None, None, None, 12.0],
        }

    def test_view_expression_with_row_split_by(self):
        table = Table({"a": [1, 2, 3, 4], "b": [5, 6, 7, 8]})
        view = table.view(
            split_by=["computed"],
            expressions={
                "computed": '"a" + "b"',
            },
        )
        assert view.to_columns() == {
            "6|a": [1, None, None, None],
            "6|b": [5, None, None, None],
            "6|computed": [6.0, None, None, None],
            "8|a": [None, 2, None, None],
            "8|b": [None, 6, None, None],
            "8|computed": [None, 8.0, None, None],
            "10|a": [None, None, 3, None],
            "10|b": [None, None, 7, None],
            "10|computed": [None, None, 10.0, None],
            "12|a": [None, None, None, 4],
            "12|b": [None, None, None, 8],
            "12|computed": [None, None, None, 12.0],
        }

    def test_view_expression_with_sort(self):
        table = Table({"a": ["a", "ab", "abc", "abcd"]})
        view = table.view(
            sort=[["computed", "desc"]], expressions={"computed": 'length("a")'}
        )
        assert view.to_columns() == {
            "a": ["abcd", "abc", "ab", "a"],
            "computed": [4, 3, 2, 1],
        }

    def test_view_expression_with_filter(self):
        table = Table({"a": ["a", "ab", "abc", "abcd"]})
        view = table.view(
            filter=[["computed", ">=", 3]], expressions={"computed": 'length("a")'}
        )
        assert view.to_columns() == {"a": ["abc", "abcd"], "computed": [3, 4]}

    def test_view_day_of_week_date(self):
        table = Table({"a": [date(2020, 3, i) for i in range(9, 14)]})
        view = table.view(expressions={"bucket": 'day_of_week("a")'})
        assert view.schema() == {"a": date, "bucket": str}
        assert view.to_columns() == {
            "a": [datetime(2020, 3, i) for i in range(9, 14)],
            "bucket": [
                "2 Monday",
                "3 Tuesday",
                "4 Wednesday",
                "5 Thursday",
                "6 Friday",
            ],
        }

    def test_view_day_of_week_datetime(self):
        table = Table({"a": [datetime(2020, 3, i, 12, 30) for i in range(9, 14)]})
        view = table.view(expressions={"bucket": 'day_of_week("a")'})
        assert view.schema() == {"a": datetime, "bucket": str}
        assert view.to_columns() == {
            "a": [datetime(2020, 3, i, 12, 30) for i in range(9, 14)],
            "bucket": [
                "2 Monday",
                "3 Tuesday",
                "4 Wednesday",
                "5 Thursday",
                "6 Friday",
            ],
        }

    def test_view_month_of_year_date(self):
        table = Table({"a": [date(2020, i, 15) for i in range(1, 13)]})
        view = table.view(expressions={"bucket": 'month_of_year("a")'})
        assert view.schema() == {"a": date, "bucket": str}
        assert view.to_columns() == {
            "a": [datetime(2020, i, 15) for i in range(1, 13)],
            "bucket": [
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
            ],
        }

    def test_view_month_of_year_datetime(self):
        table = Table(
            {
                "a": [datetime(2020, i, 15) for i in range(1, 13)],
            }
        )
        view = table.view(expressions={"bucket": 'month_of_year("a")'})
        assert view.schema() == {"a": datetime, "bucket": str}
        assert view.to_columns() == {
            "a": [datetime(2020, i, 15) for i in range(1, 13)],
            "bucket": [
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
            ],
        }

    # bucketing
    def test_view_day_bucket_date(self):
        table = Table(
            {
                "a": [
                    date(2020, 1, 1),
                    date(2020, 1, 1),
                    date(2020, 2, 29),
                    date(2020, 3, 1),
                ],
            }
        )
        view = table.view(expressions={"bucket": "bucket(\"a\", 'D')"})
        assert view.schema() == {"a": date, "bucket": date}
        assert view.to_columns() == {
            "a": [
                datetime(2020, 1, 1),
                datetime(2020, 1, 1),
                datetime(2020, 2, 29),
                datetime(2020, 3, 1),
            ],
            "bucket": [
                datetime(2020, 1, 1),
                datetime(2020, 1, 1),
                datetime(2020, 2, 29),
                datetime(2020, 3, 1),
            ],
        }

    def test_view_day_bucket_date_with_null(self):
        table = Table(
            {
                "a": [
                    date(2020, 1, 1),
                    None,
                    date(2020, 2, 29),
                    date(2020, 3, 15),
                ],
            }
        )
        view = table.view(expressions={"bucket": "bucket(\"a\", 'D')"})
        assert view.schema() == {"a": date, "bucket": date}
        assert view.to_columns() == {
            "a": [
                datetime(2020, 1, 1),
                None,
                datetime(2020, 2, 29),
                datetime(2020, 3, 15),
            ],
            "bucket": [
                datetime(2020, 1, 1),
                None,
                datetime(2020, 2, 29),
                datetime(2020, 3, 15),
            ],
        }

    def test_view_day_bucket_datetime(self):
        table = Table(
            {
                "a": [
                    datetime(2020, 1, 1, 5),
                    datetime(2020, 1, 1, 23),
                    datetime(2020, 2, 29, 1),
                    datetime(2020, 3, 1, 0),
                ],
            }
        )
        view = table.view(expressions={"bucket": "bucket(\"a\", 'D')"})
        assert view.schema() == {"a": datetime, "bucket": date}
        assert view.to_columns() == {
            "a": [
                datetime(2020, 1, 1, 5),
                datetime(2020, 1, 1, 23),
                datetime(2020, 2, 29, 1),
                datetime(2020, 3, 1, 0),
            ],
            "bucket": [
                datetime(2020, 1, 1),
                datetime(2020, 1, 1),
                datetime(2020, 2, 29),
                datetime(2020, 3, 1),
            ],
        }

    def test_view_month_bucket_date(self):
        table = Table(
            {
                "a": [
                    date(2020, 1, 1),
                    date(2020, 1, 28),
                    date(2020, 2, 29),
                    date(2020, 3, 15),
                ],
            }
        )
        view = table.view(expressions={"bucket": "bucket(\"a\", 'M')"})
        assert view.schema() == {"a": date, "bucket": date}
        assert view.to_columns() == {
            "a": [
                datetime(2020, 1, 1),
                datetime(2020, 1, 28),
                datetime(2020, 2, 29),
                datetime(2020, 3, 15),
            ],
            "bucket": [
                datetime(2020, 1, 1),
                datetime(2020, 1, 1),
                datetime(2020, 2, 1),
                datetime(2020, 3, 1),
            ],
        }

    def test_view_month_bucket_date_with_null(self):
        table = Table(
            {
                "a": [
                    date(2020, 1, 1),
                    None,
                    date(2020, 2, 29),
                    date(2020, 3, 15),
                ],
            }
        )
        view = table.view(expressions={"bucket": "bucket(\"a\", 'M')"})
        assert view.schema() == {"a": date, "bucket": date}
        assert view.to_columns() == {
            "a": [
                datetime(2020, 1, 1),
                None,
                datetime(2020, 2, 29),
                datetime(2020, 3, 15),
            ],
            "bucket": [
                datetime(2020, 1, 1),
                None,
                datetime(2020, 2, 1),
                datetime(2020, 3, 1),
            ],
        }

    def test_view_month_bucket_datetime(self):
        table = Table(
            {
                "a": [
                    datetime(2020, 1, 1),
                    datetime(2020, 1, 28),
                    datetime(2020, 2, 29),
                    datetime(2020, 3, 15),
                ],
            }
        )
        view = table.view(expressions={"bucket": "bucket(\"a\", 'M')"})
        assert view.schema() == {"a": datetime, "bucket": date}
        assert view.to_columns() == {
            "a": [
                datetime(2020, 1, 1),
                datetime(2020, 1, 28),
                datetime(2020, 2, 29),
                datetime(2020, 3, 15),
            ],
            "bucket": [
                datetime(2020, 1, 1),
                datetime(2020, 1, 1),
                datetime(2020, 2, 1),
                datetime(2020, 3, 1),
            ],
        }

    def test_view_month_bucket_datetime_with_null(self):
        table = Table(
            {
                "a": [datetime(2020, 1, 1), None, None, datetime(2020, 3, 15)],
            }
        )
        view = table.view(expressions={"bucket": "bucket(\"a\", 'M')"})
        assert view.schema() == {"a": datetime, "bucket": date}
        assert view.to_columns() == {
            "a": [datetime(2020, 1, 1), None, None, datetime(2020, 3, 15)],
            "bucket": [datetime(2020, 1, 1), None, None, datetime(2020, 3, 1)],
        }

    def test_view_integer_expression(self):
        table = Table({"x": int, "y": date, "z": float})

        view = table.view(
            expressions={
                "computed": "integer(2147483648)",
                "computed2": "integer(-2147483649)",
                "computed3": "integer(123.456)",
                "computed4": 'integer("x")',
                "computed5": 'integer("y")',
                "computed6": 'integer("z")',
            }
        )

        table.update({"x": [12136582], "y": [date(2020, 6, 30)], "z": [1.23456]})

        assert view.expression_schema() == {
            "computed": int,
            "computed2": int,
            "computed3": int,
            "computed4": int,
            "computed5": int,
            "computed6": int,
        }

        result = view.to_dict()

        assert result["computed"] == [2147483648]
        assert result["computed2"] == [-2147483649]
        assert result["computed3"] == [123]
        assert result["computed4"] == [12136582]
        assert result["computed5"] == [132384030]
        assert result["computed6"] == [1]

    def test_view_float_expression(self):
        table = Table({"w": datetime, "x": int, "y": date, "z": float})

        view = table.view(
            expressions={
                "computed": "float(2147483648)",
                "computed2": "float(-2147483649)",
                "computed3": "float(123.456789123)",
                "computed4": 'float("x")',
                "computed5": 'float("y")',
                "computed6": 'float("z")',
                "computed7": 'float("w")',
            }
        )

        dt = datetime(2018, 8, 12, 15, 32, 55)

        table.update(
            {"w": [dt], "x": [12136582], "y": [date(2020, 6, 30)], "z": [1.23456]}
        )

        assert view.expression_schema() == {
            "computed": float,
            "computed2": float,
            "computed3": float,
            "computed4": float,
            "computed5": float,
            "computed6": float,
            "computed7": float,
        }

        result = view.to_dict()

        seconds_timestamp = mktime(dt.timetuple()) + dt.microsecond / 1000000.0
        ms_timestamp = int(seconds_timestamp * 1000)

        assert result["computed"] == [2147483648]
        assert result["computed2"] == [-2147483649]
        assert result["computed3"] == [123.456789123]
        assert result["computed4"] == [12136582]
        assert result["computed5"] == [132384030]
        assert result["computed6"] == [1.23456]
        assert result["computed7"] == [ms_timestamp]

    def test_view_date_expression(self):
        table = Table({"x": [1]})
        view = table.view(
            expressions={
                "computed": " date(2020, 5, 30)",
                "computed2": "date(1997, 8, 31)",
            }
        )
        assert view.expression_schema() == {"computed": date, "computed2": date}
        result = view.to_dict()
        assert result["computed"] == [datetime(2020, 5, 30)]
        assert result["computed2"] == [datetime(1997, 8, 31)]

    def test_view_datetime_expression(self):
        table = Table({"x": [1]})

        dt = datetime(2015, 11, 29, 23, 59, 59)
        seconds_timestamp = mktime(dt.timetuple()) + dt.microsecond / 1000000.0
        ms_timestamp = int(seconds_timestamp * 1000)
        view = table.view(expressions={"computed": "datetime({})".format(ms_timestamp)})
        assert view.expression_schema() == {"computed": datetime}
        result = view.to_dict()
        assert result["computed"] == [datetime(2015, 11, 29, 23, 59, 59)]

    def test_view_datetime_expression_roundtrip(self):
        table = Table({"x": [datetime(2015, 11, 29, 23, 59, 59)]})
        view = table.view(expressions={"computed": 'datetime(float("x"))'})
        assert view.expression_schema() == {"computed": datetime}
        result = view.to_dict()
        assert result["computed"] == [datetime(2015, 11, 29, 23, 59, 59)]

    def test_view_string_expression(self):
        table = Table(
            {"a": date, "b": datetime, "c": int, "d": float, "e": str, "f": bool}
        )
        view = table.view(
            expressions={
                "computed": 'string("a")',
                "computed2": 'string("b")',
                "computed3": 'string("c")',
                "computed4": 'string("d")',
                "computed5": 'string("e")',
                "computed6": 'string("f")',
                "computed7": "string(1234.5678)",
            }
        )

        table.update(
            {
                "a": [date(2020, 5, 30), date(2021, 7, 13)],
                "b": [
                    datetime(2015, 11, 29, 23, 59, 59),
                    datetime(2016, 11, 29, 23, 59, 59),
                ],
                "c": [12345678, 1293879852],
                "d": [1.2792013981, 19.218975981],
                "e": ["abcdefghijklmnop", "def"],
                "f": [False, True],
            }
        )

        assert view.expression_schema() == {
            "computed": str,
            "computed2": str,
            "computed3": str,
            "computed4": str,
            "computed5": str,
            "computed6": str,
            "computed7": str,
        }
        result = view.to_dict()
        assert result["computed"] == ["2020-05-30", "2021-07-13"]
        assert result["computed2"] == [
            "2015-11-29 23:59:59.000",
            "2016-11-29 23:59:59.000",
        ]
        assert result["computed3"] == ["12345678", "1293879852"]
        assert result["computed4"] == ["1.2792", "19.219"]
        assert result["computed5"] == ["abcdefghijklmnop", "def"]
        assert result["computed6"] == ["false", "true"]
        assert result["computed7"] == ["1234.57"] * 2

    def test_view_expession_multicomment(self):
        table = Table({"a": [1, 2, 3, 4]})
        view = table.view(expressions=["var x := 1 + 2;\n// def\nx + 100 // cdefghijk"])
        assert view.expression_schema() == {
            "var x := 1 + 2;\n// def\nx + 100 // cdefghijk": float
        }
        assert view.to_columns() == {
            "var x := 1 + 2;\n// def\nx + 100 // cdefghijk": [103, 103, 103, 103],
            "a": [1, 2, 3, 4],
        }

    def test_view_regex_email(self):
        endings = ["com", "net", "co.uk", "ie", "me", "io", "co"]
        data = [
            "{}@{}.{}".format(
                randstr(30, ascii_letters + "0123456789" + "._-"),
                randstr(10),
                choices(endings, k=1)[0],
            )
            for _ in range(100)
        ]
        table = Table({"a": data})
        expressions = {
            "address": "search(\"a\", '^([a-zA-Z0-9._-]+)@')",
            "domain": "search(\"a\", '@([a-zA-Z.]+)$')",
            "is_email?": "match_all(\"a\", '^([a-zA-Z0-9._-]+)@([a-zA-Z.]+)$')",
            "has_at?": "match(\"a\", '@')",
        }

        view = table.view(expressions=expressions)
        schema = view.expression_schema()
        assert schema == {
            "address": str,
            "domain": str,
            "is_email?": bool,
            "has_at?": bool,
        }

        results = view.to_columns()

        for i in range(100):
            source = results["a"][i]
            expected_address = re.match(r"^([a-zA-Z0-9._-]+)@", source).group(1)
            expected_domain = re.search(r"@([a-zA-Z.]+)$", source).group(1)
            assert results["address"][i] == expected_address
            assert results["domain"][i] == expected_domain
            assert results["is_email?"][i] == True
            assert results["has_at?"][i] == True

    def test_view_expression_number(self):
        def digits():
            return randstr(4, "0123456789")

        data = []

        for _ in range(1000):
            separator = "-" if random() > 0.5 else " "
            data.append(
                "{}{}{}{}{}{}{}".format(
                    digits(),
                    separator,
                    digits(),
                    separator,
                    digits(),
                    separator,
                    digits(),
                )
            )

        table = Table({"a": data})
        view = table.view(
            expressions={
                "parsed": """
        var parts[4];
        parts[0] := search("a", '^([0-9]{4})[ -][0-9]{4}[ -][0-9]{4}[ -][0-9]{4}');
        parts[1] := search("a", '^[0-9]{4}[ -]([0-9]{4})[ -][0-9]{4}[ -][0-9]{4}');
        parts[2] := search("a", '^[0-9]{4}[ -][0-9]{4}[ -]([0-9]{4})[ -][0-9]{4}');
        parts[3] := search("a", '^[0-9]{4}[ -][0-9]{4}[ -][0-9]{4}[ -]([0-9]{4})');
        concat(parts[0], parts[1], parts[2], parts[3])
        """,
                "is_number?": "match_all(\"a\", '^[0-9]{4}[ -][0-9]{4}[ -][0-9]{4}[ -][0-9]{4}')",
            }
        )
        schema = view.expression_schema()
        assert schema == {"parsed": str, "is_number?": bool}
        results = view.to_columns()

        for i in range(1000):
            source = results["a"][i]
            expected = re.sub(r"[ -]", "", source)
            assert results["parsed"][i] == expected
            assert results["is_number?"][i] == True

    def test_view_expression_newlines(self):
        table = Table(
            {
                "a": [
                    "abc\ndef",
                    "\n\n\n\nabc\ndef",
                    "abc\n\n\n\n\n\nabc\ndef\n\n\n\n",
                    None,
                    "def",
                ],
                "b": [
                    "hello\tworld",
                    "\n\n\n\n\nhello\n\n\n\n\n\tworld",
                    "\tworld",
                    "world",
                    None,
                ],
            }
        )

        view = table.view(
            expressions={
                "c1": "search(\"a\", '(\ndef)')",
                "c2": "search(\"b\", '(\tworld)')",
                "c3": "match(\"a\", '\\n')",
                "c4": "match(\"b\", '\\n')",
            }
        )

        assert view.expression_schema() == {
            "c1": str,
            "c2": str,
            "c3": bool,
            "c4": bool,
        }

        results = view.to_columns()
        assert results["c1"] == ["\ndef", "\ndef", "\ndef", None, None]
        assert results["c2"] == ["\tworld", "\tworld", "\tworld", None, None]
        assert results["c3"] == [True, True, True, None, False]
        assert results["c4"] == [False, True, False, False, None]

    def test_view_regex_substring(self):
        data = ["abc, def", "efg", "", None, "aaaaaaaaaaaaa"]
        table = Table({"x": data})
        view = table.view(
            expressions={
                "a": "substring('abcdef', 0)",
                "abc": "substring('abcdef', 3)",
                "b": 'substring("x", 0)',
                "c": 'substring("x", 5, 1)',
                "d": 'substring("x", 100)',
                "e": 'substring("x", 0, 10000)',
                "f": 'substring("x", 5, 0)',
            }
        )
        results = view.to_columns()

        assert results["a"] == ["abcdef" for _ in data]
        assert results["abc"] == ["def" for _ in data]
        assert results["b"] == [d if d else None for d in data]
        assert results["c"] == ["d", None, None, None, "a"]
        assert results["d"] == [None for _ in data]
        assert results["e"] == [None for _ in data]
        assert results["f"] == ["", None, None, None, ""]

    # FIXME: // ending\nvar domain := search(\"a\", '@([a-zA-Z.]+)$'); length(domain) > 0 ? search(domain, '[.](.*)$') : null
    # is a broken expression without the newline after var domain
    def test_view_regex_email_substr(self):
        endings = ["com", "net", "co.uk", "ie", "me", "io", "co"]
        data = [
            "{}@{}.{}".format(
                randstr(30, ascii_letters + "0123456789" + "._-"),
                randstr(10),
                choices(endings, k=1)[0],
            )
            for _ in range(100)
        ]
        table = Table({"a": data})
        expressions = {
            "address": 'var vec[2]; indexof("a", \'^([a-zA-Z0-9._-]+)@\', vec) ? substring("a", vec[0], vec[1] - vec[0] + 1) : null',
            "ending": """
            var domain := search(\"a\", '@([a-zA-Z.]+)$');
            var len := length(domain);
            if (len > 0 and is_not_null(domain)) {
                search(domain, '[.](.*)$');
            } else {
                'not found';
            }""",
        }

        view = table.view(expressions=expressions)
        schema = view.expression_schema()
        assert schema == {
            "address": str,
            "ending": str,
        }

        results = view.to_columns()

        for i in range(100):
            source = results["a"][i]
            address = re.match(r"^([a-zA-Z0-9._-]+)@", source).group(1)
            domain = re.search(r"@([a-zA-Z.]+)$", source).group(1)
            ending = re.search(r"[.](.*)$", domain).group(1)
            assert results["address"][i] == address
            assert results["ending"][i] == ending

    def test_view_expressions_replace(self):
        def digits():
            return randstr(4, "0123456789")

        data = []

        for _ in range(1000):
            separator = "-" if random() > 0.5 else " "
            data.append(
                "{}{}{}{}{}{}{}".format(
                    digits(),
                    separator,
                    digits(),
                    separator,
                    digits(),
                    separator,
                    digits(),
                )
            )

        table = Table({"a": data, "b": [str(i) for i in range(1000)]})
        expressions = [
            """//w
            replace('abc-def-hijk', '-', '')""",
            """//x
            replace("a", '[0-9]{4}$', "b")""",
            """//y
            replace("a", '[a-z]{4}$', "b")""",
            """//z
            var x := 'long string, very cool!'; replace("a", '^[0-9]{4}', x)""",
        ]

        validate = table.validate_expressions(expressions)
        assert validate["expression_schema"] == {
            "w": "string",
            "x": "string",
            "y": "string",
            "z": "string",
        }

        view = table.view(expressions=expressions)
        schema = view.expression_schema()
        assert schema == {
            "w": str,
            "x": str,
            "y": str,
            "z": str,
        }
        results = view.to_columns()

        for i in range(1000):
            source = results["a"][i]
            idx = results["b"][i]
            assert results["w"][i] == "abcdef-hijk"
            assert results["x"][i] == re.sub(r"[0-9]{4}$", idx, source, 1)
            assert results["y"][i] == source
            assert results["z"][i] == re.sub(
                r"^[0-9]{4}", "long string, very cool!", source, 1
            )

    def test_view_replace_invalid(self):
        table = Table({"a": "string", "b": "string"})
        expressions = [
            """//v
            replace('abc-def-hijk', '-', 123)""",
            """//w
            replace('', '-', today())""",
            """//x
            replace("a", '[0-9]{4}$', today())""",
            """//y
            replace("a", '[a-z]{4}$', null)""",
            """//z
            var x := 123; replace("a", '^[0-9]{4}', x)""",
        ]
        validate = table.validate_expressions(expressions)
        assert validate["expression_schema"] == {}

    def test_view_expressions_replace_all(self):
        def digits():
            return randstr(4, "0123456789")

        data = []

        for _ in range(1000):
            separator = "-" if random() > 0.5 else " "
            data.append(
                "{}{}{}{}{}{}{}".format(
                    digits(),
                    separator,
                    digits(),
                    separator,
                    digits(),
                    separator,
                    digits(),
                )
            )

        table = Table({"a": data, "b": [str(i) for i in range(1000)]})
        expressions = [
            """//w
            replace_all('abc-def-hijk', '-', '')""",
            """//x
            replace_all("a", '[0-9]{4}$', "b")""",
            """//y
            replace_all("a", '[a-z]{4}$', "b")""",
            """//z
            var x := 'long string, very cool!'; replace_all("a", '^[0-9]{4}', x)""",
        ]

        validate = table.validate_expressions(expressions)
        assert validate["expression_schema"] == {
            "w": "string",
            "x": "string",
            "y": "string",
            "z": "string",
        }

        view = table.view(expressions=expressions)
        schema = view.expression_schema()
        assert schema == {
            "w": str,
            "x": str,
            "y": str,
            "z": str,
        }

        results = view.to_columns()

        for i in range(1000):
            source = results["a"][i]
            idx = results["b"][i]
            assert results["w"][i] == "abcdefhijk"
            assert results["x"][i] == re.sub(r"[0-9]{4}$", idx, source)
            assert results["y"][i] == source
            assert results["z"][i] == re.sub(
                r"^[0-9]{4}", "long string, very cool!", source
            )

    def test_view_replace_invalid(self):
        table = Table({"a": "string", "b": "string"})
        expressions = [
            """//v
            replace_all('abc-def-hijk', '-', 123)""",
            """//w
            replace_all('', '-', today())""",
            """//x
            replace_all("a", '[0-9]{4}$', today())""",
            """//y
            replace_all("a", '[a-z]{4}$', null)""",
            """//z
            var x := 123; replace_all("a", '^[0-9]{4}', x)""",
        ]
        validate = table.validate_expressions(expressions)
        assert validate["expression_schema"] == {}
