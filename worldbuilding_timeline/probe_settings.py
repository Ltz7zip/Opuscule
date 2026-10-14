# -*- coding: utf-8 -*-
"""探针专用 settings：把库换成临时文件，其余全部沿用正式配置。

只被 tools/auth_setup_probe.py 通过 ``--settings`` 引用；正式运行不走这里。
库路径由 ``OPUSCULE_PROBE_DB`` 环境变量给，缺省时落在系统临时目录。
"""

from __future__ import annotations

import os
import pathlib
import tempfile

from .settings import *  # noqa: F401,F403

_DB = os.environ.get("OPUSCULE_PROBE_DB") or str(
    pathlib.Path(tempfile.gettempdir()) / "opuscule-probe.sqlite3")

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": _DB,
    }
}
