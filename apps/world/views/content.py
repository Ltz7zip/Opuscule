# -*- coding: utf-8 -*-
"""工具数据 / 媒体 / 表格 / 搜索 / 导入导出。

（原 ``world/views.py`` 的「工具数据 / 媒体 / 表格 / 搜索 / 导入导出。」分区；
拆包后行为不变，对外仍通过 ``world.views`` 访问。）
"""

from __future__ import annotations

from django.conf import settings
from django.core.files.storage import default_storage
from django.http import Http404, HttpResponse, JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods, require_safe
from django.views.static import serve as static_serve
import hashlib
import json
import posixpath
import re
import secrets

from .. import permissions
from ..models import (
    DOC_CARD,
    VT_DATE,
    VT_FORMULA,
    VT_MULTISELECT,
    VT_NUMBER,
    VT_REFERENCE,
    VT_SELECT,
    World,
)
from ..normalize import (
    ValueErrorCN,
    as_int,
    as_number,
    as_text,
    blocks_to_text,
    build_value_map,
    coerce_property_value,
    default_values_for,
    evaluate_formula,
    normalize_blocks,
)
from ..services import autolink
from apps.documents.models import Card, Document, TimelineEvent

from .canvases import clamp_int
from .common import (
    ALLOWED_MEDIA_TYPES,
    DOC_NOT_FOUND,
    _any_document,
    _upload_problem,
    current_world,
    error,
    get_document,
    get_type,
    json_response,
    parse_json,
    touch_document,
)


def _document_or_json_404(doc_id):
    return get_document(current_world(), doc_id)


@csrf_exempt
@require_http_methods(["GET", "PUT"])
def document_data(request, doc_id):
    """文档的"工具数据"：存在 ``settings.data`` 里，各工具自己解释结构。

    统一一个入口的好处：新工具只要定一份前端 spec，后端不用改。
    """
    world = current_world()
    document = get_document(world, doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)

    settings_ = document.settings if isinstance(document.settings, dict) else {}
    if request.method == "GET":
        return json_response({
            "document": {"id": document.id, "name": document.name, "type": document.document_type},
            "data": settings_.get("data") or {},
            "media": settings_.get("media") or [],
            "revision": as_int(settings_.get("revision"), 0),
        })

    payload = parse_json(request)
    incoming = payload.get("data")
    if not isinstance(incoming, dict):
        return error("data 必须是对象")
    encoded = json.dumps(incoming, ensure_ascii=False)
    if len(encoded) > 400 * 1024:
        return error("这份数据太大了（上限约 400 KB）")
    merged = dict(settings_)
    merged["data"] = incoming
    document.settings = merged
    document.save(update_fields=["settings", "updated_at"])
    touch_document(document, label="编辑", author=request.user)
    return json_response({
        "document": {"id": document.id, "name": document.name, "type": document.document_type},
        "data": incoming,
        "media": merged.get("media") or [],
        "revision": as_int((document.settings or {}).get("revision"), 0),
    })


@csrf_exempt
@require_http_methods(["POST", "DELETE"])
def document_media(request, doc_id):
    """文档里的媒体（语音、图片…）：文件落盘，元数据挂在 ``settings.media``。"""
    world = current_world()
    document = get_document(world, doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)

    settings_ = document.settings if isinstance(document.settings, dict) else {}
    media = list(settings_.get("media") or [])

    if request.method == "DELETE":
        target_id = as_text(request.GET.get("id"), 80) or as_text(parse_json(request).get("id"), 80)
        kept = []
        for item in media:
            if item.get("id") == target_id:
                path = item.get("path") or ""
                if path:
                    try:
                        default_storage.delete(path)
                    except Exception:
                        pass
                continue
            kept.append(item)
        settings_["media"] = kept
        document.settings = settings_
        document.save(update_fields=["settings", "updated_at"])
        return json_response({"ok": True, "media": kept, "entry": None})

    upload = request.FILES.get("file")
    if upload is None:
        return error("没有收到文件")
    problem = _upload_problem(upload, ALLOWED_MEDIA_TYPES)
    if problem:
        return error(problem)

    name = as_text(upload.name, 200) or "file"
    safe_name = re.sub(r"[\\/:*?\"<>|]+", "-", name.split("/")[-1])
    path = default_storage.save(f"docs/{document.id}/{safe_name}", upload)
    entry = {
        "id": secrets.token_urlsafe(8),
        "name": name,
        "title": as_text(request.POST.get("title"), 200) or name,
        "kind": as_text(request.POST.get("kind"), 20) or "file",
        "path": path,
        "size": upload.size,
        "content_type": getattr(upload, "content_type", "") or "",
        "created_at": timezone.now().isoformat(),
    }
    if request.POST.get("duration"):
        try:
            entry["duration"] = float(request.POST.get("duration"))
        except (TypeError, ValueError):
            entry["duration"] = 0.0
    try:
        entry["url"] = default_storage.url(path)
    except Exception:
        entry["url"] = f"{settings.MEDIA_URL}{path}"
    media.append(entry)
    settings_["media"] = media
    document.settings = settings_
    document.save(update_fields=["settings", "updated_at"])
    return json_response({"ok": True, "media": media, "item": entry, "entry": entry})


