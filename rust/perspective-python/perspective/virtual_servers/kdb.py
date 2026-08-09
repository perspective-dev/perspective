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

import io
import logging
import re
from datetime import date, datetime

import pyarrow as pa
import pyarrow.compute as pc
from pyarrow import ipc

import perspective
from perspective.virtual_servers import VirtualServerHandler

logger = logging.getLogger(__name__)

# The aggregates this handler advertises are q's own, by their q names — a
# kdb+ user picks `sdev` or `dev` because they are different statistics, and
# `wavg` because weighted aggregates are why they are running kdb+. Names are
# emitted into the query as written, so this doubles as the allowlist: a
# config naming anything else is rejected rather than passed through to q.
NUMBER_AGGS = [
    "sum",
    "avg",
    "count",
    "count distinct",
    "min",
    "max",
    "first",
    "last",
    "med",
    "dev",
    "sdev",
    "var",
    "svar",
    "prd",
    "any",
    "all",
]

# q aggregates over a second column, e.g. `Size wavg Price`. Advertised via
# `AggSpec::Multiple`, which the UI expands to one entry per column of the
# named type.
NUMBER_MULTI_AGGS = [
    "wavg",
    "wsum",
    "cor",
    "cov",
]

# `min`/`max` are defined for q temporals but not for symbols.
TEMPORAL_AGGS = [
    "count",
    "count distinct",
    "min",
    "max",
    "first",
    "last",
]

STRING_AGGS = [
    "count",
    "count distinct",
    "first",
    "last",
]

# `sum` over booleans counts the trues — a q idiom worth surfacing.
BOOLEAN_AGGS = [
    "count",
    "count distinct",
    "first",
    "last",
    "any",
    "all",
    "sum",
]

AGGREGATES = set(
    NUMBER_AGGS + NUMBER_MULTI_AGGS + TEMPORAL_AGGS + STRING_AGGS + BOOLEAN_AGGS
)

# `AggSpec::Multiple` — the extra argument is a numeric column, which the UI
# expands into one menu entry per matching column.
NUMBER_MULTI_AGGS_SPEC = [[name, ["float"]] for name in NUMBER_MULTI_AGGS]

# Aggregates whose q spelling is more than one primitive. Everything else is
# emitted as the q name itself, so this table stays at the exceptions.
AGGREGATE_CHAINS = {
    "count distinct": ("count", "distinct"),
}

# Comparison operators keep Perspective's spelling of q's `=` and `<>`: they
# are the UI's shared operator vocabulary — the value editor, the arity rules
# and the string autocomplete are all keyed off these exact strings — and they
# denote the same thing in both languages. The *predicates* below are where
# the data model shows: `like` is q's, with q's wildcards.
FILTER_OPS = [
    "==",
    "!=",
    ">=",
    "<=",
    ">",
    "<",
    "in",
    "not in",
]

STRING_FILTER_OPS = FILTER_OPS + ["like"]

# Window aggregates are q's own primitives, by their q names. A q developer
# reads `mdev` and knows it is a moving *population* deviation; spelling it
# `stddev` would both rename it and misdescribe it.
#
# q's moving verbs take a frame; its running verbs are the cumulative case of
# the same aggregate, so `msum`/`sums` are one entry with two spellings (see
# `WINDOW_VERBS`) rather than two menu items. `range` frames are absent
# throughout: q has no range-framed primitive, which would need an as-of `wj`.
FRAMES = ["rows", "cumulative"]

WINDOW_AGGREGATES = [
    {"name": "msum", "frames": FRAMES},
    {"name": "mavg", "frames": FRAMES, "result_type": "float"},
    {"name": "mcount", "frames": FRAMES, "result_type": "float"},
    {"name": "mmin", "frames": FRAMES},
    {"name": "mmax", "frames": FRAMES},
    {"name": "mdev", "frames": FRAMES, "result_type": "float"},
    {"name": "mvar", "frames": FRAMES, "result_type": "float"},
    {"name": "first", "frames": FRAMES},
    {"name": "xprev", "offset": True},
    {"name": "xnext", "offset": True},
    {"name": "deltas", "offset": True},
    {"name": "ema", "alpha": True, "result_type": "float"},
]

# `mmin`/`mmax` are defined for q temporals but not for symbols, and the
# arithmetic ones for neither.
WINDOW_AGGREGATES_TEMPORAL = [
    {"name": "mcount", "frames": FRAMES, "result_type": "float"},
    {"name": "mmin", "frames": FRAMES},
    {"name": "mmax", "frames": FRAMES},
    {"name": "first", "frames": FRAMES},
    {"name": "xprev", "offset": True},
    {"name": "xnext", "offset": True},
]

WINDOW_AGGREGATES_ANY = [
    {"name": "mcount", "frames": FRAMES, "result_type": "float"},
    {"name": "first", "frames": FRAMES},
    {"name": "xprev", "offset": True},
    {"name": "xnext", "offset": True},
]

# Each q window aggregate as its (running, moving) pair of primitives — the
# cumulative frame takes the first, a `rows` frame the second.
WINDOW_VERBS = {
    "msum": ("sums", "msum"),
    "mavg": ("avgs", "mavg"),
    "mmin": ("mins", "mmin"),
    "mmax": ("maxs", "mmax"),
}

# The scratch column that restores a window's source ordering. A window's
# `order_by` orders rows within the frame only — it must not reorder the view.
WINDOW_INDEX = "pspIdx"

# The lambda parameter a windowed source is bound to, so the levels of a
# rollup share one computation of it.
WINDOW_SOURCE = "pspSrc"

