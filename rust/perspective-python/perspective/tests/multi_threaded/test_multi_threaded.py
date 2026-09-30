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

from perspective import Server

import asyncio
import random
import threading

from random import sample
from string import ascii_letters
from threading import Thread
from time import sleep, time

class TestServer(object):
    def test_sync_updates_with_loop_callback_are_sync(self):
        def feed(table):
            y = 1000
            while y > 0:
                y -= 1
                table.update([{"a": random.randint(0, 10), "index": y}])

        perspective_server = Server()
        loop = asyncio.new_event_loop()
        thread = threading.Thread(target=loop.run_forever)
        thread.start()

        client = perspective_server.new_local_client()
        table = client.table(
            {"a": "integer", "index": "integer"}, index="index", name="test"
        )

        view = table.view()
        global count
        count = 0

        def update(x):
            global count
            count += 1

        view.on_update(update)
        feed(table)
        assert table.size() == 1000
        assert count == 1000
        loop.call_soon_threadsafe(loop.stop)
        thread.join()
        loop.close()

    def test_concurrent_updates(self):
        async def feed(table, loop):
            y = 1000
            while y > 0:
                y -= 1
                table.update([{"a": random.randint(0, 10), "index": y}])
                await asyncio.sleep(0.001)

        perspective_server = Server()
        loop = asyncio.new_event_loop()
        thread = threading.Thread(target=loop.run_forever)
        thread.start()

        client = perspective_server.new_local_client()
        table = client.table(
            {"a": "integer", "index": "integer"}, index="index", name="test"
        )

        view = table.view()
        global count
        count = 0

        def update(x):
            global count
            count += 1

        view.on_update(update)
        asyncio.run_coroutine_threadsafe(feed(table, loop), loop).result()
        assert table.size() == 1000
        assert count == 1000
        loop.call_soon_threadsafe(loop.stop)
        thread.join()
        loop.close()

    def test_concurrent_updates_with_limit_tables_are_threadsafe(self):
        TEST_ITERATIONS = 100
        global running
        perspective_server = Server()
        client = perspective_server.new_local_client()
        table = client.table(
            {"col{}".format(i): "integer" for i in range(100)}, limit=100
        )

        running = True

        # Create an updating thread that overlaps the index alot
        def feed(table):
            row = {"col{}".format(i): random.randint(0, 100) for i in range(100)}
            while running:
                table.update([row for _ in range(100)])

        thread = threading.Thread(target=feed, args=(table,))
        thread.start()

        results = []

        # Create a thread that serialized the table alot, checking for nulls
        def feed2(table):
            global running
            view = table.view()
            while len(results) < TEST_ITERATIONS:
                arr = view.to_arrow()
                table2 = client.table(arr)
                view2 = table2.view()
                json = view2.to_json(end_row=1)
                view2.delete()
                table2.delete()
                results.append(json)

            view.delete()
            running = False

        thread2 = threading.Thread(target=feed2, args=(table,))
        thread2.start()

        thread.join()
        thread2.join()

        assert table.size() == 100
        for result in results:
            for row in result:
                for col, val in row.items():
                    assert val is not None

        table.delete()

    def test_concurrent_view_creation_on_separate_servers_are_threadsafe(self):
        def run_perspective():
            x = 1000
            s = Server()
            c = s.new_local_client()
            t = c.table({"a": "string", "b": int})
            t.view(expressions=["//tmp\nfalse"])
            while x > 0:
                t.update([{"a": "foo", "b": 42}])
                x -= 1

        thread1 = threading.Thread(target=run_perspective, daemon=True)
        thread2 = threading.Thread(target=run_perspective, daemon=True)
        thread1.start()
        thread2.start()
        thread1.join()
        thread2.join()

    def test_concurrent_view_creation_with_updates_are_threadsafe(self):
        global running
        s = Server()
        schema = {
            "a": "string",
            "b": "string",
            "c": "string",
        }

        group_bys = ["a", "b", "c"]
        c = s.new_local_client()
        t = c.table(schema, limit=10000)
        running = True

        def gen_views():
            global running
            for _ in range(100):
                t.view(columns=list(schema.keys()), group_by=group_bys)
                sleep(0.01)
            running = False

        def run_psp():
            global running
            while running:
                t.update(
                    [
                        {
                            "a": "".join(sample(ascii_letters, 4)),
                            "b": "".join(sample(ascii_letters, 4)),
                            "c": "".join(sample(ascii_letters, 4)),
                        }
                    ]
                )

        thread1 = Thread(target=run_psp, daemon=True)
        thread2 = Thread(target=gen_views, daemon=True)
        thread1.start()
        thread2.start()
        thread1.join()
        thread2.join()

    def test_to_columns_id_while_filtered_rows_shrink(self):
        from concurrent.futures import ThreadPoolExecutor

        executor = ThreadPoolExecutor()
        poll_lock = threading.Lock()

        def poll(server):
            try:
                server.poll()
            finally:
                poll_lock.release()

        def on_poll_request(server):
            if poll_lock.acquire(blocking=False):
                executor.submit(poll, server)

        perspective_server = Server(on_poll_request=on_poll_request)
        client = perspective_server.new_local_client()
        table = client.table(
            {"a": "float", "index": "integer"}, index="index", name="test"
        )

        stop = threading.Event()

        def feed():
            while not stop.is_set():
                table.update(
                    [
                        {"a": random.random() * 100, "index": random.randint(0, 200)}
                        for _ in range(50)
                    ]
                )
                sleep(0.001)

        thread = threading.Thread(target=feed)
        thread.start()
        reader = perspective_server.new_local_client()
        view = reader.open_table("test").view(filter=[["a", ">", 50]])
        deadline = time() + 2.5
        checked = 0
        try:
            while time() < deadline:
                n = view.num_rows()
                cols = view.to_columns(start_row=0, end_row=n, id=True)
                assert len(cols["__ID__"]) == len(cols["a"])
                assert all(len(x) == 1 for x in cols["__ID__"])
                checked += 1
        finally:
            stop.set()
            thread.join()
            executor.shutdown()

        assert checked > 0

    def test_concurrent_flat_view_reads_are_threadsafe(self):
        client = Server().new_local_client()
        table = client.table(
            {"a": "integer", "b": "string", "index": "integer"}, index="index"
        )
        table.update(
            [{"a": i, "b": ascii_letters[i % 52], "index": i} for i in range(60)]
        )
        for config in ({}, {"filter": [["a", ">", 2]]}):
            view = table.view(**config)
            errors = []
            stop = threading.Event()

            def read():
                try:
                    while not stop.is_set():
                        view.column_paths()
                        view.to_columns()
                        view.to_arrow()
                except Exception as e:
                    errors.append(e)

            readers = [threading.Thread(target=read) for _ in range(8)]
            for reader in readers:
                reader.start()

            try:
                for i in range(300):
                    table.update([{"a": i, "b": "z", "index": i % 60}])
            finally:
                stop.set()
                for reader in readers:
                    reader.join()

            assert errors == []
            assert view.num_rows() == len(view.to_columns()["a"])
            view.delete()