# 上传文件落盘时，路径里就嵌着「属于哪篇文档」：文档媒体是 ``docs/<id>/…``、
# 地图底图是 ``maps/<id>/…``（见 document_media 与地图底图上传）。鉴权只需从路径
# 里把这篇文档的 id 抠出来。
MEDIA_OWNER_PATTERN = re.compile(r"^(?:docs|maps)/(\d+)(?:/|$)")


@require_safe
def media_file(request, path):
    """上传文件（``/media/…``）的鉴权入口。

    挡的是「知道路径就能直链下载未公开的图 / 语音」——这是本阶段要关掉的一扇门。
    放行口径只认一件事：文件所属的这篇文档若对外公开（发布站点能看，见
    ``permissions.published_document``），谁都能取；否则得是能读它所属世界的人。

    鉴权通过后交给 Django 自带的 ``static_serve`` 读盘——它自带条件请求与 Range
    支持，语音、音频拖进度条才不会卡。
    """
    relative = posixpath.normpath(path or "").lstrip("/")
    if relative in ("", ".", "..") or relative.startswith("../"):
        raise Http404

    owner = MEDIA_OWNER_PATTERN.match(relative)
    doc_id = int(owner.group(1)) if owner else 0

    allowed = False
    if doc_id:
        if permissions.published_document(doc_id) is not None:
            allowed = True
        else:
            document = Document.objects.filter(pk=doc_id).select_related("world").first()
            allowed = document is not None and permissions.can_read(request.user, document.world)
    if not allowed:
        if not (request.user and request.user.is_authenticated):
            return JsonResponse({"error": "请先登录", "need_login": True}, status=401)
        return JsonResponse({"error": "没有权限看这个文件"}, status=403)

    response = static_serve(request, relative, document_root=settings.MEDIA_ROOT)
    # 别让浏览器"嗅探"内容类型：上传文件的类型已经过白名单校验，明确告知按声明渲染。
    response["X-Content-Type-Options"] = "nosniff"
    return response


TABLE_FILTER_OPS = ("contains", "is", "is_not", "gt", "lt", "empty", "not_empty")
TABLE_SORT_DIRS = ("asc", "desc")
TABLE_VIEW_KEYS = ("filter", "sort", "group", "hidden", "widths")


def _table_view(config: dict) -> dict:
    """把表格的视图设置归一化成 ``{filter, sort, group, hidden, widths}``。

    这些设置以前是散着放（甚至没有）的；这里统一收进
    ``settings["table"]["view"]``，读旧数据时一律当作「没设」，行为跟旧表格一致。
    """
    raw = config.get("view") if isinstance(config.get("view"), dict) else {}

    def pick(key):
        # 新结构优先；没有再看早先平铺在 config 里的同名键
        value = raw.get(key)
        return value if value is not None else config.get(key)

    view = {"filter": None, "sort": None, "group": None, "hidden": [], "widths": {}}

    item = pick("filter")
    if isinstance(item, dict):
        prop_id = as_int(item.get("id"), 0)
        op = as_text(item.get("op"), 20) or "contains"
        if prop_id:
            view["filter"] = {
                "id": prop_id,
                "op": op if op in TABLE_FILTER_OPS else "contains",
                "text": as_text(item.get("text"), 200),
            }

    item = pick("sort")
    if isinstance(item, dict):
        prop_id = as_int(item.get("id"), 0)
        if prop_id:
            direction = as_text(item.get("dir"), 8) or "asc"
            view["sort"] = {
                "id": prop_id, "dir": direction if direction in TABLE_SORT_DIRS else "asc",
            }

    item = pick("group")
    if isinstance(item, dict):
        item = item.get("id")
    prop_id = as_int(item, 0)
    if prop_id:
        view["group"] = {"id": prop_id}

    hidden = pick("hidden")
    if isinstance(hidden, list):
        view["hidden"] = sorted({as_int(value) for value in hidden if as_int(value)})

    widths = pick("widths")
    if isinstance(widths, dict):
        for key, value in widths.items():
            prop_id = as_int(key, 0)
            width = as_int(value, 0)
            if prop_id and width:
                view["widths"][str(prop_id)] = max(60, min(900, width))
    return view