# `meta`'s type character -> Perspective `ColumnType`. Upper case is the list
# variant of the same type; only `C` (a column of strings) is meaningful as a
# Perspective column. Types with no Perspective analogue are projected through
# a cast (see `TO_STRING` / `TO_DATE` / `TO_TIMESTAMP`) so the declared type
# and the type q actually yields cannot drift.
TYPES = {
    "b": "boolean",
    "x": "integer",
    "h": "integer",
    "i": "integer",
    # `j` is 64-bit; like DuckDB's `BIGINT` it maps to `float` because
    # Perspective's `integer` is 32-bit.
    "j": "float",
    "e": "float",
    "f": "float",
    "c": "string",
    "C": "string",
    "s": "string",
    "g": "string",
    "p": "datetime",
    "z": "datetime",
    "d": "date",
    "m": "date",
    "n": "string",
    "u": "string",
    "v": "string",
    "t": "string",
}

# Projections applied to source columns whose q type has no Perspective
# analogue, keeping `TYPES` honest about what lands in the Arrow payload.
TO_STRING = set("gnuvtc")
TO_DATE = {"m"}
TO_TIMESTAMP = {"z"}

# `q` nulls are in-band sentinel values, not a validity bitmap. Rollup levels
# pad the row-path columns they don't fill, and the pad must be typed or the
# level tables won't concatenate.
NULLS = {
    "b": "0b",
    "x": "0x00",
    "h": "0Nh",
    "i": "0Ni",
    "j": "0Nj",
    "e": "0Ne",
    "f": "0n",
    "c": '" "',
    "C": '""',
    "s": "`",
    "g": "0Ng",
    "p": "0Np",
    "z": "0Nz",
    "d": "0Nd",
    "m": "0Nm",
    "n": "0Nn",
    "u": "0Nu",
    "v": "0Nv",
    "t": "0Nt",
}

# Views are materialized as globals under a dedicated namespace so a failed
# `view_delete` can never collide with user state.
NAMESPACE = ".psp"

# Internal column names. They are q-legal identifiers (Perspective's
# `__ROW_PATH_0__` is not — q identifiers must start with a letter), and are
# renamed to the wire names in `view_get_data`.
GROUPING_ID = "pspGid"
ROW_PATH = "pspRp{}"
DEPTH = "pspOrd{}"
SORT = "pspSrt{}"
ANCESTOR = "pspAnc{}_{}"

IDENTIFIER = re.compile(r"^[a-zA-Z][a-zA-Z0-9_]*$")

STRING_ESCAPES = {
    "\\": "\\\\",
    '"': '\\"',
    "\n": "\\n",
    "\r": "\\r",
    "\t": "\\t",
}


class KdbVirtualSession:
    def __init__(self, callback, db):
        self.session = perspective.VirtualServer(KdbVirtualServerHandler(db))
        self.callback = callback

    def handle_request(self, msg):
        self.callback(self.session.handle_request(msg))


class KdbVirtualServer:
    def __init__(self, db):
        self.db = db

    def new_session(self, callback):
        return KdbVirtualSession(callback, self.db)


