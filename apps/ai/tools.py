# -*- coding: utf-8 -*-
"""AI 可以调用的工具。

两类：

- **只读工具**：直接查库并返回 JSON 摘要，供模型理解世界；
- **提议工具**：不写库，只把改动追加到 ``ToolRunner.changes``，
  由上层包成 ``AiChangeSet`` 交给用户审阅。

所有工具都以「当前世界」为边界，模型拿不到其它世界的数据。
"""

from __future__ import annotations

from django.db.models import Q

from apps.documents.models import Document, Era, TimelineEvent
from apps.maps.models import MapMarker
from apps.world.models import DOC_CARD, DOC_TIMELINE, DOC_TYPES, EntityType

from .models import (
    CHANGE_CREATE_DOCUMENT,
    CHANGE_CREATE_TIMELINE_EVENT,
    CHANGE_UPDATE_DOCUMENT,
)

DOC_TYPE_VALUES = {value for value, _label in DOC_TYPES}
DOC_TYPE_LABELS = dict(DOC_TYPES)

MAX_LIMIT = 50


def _schema(name: str, description: str, properties: dict, required: list | None = None) -> dict:
    return {
        "name": name,
        "description": description,
        "parameters": {
            "type": "object",
            "properties": properties,
            "required": required or [],
        },
    }


TOOLS = [
    _schema(
        "list_documents",
        "列出当前世界的文档（可按类型过滤）。返回 id、名称、类型与父文档。",
        {
            "document_type": {"type": "string", "description": "可选，文档类型，如 card / timeline / map"},
            "limit": {"type": "integer", "description": "最多返回条数，默认 30，上限 50"},
        },
    ),
    _schema(
        "get_document",
        "读取一份文档的详情；卡片会带属性与正文，时间线会带事件，地图会带标注。",
        {"document_id": {"type": "integer", "description": "文档 id"}},
        ["document_id"],
    ),
    _schema(
        "search_documents",
        "按名称在当前世界里搜索文档。",
        {
            "query": {"type": "string", "description": "搜索关键词"},
            "limit": {"type": "integer", "description": "最多返回条数，默认 20，上限 50"},
        },
        ["query"],
    ),
    _schema(
        "list_timeline_events",
        "列出世界总时间线上的事件；可用 document_id 只看某份旧时间线文档里的事件。返回标题、精度、年月日与纪元。",
        {
            "document_id": {"type": "integer", "description": "可选，旧时间线文档 id；不传则读整个世界时间线"},
            "limit": {"type": "integer", "description": "最多返回条数，默认 40，上限 50"},
        },
    ),
    _schema(
        "list_eras",
        "列出当前世界的纪元（含长度与简介）。",
        {},
    ),
    _schema(
        "list_map_markers",
        "列出地图标注，可按地图文档过滤。",
        {
            "document_id": {"type": "integer", "description": "可选，地图文档 id"},
            "limit": {"type": "integer", "description": "最多返回条数，默认 40，上限 50"},
        },
    ),
    _schema(
        "list_entity_types",
        "列出卡片类型（含属性名），用于新建卡片时选择类型。",
        {},
    ),
    _schema(
        "propose_create_document",
        "提议新建一份文档。改动不会立刻生效，会进入变更集等用户确认。",
        {
            "name": {"type": "string", "description": "文档名称"},
            "document_type": {"type": "string", "description": "文档类型，默认 card"},
            "parent_id": {"type": "integer", "description": "可选，父文档 id"},
            "era_id": {"type": "integer", "description": "可选，所属纪元 id"},
            "entity_type": {"type": "integer", "description": "可选，卡片类型 id"},
            "summary": {"type": "string", "description": "这次改动的一句话说明"},
        },
        ["name"],
    ),
    _schema(
        "propose_update_document",
        "提议修改一份文档：可以改名，或追加一段正文。改动进入变更集等用户确认。",
        {
            "document_id": {"type": "integer", "description": "要修改的文档 id"},
            "name": {"type": "string", "description": "可选，新名称"},
            "append_text": {"type": "string", "description": "可选，追加到正文末尾的文字"},
            "summary": {"type": "string", "description": "这次改动的一句话说明"},
        },
        ["document_id"],
    ),
    _schema(
        "propose_create_timeline_event",
        "提议在世界总时间线上新建事件。改动进入变更集等用户确认。",
        {
            "document_id": {"type": "integer",
                            "description": "可选，旧时间线文档 id；不传则记到世界总时间线"},
            "title": {"type": "string", "description": "事件标题"},
            "year": {"type": "integer", "description": "年份"},
            "month": {"type": "integer", "description": "可选，月份"},
            "day": {"type": "integer", "description": "可选，日期"},
            "era_id": {"type": "integer", "description": "可选，纪元 id"},
            "description": {"type": "string", "description": "事件描述"},
            "summary": {"type": "string", "description": "这次改动的一句话说明"},
        },
        ["title"],
    ),
]


