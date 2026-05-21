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


import psutil
import os
import perspective as psp

client = psp.Server().new_local_client()
Table = client.table


class TestDelete(object):
    # delete

    def test_table_delete(self):
        process = psutil.Process(os.getpid())
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)
        tbl.delete()
        mem = process.memory_info().rss

        for x in range(10000):
            data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
            tbl = Table(data)
            tbl.delete()

        mem2 = process.memory_info().rss

        # assert 1 < (max2 / max) < 1.01
        assert (mem2 - mem) < 2000000

    def test_table_delete_with_view(self, sentinel):
        data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
        tbl = Table(data)

        process = psutil.Process(os.getpid())
        mem = process.memory_info().rss
        for x in range(10000):
            view = tbl.view()
            view.delete()

        tbl.delete()
        mem2 = process.memory_info().rss
        assert (mem2 - mem) < 2000000


class TestExpressionVocab(object):
    # Regression tests for the `t_expression_vocab` leak fixed in PR #3175.
    # Pre-fix, updates against a view with a string-producing expression
    # interned each result into a new 4KB vocab page once the prior page
    # filled, and never deduplicated against older pages. RSS grew without
    # bound. The fix adds cross-page deduplication; these tests assert the
    # steady state is flat.

    def test_string_expression_update_no_leak(self):
        long_literal = "X" * 256
        tbl = Table({"x": "integer", "c": "string"}, index="x")
        view = tbl.view(expressions={"e": 'concat("c", \'' + long_literal + "')"})

        for _ in range(100):
            tbl.update([{"x": 1, "c": "value"}])

        process = psutil.Process(os.getpid())
        mem = process.memory_info().rss
        for _ in range(5000):
            tbl.update([{"x": 1, "c": "value"}])
        mem2 = process.memory_info().rss

        view.delete()
        tbl.delete()

        assert (mem2 - mem) < 2000000

    def test_string_expression_update_bounded_vocab_no_leak(self):
        # Cycles through a small fixed set of distinct values. Exercises the
        # cross-page `string_exists` lookup the fix relies on: once the
        # vocabulary is fully populated, subsequent interns must resolve to
        # existing pointers rather than allocating new ones.
        values = ["alpha", "bravo", "charlie", "delta", "echo"]
        tbl = Table({"x": "integer", "c": "string"}, index="x")
        view = tbl.view(expressions={"e": 'upper("c")'})

        for i in range(100):
            tbl.update([{"x": 1, "c": values[i % len(values)]}])

        process = psutil.Process(os.getpid())
        mem = process.memory_info().rss
        for i in range(5000):
            tbl.update([{"x": 1, "c": values[i % len(values)]}])
        mem2 = process.memory_info().rss

        view.delete()
        tbl.delete()

        assert (mem2 - mem) < 2000000