class KdbVirtualServerHandler(VirtualServerHandler):
    """
    An implementation of a `perspective.VirtualServerHandler` for kdb+.

    `db` is a callable which evaluates a q expression and returns a PyKX
    object, e.g. a `pykx.SyncQConnection`. The connected q process must accept
    global assignment, as views are materialized as globals under `.psp`.
    """

    def __init__(self, db):
        self.db = db
        self.views = {}
        self.schemas = {}
        self.counter = 0

    def get_features(self):
        return {
            "group_by": True,
            # Phase 2 — the pivot idiom and its `|`-joined column naming are
            # not implemented yet.
            "split_by": False,
            "sort": True,
            # Expressions are q, passed through verbatim — there is no ExprTK
            # translation, so the expression language here is q's. Note this
            # executes client-authored q in the connected process (as the SQL
            # handlers execute client-authored SQL); turn it off if that is
            # not an acceptable trust boundary for a deployment.
            "expressions": True,
            "group_rollup_mode": ["rollup", "flat", "total"],
            "filter_ops": {
                "integer": FILTER_OPS,
                "float": FILTER_OPS,
                "boolean": FILTER_OPS,
                "date": FILTER_OPS,
                "datetime": FILTER_OPS,
                "string": STRING_FILTER_OPS,
            },
            "aggregates": {
                "integer": NUMBER_AGGS + NUMBER_MULTI_AGGS_SPEC,
                "float": NUMBER_AGGS + NUMBER_MULTI_AGGS_SPEC,
                "string": STRING_AGGS,
                "boolean": BOOLEAN_AGGS,
                "date": TEMPORAL_AGGS,
                "datetime": TEMPORAL_AGGS,
            },
            "window_aggregates": {
                "integer": WINDOW_AGGREGATES,
                "float": WINDOW_AGGREGATES,
                "date": WINDOW_AGGREGATES_TEMPORAL,
                "datetime": WINDOW_AGGREGATES_TEMPORAL,
                "string": WINDOW_AGGREGATES_ANY,
                "boolean": WINDOW_AGGREGATES_ANY,
            },
        }

    def get_hosted_tables(self):
        return [to_str(x) for x in to_py(run_query(self.db, q_hosted_tables()))]

    def table_schema(self, table_name, config=None):
        return {
            name: TYPES[type_char]
            for name, type_char in self.q_schema(table_name).items()
        }

    def table_size(self, table_name):
        return int(to_py(run_query(self.db, q_table_size(table_name))))

    def view_schema(self, view_name, config=None):
        view = self.views.get(view_name)
        if view is None:
            return self.table_schema(view_name)
        return view["schema"]

    def view_size(self, view_name):
        view = self.views.get(view_name)
        if view is None:
            return self.table_size(view_name)
        return int(to_py(run_query(self.db, f"count {view['expression']}")))

    def view_column_size(self, view_name, config=None):
        view = self.views.get(view_name)
        if view is None:
            return len(self.table_schema(view_name))
        return len(view["schema"])

    def table_validate_expression(self, table_name, expression):
        """Type a q expression by asking q, which is also what rejects it —
        an unparseable or ill-typed expression raises, and the UI renders the
        q error against the offending expression."""
        return TYPES[self.expression_types(table_name, {"x": expression})["x"]]

    def table_make_view(self, table_name, view_name, config):
        expressions = config.get("expressions") or {}
        cols = Columns(
            self.q_schema(table_name),
            expressions,
            self.expression_types(table_name, expressions),
        )

        # A window alias is an ordinary column of the windowed source by the
        # time anything downstream sees it, so folding its type into the
        # source schema is all that is needed to make it groupable,
        # filterable and sortable.
        windows = window_specs(config)
        if windows:
            cols = Columns(
                {**cols.q_types, **self.window_types(table_name, windows, cols)},
                expressions,
                cols.expression_types,
            )

        self.counter += 1
        q_name = f"v{self.counter}_{sanitize(view_name)}"
        expression = f"{NAMESPACE}.{q_name}"
        query, columns = q_table_make_view(table_name, expression, config, cols)
        run_query(self.db, query)

        # The view's own `meta` types it, not the source table's: an aggregate
        # changes a column's type (`count` over symbols is a long), and an
        # expression column has no source column at all.
        view_types = self.meta(expression)
        self.views[view_name] = {
            "q_name": q_name,
            "table": table_name,
            "expression": expression,
            "columns": columns,
            "schema": {c: TYPES[view_types[c]] for c in columns},
            "group_by": list(config.get("group_by") or []),
            "flat": (config.get("group_rollup_mode") or "rollup") == "flat",
        }

    def view_delete(self, view_name):
        view = self.views.pop(view_name, None)
        if view is not None:
            run_query(self.db, q_view_delete(view["q_name"]))

    def view_get_min_max(self, view_name, column_name, config=None):
        view = self.views.get(view_name)
        if view is None:
            return (None, None)

        # A view column is an aggregate of the source column of the same name,
        # so the source table's `meta` is what types it — the view itself is a
        # `.psp` global, not something `meta` can be asked about by view id.
        type_char = self.q_schema(view["table"]).get(column_name)
        if type_char is None:
            return (None, None)

        query = q_view_min_max(view["expression"], column_name, type_char)
        if query is None:
            return (None, None)

        low, high = to_py(run_query(self.db, query))
        return (scrub_scalar(low), scrub_scalar(high))

    def view_get_data(self, view_name, config, schema, viewport, data):
        view = self.views.get(view_name)
        if view is None:
            return

        columns = [c for c in view["columns"] if c in schema]
        start_col = viewport.get("start_col") or 0
        end_col = viewport.get("end_col")
        columns = (
            columns[start_col:end_col] if end_col is not None else columns[start_col:]
        )

        start_row = viewport.get("start_row") or 0
        end_row = viewport.get("end_row")
        if end_row is None:
            end_row = self.view_size(view_name)

        length = end_row - start_row
        if length <= 0:
            return

        markers = marker_columns(len(view["group_by"]), view["flat"])
        query = q_view_slice(view["expression"], markers + columns, start_row, length)

        arrow_table = to_arrow(run_query(self.db, query))
        arrow_table = scrub_nulls(arrow_table)
        arrow_table = rename_markers(arrow_table, len(view["group_by"]))

        buf = io.BytesIO()
        with ipc.new_stream(buf, arrow_table.schema) as writer:
            writer.write_table(arrow_table)
        data.from_arrow_ipc(buf.getvalue())

    ############################################################################
    #
    # Internals

    def meta(self, table):
        """`{column: q type char}` for any table expression."""
        names, type_chars = to_py(run_query(self.db, q_meta(table)))
        return {
            to_str(name): type_char
            for name, type_char in zip(names, to_type_chars(type_chars))
        }

    def q_schema(self, table_name):
        """The source table's q `meta`, memoized — every query builder needs
        it to type its literals, casts and row-path padding."""
        if table_name not in self.schemas:
            self.schemas[table_name] = {
                name: type_char
                for name, type_char in self.meta(q_symbol(table_name)).items()
                if not name.startswith("__")
            }

        return self.schemas[table_name]

    def expression_types(self, table_name, expressions):
        """Type every expression alias in one round trip, by projecting them
        over a one-row sample and reading the result's `meta`."""
        if not expressions:
            return {}

        query = q_expression_types(table_name, expressions)
        type_chars = to_type_chars(to_py(run_query(self.db, query)))
        return dict(zip(expressions, type_chars))

    def window_types(self, table_name, windows, cols):
        """Type every window alias in one round trip. Window aggregates are
        row-count independent in *type*, so a one-row sample suffices."""
        query = q_window_types(table_name, windows, cols)
        type_chars = to_type_chars(to_py(run_query(self.db, query)))
        return dict(zip([alias for alias, _ in windows], type_chars))


################################################################################
#
# q literals
#
# `q` has no bound parameters, so every literal is emitted through these — they
# are the injection boundary. Identifiers become symbols (never code), and
# strings are escaped.


def q_string(value):
    """A q char-list literal."""
    out = "".join(STRING_ESCAPES.get(c, c) for c in str(value))
    return f'"{out}"'


def q_symbol(name):
    """A q symbol literal, spelled `` `name `` when q's identifier grammar
    allows it (Perspective column names like `"Product Name"` do not)."""
    if IDENTIFIER.match(name):
        return f"`{name}"
    return f"`${q_string(name)}"


def q_list(items):
    """A q list literal, handling the singleton `enlist` case. The parens are
    load-bearing — q applies right-to-left, so an unparenthesized
    `enlist x` would swallow whatever follows it."""
    if not items:
        return "()"
    if len(items) == 1:
        return f"(enlist {items[0]})"
    return "({})".format(";".join(items))


def q_dict(names, values):
    """A q dictionary literal, as taken by functional select's `by` and
    aggregate arguments."""
    if not names:
        return "()!()"
    return f"{q_list(names)}!{q_list(values)}"