def _table_config(world: World, document: Document) -> dict:
    """表格配置；没配过类型就猜一个（第一张卡的类型 / 世界的第一个类型），
    这样新建的表格不会是一张空表。
    """
    settings_ = document.settings if isinstance(document.settings, dict) else {}
    config = settings_.get("table") if isinstance(settings_.get("table"), dict) else {}
    entity_type = get_type(world, config.get("entity_type")) if config.get("entity_type") else None
    if entity_type is None:
        sample = Document.objects.filter(
            world=world, document_type=DOC_CARD, deleted_at__isnull=True,
        ).exclude(entity_type=None).order_by("position", "id").first()
        entity_type = sample.entity_type if sample is not None else world.types.order_by("position", "id").first()
    columns = config.get("columns") if isinstance(config.get("columns"), list) else []
    return {"entity_type": entity_type, "columns": columns, "view": _table_view(config)}


def _table_column(prop) -> dict:
    """一列（= 一个属性）的描述；选项只给标签，前端直接铺下拉。"""
    return {
        "id": prop.id,
        "name": prop.name,
        "value_type": prop.value_type,
        "options": prop.option_labels,
        "required": prop.required,
        "formula": prop.formula,
        "reference_type": prop.reference_type_id,
    }


def _table_row(doc: Document, properties: list, type_cache: dict | None = None) -> dict:
    """一行（= 一张卡片）：原始值 + 公式列算出来的值，前端可直接用。

    ``type_cache`` 按类型 id 缓存 ``all_properties()``：表格最多 400 行，
    同一类型的属性定义不必每行都沿继承链查一遍库。
    """
    card = getattr(doc, "card", None)
    raw = dict(card.values or {}) if card is not None else {}
    if card is None:
        values_by_name = {}
    elif type_cache is None:
        values_by_name = build_value_map(card)
    else:
        # 等价于 card.effective_type()，但直接用行上的 doc，省一次反向关系访问
        entity_type = card.entity_type or doc.entity_type
        type_properties = []
        if entity_type is not None:
            type_properties = type_cache.get(entity_type.id)
            if type_properties is None:
                type_properties = entity_type.all_properties()
                type_cache[entity_type.id] = type_properties
        values_by_name = {
            prop.name: raw.get(str(prop.id), prop.default_value) for prop in type_properties
        }
    values = {}
    for prop in properties:
        if prop.value_type == VT_FORMULA:
            values[str(prop.id)] = evaluate_formula(prop.formula, values_by_name)
        else:
            values[str(prop.id)] = raw.get(str(prop.id))
    return {"id": doc.id, "name": doc.name, "values": values, "cover": doc.cover}


def _table_has_value(value) -> bool:
    return value not in (None, "", [], {})


def _table_cell_text(prop, value, name_cache: dict | None = None) -> str:
    """单元格的纯文本（筛选 / 排序 / 分组用）。"""
    if not _table_has_value(value):
        return ""
    if isinstance(value, list):
        return "、".join(str(item) for item in value)
    if prop.value_type == VT_REFERENCE and name_cache is not None:
        return name_cache.get(as_int(value, 0)) or str(value)
    return str(value)


def _table_name_cache(world: World, properties: list, view: dict) -> dict:
    """只在「按引用列筛选/排序/分组」时才去查一次 id→名称，省一次查询。"""
    by_id = {prop.id: prop for prop in properties}
    for key in ("filter", "sort", "group"):
        item = view.get(key)
        prop = by_id.get(as_int(item.get("id"), 0)) if isinstance(item, dict) else None
        if prop is not None and prop.value_type == VT_REFERENCE:
            return dict(
                Document.objects.filter(world=world, deleted_at__isnull=True).values_list("id", "name")
            )
    return {}


def _table_match_filter(prop, text: str, filter_view: dict) -> bool:
    op = filter_view.get("op") or "contains"
    if op == "empty":
        return text == ""
    if op == "not_empty":
        return text != ""
    target = as_text(filter_view.get("text"), 200)
    if op == "contains":
        return target.lower() in text.lower()
    if op == "is":
        return text.strip().lower() == target.strip().lower()
    if op == "is_not":
        return text.strip().lower() != target.strip().lower()
    left = as_number(text)
    right = as_number(target)
    if left is None or right is None:
        return False
    return left > right if op == "gt" else left < right


def _table_sort_key(prop, value):
    if prop.value_type in (VT_NUMBER, VT_FORMULA):
        number = as_number(value)
        return (0, number) if number is not None else (1, 0.0)
    if prop.value_type == VT_DATE:
        if isinstance(value, dict):
            return (0, (as_int(value.get("year")), as_int(value.get("month"), 1), as_int(value.get("day"), 1)))
        return (1, (0, 0, 0))
    text = _table_cell_text(prop, value)
    return (0, text.lower()) if text else (1, "")


