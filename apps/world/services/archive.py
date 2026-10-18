# -*- coding: utf-8 -*-
"""世界存档：整包快照与整包回滚（0.7.0 §4.3）。

一个世界的「全部内容」都在这里进出：

* ``snapshot_world`` —— 把文档树 / 卡片 / 时间线 / 时代 / 历法 / 地图 / 图谱拍成
  一份纯 JSON（地图的 ``map_data`` 原样带上，不做解析）。
* ``create_archive`` —— 落一条 ``WorldArchive``，顺手按 ``MAX_ARCHIVES`` 剪枝。
* ``restore_archive`` —— 读档前先自动备份一份，再清空世界并按快照重建。

两个约定值得写在这里：

1. **重建而不是覆盖主键**。数据库主键是全局唯一的，快照里的旧 id 可能已经被
   别的世界占走；读档时统一走「新建行 + 旧 id → 新 id 映射」，所有引用
   （文档父级 / 时代 / 类型 / 属性值里的引用 / 事件的关联卡片 / 图谱节点……）
   都按映射重写。代价是站内 ``#doc=<id>`` 这类临时链接会失效；正式地址用
   slug、发布站用 published_slug，不受影响。
2. **与 ``DocumentVersion`` 独立**。存档不保存文档级版本历史；读档会先删掉
   本世界的文档（版本历史随文档级联删除），这是「整包回滚」的应有之义。
"""

from __future__ import annotations

from datetime import date, datetime

from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime

from apps.documents.models import (
    Calendar,
    Card,
    Document,
    Era,
    TimelineEvent,
    WorldArchive,
    WorldTimeline,
)
from apps.graph.models import TreeEdge, TreeNode, TreeVariant
from apps.maps.models import MapLayer, MapMarker
from apps.world.models import (
    ARCHIVE_AUTO,
    ARCHIVE_KINDS,
    ARCHIVE_MANUAL,
    CONFIDENCE_EXACT,
    DOC_CARD,
    ERA_MODE_UNIVERSAL,
    MAX_ARCHIVES,
    EntityType,
    PropertyDef,
    VT_REFERENCE,
    World,
)
from apps.world.normalize import as_int

SNAPSHOT_FORMAT = "worldbuilding-timeline/archive"
SNAPSHOT_VERSION = 1

#: 读档会还原的世界字段（站点地址 / 所有者 / 发布 / 封禁都不动，免得读档改站点状态）
WORLD_FIELDS = (
    "name", "description", "theme_config", "ai_enabled",
    "auto_link_enabled", "link_entrance_enabled", "genres",
)

TYPE_FIELDS = ("id", "name", "parent", "icon", "color", "position", "hidden", "created_at")
PROPERTY_FIELDS = (
    "id", "entity_type", "name", "value_type", "options", "required", "default_value",
    "formula", "description", "position", "show_on_existing", "reference_type",
)
CALENDAR_FIELDS = (
    "id", "name", "mode", "hours_per_day", "months", "moons", "open_past",
    "default_precision", "start_year", "end_year", "is_preset", "created_at",
)
TIMELINE_FIELDS = ("id", "origin_year", "calendar", "settings", "created_at", "updated_at")
ERA_FIELDS = (
    "id", "name", "position", "start_year", "end_year", "start_precision",
    "end_precision", "length_years", "theme", "theme_config", "icon", "description",
    "cover",
)
DOCUMENT_FIELDS = (
    "id", "document_type", "name", "slug", "parent", "position", "era", "era_ids",
    "entity_type", "settings", "map_data", "preview", "cover", "icon", "pinned",
    "hidden", "is_published", "published_slug", "published_version", "published_at",
    "listed", "reveal_condition", "forked_from", "created_at", "updated_at",
    "deleted_at",
)
CARD_FIELDS = (
    "id", "document", "entity_type", "aliases", "values", "blocks", "blocks_doc",
    "comments", "body", "era_mode", "era_ids",
)
EVENT_FIELDS = (
    "id", "timeline", "document", "title", "precision", "year", "month", "day",
    "hour", "era", "description", "cover", "row", "position", "confidence",
    "range_years", "settings", "featured_card", "created_at", "updated_at",
)
LAYER_FIELDS = ("id", "document", "name", "position", "visible", "opacity")
MARKER_FIELDS = (
    "id", "document", "layer", "kind", "name", "description", "x", "y", "points",
    "color", "icon", "scale", "rotation", "card", "position", "created_at",
)
VARIANT_FIELDS = ("id", "document", "name", "kind", "position", "edge_labels",
                  "settings", "created_at")