def q_number(value, type_char):
    """A numeric literal typed to survive comparison against `type_char`."""
    if type_char in "ef":
        return repr(float(value))
    return str(int(value))


def q_temporal(value, type_char):
    """A date or timestamp literal, emitted as epoch arithmetic so no
    formatting or locale can come between Python and q. Perspective sends
    temporal filter operands as epoch milliseconds."""
    ms = to_epoch_ms(value)
    if ms is None:
        return None
    if type_char in ("d", "m"):
        return f"(1970.01.01+{ms // 86_400_000})"
    return f"(1970.01.01D00:00:00.000000000+{ms * 1_000_000})"


def to_epoch_ms(value):
    """Coerce a Perspective filter operand to epoch milliseconds. `Scalar` is
    a float for temporals, but ISO-8601 strings are accepted too."""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, datetime):
        return int(value.timestamp() * 1000)
    if isinstance(value, date):
        return int(datetime(value.year, value.month, value.day).timestamp() * 1000)
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
        return int(parsed.timestamp() * 1000)

    return None


class Columns:
    """What every builder needs to know about a name: its q type, and — if it
    is an expression alias rather than a real column — the q it stands for.

    Expression aliases shadow source columns of the same name, matching the
    SQL handlers, where `col_name` resolves an alias before quoting it as an
    identifier.
    """

    def __init__(self, q_types, expressions=None, expression_types=None):
        self.q_types = q_types
        self.expressions = expressions or {}
        self.expression_types = expression_types or {}

    def expression(self, column):
        return self.expressions.get(column)

    def type_char(self, column):
        if column in self.expressions:
            return self.expression_types.get(column, "")
        return self.q_types.get(column, "")

    def psp_type(self, column):
        return TYPES.get(self.type_char(column), "string")

    def null(self, column):
        return NULLS[projected_type(self.type_char(column) or "s")]

    def names(self):
        return [c for c in self.q_types if c not in self.expressions]


def q_column(column, cols):
    """The parse-tree expression for a column, applying the cast that makes
    q's type match the one `TYPES` declares.

    An expression alias passes its q through verbatim via `parse`, which is
    what turns expression *text* into the parse tree functional qSQL takes —
    the same pass-through the SQL handlers do by inlining the fragment.
    """
    expression = cols.expression(column)
    if expression is not None:
        return f"(parse {q_string(expression)})"

    type_char = cols.type_char(column)
    symbol = q_symbol(column)
    if type_char in TO_STRING:
        return f"(string;{symbol})"
    if type_char in TO_DATE:
        return f'($;"d";{symbol})'
    if type_char in TO_TIMESTAMP:
        return f'($;"p";{symbol})'
    return symbol


def projected_type(type_char):
    """The q type a column has *after* `q_column`'s cast — the type a row-path
    pad has to match for the rollup levels to concatenate."""
    if type_char in TO_STRING:
        return "C"
    if type_char in TO_DATE:
        return "d"
    if type_char in TO_TIMESTAMP:
        return "p"
    return type_char


def q_aggregate(aggregate, column, cols):
    """An aggregate parse tree over a column.

    The advertised name *is* the q primitive, so it is emitted as written;
    `AGGREGATE_CHAINS` covers only the spellings that are more than one
    primitive. Validating against the advertised set keeps this from becoming
    a way to name arbitrary q functions.
    """
    arguments = []
    if isinstance(aggregate, (list, tuple)):
        # `Aggregate::MultiAggregate` — `["wavg", ["Size"]]`.
        arguments = list(aggregate[1] or []) if len(aggregate) > 1 else []
        aggregate = aggregate[0] if aggregate else "count"

    aggregate = str(aggregate)
    if aggregate not in AGGREGATES:
        msg = f"Unknown aggregate '{aggregate}'"
        raise ValueError(msg)

    tree = q_column(column, cols)
    if arguments:
        # A binary q aggregate, whose left argument is the weight or the
        # second series: `Size wavg Price`.
        return f"({aggregate};{q_column(arguments[0], cols)};{tree})"

    for name in reversed(AGGREGATE_CHAINS.get(aggregate, (aggregate,))):
        tree = f"({name};{tree})"

    return tree


################################################################################
#
# q query builders
#
# Every builder is a pure `args -> q source` function so the emitted q can be
# asserted against goldens without a q process or a license.


def q_hosted_tables():
    return "tables[]"


def q_meta(table):
    """`meta` as a `(names; types)` pair rather than as a table, so the result
    has one unambiguous shape to unpack regardless of how PyKX orients a q
    table."""
    return f"{{[m] (m`c;m`t)}}[0!meta {table}]"


def q_table_schema(table_name):
    return q_meta(q_symbol(table_name))


def q_expression_types(table_name, expressions):
    """The q type char of each expression alias, in declaration order.

    Projecting over `1 sublist` keeps this cheap — expressions are row-wise,
    so one row types them as well as the whole table does, and an empty table
    still yields typed empty vectors.
    """
    probe = q_select(
        f"(1 sublist get {q_symbol(table_name)})",
        [],
        "0b",
        q_dict(
            [q_symbol(alias) for alias in expressions],
            [f"(parse {q_string(text)})" for text in expressions.values()],
        ),
    )

    return f"{{[m] m`t}}[0!meta {probe}]"


def q_table_size(table_name):
    return f"count get {q_symbol(table_name)}"


def q_select(table, constraints, by, aggregates):
    """Functional `?[t;c;b;a]`. Perspective's column names are not q
    identifiers, so the text form of qSQL is unavailable to us."""
    return f"?[{table};{q_list(constraints)};{by};{aggregates}]"


