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

# Regression tests for static HTML export, based on the repro in
# https://github.com/perspective-dev/perspective/issues/2846

import base64
import json
import re

import pandas as pd
import pytest

from perspective.widget import PerspectiveWidget, __version__

pytestmark = pytest.mark.filterwarnings("ignore::DeprecationWarning")


def make_widget():
    df = pd.DataFrame(dict(x=[1.0, 2.0, 3.0], y=[1.0, 3.0, 2.0]))
    return PerspectiveWidget(df)


def export_html(widget):
    bundle = widget._repr_mimebundle_()
    data = bundle[0] if isinstance(bundle, tuple) else bundle
    return data["text/html"]


class TestWidgetHtmlExport:
    @pytest.fixture(autouse=True)
    def _enable_export(self, monkeypatch):
        monkeypatch.setenv("PSP_JUPYTER_HTML_EXPORT", "1")

    def test_disabled_without_env(self, monkeypatch):
        monkeypatch.delenv("PSP_JUPYTER_HTML_EXPORT")
        bundle = make_widget()._repr_mimebundle_()
        data = bundle[0] if isinstance(bundle, tuple) else bundle
        assert data is None or "text/html" not in data

    def test_bundle_preserves_anywidget_view(self):
        bundle = make_widget()._repr_mimebundle_()
        assert isinstance(bundle, tuple)
        data, _metadata = bundle
        assert "text/html" in data
        assert "application/vnd.jupyter.widget-view+json" in data

    def test_viewer_id_is_quoted(self):
        widget = make_widget()
        html = export_html(widget)
        assert f'const viewerId = "{widget.model_id}";' in html
        assert f'id="perspective-envelope-{widget.model_id}"' in html

    def test_viewer_attrs_is_json(self):
        widget = make_widget()
        html = export_html(widget)
        match = re.search(r"const viewerAttrs = (\{.*?\});", html, re.S)
        assert match is not None
        attrs = json.loads(match.group(1))
        assert attrs["columns"] == ["index", "x", "y"]
        assert attrs == json.loads(json.dumps(widget.save()))

    def test_worker_is_awaited_before_table(self):
        html = export_html(make_widget())
        assert 'await customElements.whenDefined("perspective-viewer");' in html
        assert "const client = await perspective.worker();" in html
        assert "const table = await client.table(data.buffer);" in html
        assert "perspective.worker().table" not in html

    def test_cdn_urls_use_5x_package_names(self):
        html = export_html(make_widget())
        urls = re.findall(r'(?:src|href)="([^"]+)"', html)
        prefix = f"https://cdn.jsdelivr.net/npm/@perspective-dev"
        assert urls == [
            f"{prefix}/client@{__version__}/dist/cdn/perspective.js",
            f"{prefix}/viewer@{__version__}/dist/cdn/perspective-viewer.js",
            f"{prefix}/viewer-datagrid@{__version__}/dist/cdn/perspective-viewer-datagrid.js",
            f"{prefix}/viewer-charts@{__version__}/dist/cdn/perspective-viewer-charts.js",
            f"{prefix}/viewer@{__version__}/dist/css/themes.css",
        ]

    def test_arrow_payload_round_trips(self):
        widget = make_widget()
        html = export_html(widget)
        match = re.search(
            r'<script type="application/vnd.apache.arrow.file">(.*?)</script>',
            html,
            re.S,
        )
        assert match is not None
        data = base64.b64decode("".join(match.group(1).split()))
        table = widget.table.get_client().table(data)
        try:
            view = table.view()
            try:
                assert view.to_columns() == {
                    "index": [0, 1, 2],
                    "x": [1.0, 2.0, 3.0],
                    "y": [1.0, 3.0, 2.0],
                }
            finally:
                view.delete()
        finally:
            table.delete()