def _table_aggregates(rows: list, properties: list) -> dict:
    """底部 Rollup：每列给计数，数值/公式列再给 sum/avg/min/max。"""
    by_column = {}
    for prop in properties:
        key = str(prop.id)
        if prop.value_type in (VT_NUMBER, VT_FORMULA):
            numbers = [as_number(row["values"].get(key)) for row in rows]
            numbers = [value for value in numbers if value is not None]
            by_column[key] = {
                "count": len(numbers),
                "sum": round(sum(numbers), 4) if numbers else None,
                "avg": round(sum(numbers) / len(numbers), 4) if numbers else None,
                "min": min(numbers) if numbers else None,
                "max": max(numbers) if numbers else None,
            }
        else:
            by_column[key] = {"count": sum(1 for row in rows if _table_has_value(row["values"].get(key)))}
    return {"total": len(rows), "by_column": by_column}


def _table_groups(rows: list, prop, properties: list, name_cache: dict | None = None) -> list:
    """按某个属性把行分组（Notion 的分组视图），每组自带 Rollup。"""
    buckets: dict = {}
    order: list = []
    for row in rows:
        label = _table_cell_text(prop, row["values"].get(str(prop.id)), name_cache) or "未分组"
        if label not in buckets:
            buckets[label] = []
            order.append(label)
        buckets[label].append(row)
    if prop.value_type in (VT_SELECT, VT_MULTISELECT) and prop.option_labels:
        preferred = [label for label in prop.option_labels if label in buckets]
        order = preferred + [label for label in order if label not in preferred]
    groups = []
    for label in order:
        group_rows = buckets[label]
        groups.append({
            "label": label,
            "property_id": prop.id,
            "row_ids": [row["id"] for row in group_rows],
            "count": len(group_rows),
            "aggregates": _table_aggregates(group_rows, properties),
        })
    return groups


def _schema_token(entity_type, properties: list) -> str:
    """类型结构的指纹；前端拿它判断「这行之外的东西变了没」。"""
    parts = [str(entity_type.id) if entity_type is not None else "0"]
    for prop in properties:
        parts.append(f"{prop.id}:{prop.name}:{prop.value_type}:{prop.position}")
    return hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()[:12]


def _table_cell_result(card, row_document: Document) -> dict:
    """单元格写回后的轻量回执：这一行 + 结构指纹，供前端乐观更新校正。"""
    entity_type = card.effective_type() or row_document.entity_type
    properties = entity_type.all_properties() if entity_type is not None else []
    return {
        "row": _table_row(row_document, properties),
        "schema": _schema_token(entity_type, properties),
    }


def table_payload(world: World, document: Document) -> dict:
    """表格内容：列（属性）+ 行（卡片）+ 视图（筛选/排序/分组/Rollup）。"""
    config = _table_config(world, document)
    entity_type = config["entity_type"]
    all_properties = entity_type.all_properties() if entity_type is not None else []
    by_id = {prop.id: prop for prop in all_properties}

    wanted = [as_int(item) for item in config["columns"] if as_int(item)]
    shown = [by_id[item] for item in wanted if item in by_id] if wanted else list(all_properties)

    view = config["view"]
    hidden = set(view["hidden"])
    columns = [prop for prop in shown if prop.id not in hidden]

    documents = Document.objects.filter(
        world=world, deleted_at__isnull=True, document_type=DOC_CARD,
    ).select_related("card", "card__entity_type", "entity_type")
    if entity_type is not None:
        documents = documents.filter(entity_type=entity_type)

    # 当前类型的属性已经算过了，直接放进缓存；其余类型按需补齐
    type_cache: dict[int, list] = {entity_type.id: all_properties} if entity_type is not None else {}
    rows = [
        _table_row(doc, all_properties, type_cache)
        for doc in documents.order_by("position", "id")[:400]
    ]
    name_cache = _table_name_cache(world, all_properties, view)

    filter_view = view["filter"]
    if filter_view and by_id.get(filter_view["id"]):
        prop = by_id[filter_view["id"]]
        rows = [
            row for row in rows
            if _table_match_filter(prop, _table_cell_text(prop, row["values"].get(str(prop.id)), name_cache), filter_view)
        ]

    sort_view = view["sort"]
    if sort_view and by_id.get(sort_view["id"]):
        prop = by_id[sort_view["id"]]
        rows.sort(
            key=lambda row: _table_sort_key(prop, row["values"].get(str(prop.id))),
            reverse=sort_view["dir"] == "desc",
        )

    group_view = view["group"]
    groups = None
    if group_view and by_id.get(group_view["id"]):
        groups = _table_groups(rows, by_id[group_view["id"]], columns, name_cache)

    return {
        "document": {"id": document.id, "name": document.name, "type": document.document_type},
        "entity_type": entity_type.to_payload() if entity_type is not None else None,
        "available_types": [
            {"id": t.id, "name": t.name, "parent": t.parent_id}
            for t in world.types.filter(hidden=False).order_by("position", "id")
        ],
        "all_columns": [_table_column(prop) for prop in all_properties],
        "columns": [_table_column(prop) for prop in columns],
        "view": view,
        "rows": rows,
        "groups": groups,
        "aggregates": _table_aggregates(rows, columns),
        "schema": _schema_token(entity_type, all_properties),
    }