def q_constraints(config, cols):
    """`where` clauses for a view config's filters."""
    constraints = []
    for entry in config.get("filter") or []:
        column, op = entry[0], entry[1]
        value = entry[2] if len(entry) > 2 else None
        constraint = q_constraint(column, op, value, cols)
        if constraint is not None:
            constraints.append(constraint)

    return constraints


def q_literal(value, type_char, psp_type):
    """A filter operand as a q literal of the column's type."""
    if psp_type == "boolean":
        return "1b" if value else "0b"
    if psp_type in ("date", "datetime"):
        return q_temporal(value, type_char)
    if psp_type == "string":
        # Symbols are what kdb+ string columns overwhelmingly are, and an
        # unknown type is assumed to be one — the char-list handling would be
        # actively wrong against a symbol column.
        if type_char in ("s", ""):
            return q_symbol(str(value))
        return q_string(value)

    return q_number(value, type_char)


def q_constraint(column, op, value, cols):
    type_char = cols.type_char(column)
    psp_type = TYPES.get(type_char, "string")
    expression = q_column(column, cols)

    if op in ("in", "not in"):
        # q's `in` takes a vector, which is also a parse-tree constant — no
        # `enlist` dance needed once there is more than one value.
        if not isinstance(value, (list, tuple)) or not value:
            return None

        literals = [q_literal(v, type_char, psp_type) for v in value]
        if any(literal is None for literal in literals):
            return None

        match = f"(in;{expression};{q_list(literals)})"
        return match if op == "in" else f"(not;{match})"

    if value is None or isinstance(value, (list, tuple)):
        # A null operand would be `is null`, which is not advertised; a list
        # operand only means `in`.
        return None

    if psp_type == "string":
        return q_string_constraint(expression, op, value, type_char)

    literal = q_literal(value, type_char, psp_type)
    if literal is None:
        return None

    operator = {"==": "=", "!=": "<>"}.get(op, op)
    if operator not in ("=", "<>", "<", ">", "<=", ">="):
        return None

    return f"({operator};{expression};{literal})"


def q_string_constraint(expression, op, value, type_char):
    """String comparisons in q are not the scalar comparisons they look like:
    `=` over a column of char lists compares character-wise, and a symbol
    constant must be enlisted to distinguish it from a column reference.
    """
    is_symbol = type_char in ("s", "")
    if op == "like":
        # q's `like`, taking q's pattern language — `*` and `?`, not SQL's
        # `%` and `_`. The pattern is the user's, passed through as written.
        return f"(like;{expression};{q_string(value)})"

    if op in ("==", "!="):
        # `in` rather than `=`, which would compare char lists element-wise.
        literal = q_literal(value, type_char, "string")
        match = f"(in;{expression};enlist {literal})"
        return match if op == "==" else f"(not;{match})"

    if op not in ("<", ">", "<=", ">="):
        return None

    # Only symbols order lexicographically; char lists compare element-wise,
    # so cast through a lambda — inside one, `` `$ `` is ordinary q and not a
    # parse-tree column reference.
    if not is_symbol:
        expression = f"({{[x] `$x}};{expression})"

    return f"({op};{expression};enlist {q_symbol(str(value))})"


def q_view_delete(q_name):
    """Deleting a view is best-effort — the UI recovers from a missing one, so
    a protected evaluation is preferable to an error."""
    return f"@[{{![`{NAMESPACE};();0b;enlist x]}};{q_symbol(q_name)};()]"


def q_view_slice(expression, columns, start_row, length):
    symbols = q_list([q_symbol(c) for c in columns])
    return f"{symbols}#({start_row};{length}) sublist {expression}"


def q_view_min_max(expression, column, type_char):
    """`min`/`max` as a float pair. Perspective's `Scalar` has no temporal
    variant, so temporals are projected to epoch milliseconds rather than
    silently degrading to null on the way through `py_to_scalar`."""
    psp_type = TYPES.get(type_char, "string")
    if psp_type == "string":
        return None

    if psp_type == "date":
        scale = '(`float$"j"$v)*86400000'
    elif psp_type == "datetime":
        scale = '(`float$"j"$v)%1e6'
    else:
        scale = "`float$v"

    # `flip` unwraps the table to its column dictionary, so the symbol lookup
    # is unambiguously a column and not a row index.
    column_expression = f"flip[{expression}][{q_symbol(column)}]"
    return f"{{[c] {{[v] {scale}}} each (min c;max c)}}[{column_expression}]"


def marker_columns(group_by_len, is_flat):
    """The metadata columns `VirtualDataSlice` reads back out of the payload.
    Flat mode carries no `__GROUPING_ID__` — every row is a leaf."""
    if group_by_len == 0:
        return []
    markers = [] if is_flat else [GROUPING_ID]
    return markers + [ROW_PATH.format(i) for i in range(group_by_len)]


def sort_specs(config):
    """The active row sorts. `col ...` directions sort split-by columns, which
    this handler does not advertise."""
    specs = []
    for column, direction in config.get("sort") or []:
        if direction == "none" or direction.startswith("col "):
            continue
        specs.append(
            (
                column,
                "desc" if direction.startswith("desc") else "asc",
                direction.endswith("abs"),
            )
        )

    return specs


def q_sort(expression, keys):
    """Apply an ordering tuple. q's sorts are stable and it evaluates
    right-to-left, so emitting the keys in tuple order gives the leftmost key
    the highest precedence."""
    if not keys:
        return expression

    runs = []
    for name, direction in keys:
        if runs and runs[-1][0] == direction:
            runs[-1][1].append(name)
        else:
            runs.append((direction, [name]))

    for direction, names in reversed(runs):
        verb = "xasc" if direction == "asc" else "xdesc"
        symbols = q_list([q_symbol(n) for n in names])
        expression = f"{symbols} {verb} {expression}"

    return expression


def window_specs(config):
    """A config's windows, sorted by alias so the emitted q is
    deterministic — the map itself is unordered."""
    return sorted((config.get("windows") or {}).items())


