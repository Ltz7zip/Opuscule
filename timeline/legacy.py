# -*- coding: utf-8 -*-
"""把老的 data.json 搬进数据库（只读，不会改动原文件）。

``manage.py migrate`` 时由数据迁移自动跑一次；之后也可以随时手动重跑：

    python manage.py import_legacy_json            # 默认读项目根目录的 data.json
    python manage.py import_legacy_json old.json   # 指定别的文件
    python manage.py import_legacy_json --replace  # 先清空条目表再导入
"""

import json
from pathlib import Path

from django.conf import settings

from .models import DEFAULT_VIEW
from .normalize import as_float, as_int, normalize

LEGACY_FILE = "data.json"

# 没有 data.json 时的示例数据，与 Flask 版 DEFAULT_DATA["items"] 完全一致
DEFAULT_ITEMS = [
    {"id": 1, "kind": "event", "title": "新事件", "start": 1642, "end": 1642, "desc": "", "row": 0},
    {"id": 2, "kind": "event", "title": "新事件", "start": 1668, "end": 1668, "desc": "", "row": 1},
    {"id": 3, "kind": "event", "title": "新事件", "start": 1712, "end": 1712, "desc": "", "row": 0},
    {"id": 4, "kind": "era", "title": "新纪元", "start": 1602, "end": 1688, "desc": "", "row": 0, "theme": "blue"},
    {"id": 5, "kind": "era", "title": "新纪元", "start": 1688, "end": 1755, "desc": "", "row": 1, "theme": "violet"},
    {"id": 6, "kind": "era", "title": "新纪元", "start": 1642, "end": 1755, "desc": "", "row": 2, "theme": "red"},
]


def read_legacy_file(path=None):
    """读 data.json；文件不存在或损坏时返回 None（对应 Flask 的回落逻辑）。"""
    path = Path(path) if path else Path(settings.BASE_DIR) / LEGACY_FILE
    if not path.exists():
        return None
    try:
        with open(path, "r", encoding="utf-8") as fp:
            return json.load(fp)
    except (OSError, ValueError):
        return None


def parse_legacy(raw):
    """把旧文件的内容拆成 (items, view)。

    兼容三种情况：早期只存了一个数组的版本、正常 dict、以及文件损坏/缺失
    （此时给一份示例数据，和 Flask 版 ``_blank_data()`` 的行为一致）。
    """
    view = dict(DEFAULT_VIEW)
    if not isinstance(raw, dict):
        if isinstance(raw, list):
            return raw, view
        return [dict(item) for item in DEFAULT_ITEMS], view

    if isinstance(raw.get("items"), list):
        items = raw["items"]
    else:
        items = [dict(item) for item in DEFAULT_ITEMS]

    raw_view = raw.get("view")
    if isinstance(raw_view, dict):
        start = as_float(raw_view.get("start"))
        end = as_float(raw_view.get("end"))
        if start is not None:
            view["start"] = start
        if end is not None:
            view["end"] = end
    return items, view


def import_into_db(items, view, item_model, view_model):
    """把 (items, view) 写进数据库，返回写入的条目数。

    带合法 id 的记录按 id 覆盖，没有 id 的当新记录插入。
    旧文件里重复的 id 只取第一条（Flask 版按 id 查找时也是命中第一条）。
    """
    seen = set()
    written = 0
    for raw in items:
        values = normalize(raw)
        legacy_id = as_int(raw.get("id")) if isinstance(raw, dict) else 0
        if legacy_id > 0:
            if legacy_id in seen:
                continue
            seen.add(legacy_id)
            item_model.objects.update_or_create(pk=legacy_id, defaults=values)
        else:
            item_model.objects.create(**values)
        written += 1

    view_model.objects.update_or_create(pk=1, defaults=view)
    return written


def import_legacy_file(path=None, replace=False, item_model=None, view_model=None, strict=False):
    """读文件 + 写库的一站式入口，返回 (数据来源路径或 None, 写入条目数)。

    ``strict=True`` 时读不到文件就抛 OSError，不做「写入示例数据」的兜底——
    命令行用它，免得手滑把示例数据塞进已有数据库。数据迁移不加 strict，
    这样全新安装会得到和 Flask 版一样的示例时间轴。
    """
    from .models import TimelineItem, TimelineView  # 延迟导入，方便迁移里换成历史模型

    item_model = item_model or TimelineItem
    view_model = view_model or TimelineView

    resolved = Path(path) if path else Path(settings.BASE_DIR) / LEGACY_FILE
    raw = read_legacy_file(path)
    if raw is None and strict:
        raise OSError(f"读不到可用的 JSON：{resolved}")

    # 先确认文件读得出来，再动数据库，避免清空了却导不进来
    if replace:
        item_model.objects.all().delete()

    items, view = parse_legacy(raw)
    written = import_into_db(items, view, item_model, view_model)
    return (resolved if raw is not None else None), written