@csrf_exempt
@require_http_methods(["GET", "PUT"])
def table_detail(request, doc_id):
    """读表格 / 改它的类型、要显示的列，以及视图设置（筛选/排序/分组/隐藏列/列宽）。"""
    world = current_world()
    document = get_document(world, doc_id)
    if document is None or document.document_type != "table":
        return json_response(DOC_NOT_FOUND, status=404)

    if request.method == "GET":
        return json_response(table_payload(world, document))

    payload = parse_json(request)
    settings_ = document.settings if isinstance(document.settings, dict) else {}
    config = settings_.get("table") if isinstance(settings_.get("table"), dict) else {}
    if "entity_type" in payload:
        entity_type = get_type(world, payload.get("entity_type"))
        config["entity_type"] = entity_type.id if entity_type is not None else None
    if "columns" in payload and isinstance(payload.get("columns"), list):
        config["columns"] = [as_int(item) for item in payload["columns"] if as_int(item)]
    if "view" in payload and isinstance(payload.get("view"), dict):
        current = _table_view(config)
        incoming = _table_view({"view": payload["view"]})
        for key in TABLE_VIEW_KEYS:          # 只覆盖前端真给了的键，支持局部更新
            if key in payload["view"]:
                current[key] = incoming[key]
        config["view"] = current
    settings_["table"] = config
    document.settings = settings_
    document.save(update_fields=["settings"])
    return json_response(table_payload(world, document))


@csrf_exempt
@require_http_methods(["PUT"])
def table_cell(request, doc_id):
    """改一个单元格 = 改那张卡片的属性值（这就是"双向绑定"）。

    只回这一行（+ 结构指纹）：前端做乐观更新后拿它校正，不必整表重载。
    """
    world = current_world()
    document = get_document(world, doc_id)
    if document is None or document.document_type != "table":
        return json_response(DOC_NOT_FOUND, status=404)

    payload = parse_json(request)
    row_document = get_document(world, payload.get("row"))
    if row_document is None:
        return json_response({"error": "找不到这一行对应的卡片"}, status=404)

    card, _created = Card.objects.get_or_create(
        document=row_document, defaults={"entity_type": row_document.entity_type})

    if "name" in payload:
        row_document.name = as_text(payload.get("name"), 200) or row_document.name
        row_document.save(update_fields=["name", "updated_at"])
        touch_document(document, label="改表格行名", author=request.user)
        return json_response(_table_cell_result(card, row_document))

    entity_type = card.effective_type()
    column_id = as_int(payload.get("column") or payload.get("property"), 0)
    prop = None
    if entity_type is not None:
        prop = next((item for item in entity_type.all_properties() if item.id == column_id), None)
    if prop is None:
        return error("找不到这一列（属性）")

    try:
        value = coerce_property_value(prop, payload.get("value"), world)
    except ValueErrorCN as exc:
        return error(str(exc))
    values = dict(card.values or {})
    values[str(prop.id)] = value
    card.values = values
    card.save(update_fields=["values"])
    row_document.save(update_fields=["updated_at"])
    touch_document(document, label="编辑表格单元格", author=request.user)
    return json_response(_table_cell_result(card, row_document))


@csrf_exempt
@require_http_methods(["POST", "DELETE"])
def table_rows(request, doc_id):
    """加一行（= 建一张卡片）或删一行。"""
    world = current_world()
    document = get_document(world, doc_id)
    if document is None or document.document_type != "table":
        return json_response(DOC_NOT_FOUND, status=404)

    config = _table_config(world, document)
    payload = parse_json(request)

    if request.method == "DELETE":
        row_document = get_document(world, payload.get("row"))
        if row_document is None:
            return json_response({"error": "找不到这一行对应的卡片"}, status=404)
        row_document.deleted_at = timezone.now()      # 软删，回收站里能还原
        row_document.save(update_fields=["deleted_at"])
        touch_document(document, label="删表格行", author=request.user)
        return json_response(table_payload(world, document))

    entity_type = config["entity_type"]
    row_document = Document.objects.create(
        world=world,
        document_type=DOC_CARD,
        name=as_text(payload.get("name"), 200) or "新行",
        parent=document.parent if payload.get("parent") is None else get_document(world, payload.get("parent")),
        entity_type=entity_type,
    )
    Card.objects.create(
        document=row_document,
        entity_type=entity_type,
        values=default_values_for(entity_type) if entity_type is not None else {},
        blocks=normalize_blocks([{"id": "b1", "type": "text", "title": "", "text": ""}]),
    )
    touch_document(document, label="加表格行", author=request.user)
    return json_response(table_payload(world, document))