def window_frame(spec):
    """The q window width, or `None` for a cumulative frame.

    Perspective frames `rows` *preceding* plus the current row, so a q window
    — which counts the current row as one of its `n` — is one wider.
    """
    if spec.get("range") is not None:
        raise ValueError(
            "window `range` frames are not supported by the kdb+ handler; q has no "
            "range-framed primitive (an as-of `wj` would be required)"
        )

    rows = spec.get("rows")
    return None if rows is None else int(rows) + 1


def q_window_accumulate(operand, verbs, width):
    """Apply a window's (cumulative, moving) verb pair to an operand."""
    cumulative, moving = verbs
    if width is None:
        return f"{cumulative} {operand}"
    return f"{width} {moving} {operand}"


def q_window_body(spec):
    """A window aggregate as q over the bound source vector `v`."""
    aggregate = spec.get("aggregate")
    width = window_frame(spec)
    offset = int(spec.get("offset") or 1)

    if aggregate in WINDOW_VERBS:
        return q_window_accumulate("v", WINDOW_VERBS[aggregate], width)

    if aggregate == "mcount":
        # `mcount` counts the non-nulls in each window; the running case has
        # no primitive, so it accumulates the same predicate.
        if width is not None:
            return f"{width} mcount v"
        return "sums `long$not null v"

    if aggregate in ("mdev", "mvar"):
        # `mdev` is a population statistic, and `mvar` is its square — q has
        # no moving-variance primitive, and no running form of either, so the
        # cumulative case is derived to agree with `mdev`.
        if width is not None:
            deviation = f"{width} mdev v"
            return deviation if aggregate == "mdev" else f"{{[d] d*d}} {deviation}"

        sums = "sums v"
        squares = "sums (v*v)"
        counts = "sums (`long$not null v)"
        variance = f"{{[s1;s2;n] (s2%n)-(s1%n) xexp 2}}[{sums};{squares};{counts}]"
        return variance if aggregate == "mvar" else f"sqrt {variance}"

    if aggregate == "first":
        # The earliest row still inside the frame — index arithmetic, which is
        # null-safe in a way that an `xprev`-and-patch would not be.
        if width is not None:
            return f"v 0|(til count v)-{width - 1}"
        return "first v"

    if aggregate == "xprev":
        return f"{offset} xprev v"

    if aggregate == "xnext":
        # q has no `xnext` primitive; a negative shift is one.
        return f"{-offset} xprev v"

    if aggregate == "deltas":
        # `deltas` is the 1-step difference; the general offset spells out.
        return "deltas v" if offset == 1 else f"v-{offset} xprev v"

    if aggregate == "ema":
        alpha = spec.get("alpha")
        if alpha is None:
            raise ValueError("window `ema` requires an `alpha`")
        return f"{float(alpha)!r} ema v"

    msg = f"Unknown window aggregate '{aggregate}'"
    raise ValueError(msg)


def q_window(spec, cols):
    """One window as a parse tree: a q lambda applied to its source column.

    A lambda rather than an inline parse tree because inside one the body is
    ordinary q — no `enlist`-the-constant rules, and the source vector is
    bound once however many times the aggregate needs it.
    """
    return f"({{[v] {q_window_body(spec)}}};{q_column(spec['column'], cols)})"


def q_windows(table, windows, cols):
    """Extend `table` with a column per window.

    Windows are computed on the source, before filtering and grouping, so a
    window alias is an ordinary column everywhere downstream — mirroring the
    SQL translation's `__PSP_WINDOW_SRC__` subquery.

    Windows sharing a partition and an ordering are computed in one pass, and
    an ordered pass sorts the source, computes, then restores the original
    row order: `order_by` orders rows within the frame, not the view.
    """
    if not windows:
        return table

    groups = {}
    for alias, spec in windows:
        order_by = spec.get("order_by")
        key = (
            tuple(order_by) if order_by else None,
            tuple(spec.get("partition_by") or []),
        )
        groups.setdefault(key, []).append((alias, spec))

    ordered = any(order_by for order_by, _ in groups)
    if ordered:
        table = q_update(table, [WINDOW_INDEX], ["`i"])

    for (order_by, partition_by), specs in groups.items():
        if order_by:
            column, direction = order_by
            table = q_sort(table, [(column, direction)])

        by = (
            q_dict(
                [q_symbol(c) for c in partition_by],
                [q_column(c, cols) for c in partition_by],
            )
            if partition_by
            else "0b"
        )

        # `update ... by ...` broadcasts within each partition and preserves
        # row order, which `select ... by ...` would not.
        table = q_update(
            table,
            [alias for alias, _ in specs],
            [q_window(spec, cols) for _, spec in specs],
            by,
        )

        if order_by:
            table = q_sort(table, [(WINDOW_INDEX, "asc")])

    if ordered:
        table = q_drop(table, [WINDOW_INDEX])

    return table


def q_window_types(table_name, windows, cols):
    """The q type char of each window alias, in sorted-alias order. Typing is
    row-count independent, so a one-row sample is enough."""
    source = q_windows(f"(1 sublist get {q_symbol(table_name)})", windows, cols)
    aliases = q_list([q_symbol(alias) for alias, _ in windows])
    return f"{{[m] m`t}}[0!meta {aliases}#{source}]"


def q_update(table, names, values, by="0b"):
    """Functional update, adding or replacing columns."""
    dictionary = q_dict([q_symbol(n) for n in names], values)
    return f"![{table};();{by};{dictionary}]"


def q_set(target, expression, table_name, windows, cols):
    """The statement materializing a view as a global.

    With windows, the view query is wrapped in a lambda taking the windowed
    source, so however many times the query references it — once per rollup
    level — the windows are computed once.
    """
    if not windows:
        return f"{target} set {expression};"

    source = q_windows(f"(get {q_symbol(table_name)})", windows, cols)
    return f"{target} set {{[{WINDOW_SOURCE}] {expression}}}[{source}];"