NODE_FIELDS = (
    "id", "variant", "card", "name", "subtitle", "image", "kind", "note",
    "generation", "x", "y", "position", "junction", "deceased", "favourite",
    "group", "group_color",
)
EDGE_FIELDS = ("id", "variant", "source", "target", "kind", "label", "style",
               "start_year", "end_year")


# --------------------------------------------------------------------------- #
# 快照
# --------------------------------------------------------------------------- #
def _jsonable(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def _rows(queryset, fields) -> list[dict]:
    return [{key: _jsonable(value) for key, value in row.items()}
            for row in queryset.values(*fields)]


def _dict(value) -> dict:
    return value if isinstance(value, dict) else {}


def _list(value) -> list:
    return value if isinstance(value, list) else []


def snapshot_world(world: World) -> dict:
    """把整个世界拍成一份 JSON 可序列化的快照。"""
    timeline = WorldTimeline.objects.filter(world=world).first()
    events = list(TimelineEvent.objects.filter(
        # 0.7.0 的事件都在总时间线上；``document`` 条件兜住还没迁完的旧数据。
        **({} if timeline is None else {"timeline": timeline})
    ).values(*EVENT_FIELDS)) if timeline is not None else []
    if timeline is None:
        events = list(TimelineEvent.objects.filter(document__world=world).values(*EVENT_FIELDS))

    links: dict[int, list[int]] = {}
    event_ids = [row["id"] for row in events]
    if event_ids:
        through = TimelineEvent.linked_cards.through
        for event_id, document_id in through.objects.filter(
                timelineevent_id__in=event_ids,
        ).values_list("timelineevent_id", "document_id"):
            links.setdefault(event_id, []).append(document_id)
    for row in events:
        row["linked_cards"] = sorted(links.get(row["id"], []))

    return {
        "format": SNAPSHOT_FORMAT,
        "version": SNAPSHOT_VERSION,
        "created_at": timezone.now().isoformat(),
        "world": {field: _jsonable(getattr(world, field)) for field in WORLD_FIELDS},
        "types": _rows(EntityType.objects.filter(world=world).order_by("id"), TYPE_FIELDS),
        "properties": _rows(
            PropertyDef.objects.filter(entity_type__world=world).order_by("id"),
            PROPERTY_FIELDS,
        ),
        "calendars": _rows(Calendar.objects.filter(world=world).order_by("id"),
                           CALENDAR_FIELDS),
        "timeline": _rows(WorldTimeline.objects.filter(world=world), TIMELINE_FIELDS),
        "eras": _rows(Era.objects.filter(world=world).order_by("id"), ERA_FIELDS),
        "documents": _rows(Document.objects.filter(world=world).order_by("id"),
                           DOCUMENT_FIELDS),
        "cards": _rows(Card.objects.filter(document__world=world).order_by("id"),
                       CARD_FIELDS),
        "events": [{key: _jsonable(value) for key, value in row.items()} for row in events],
        "map_layers": _rows(MapLayer.objects.filter(document__world=world).order_by("id"),
                            LAYER_FIELDS),
        "map_markers": _rows(MapMarker.objects.filter(document__world=world).order_by("id"),
                             MARKER_FIELDS),
        "tree_variants": _rows(
            TreeVariant.objects.filter(document__world=world).order_by("id"),
            VARIANT_FIELDS,
        ),
        "tree_nodes": _rows(
            TreeNode.objects.filter(variant__document__world=world).order_by("id"),
            NODE_FIELDS,
        ),
        "tree_edges": _rows(
            TreeEdge.objects.filter(variant__document__world=world).order_by("id"),
            EDGE_FIELDS,
        ),
    }


def summarize(payload: dict) -> str:
    """存档列表里那句摘要，形如「12 篇文档 · 3 个事件 · 2 个时代 · 1 张地图」。"""
    documents = _list(payload.get("documents"))
    events = _list(payload.get("events"))
    eras = _list(payload.get("eras"))
    maps = [d for d in documents if d.get("document_type") == "map"]
    parts = [f"{len(documents)} 篇文档", f"{len(events)} 个事件", f"{len(eras)} 个时代"]
    if maps:
        parts.append(f"{len(maps)} 张地图")
    return " · ".join(parts)


# --------------------------------------------------------------------------- #
# 存档 / 剪枝
# --------------------------------------------------------------------------- #
def create_archive(world: World, *, name: str = "", note: str = "",
                   kind: str = ARCHIVE_MANUAL, author=None) -> WorldArchive:
    payload = snapshot_world(world)
    if kind not in dict(ARCHIVE_KINDS):
        kind = ARCHIVE_MANUAL
    default_name = timezone.localtime().strftime("存档 %Y-%m-%d %H:%M")
    archive = WorldArchive.objects.create(
        world=world,
        name=(name or default_name)[:80],
        note=(note or "")[:200],
        kind=kind,
        author=author if getattr(author, "is_authenticated", False) else None,
        payload=payload,
        summary=summarize(payload),
    )
    prune_archives(world)
    return archive


def prune_archives(world: World) -> None:
    """只留最新的 ``MAX_ARCHIVES`` 份（拍板④：上限 20）。"""
    extra = list(world.archives.order_by("-created_at", "-id")
                 .values_list("id", flat=True)[MAX_ARCHIVES:])
    if extra:
        WorldArchive.objects.filter(id__in=extra).delete()


# --------------------------------------------------------------------------- #
# 读档
# --------------------------------------------------------------------------- #
def restore_archive(archive: WorldArchive, *, author=None) -> dict:
    """整包回滚到这份存档；回滚前自动留一份「读档前备份」。"""
    payload = archive.payload if isinstance(archive.payload, dict) else {}
    if not payload:
        raise ValueError("这份存档没有内容")
    if payload.get("format") != SNAPSHOT_FORMAT:
        raise ValueError("无法识别的存档格式")
    world = archive.world
    restored_from = archive.to_payload()
    backup = create_archive(
        world,
        name=f"读档前自动备份 · {archive.name}"[:80],
        note=f"准备读档：{archive.name}"[:200],
        kind=ARCHIVE_AUTO,
        author=author,
    )
    with transaction.atomic():
        _clear_world(world)
        _restore_world(world, payload)
    return {"restored_from": restored_from, "backup": backup.to_payload()}


def _clear_world(world: World) -> None:
    """把世界的全部内容清空（存档本身与成员 / 发布状态不动）。"""
    TreeEdge.objects.filter(variant__document__world=world).delete()
    TreeNode.objects.filter(variant__document__world=world).delete()
    TreeVariant.objects.filter(document__world=world).delete()
    MapMarker.objects.filter(document__world=world).delete()
    MapLayer.objects.filter(document__world=world).delete()
    TimelineEvent.objects.filter(document__world=world).delete()
    TimelineEvent.objects.filter(timeline__world=world).delete()
    Card.objects.filter(document__world=world).delete()
    Document.objects.filter(world=world).delete()
    WorldTimeline.objects.filter(world=world).delete()
    Era.objects.filter(world=world).delete()
    Calendar.objects.filter(world=world).delete()
    PropertyDef.objects.filter(entity_type__world=world).delete()
    EntityType.objects.filter(world=world).delete()


def _parse_moment(value):
    """快照里的时间串 → aware datetime；空值 / 解析失败都回 None。"""
    if not value:
        return None
    if isinstance(value, datetime):
        moment = value
    else:
        moment = parse_datetime(str(value))
        if moment is None:
            day = parse_date(str(value))
            if day is None:
                return None
            moment = datetime(day.year, day.month, day.day)
    if timezone.is_naive(moment):
        moment = timezone.make_aware(moment)
    return moment


def _stamp(model, pk, row: dict, fields) -> None:
    """回填 auto_now / auto_now_add 列（``update()`` 不触发 pre_save）。"""
    patch = {field: _parse_moment(row.get(field)) for field in fields if row.get(field)}
    if patch:
        model.objects.filter(pk=pk).update(**patch)


def _remap_id_list(value, mapping: dict) -> list:
    out = []
    for raw in _list(value):
        mapped = mapping.get(as_int(raw))
        if mapped is not None:
            out.append(mapped)
    return out


def _remap_foreign_id(value, mapping: dict):
    """旧外键 id → 新 id；映射值可能是新 id（类型 / 时代）或新对象（文档）。"""
    mapped = mapping.get(as_int(value))
    if mapped is None:
        return None
    return mapped.id if hasattr(mapped, "id") else mapped


def _remap_settings(value, calendar_map: dict, era_map: dict) -> dict:
    """``settings`` 里的 ``calendar`` 与 ``era_spans`` 键（时代 id）都要换新 id。"""
    settings = dict(_dict(value))
    if "calendar" in settings:
        mapped = calendar_map.get(as_int(settings.get("calendar")))
        if mapped is None:
            settings.pop("calendar")
        else:
            settings["calendar"] = mapped
    spans = settings.get("era_spans")
    if isinstance(spans, dict):
        remapped = {}
        for key, span in spans.items():
            era_id = era_map.get(as_int(key))
            if era_id is not None:
                remapped[str(era_id)] = span
        if remapped:
            settings["era_spans"] = remapped
        else:
            settings.pop("era_spans")
    return settings


def _remap_reference(raw, doc_map: dict):
    if isinstance(raw, (list, tuple)):
        return [doc_map[as_int(item)].id for item in raw if as_int(item) in doc_map]
    target = doc_map.get(as_int(raw))
    return target.id if target is not None else None


def _remap_values(values, prop_map: dict, reference_props: set, doc_map: dict) -> dict:
    """``Card.values`` 的键是属性 id，引用型属性的值是被引用文档 id。"""
    out = {}
    for key, raw in _dict(values).items():
        old_id = as_int(key)
        new_id = prop_map.get(old_id)
        if new_id is None:
            continue
        if old_id in reference_props:
            mapped = _remap_reference(raw, doc_map)
            if mapped is None or mapped == []:
                continue
            out[str(new_id)] = mapped
        else:
            out[str(new_id)] = raw
    return out


def _restore_world(world: World, payload: dict) -> None:
    data = _dict(payload.get("world"))
    fields = [field for field in WORLD_FIELDS if field in data]
    if fields:
        for field in fields:
            setattr(world, field, data[field])
        world.save(update_fields=fields)

    # 类型：先建行（parent 留空），第二遍回填父子关系
    type_map: dict[int, int] = {}
    type_rows = _list(payload.get("types"))
    for row in type_rows:
        entity_type = EntityType.objects.create(
            world=world,
            name=row.get("name") or "未命名类型",
            icon=row.get("icon") or "",
            color=row.get("color") or "",
            position=row.get("position") or 0,
            hidden=bool(row.get("hidden")),
        )
        type_map[as_int(row.get("id"))] = entity_type.id
        _stamp(EntityType, entity_type.id, row, ("created_at",))
    for row in type_rows:
        new_id = type_map.get(as_int(row.get("id")))
        parent_id = type_map.get(as_int(row.get("parent")))
        if new_id and parent_id:
            EntityType.objects.filter(pk=new_id).update(parent_id=parent_id)

    # 属性：reference_type 同样第二遍回填
    prop_map: dict[int, int] = {}
    reference_props: set[int] = set()
    prop_rows = _list(payload.get("properties"))
    for row in prop_rows:
        entity_type_id = type_map.get(as_int(row.get("entity_type")))
        if entity_type_id is None:
            continue
        prop = PropertyDef.objects.create(
            entity_type_id=entity_type_id,
            name=row.get("name") or "属性",
            value_type=row.get("value_type") or "text",
            options=_list(row.get("options")),
            required=bool(row.get("required")),
            default_value=row.get("default_value"),
            formula=row.get("formula") or "",
            description=row.get("description") or "",
            position=row.get("position") or 0,
            show_on_existing=bool(row.get("show_on_existing")),
        )
        old_id = as_int(row.get("id"))
        prop_map[old_id] = prop.id
        if row.get("value_type") == VT_REFERENCE:
            reference_props.add(old_id)
    for row in prop_rows:
        new_id = prop_map.get(as_int(row.get("id")))
        reference_id = type_map.get(as_int(row.get("reference_type")))
        if new_id and reference_id:
            PropertyDef.objects.filter(pk=new_id).update(reference_type_id=reference_id)

    calendar_map: dict[int, int] = {}
    for row in _list(payload.get("calendars")):
        calendar = Calendar.objects.create(
            world=world,
            name=row.get("name") or "日历",
            mode=row.get("mode") or "earth",
            hours_per_day=row.get("hours_per_day") or 24,
            months=_list(row.get("months")),
            moons=_list(row.get("moons")),
            open_past=bool(row.get("open_past")),
            default_precision=row.get("default_precision") or "year",
            start_year=row.get("start_year"),
            end_year=row.get("end_year"),
            is_preset=bool(row.get("is_preset")),
        )
        calendar_map[as_int(row.get("id"))] = calendar.id
        _stamp(Calendar, calendar.id, row, ("created_at",))

    timeline_rows = _list(payload.get("timeline"))
    timeline = None
    if timeline_rows:
        row = timeline_rows[0]
        timeline = WorldTimeline.objects.create(
            world=world,
            origin_year=row.get("origin_year") or 0.0,
            calendar_id=calendar_map.get(as_int(row.get("calendar"))),
            settings=_remap_settings(row.get("settings"), calendar_map, {}),
        )
    elif _list(payload.get("events")):
        timeline = WorldTimeline.for_world(world)

    era_map: dict[int, int] = {}
    for row in _list(payload.get("eras")):
        era = Era.objects.create(
            world=world,
            name=row.get("name") or "新纪元",
            position=row.get("position") or 0,
            start_year=row.get("start_year"),
            end_year=row.get("end_year"),
            start_precision=row.get("start_precision") or "year",
            end_precision=row.get("end_precision") or "year",
            length_years=row.get("length_years") or 0.0,
            theme=row.get("theme") or "blue",
            theme_config=_dict(row.get("theme_config")),
            icon=row.get("icon") or "",
            description=row.get("description") or "",
            cover=row.get("cover") or "",
        )
        era_map[as_int(row.get("id"))] = era.id

    if timeline is not None and timeline_rows:
        # era_spans 的键是时代 id，必须等时代建完再回填
        timeline.settings = _remap_settings(timeline_rows[0].get("settings"),
                                            calendar_map, era_map)
        timeline.save(update_fields=["settings", "updated_at"])
        _stamp(WorldTimeline, timeline.id, timeline_rows[0], ("created_at", "updated_at"))

    doc_map: dict[int, object] = {}
    doc_rows = _list(payload.get("documents"))
    for row in doc_rows:
        document = Document.objects.create(
            world=world,
            document_type=row.get("document_type") or DOC_CARD,
            name=row.get("name") or "未命名",
            slug=row.get("slug") or "",
            position=row.get("position") or 0,
            era_id=era_map.get(as_int(row.get("era"))),
            era_ids=_remap_id_list(row.get("era_ids"), era_map),
            entity_type_id=_remap_foreign_id(row.get("entity_type"), type_map),
            settings=_remap_settings(row.get("settings"), calendar_map, era_map),
            map_data=row.get("map_data") or "",
            preview=_dict(row.get("preview")),
            cover=row.get("cover") or "",
            icon=row.get("icon") or "",
            pinned=bool(row.get("pinned")),
            hidden=bool(row.get("hidden")),
            is_published=row.get("is_published", True),
            published_slug=row.get("published_slug") or "",
            published_version=row.get("published_version") or 0,
            listed=row.get("listed", True),
            reveal_condition=row.get("reveal_condition") or "",
        )
        doc_map[as_int(row.get("id"))] = document
        _stamp(Document, document.id, row,
               ("created_at", "updated_at", "published_at", "deleted_at"))
    for row in doc_rows:
        document = doc_map.get(as_int(row.get("id")))
        if document is None:
            continue
        parent = doc_map.get(as_int(row.get("parent")))
        forked = doc_map.get(as_int(row.get("forked_from")))
        if parent is not None or forked is not None:
            Document.objects.filter(pk=document.pk).update(
                parent_id=parent.id if parent is not None else None,
                forked_from_id=forked.id if forked is not None else None,
            )

    for row in _list(payload.get("cards")):
        document = doc_map.get(as_int(row.get("document")))
        if document is None:
            continue
        Card.objects.create(
            document=document,
            entity_type_id=_remap_foreign_id(row.get("entity_type"), type_map),
            aliases=_list(row.get("aliases")),
            values=_remap_values(row.get("values"), prop_map, reference_props, doc_map),
            blocks=_list(row.get("blocks")),
            blocks_doc=_list(row.get("blocks_doc")),
            comments=_list(row.get("comments")),
            body=row.get("body") or "",
            era_mode=row.get("era_mode") or ERA_MODE_UNIVERSAL,
            era_ids=_remap_id_list(row.get("era_ids"), era_map),
        )

    for row in _list(payload.get("events")):
        event = TimelineEvent.objects.create(
            timeline=timeline,
            document=doc_map.get(as_int(row.get("document"))),
            title=row.get("title") or "未命名事件",
            precision=row.get("precision") or "year",
            year=as_int(row.get("year")),
            month=as_int(row.get("month"), 1) or 1,
            day=as_int(row.get("day"), 1) or 1,
            hour=as_int(row.get("hour")),
            era_id=era_map.get(as_int(row.get("era"))),
            description=row.get("description") or "",
            cover=row.get("cover") or "",
            row=as_int(row.get("row")),
            position=as_int(row.get("position")),
            confidence=row.get("confidence") or CONFIDENCE_EXACT,
            range_years=row.get("range_years") or 0.0,
            settings=_dict(row.get("settings")),
            featured_card_id=_remap_foreign_id(row.get("featured_card"), doc_map),
        )
        _stamp(TimelineEvent, event.id, row, ("created_at", "updated_at"))
        linked = [doc_map[as_int(item)] for item in _list(row.get("linked_cards"))
                  if as_int(item) in doc_map]
        if linked:
            event.linked_cards.set(linked)

    layer_map: dict[int, int] = {}
    for row in _list(payload.get("map_layers")):
        document = doc_map.get(as_int(row.get("document")))
        if document is None:
            continue
        layer = MapLayer.objects.create(
            document=document,
            name=row.get("name") or "默认",
            position=row.get("position") or 0,
            visible=row.get("visible", True),
            opacity=row.get("opacity") if row.get("opacity") is not None else 1.0,
        )
        layer_map[as_int(row.get("id"))] = layer.id

    for row in _list(payload.get("map_markers")):
        document = doc_map.get(as_int(row.get("document")))
        if document is None:
            continue
        marker = MapMarker.objects.create(
            document=document,
            layer_id=layer_map.get(as_int(row.get("layer"))),
            kind=row.get("kind") or "pin",
            name=row.get("name") or "",
            description=row.get("description") or "",
            x=row.get("x") if row.get("x") is not None else 50.0,
            y=row.get("y") if row.get("y") is not None else 50.0,
            points=_list(row.get("points")),
            color=row.get("color") or "gold",
            icon=row.get("icon") or "",
            scale=row.get("scale") if row.get("scale") is not None else 1.0,
            rotation=row.get("rotation") or 0.0,
            card_id=_remap_foreign_id(row.get("card"), doc_map),
            position=row.get("position") or 0,
        )
        _stamp(MapMarker, marker.id, row, ("created_at",))

    variant_map: dict[int, int] = {}
    for row in _list(payload.get("tree_variants")):
        document = doc_map.get(as_int(row.get("document")))
        if document is None:
            continue
        variant = TreeVariant.objects.create(
            document=document,
            name=row.get("name") or "Main",
            kind=row.get("kind") or "family",
            position=row.get("position") or 1,
            edge_labels=_dict(row.get("edge_labels")),
            settings=_dict(row.get("settings")),
        )
        variant_map[as_int(row.get("id"))] = variant.id
        _stamp(TreeVariant, variant.id, row, ("created_at",))

    node_map: dict[int, int] = {}
    node_rows = _list(payload.get("tree_nodes"))
    for row in node_rows:
        variant_id = variant_map.get(as_int(row.get("variant")))
        if variant_id is None:
            continue
        node = TreeNode.objects.create(
            variant_id=variant_id,
            card_id=_remap_foreign_id(row.get("card"), doc_map),
            name=row.get("name") or "新成员",
            subtitle=row.get("subtitle") or "",
            image=row.get("image") or "",
            kind=row.get("kind") or "person",
            note=row.get("note") or "",
            generation=as_int(row.get("generation")),
            x=row.get("x") or 0.0,
            y=row.get("y") or 0.0,
            position=row.get("position") or 0,
            junction=bool(row.get("junction")),
            deceased=bool(row.get("deceased")),
            favourite=bool(row.get("favourite")),
            group=row.get("group") or "",
            group_color=row.get("group_color") or "",
        )
        node_map[as_int(row.get("id"))] = node.id

    for row in _list(payload.get("tree_edges")):
        variant_id = variant_map.get(as_int(row.get("variant")))
        source_id = node_map.get(as_int(row.get("source")))
        target_id = node_map.get(as_int(row.get("target")))
        if variant_id is None or source_id is None or target_id is None:
            continue
        TreeEdge.objects.create(
            variant_id=variant_id,
            source_id=source_id,
            target_id=target_id,
            kind=row.get("kind") or "parent",
            label=row.get("label") or "",
            style=row.get("style") or "",
            start_year=row.get("start_year"),
            end_year=row.get("end_year"),
        )