@csrf_exempt
@require_http_methods(["GET", "POST"])
def table_csv(request, doc_id):
    """CSV 进出：导出当前视图；导入按"名称"匹配已有行并更新。"""
    import csv as csv_module
    import io as io_module

    from django.http import HttpResponse

    world = current_world()
    document = get_document(world, doc_id)
    if document is None or document.document_type != "table":
        return json_response(DOC_NOT_FOUND, status=404)

    if request.method == "GET":
        payload_data = table_payload(world, document)
        columns = payload_data["columns"]
        buffer = io_module.StringIO()
        writer = csv_module.writer(buffer)
        writer.writerow(["名称"] + [column["name"] for column in columns])
        for row in payload_data["rows"]:
            writer.writerow([row["name"]] + [
                "" if row["values"].get(str(column["id"])) is None else row["values"][str(column["id"])]
                for column in columns
            ])
        response = HttpResponse(buffer.getvalue(), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="{document.name}.csv"'
        return response

    payload = parse_json(request)
    text = payload.get("csv") or ""
    entity_type = _table_config(world, document)["entity_type"]
    props = entity_type.all_properties() if entity_type is not None else []
    by_name = {prop.name: prop for prop in props}
    reader = csv_module.reader(io_module.StringIO(text))
    header = next(reader, None) or []
    created = updated = 0
    for record in reader:
        if not record:
            continue
        title = (record[0] or "").strip()
        if not title:
            continue
        row_document = Document.objects.filter(
            world=world, deleted_at__isnull=True, document_type=DOC_CARD, name=title,
        ).first()
        card = None
        if row_document is None:
            row_document = Document.objects.create(
                world=world, document_type=DOC_CARD, name=title, parent=document.parent,
                entity_type=entity_type,
            )
            card = Card.objects.create(document=row_document, entity_type=entity_type, values={})
            created += 1
        else:
            card, _ = Card.objects.get_or_create(
                document=row_document, defaults={"entity_type": entity_type})
            updated += 1
        values = dict(card.values or {})
        for index, cell in enumerate(record[1:], start=1):
            if index >= len(header):
                break
            prop = by_name.get((header[index] or "").strip())
            if prop is None:
                continue
            try:
                values[str(prop.id)] = coerce_property_value(prop, cell, world)
            except ValueErrorCN:
                continue
        card.values = values
        card.save(update_fields=["values"])
    touch_document(document, label="导入 CSV", author=request.user)
    return json_response({"created": created, "updated": updated,
                          "table": table_payload(world, document)})


@require_safe
def search(request):
    """全库搜索：标题、别名、正文、属性值都能命中（⌘K 用它）。"""
    world = current_world()
    keyword = (request.GET.get("q") or "").strip()
    limit = clamp_int(request.GET.get("limit", 20), 1, 100)
    if not keyword:
        return json_response({"results": [], "query": ""})

    lowered = keyword.lower()
    results = []
    # 按最近改动排序：新的在前，前端再按「今天 / 昨天 / 更早」分组
    documents = (Document.objects.filter(world=world, deleted_at__isnull=True)
                 .select_related("card")
                 .only("id", "name", "document_type", "updated_at",
                       "card__aliases", "card__body", "card__values")
                 .order_by("-updated_at", "-id"))
    for document in documents:
        haystack_parts = [document.name]
        card = getattr(document, "card", None)
        if card is not None:
            haystack_parts.extend(card.aliases or [])
            haystack_parts.append(card.body or "")
            for value in (card.values or {}).values():
                if isinstance(value, (str, int, float)):
                    haystack_parts.append(str(value))
        haystack = "\n".join(part for part in haystack_parts if part)
        position = haystack.lower().find(lowered)
        if position < 0:
            continue
        snippet = haystack[max(0, position - 30):position + len(keyword) + 40].replace("\n", " ")
        results.append({
            "id": document.id,
            "name": document.name,
            "type": document.document_type,
            "snippet": snippet,
            "position": position,
            "updated_at": document.updated_at.isoformat() if document.updated_at else None,
        })
        if len(results) >= limit:
            break

    if request.GET.get("fuzzy") in ("1", "true", "yes"):
        seen = {item["id"] for item in results}
        for match in autolink.fuzzy_candidates(world, keyword, limit=6):
            if match.get("document_id") in seen:
                continue
            results.append({
                "id": match.get("document_id"),
                "name": match.get("name"),
                "type": match.get("type") or DOC_CARD,
                "snippet": f"≈ 你是不是想找「{match.get('name')}」",
                "fuzzy": True,
            })
    return json_response({"results": results, "query": keyword})


@require_safe
def suggestions(request):
    """「值得添加」：本地规则统计，不调用任何外部模型。

    四类：正文里反复出现但还没有卡片的名字 / 空壳卡片 / 没人引用的文档 /
    还没关联卡片的时间线事件。跟世界设置里的「AI 功能」开关联动——
    关掉就只回空的建议列表（界面上会提示去打开）。
    """
    world = current_world()
    if not world.ai_enabled:
        # 关掉 AI/自动识别：只回空建议，界面上提示去打开（别偷偷还是算一遍）
        return json_response({"enabled": False, "entities": [], "empty_cards": [],
                              "orphans": [], "events": []})

    cards = list(
        Card.objects.filter(document__world=world)
        .select_related("document")
        .only("document_id", "aliases", "values", "blocks", "body", "document__name")
    )
    # 名字名单只查一次：逐卡统计时复用，避免每张卡都全量查一遍候选
    pairs = autolink.candidates(world)
    known_all = {name.casefold() for name, _document in pairs}
    bodies: dict[int, str] = {}
    counted: dict[str, int] = {}
    for card in cards:
        body = card.body or blocks_to_text(card.blocks)
        bodies[card.document_id] = body
        # 语义与 exclude_document_id 一致：把自己卡片的有效名字从已知名单里拿掉
        own = {
            text.casefold()
            for text in ((name or "").strip() for name in card.mention_names())
            if 1 < len(text) <= autolink.MAX_NAME
        }
        known = known_all - own if own else known_all
        for name in autolink.detect_new_names(world, body, known_names=known):
            name = (name or "").strip()
            if len(name) < 2 or name.startswith("的") or name == world.name:
                continue
            counted[name] = counted.get(name, 0) + 1
    entities = [{"name": name, "count": count}
                for name, count in sorted(counted.items(), key=lambda item: (-item[1], item[0]))[:12]]

    empty_cards = [
        {"id": card.document_id, "name": card.document.name}
        for card in cards
        if not (card.body or "").strip() and not [b for b in (card.blocks or []) if isinstance(b, dict) and (b.get("text") or "").strip()]
    ][:12]

    referenced = set()
    for card in cards:
        for value in (card.values or {}).values():
            if isinstance(value, int):
                referenced.add(value)
    orphans = [
        {"id": card.document_id, "name": card.document.name}
        for card in cards
        if card.document_id not in referenced and bodies.get(card.document_id, "").strip()
    ][:12]

    events = [
        {"id": event.id, "title": event.title, "document": event.document_id}
        for event in TimelineEvent.objects.filter(document__world=world, featured_card__isnull=True)[:12]
    ]
    return json_response({"enabled": True, "entities": entities, "empty_cards": empty_cards,
                          "orphans": orphans, "events": events})


@require_safe
def complete(request):
    """打字补全（精确名字档）：前缀优先、包含兜底，候选带类型与描述。"""
    world = current_world()
    keyword = (request.GET.get("q") or "").strip()
    limit = clamp_int(request.GET.get("limit", autolink.COMPLETE_LIMIT), 1, 50)
    exclude = as_int(request.GET.get("exclude"), 0) or None
    results = autolink.complete_names(world, keyword, exclude_document_id=exclude, limit=limit)
    return json_response({"results": results, "query": keyword})


@csrf_exempt
@require_http_methods(["POST"])
def autolink_view(request):
    """正文里的名字识别：返回命中的卡片与位置（前端据此渲染链接）。"""
    world = current_world()
    payload = parse_json(request)
    text = as_text(payload.get("text"), 200000)
    exclude = payload.get("exclude")
    return json_response({
        "matches": autolink.find_mentions(world, text, exclude_document_id=as_int(exclude, 0) or None),
    })


@require_safe
def backlinks(request, doc_id):
    """谁提到了这张卡（按名字/别名在正文与标题里出现来算）。"""
    world = current_world()
    document = get_document(world, doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)

    card = getattr(document, "card", None)
    names = [document.name] + list((card.aliases if card is not None else []) or [])
    found = []
    for other in (Document.objects.filter(world=world, deleted_at__isnull=True)
                  .exclude(pk=document.pk).select_related("card")
                  .only("id", "name", "document_type",
                        "card__aliases", "card__body", "card__blocks")):
        other_card = getattr(other, "card", None)
        body = (other_card.body if other_card is not None else "") or ""
        if other_card is not None and not body.strip():
            body = blocks_to_text(other_card.blocks)
        haystack = f"{other.name}\n{body}"
        matched = next((name for name in names if name and name in haystack), "")
        if not matched:
            continue
        position = haystack.find(matched)
        found.append({"id": other.id, "name": other.name,
                      "type": other.document_type, "matched": matched,
                      "snippet": haystack[max(0, position - 20):
                                         position + len(matched) + 30].replace("\n", " ")})
    return json_response({"mentions": found, "count": len(found)})


def _clock_stamp() -> str:
    return timezone.localtime().strftime("%Y%m%d-%H%M")


@require_safe
def export_world(request):
    """导出整个世界的 zip（Markdown + JSON 备份），或只要 JSON。"""
    from django.http import HttpResponse

    from ..services import exchange

    world = current_world()
    fmt = request.GET.get("format") or "zip"
    safe_name = re.sub(r'[\\/:*?"<>|]+', "-", world.name or "world")
    stamp = _clock_stamp()

    if fmt == "json":
        body = json.dumps(exchange.world_backup(world), ensure_ascii=False, indent=2)
        response = HttpResponse(body, content_type="application/json; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="{safe_name}-{stamp}.json"'
        return response
    body = exchange.world_zip(world)
    response = HttpResponse(body, content_type="application/zip")
    response["Content-Disposition"] = f'attachment; filename="{safe_name}-{stamp}.zip"'
    return response


@require_safe
def export_document(request, doc_id):
    """单份文档导出：Markdown（默认）或 JSON。"""
    from django.http import HttpResponse

    from ..services import exchange

    world = current_world()
    document = get_document(world, doc_id)
    if document is None:
        return json_response(DOC_NOT_FOUND, status=404)

    safe_name = re.sub(r'[\\/:*?"<>|]+', "-", document.name or "document")
    if (request.GET.get("format") or "markdown") == "json":
        body = json.dumps(exchange.document_payload(document), ensure_ascii=False, indent=2)
        content_type = "application/json; charset=utf-8"
        filename = f"{safe_name}.json"
    else:
        body = exchange.document_markdown(document)
        content_type = "text/markdown; charset=utf-8"
        filename = f"{safe_name}.md"
    response = HttpResponse(body, content_type=content_type)
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


@csrf_exempt
@require_http_methods(["POST"])
def import_files(request):
    """导入 Markdown / zip / world.json。

    两种请求体都收：``multipart/form-data``（上传文件，支持 zip 递归）与 JSON
    （``{files: [{name, content}], mode, parent}``，方便脚本与探针）。
    """
    import io as io_module
    import zipfile

    from ..services import exchange

    world = current_world()
    is_multipart = bool(request.content_type and request.content_type.startswith("multipart/"))
    body_payload = {} if is_multipart else parse_json(request)   # multipart 读了 body 会炸
    parent = get_document(world, request.POST.get("parent")) if is_multipart and request.POST.get("parent") else None
    as_type = (request.POST.get("as_type") if is_multipart else body_payload.get("as_type")) or None
    files: list[dict] = []

    if is_multipart:
        uploads = request.FILES.getlist("files") or request.FILES.getlist("file")
        if not uploads:
            return error("没有收到文件")
        for upload in uploads:
            raw = upload.read()
            name = upload.name or "file.md"
            if name.lower().endswith(".zip"):
                try:
                    archive = zipfile.ZipFile(io_module.BytesIO(raw))
                except zipfile.BadZipFile:
                    return error(f"{name} 不是有效的 zip")
                for info in archive.infolist():
                    if info.is_dir() or "__MACOSX" in info.filename or "/._" in info.filename:
                        continue
                    inner = archive.read(info)
                    files.append({"name": info.filename,
                                  "content": inner.decode("utf-8", errors="replace")})
            else:
                files.append({"name": name, "content": raw.decode("utf-8", errors="replace")})
    else:
        if body_payload.get("parent"):
            parent = get_document(world, body_payload.get("parent"))
        files = [item for item in (body_payload.get("files") or []) if isinstance(item, dict)]
        if not files and (body_payload.get("markdown") or "").strip():
            # 前端"粘贴 Markdown"走的就是这条路：当成一个虚拟文件
            files = [{"name": "粘贴的文档.md", "content": body_payload["markdown"]}]

    # world.json 形式的备份走另一条路（multipart 上传的 .json，或 JSON 体里的 mode=backup）
    backup_text = ""
    if not files and not is_multipart:
        body_payload = parse_json(request)
    if not is_multipart:
        if body_payload.get("mode") == "backup" or body_payload.get("backup"):
            raw_backup = body_payload.get("content") or body_payload.get("backup")
            backup_text = raw_backup if isinstance(raw_backup, str) else json.dumps(raw_backup or {})
    if not backup_text:
        backup_files = [item for item in files if (item.get("name") or "").lower().endswith(".json")
                        and '"documents"' in (item.get("content") or "")]
        if backup_files:
            backup_text = backup_files[0]["content"]
    if backup_text:
        try:
            payload = json.loads(backup_text)
        except ValueError:
            return error("备份 JSON 解析失败")
        return json_response(exchange.import_backup(world, payload) | {"mode": "backup"})

    md_files = [item for item in files if (item.get("name") or "").lower().endswith((".md", ".markdown", ".txt"))]
    if as_type:
        result = exchange.import_markdown_files(world, md_files, parent=parent, as_type=as_type)
    else:
        result = exchange.import_markdown_files(world, md_files, parent=parent)
    touch_document(_any_document(world), label="导入文件", author=request.user)
    return json_response({"summary": result, "mode": "markdown"})