def q_table_make_view(table_name, target, config, cols):
    """Materialize a view as a global, returning `(statement, columns)`.

    A rollup is `n + 1` grouped selects — one per level — padded to a common
    schema and concatenated, which is how a `GROUP BY ROLLUP` is spelled in a
    language that has no `GROUPING SETS`.
    """
    columns = [c for c in (config.get("columns") or []) if c]
    group_by = list(config.get("group_by") or [])
    mode = config.get("group_rollup_mode") or "rollup"
    aggregates = config.get("aggregates") or {}
    sorts = sort_specs(config)
    constraints = q_constraints(config, cols)
    windows = window_specs(config)

    # A rollup references its source once per level, so a windowed source is
    # bound as a lambda argument rather than inlined — otherwise every level
    # would recompute the windows.
    table = WINDOW_SOURCE if windows else q_symbol(table_name)

    if not columns:
        columns = [c for c in cols.names() if c not in group_by]

    is_total = mode == "total"
    is_flat = mode == "flat"
    grouped = bool(group_by)
    levels = []

    if not grouped:
        # A flat or total select is a single level with no metadata columns.
        if is_total:
            selects = {c: q_aggregate_for(c, aggregates, cols) for c in columns}
        else:
            selects = {c: q_column(c, cols) for c in columns}

        sort_selects = {
            SORT.format(j): q_sort_expression(
                column, is_abs, aggregates, cols, aggregate=is_total
            )
            for j, (column, _, is_abs) in enumerate(sorts)
        }
        selects.update(sort_selects)
        expression = q_select(
            table,
            constraints,
            "0b",
            q_dict(
                [q_symbol(c) for c in selects],
                list(selects.values()),
            ),
        )

        keys = (
            []
            if is_total
            else [(SORT.format(j), d) for j, (_, d, _) in enumerate(sorts)]
        )
        expression = q_sort(expression, keys)
        expression = q_drop(expression, list(sort_selects))
        expression = q_reorder(expression, columns)
        return (q_set(target, expression, table_name, windows, cols), columns)

    n = len(group_by)
    depth_levels = [n] if is_flat else range(n + 1)
    for k in depth_levels:
        levels.append(
            q_level(
                table,
                constraints,
                aggregates,
                cols,
                group_by,
                columns,
                sorts,
                k,
                n,
                is_flat,
            )
        )

    expression = f"raze {q_list(levels)}" if len(levels) > 1 else levels[0]

    # Sibling groups must sort as blocks, which means ordering a row by its
    # ancestors' aggregates before its own — the ancestor's value lives in the
    # level table one deeper than the ordering key, so join it back on.
    if sorts:
        for i in range(n - 1):
            ancestors = q_ancestors(
                table, constraints, aggregates, cols, group_by, sorts, i
            )
            expression = f"({expression}) lj ({ancestors})"

    keys = []
    for i in range(n):
        if not is_flat:
            keys.append((DEPTH.format(i), "asc"))
        for j, (_, direction, _) in enumerate(sorts):
            name = SORT.format(j) if i == n - 1 else ANCESTOR.format(i, j)
            keys.append((name, direction))
        keys.append((ROW_PATH.format(i), "asc"))

    expression = q_sort(expression, keys)

    helpers = [SORT.format(j) for j in range(len(sorts))]
    if not is_flat:
        helpers += [DEPTH.format(i) for i in range(n)]
    if sorts:
        helpers += [
            ANCESTOR.format(i, j) for i in range(n - 1) for j in range(len(sorts))
        ]

    expression = q_drop(expression, helpers)
    expression = q_reorder(expression, marker_columns(n, is_flat) + columns)
    return (q_set(target, expression, table_name, windows, cols), columns)


def q_level(
    table, constraints, aggregates, cols, group_by, columns, sorts, k, n, is_flat
):
    """One rollup level: grouped by the first `k` group-by columns, padded with
    typed nulls for the levels it does not reach."""
    by = q_dict(
        [q_symbol(ROW_PATH.format(i)) for i in range(k)],
        [q_column(group_by[i], cols) for i in range(k)],
    )

    selects = {c: q_aggregate_for(c, aggregates, cols) for c in columns}
    for j, (column, _, is_abs) in enumerate(sorts):
        selects[SORT.format(j)] = q_sort_expression(
            column, is_abs, aggregates, cols, aggregate=True
        )

    aggregate_dict = q_dict([q_symbol(c) for c in selects], list(selects.values()))
    # A `by` of `0b` with aggregate expressions collapses to the single total
    # row, which is exactly the `k == 0` level.
    expression = q_select(table, constraints, "0b" if k == 0 else by, aggregate_dict)
    if k > 0:
        expression = f"0!{expression}"

    pad_names = [ROW_PATH.format(i) for i in range(k, n)]
    pad_values = [cols.null(group_by[i]) for i in range(k, n)]
    order = marker_columns(n, is_flat)
    if not is_flat:
        # A `GROUPING_ID` bitmask over `n` columns with the trailing `n - k`
        # aggregated away — the encoding `VirtualDataSlice` decodes depth from.
        pad_names.append(GROUPING_ID)
        pad_values.append(str(2 ** (n - k) - 1))
        # How deep this row sits, clamped per level. Ordering by it ahead of
        # each level's key is what interleaves a subtotal before its children.
        pad_names += [DEPTH.format(i) for i in range(n)]
        pad_values += [str(min(k, i + 1)) for i in range(n)]
        order = order + [DEPTH.format(i) for i in range(n)]

    if pad_names:
        expression = q_pad(expression, pad_names, pad_values)

    return q_reorder(expression, order + list(selects))


