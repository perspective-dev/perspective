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

from random import random
from .viewer_traitlets import PerspectiveTraitlets
import perspective

# from .. import Server

# ─  │  ┌ ┬ ┐
# ┄  ┆  ├ ┼ ┤ ╲ ╱
# ┈  ┊  └ ┴ ┘
# ━  ┃  ┏ ┳ ┓ ┏ ┯ ┓ ┏ ┳ ┓ ┏ ┯ ┓
# ┅  ┇  ┣ ╋ ┫ ┣ ┿ ┫ ┠ ╂ ┨ ┠ ┼ ┨
# ┉  ┋  ┗ ┻ ┛ ┗ ┷ ┛ ┗ ┻ ┛ ┗ ┷ ┛

# global_server = PySyncServer()


class PerspectiveViewer(PerspectiveTraitlets, object):
    """PerspectiveViewer wraps the `perspective.Table` API and exposes an API
    around creating views, loading data, and updating data.
    """

    # Viewer attributes that should be saved in `save()` and restored using
    # `restore()`. Symmetric to `PERSISTENT_ATTRIBUTES` in `perspective-viewer`.
    PERSISTENT_ATTRIBUTES = (
        "group_by",
        "split_by",
        "filter",
        "sort",
        "aggregates",
        "columns",
        "expressions",
        "plugin",
        "plugin_config",
        "theme",
        "settings",
        "title",
        "version",
    )

    def __init__(
        self,
        plugin="Datagrid",
        columns=None,
        columns_config=None,
        group_by=None,
        split_by=None,
        group_rollup_mode=None,
        aggregates=None,
        sort=None,
        filter=None,
        expressions=None,
        plugin_config=None,
        settings=True,
        theme=None,
        title=None,
        # ignored, here for restore compatibility
        version=None,
    ):
        """Initialize an instance of `PerspectiveViewer` with the given viewer
        configuration.  Do not pass a `Table` or data into the constructor -
        use the :func:`load()` method to provide the viewer with data.

        Keyword Arguments:
            columns (:obj:`list` of :obj:`str`): A list of column names to be
                visible to the user.
            columns_config (:obj:`dict`): Per-column configuration (styling,
                formatting, etc.), keyed by column name.
            group_by (:obj:`list` of :obj:`str`): A list of column names to
                use as group by.
            split_by (:obj:`list` of :obj:`str`): A list of column names
                to use as split by.
            group_rollup_mode (:obj:`str`): How group-by rollups render; one
                of ``rollup``, ``flat``, or ``total``.
            aggregates (:obj:`dict` of :obj:`str` to :obj:`str`):  A dictionary
                of column names to aggregate types, which specify aggregates
                for individual columns.
            sort (:obj:`list` of :obj:`list` of :obj:`str`): A list of lists,
                each list containing a column name and a sort direction
                (``asc``, ``desc``, ``asc abs``, ``desc abs``, ``col asc``,
                ``col desc``, ``col asc abs``, ``col desc abs``).
            filter (:obj:`list` of :obj:`list` of :obj:`str`): A list of lists,
                each list containing a column name, a filter comparator, and a
                value to filter by.
            expressions (:obj:`list` of :obj:`str`): A list of string
                expressions which are applied to the view.
            plugin (:obj:`str`/:obj:`perspective.Plugin`): Which plugin to
                select by default.
            plugin_config (:obj:`dict`): A configuration for the plugin, i.e.
                the datagrid plugin or a chart plugin.
            settings(:obj:`bool`): Whether the perspective query settings
                panel should be open.
            theme (:obj:`str`): The color theme to use.
            version (:obj:`str`): The version this configuration is restored from.
                This should only be used when restoring a configuration,
                and should not be set manually.

        Examples:
            >>> viewer = PerspectiveViewer(
            ...     aggregates={"a": "avg"},
            ...     group_by=["a"],
            ...     sort=[["b", "desc"]],
            ...     filter=[["a", ">", 1]],
            ...     expressions=["\"a\" + 100"]
            ... )
        """

        # The Table under management by this viewer and its
        # attached PerspectiveManager
        self._table = None
        self._client = None

        # Viewer configuration
        self.plugin = plugin  # validate_plugin(plugin)
        self.columns = columns or []  # validate_columns(columns) or []
        self.columns_config = columns_config or {}
        self.group_by = group_by or []  # validate_group_by(group_by) or []
        self.split_by = split_by or []  # validate_split_by(split_by) or []
        self.group_rollup_mode = group_rollup_mode or "rollup"
        self.aggregates = aggregates or {}  # validate_aggregates(aggregates) or {}
        self.sort = sort or []  # validate_sort(sort) or []
        self.filter = filter or []  # validate_filter(filter) or []
        self.expressions = expressions or {}  # validate_expressions(expressions) or {}
        self.plugin_config = (
            plugin_config or {}
        )  # validate_plugin_config(plugin_config) or {}
        self.settings = settings
        self.theme = theme
        self.title = title

    def new_proxy_session(self, cb):
        return perspective.ProxySession(self._client, cb)

    @property
    def client(self):
        """Returns the ``perspective.Client`` or ``perspective.AsyncClient`` under management by the viewer."""
        return self._client

    @property
    def table(self):
        """Returns the ``perspective.Table`` or ``perspective.AsyncTable`` under management by the viewer."""
        return self._table

    def is_async(self):
        """Returns whether this widget has an async interface or synchronous"""
        return isinstance(self._table, perspective.perspective.AsyncTable)

    def load(self, data, **options):
        """Given a ``perspective.Table``, a ``perspective.AsyncTable``,
        or data that can be handled by ``perspective.Table``, pass it to the
        viewer.  Like `__init__`, load accepts a `perspective.Table`, a dataset,
        or a schema.

        ``load()`` resets the state of the viewer: if a ``perspective.Table``
        has already been  loaded, ``**options`` is ignored as the options
        already set on the ``Table`` take precedence.

        If data is passed in, a ``perspective.Table`` is automatically created
        by this method, and the options passed to ``**config`` are extended to
        the new Table.  If the widget already has a dataset, and the new data
        has different columns to the old one, then the widget state (pivots,
        sort, etc.) is cleared to prevent applying settings on columns that
        don't exist.

        When a ``perspective.AsyncTable`` is loaded, the widget's interface
        becomes async. Methods which operate on the underlying Perspective
        view, inclusive of the ``load()`` call itself, return coroutine values
        which must be awaited.

        Loading a ``perspective.Table`` or plain data will make the interface
        synchronous again.

        Args:
            data (:obj:`Table`|:obj:`AsyncTable`|:obj:`dict`|:obj:`list`|:obj:`pandas.DataFrame`|:obj:`bytes`|:obj:`str`): a
                `perspective.Table` instance, a `perspective.AsyncTable`
                instance, or a dataset to be loaded in the viewer.

        Keyword Arguments:
            name (:obj:`str`): An optional name to reference the table by so it can
                be accessed from the front-end. If not provided, a name will
                be generated.
            index (:obj:`str`): A column name to be used as the primary key.
                Ignored if a ``Table`` or ``AsyncTable`` is supplied.
            limit (:obj:`int`): A upper limit on the number of rows in the Table.
                Cannot be set at the same time as `index`. Ignored if a
                ``Table`` or ``AsyncTable`` is supplied.

        Returns:
            coro (:obj:`coroutine`): when `AsyncTable` is passed, the `load()` call must be awaited
        """
        name = options.pop("name", str(random()))

        # Reset the viewer when `load()` is called multiple times.
        if self.table is not None:
            self.reset()

        if isinstance(data, perspective.perspective.AsyncTable):
            self._table = data
            async def load_table():
                self._client = await self.table.get_client()
                self.table_name = self.table.get_name()
                # If the user does not set columns to show, synchronize viewer state
                # with dataset.
                if len(self.columns) == 0:
                    self.columns = await self.table.columns()

            return load_table()
        elif isinstance(data, perspective.perspective.Table):
            self._table = data
            self._client = data.get_client()
        elif isinstance(data, perspective.perspective.View) or isinstance(data, perspective.perspective.AsyncView):
            raise TypeError(
                "Views cannot be loaded directly, load a table or raw data instead"
            )
        else:
            self._table = perspective.table(data, name=name, **options)
            self._client = perspective.GLOBAL_CLIENT

        # If the user does not set columns to show, synchronize viewer state
        # with dataset.
        if len(self.columns) == 0:
            self.columns = self.table.columns()

        self.table_name = self.table.get_name()

    def update(self, data):
        """Update the table under management by the viewer with new data.
        This function follows the semantics of `Table.update()`, and will be
        affected by whether an index is set on the underlying table.

        When this widget has loaded an ``AsyncTable``, returns a coroutine
        which must be awaited.

        Args:
            data (:obj:`dict`|:obj:`list`|:obj:`pandas.DataFrame`): the
            update data for the table.

        Returns:
            coro (:obj:`coroutine`): when async, must be awaited
        """
        return self.table.update(data)

    def clear(self):
        """Clears the rows of this viewer's ``Table``."""
        if self.table is not None:
            return self.table.clear()

    def replace(self, data):
        """Replaces the rows of this viewer's `Table` with new data.

        Args:
            data (:obj:`dict`|:obj:`list`|:obj:`pandas.DataFrame`): new data
            to set into the table - must conform to the table's schema.

        Returns:
            coro (:obj:`coroutine`): when async, must be awaited
        """
        if self.table is not None:
            return self.table.replace(data)

    def save(self):
        """Get the viewer's attributes as a dictionary, symmetric with `restore`
        so that a viewer's configuration can be reproduced."""
        return {
            attr: getattr(self, attr)
            for attr in PerspectiveViewer.PERSISTENT_ATTRIBUTES
        }

    def restore(self, **kwargs):
        """Restore a given set of attributes, passed as kwargs
        (e.g. dictionary). Symmetric with `save` so that a given viewer's
        configuration can be reproduced."""
        for k, v in kwargs.items():
            if k in PerspectiveViewer.PERSISTENT_ATTRIBUTES:
                setattr(self, k, v)

    def to_kwargs(self):
        """Get the viewer's attributes as a list of kwargs, which can be passed to
        the viewer constructor"""
        attrs = self.save()
        defaults = {
            "columns": [],
            "group_by": [],
            "split_by": [],
            "aggregates": {},
            "sort": [],
            "filter": [],
            "expressions": {},
            "plugin_config": {},
            "version": "2.10.0",
        }
        kwargs = {}
        for key, default in defaults.items():
            if attrs.get(key) != default:
                kwargs[key] = attrs[key]
        return ", ".join(
            ["{}={}".format(attr, repr(val)) for attr, val in kwargs.items()]
        )

    def reset(self):
        """Resets the viewer's attributes and state, but does not delete or
        modify the underlying `Table`.

        Example:
            widget = PerspectiveWidget(data, group_by=["date"], plugin=Plugin.XBAR)
            widget.reset()
            widget.plugin  #
        """
        self.group_by = []
        self.split_by = []
        self.filter = []
        self.sort = []
        self.expressions = {}
        self.aggregates = {}
        self.columns = []
        self.plugin = "Datagrid"
        self.plugin_config = {}

    def delete(self, delete_table=True):
        """Delete the Viewer's data and clears its internal state. If
        ``delete_table`` is True, the underlying `perspective.Table` and the
        internal `View` object will be deleted.

        Args:
            delete_table (:obj:`bool`) : whether the underlying `Table` will be
                deleted. Defaults to True.

        Returns:
            coro (:obj:`coroutine`): when async and `delete_table` is `True`,
                must be awaited
        """
        ret = None
        if delete_table:
            # Delete table
            ret = self.table.delete()
            self.table_name = None
            self._table = None

        self.reset()
        return ret