def _as_int(value, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _as_text(value, limit: int = 4000) -> str:
    text = value if isinstance(value, str) else ("" if value is None else str(value))
    return text.strip()[:limit]


def _limit(value, default: int = 30) -> int:
    number = _as_int(value, default)
    return max(1, min(number or default, MAX_LIMIT))


class ToolRunner:
    """执行一次对话里模型请求的工具，并收集它提议的改动。"""

    def __init__(self, world, user=None, can_edit: bool = False):
        self.world = world
        self.user = user
        self.can_edit = can_edit
        self.changes: list[dict] = []

    # -- 对外接口 ----------------------------------------------------------- #
    def schemas(self) -> list[dict]:
        return TOOLS

    def run(self, name: str, arguments: dict | None) -> dict:
        handler = getattr(self, f"_tool_{name}", None)
        if handler is None:
            return {"error": f"未知工具：{name}"}
        try:
            result = handler(arguments or {})
        except Exception as exc:  # noqa: BLE001 - 工具错误要回给模型，不能打断循环
            return {"error": str(exc)}
        return result

    # -- 内部工具 ----------------------------------------------------------- #
    def _documents(self):
        return Document.objects.filter(world=self.world, deleted_at__isnull=True)

    def _document(self, doc_id) -> Document | None:
        return self._documents().filter(pk=_as_int(doc_id, 0)).first()

    def _require_document(self, doc_id) -> Document:
        document = self._document(doc_id)
        if document is None:
            raise ValueError("文档不存在或已删除")
        return document

    # -- 只读工具 ----------------------------------------------------------- #
    def _tool_list_documents(self, arguments: dict) -> dict:
        queryset = self._documents().order_by("position", "id")
        doc_type = _as_text(arguments.get("document_type"), 40)
        if doc_type:
            if doc_type not in DOC_TYPE_VALUES:
                return {"error": f"未知文档类型：{doc_type}"}
            queryset = queryset.filter(document_type=doc_type)
        rows = [
            {
                "id": document.id,
                "name": document.name,
                "type": document.document_type,
                "parent": document.parent_id,
            }
            for document in queryset[:_limit(arguments.get("limit"), 30)]
        ]
        return {"documents": rows, "count": len(rows)}

    def _tool_get_document(self, arguments: dict) -> dict:
        document = self._require_document(arguments.get("document_id"))
        payload = document.to_payload(with_card=True)
        if document.document_type == DOC_TIMELINE:
            payload["events"] = [
                event.to_payload() for event in document.events.order_by("year", "month", "day", "id")[:MAX_LIMIT]
            ]
        if document.document_type == "map":
            payload["markers"] = [
                marker.to_payload()
                for marker in document.map_markers.order_by("position", "id")[:MAX_LIMIT]
            ]
        return {"document": payload}

    def _tool_search_documents(self, arguments: dict) -> dict:
        query = _as_text(arguments.get("query"), 120)
        if not query:
            return {"error": "搜索关键词不能为空"}
        queryset = self._documents().filter(
            Q(name__icontains=query) | Q(card__body__icontains=query)
        ).distinct().order_by("position", "id")
        rows = [
            {
                "id": document.id,
                "name": document.name,
                "type": document.document_type,
                "parent": document.parent_id,
            }
            for document in queryset[:_limit(arguments.get("limit"), 20)]
        ]
        return {"query": query, "documents": rows, "count": len(rows)}

    def _tool_list_timeline_events(self, arguments: dict) -> dict:
        # 0.7.0：事件都挂在世界总时间线上；``document_id`` 只是旧文档的过滤条件
        queryset = TimelineEvent.objects.filter(timeline__world=self.world)
        document_id = _as_int(arguments.get("document_id"), 0)
        if document_id:
            queryset = queryset.filter(document_id=document_id)
        events = queryset.order_by("year", "month", "day", "position", "id")[:_limit(arguments.get("limit"), 40)]
        return {"events": [event.to_payload() for event in events]}

    def _tool_list_eras(self, arguments: dict) -> dict:
        eras = Era.objects.filter(world=self.world).order_by("position", "id")
        return {"eras": [era.to_payload() for era in eras]}

    def _tool_list_map_markers(self, arguments: dict) -> dict:
        queryset = MapMarker.objects.filter(document__world=self.world,
                                            document__deleted_at__isnull=True)
        document_id = _as_int(arguments.get("document_id"), 0)
        if document_id:
            queryset = queryset.filter(document_id=document_id)
        markers = queryset.order_by("position", "id")[:_limit(arguments.get("limit"), 40)]
        return {"markers": [marker.to_payload() for marker in markers]}

    def _tool_list_entity_types(self, arguments: dict) -> dict:
        types = EntityType.objects.filter(world=self.world).order_by("position", "id")
        return {
            "types": [
                {
                    "id": entity_type.id,
                    "name": entity_type.name,
                    "parent": entity_type.parent_id,
                    "properties": [prop.name for prop in entity_type.all_properties()],
                }
                for entity_type in types
            ]
        }

    # -- 提议工具 ----------------------------------------------------------- #
    def _propose(self, kind: str, payload: dict, summary: str) -> dict:
        if not self.can_edit:
            return {"error": "当前账号只有阅读权限，不能提议改动"}
        self.changes.append({"kind": kind, "payload": payload, "summary": summary})
        return {"proposed": True, "summary": summary}

    def _tool_propose_create_document(self, arguments: dict) -> dict:
        name = _as_text(arguments.get("name"), 200)
        if not name:
            return {"error": "文档名称不能为空"}
        doc_type = _as_text(arguments.get("document_type"), 40) or DOC_CARD
        if doc_type not in DOC_TYPE_VALUES:
            return {"error": f"未知文档类型：{doc_type}"}
        parent_id = _as_int(arguments.get("parent_id"), 0) or None
        if parent_id and self._document(parent_id) is None:
            return {"error": "父文档不存在或已删除"}
        era_id = _as_int(arguments.get("era_id"), 0) or None
        if era_id and not Era.objects.filter(world=self.world, pk=era_id).exists():
            return {"error": "纪元不存在"}
        entity_type_id = _as_int(arguments.get("entity_type"), 0) or None
        if entity_type_id and doc_type == DOC_CARD:
            if not EntityType.objects.filter(world=self.world, pk=entity_type_id).exists():
                return {"error": "卡片类型不存在"}
        elif entity_type_id:
            entity_type_id = None
        payload = {
            "name": name,
            "document_type": doc_type,
            "parent_id": parent_id,
            "era_id": era_id,
            "entity_type": entity_type_id,
            "note": _as_text(arguments.get("summary"), 300),
        }
        summary = payload["note"] or f"新建{DOC_TYPE_LABELS.get(doc_type, doc_type)}「{name}」"
        return self._propose(CHANGE_CREATE_DOCUMENT, payload, summary)

    def _tool_propose_update_document(self, arguments: dict) -> dict:
        document = self._document(arguments.get("document_id"))
        if document is None:
            return {"error": "文档不存在或已删除"}
        name = _as_text(arguments.get("name"), 200)
        append_text = _as_text(arguments.get("append_text"), 4000)
        if not name and not append_text:
            return {"error": "没有要修改的内容"}
        payload = {
            "document_id": document.id,
            "document_name": document.name,
            "name": name,
            "append_text": append_text,
            "note": _as_text(arguments.get("summary"), 300),
        }
        parts = []
        if name:
            parts.append(f"改名为「{name}」")
        if append_text:
            parts.append("追加正文")
        summary = payload["note"] or f"修改文档「{document.name}」：" + "、".join(parts)
        return self._propose(CHANGE_UPDATE_DOCUMENT, payload, summary)

    def _tool_propose_create_timeline_event(self, arguments: dict) -> dict:
        # 0.7.0：默认记到世界总时间线；只有显式给旧时间线文档时才挂回文档
        document = None
        document_id = _as_int(arguments.get("document_id"), 0) or None
        if document_id:
            document = self._document(document_id)
            if document is None:
                return {"error": "文档不存在或已删除"}
            if document.document_type != DOC_TIMELINE:
                return {"error": "目标文档不是时间线"}
        title = _as_text(arguments.get("title"), 160)
        if not title:
            return {"error": "事件标题不能为空"}
        era_id = _as_int(arguments.get("era_id"), 0) or None
        if era_id and not Era.objects.filter(world=self.world, pk=era_id).exists():
            return {"error": "纪元不存在"}
        has_month = _as_int(arguments.get("month"), 0) > 0
        has_day = _as_int(arguments.get("day"), 0) > 0
        payload = {
            "document_id": document.id if document is not None else None,
            "document_name": document.name if document is not None else "世界时间线",
            "title": title,
            "precision": "day" if has_day else ("month" if has_month else "year"),
            "year": _as_int(arguments.get("year"), 0),
            "month": max(1, min(_as_int(arguments.get("month"), 1), 12)),
            "day": max(1, min(_as_int(arguments.get("day"), 1), 31)),
            "era_id": era_id,
            "description": _as_text(arguments.get("description"), 2000),
            "note": _as_text(arguments.get("summary"), 300),
        }
        summary = payload["note"] or f"在「{payload['document_name']}」新建事件「{title}」"
        return self._propose(CHANGE_CREATE_TIMELINE_EVENT, payload, summary)