def q_ancestors(table, constraints, aggregates, cols, group_by, sorts, i):
    """A keyed table of the level-`i + 1` sort aggregates, for `lj` onto the
    concatenated levels."""
    by = q_dict(
        [q_symbol(ROW_PATH.format(x)) for x in range(i + 1)],
        [q_column(group_by[x], cols) for x in range(i + 1)],
    )

    selects = {
        ANCESTOR.format(i, j): q_sort_expression(
            column, is_abs, aggregates, cols, aggregate=True
        )
        for j, (column, _, is_abs) in enumerate(sorts)
    }

    return q_select(
        table,
        constraints,
        by,
        q_dict([q_symbol(c) for c in selects], list(selects.values())),
    )


def q_aggregate_for(column, aggregates, cols):
    aggregate = aggregates.get(column)
    if aggregate is None:
        psp_type = cols.psp_type(column)
        aggregate = "sum" if psp_type in ("integer", "float") else "count"

    return q_aggregate(aggregate, column, cols)


def q_sort_expression(column, is_abs, aggregates, cols, aggregate):
    expression = q_column(column, cols)
    if aggregate:
        expression = q_aggregate_for(column, aggregates, cols)
    return f"(abs;{expression})" if is_abs else expression


def q_pad(expression, names, values):
    """Append constant metadata columns.

    Deliberately *not* a functional update: inside a parse tree a symbol is a
    column reference, so the symbol null a row-path pad needs would be read as
    a column named `""`. Building the columns inside a lambda keeps them
    literals, and `count[t]#` broadcasts them explicitly.
    """
    columns = q_dict([q_symbol(n) for n in names], [f"count[t]#{v}" for v in values])
    return f"{{[t] t,'flip {columns}}}[{expression}]"


def q_drop(expression, names):
    """Functional delete."""
    if not names:
        return expression
    return f"![{expression};();0b;{q_list([q_symbol(n) for n in names])}]"


def q_reorder(expression, columns):
    """`xcols` over the full column list, pinning an order the levels can be
    concatenated in."""
    if not columns:
        return expression
    return f"{q_list([q_symbol(c) for c in columns])} xcols {expression}"


def sanitize(view_name):
    """Perspective's view names are opaque; q's globals are identifiers."""
    return re.sub(r"[^A-Za-z0-9]", "_", view_name)[:32]


################################################################################
#
# kdb+ Utils


def run_query(db, query):
    query = " ".join(query.split())
    try:
        result = db(query)
    except Exception as e:
        logger.error(e)
        logger.error(f"{query}")
        raise e
    else:
        logger.debug(f"{query}")
        return result


def to_py(result):
    return result.py() if hasattr(result, "py") else result


def to_arrow(result):
    return result.pa() if hasattr(result, "pa") else result


def to_str(value):
    """PyKX yields symbols and chars as `bytes`."""
    if isinstance(value, bytes):
        return value.decode("utf-8")
    return str(value)


def to_type_chars(value):
    """Normalize a q char vector to a list of single-character strings. PyKX
    may hand one back as `bytes`, which iterates to the same chars once
    decoded."""
    if isinstance(value, (bytes, str)):
        return list(to_str(value))
    return [to_str(char) for char in value]


def scrub_scalar(value):
    """q's null and infinity sentinels are in-band, so a `min`/`max` of an
    empty or all-null column comes back as a sentinel rather than as null."""
    if value is None:
        return None
    value = float(value)
    if value != value or abs(value) == float("inf"):
        return None
    if abs(value) >= 9.0e18:
        return None
    return value


def scrub_nulls(arrow_table):
    """Replace q's in-band null sentinels with Arrow nulls.

    q has no validity bitmap — a null long *is* `INT64_MIN`. Perspective
    treats a value as missing only when the Arrow validity bit says so, so
    without this pass an empty cell renders as -9223372036854775808.
    """
    sentinels = {
        pa.int8(): -(2**7),
        pa.int16(): -(2**15),
        pa.int32(): -(2**31),
        pa.int64(): -(2**63),
    }

    columns = [scrub_column(column, sentinels) for column in arrow_table.columns]
    schema = pa.schema(
        [
            pa.field(name, column.type)
            for name, column in zip(arrow_table.column_names, columns)
        ]
    )

    return pa.Table.from_arrays(columns, schema=schema)


def scrub_column(column, sentinels):
    dtype = column.type

    if pa.types.is_dictionary(dtype):
        # Decode rather than re-encode: `VirtualDataSlice` dictionary-encodes
        # `Utf8` itself, so the round trip would buy nothing.
        column = column.cast(pa.string())
        dtype = column.type

    null = pa.scalar(None, type=dtype)

    if pa.types.is_floating(dtype):
        return pc.if_else(pc.is_nan(column), null, column)

    if dtype in sentinels:
        return pc.if_else(pc.equal(column, sentinels[dtype]), null, column)

    if pa.types.is_temporal(dtype):
        # `0Nd` / `0Np` are the minimum value of the underlying integer.
        width = 32 if pa.types.is_date32(dtype) or pa.types.is_time32(dtype) else 64
        underlying = pa.int32() if width == 32 else pa.int64()
        mask = pc.equal(column.cast(underlying, safe=False), -(2 ** (width - 1)))
        return pc.if_else(mask, null, column)

    if pa.types.is_string(dtype) or pa.types.is_large_string(dtype):
        # The empty symbol is q's symbol null.
        return pc.if_else(pc.equal(column, ""), null, column)

    return column


def rename_markers(arrow_table, group_by_len):
    """Rename the q-legal metadata columns to the names `VirtualDataSlice`
    looks for. q identifiers cannot start with an underscore, so the wire
    names can only be applied here."""
    if group_by_len == 0:
        return arrow_table

    renames = {GROUPING_ID: "__GROUPING_ID__"}
    for i in range(group_by_len):
        renames[ROW_PATH.format(i)] = f"__ROW_PATH_{i}__"

    return arrow_table.rename_columns(
        [renames.get(name, name) for name in arrow_table.column_names]
    )
