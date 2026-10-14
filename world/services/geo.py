# -*- coding: utf-8 -*-
"""地图实体 ⇄ 世界编辑器 的桥。

地图里的国家 / 省份 / 城镇 / 河流只活在 Opuscule 的 pack 里（``Document.map_data`` 是
不透明字符串，服务端**从不解析**），所以这里收到的永远是前端从 pack 抽好的扁平 JSON。
本模块把它落成编辑器认识的三件东西：

* ``EntityType`` —— 国家 / 省份 / 城镇 / 地点 / 河流 / 山脉 / 道路（缺什么建什么，可重入）
* ``Document`` + ``Card`` —— 一个实体一张卡片，按 ``parent`` 组成
  「地理 → 国家 → 省份 → 城镇 → 地点」这棵树；没有归属的按类型放进同名文件夹
* ``MapMarker`` —— ``kind="pin"``、``card=`` 刚建的卡片：条目在地图上的位置就靠它

反向的「自动铺开下级」也在这里：给定一个条目，按它的地图锚点**确定性地**撒出下一级 ——
同一个条目每次撒出来的位置与名字都一样，不会越点越乱。

依赖方向：``world.services.geo`` 只碰模型与 ``world.normalize``，不 import ``world.views``。
"""

from __future__ import annotations

import math
from typing import Any

from django.db import transaction

from ..models import (
    DOC_CARD,
    DOC_FOLDER,
    MARKER_PIN,
    EntityType,
    PropertyDef,
    VT_NUMBER,
    VT_TEXT,
)
from ..normalize import coerce_property_value, normalize_blocks
from documents.models import Card, Document
from maps.models import MapMarker

#: 地理层级的根文件夹名
GEO_ROOT = "地理"
#: 每个条目的「所属」兜底文件夹：没有上级的实体按类型放进去（排序靠后，排在国家卡片后面）
GEO_ORPHAN_POSITION = 100

#: 每一级：图标 / 图钉颜色 / 下一级 / 自动铺开的半径（地图百分比）
GEO_LEVELS: dict[str, dict[str, Any]] = {
    "国家": {"icon": "flag", "color": "gold", "child": "省份", "spread": 12.0},
    "省份": {"icon": "map", "color": "sky", "child": "城镇", "spread": 6.0},
    "城镇": {"icon": "building", "color": "teal", "child": "地点", "spread": 2.5},
    "地点": {"icon": "map-pin", "color": "violet", "child": "", "spread": 1.0},
    "河流": {"icon": "waves", "color": "blue", "child": "", "spread": 3.0},
    "山脉": {"icon": "mountain", "color": "violet", "child": "", "spread": 3.0},
    "道路": {"icon": "route", "color": "teal", "child": "", "spread": 3.0},
}

#: 层级的规范顺序（也是类型与兜底文件夹的顺序）
GEO_ORDER = ["国家", "省份", "城镇", "地点", "河流", "山脉", "道路"]

#: 每级的属性：属性名 → 值类型。名称用中文，与起始类型「角色 / 地点 / 事件」同一套语言。
#: 跨级的引用（首都 / 所属国家…）先存**名字文本**：地图抽出来的就是名字，转引用要另一轮映射，
#: 用户想改成真正的引用随时可以在类型里改。
GEO_PROPERTIES: dict[str, list[tuple[str, str]]] = {
    "国家": [
        ("全称", VT_TEXT),
        ("政体", VT_TEXT),
        ("首都", VT_TEXT),
        ("文化", VT_TEXT),
        ("面积", VT_NUMBER),
        ("人口", VT_NUMBER),
        ("颜色", VT_TEXT),
    ],
    "省份": [("所属国家", VT_TEXT), ("省会", VT_TEXT), ("面积", VT_NUMBER), ("人口", VT_NUMBER)],
    "城镇": [
        ("所属国家", VT_TEXT),
        ("所属省份", VT_TEXT),
        ("人口", VT_NUMBER),
        ("类型", VT_TEXT),
        ("分组", VT_TEXT),
        ("坐标", VT_TEXT),
    ],
    "地点": [("所属", VT_TEXT), ("坐标", VT_TEXT)],
    "河流": [("长度", VT_NUMBER), ("流域", VT_TEXT), ("坐标", VT_TEXT)],
    "山脉": [("所属", VT_TEXT), ("坐标", VT_TEXT)],
    "道路": [("类型", VT_TEXT), ("端点", VT_TEXT), ("坐标", VT_TEXT)],
}

#: 自动铺开时给下级起的后缀，按子级分别给一组：名字 = 父名 + 「·」 + 后缀，
#: 例如「临江国·北境」「石头城·北郊」—— 一眼知道从哪来，用户改名很快
SPREAD_SUFFIXES: dict[str, list[str]] = {
    "省份": ["北境", "南境", "东境", "西境", "中州", "上郡", "下郡", "腹地", "边郡", "外郡"],
    "城镇": ["城", "镇", "港", "关", "堡", "驿", "寨", "市", "屯", "戍"],
    "地点": ["北郊", "渡口", "山隘", "旧垒", "盐场", "林地", "石桥", "古渡", "草甸", "崖上", "溪口", "南陌"],
}
SPREAD_FALLBACK_SUFFIXES = ["一号", "二号", "三号", "四号", "五号", "六号", "七号", "八号"]

#: 自动铺开的数量：有面积就按面积算，没有就给个中位数；手填的值优先
SPREAD_AREA_PER_CHILD = 400.0
SPREAD_DEFAULT = 4
SPREAD_MIN = 2
SPREAD_MAX = 12

#: 卡片「概览」里各类型显示哪几项
OVERVIEW_FIELDS = {
    "国家": ["全称", "政体", "首都", "人口"],
    "省份": ["所属国家", "省会", "人口"],
    "城镇": ["所属省份", "人口", "类型"],
    "地点": ["所属"],
    "河流": ["长度", "流域"],
    "山脉": ["所属"],
    "道路": ["类型", "端点"],
}


def _clamp_percent(value: Any) -> float | None:
    """地图坐标一律存 0–100 的百分比；认不出的值当没有。"""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    return max(0.0, min(100.0, number))


def _text(value: Any, limit: int = 200) -> str:
    return str(value or "").strip()[:limit]


def ensure_geo_types(world) -> dict[str, EntityType]:
    """建好地理类型与它们的属性；已存在就复用（可重入，重复导入不会长出第二套类型）。"""
    types: dict[str, EntityType] = {}
    for index, kind in enumerate(GEO_ORDER):
        spec = GEO_LEVELS[kind]
        entity_type, _ = EntityType.objects.get_or_create(
            world=world,
            name=kind,
            defaults={"icon": spec["icon"], "color": spec["color"], "position": index},
        )
        for prop_index, (prop_name, value_type) in enumerate(GEO_PROPERTIES.get(kind, [])):
            PropertyDef.objects.get_or_create(
                entity_type=entity_type,
                name=prop_name,
                defaults={"value_type": value_type, "position": prop_index},
            )
        types[kind] = entity_type
    return types


def geo_folder(world, name: str, parent: Document | None = None, position: int | None = None) -> Document:
    """按名字取 / 建文件夹（「地理」以及下面按类型兜底的那些）。"""
    folder = Document.objects.filter(
        world=world, document_type=DOC_FOLDER, parent=parent, name=name, deleted_at__isnull=True
    ).first()
    if folder is not None:
        return folder
    if position is None:
        position = Document.objects.filter(world=world, parent=parent, deleted_at__isnull=True).count()
    return Document.objects.create(
        world=world, document_type=DOC_FOLDER, name=name, parent=parent, position=position
    )


def _values_for(entity_type: EntityType, attrs: dict[str, Any]) -> dict[str, Any]:
    """属性名 → 值 → 键换成属性 id（编辑器前端就是这么存的），非法值直接跳过。"""
    props = {prop.name: prop for prop in entity_type.properties.all()}
    values: dict[str, Any] = {}
    for name, raw in attrs.items():
        prop = props.get(name)
        if prop is None or raw in (None, "", []):
            continue
        try:
            values[str(prop.id)] = coerce_property_value(prop, raw)
        except Exception:  # noqa: BLE001 —— 单个值不合法不该让整次导入失败
            continue
    return values


def _overview(kind: str, name: str, attrs: dict[str, Any]) -> str:
    """卡片开头那块「概览」：几行关键信息，省得点进去是空白。"""
    lines = [name]
    for field in OVERVIEW_FIELDS.get(kind, []):
        value = attrs.get(field)
        if value in (None, "", []):
            continue
        lines.append(f"{field}：{value}")
    return "\n".join(lines)


def _upsert_card(
    world,
    parent: Document,
    kind: str,
    name: str,
    attrs: dict[str, Any],
    entity_type: EntityType,
    position: int,
) -> tuple[Document, bool]:
    """同名同级就地更新，别重复导入时把树复制一遍。返回 (文档, 是否新建)。"""
    document = Document.objects.filter(
        world=world,
        document_type=DOC_CARD,
        parent=parent,
        name=name,
        deleted_at__isnull=True,
    ).first()
    created = document is None
    if created:
        document = Document.objects.create(
            world=world, document_type=DOC_CARD, name=name, parent=parent, position=position
        )

    values = _values_for(entity_type, attrs)
    card = getattr(document, "card", None)
    if card is None:
        card = Card(document=document, entity_type=entity_type, values=values)
        card.blocks = normalize_blocks([{"id": "b1", "type": "text", "title": "概览", "text": _overview(kind, name, attrs)}])
        card.save()
    else:
        card.entity_type = entity_type
        merged = dict(card.values) if isinstance(card.values, dict) else {}
        merged.update(values)
        card.values = merged
        card.save(update_fields=["entity_type", "values"])

    if document.entity_type_id != entity_type.id:
        document.entity_type = entity_type
        document.save(update_fields=["entity_type", "updated_at"])
    return document, created


def _pin(map_doc: Document, card: Document, kind: str, x: Any, y: Any) -> MapMarker | None:
    """条目在地图上的位置：一个图钉（``card`` 指回卡片，这就是「图钉 ↔ 条目」那座桥）。"""
    px, py = _clamp_percent(x), _clamp_percent(y)
    if px is None or py is None:
        return None
    marker, _ = MapMarker.objects.get_or_create(
        document=map_doc,
        card=card,
        defaults={
            "kind": MARKER_PIN,
            "name": card.name,
            "color": GEO_LEVELS.get(kind, {}).get("color", "gold"),
            "x": px,
            "y": py,
        },
    )
    touched = []
    for field, value in (("name", card.name), ("x", px), ("y", py)):
        if getattr(marker, field) != value:
            setattr(marker, field, value)
            touched.append(field)
    if touched:
        marker.save(update_fields=touched)
    return marker


@transaction.atomic
def import_entities(map_doc: Document, payload: dict[str, Any]) -> dict[str, Any]:
    """把前端抽好的实体落成卡片 + 图钉。

    载荷形状（前端按 pack 抽好，服务端不做地图解析）::

        {"nodes": [{"kind": "国家", "name": …, "x": …, "y": …, "attrs": {…},
                    "children": [{"kind": "省份", …, "children": [{"kind": "城镇", …}]}]}],
         "flat": [{"kind": "河流", "name": …, "x": …, "y": …, "attrs": {…}}]}
    """
    world = map_doc.world
    types = ensure_geo_types(world)
    root = geo_folder(world, GEO_ROOT)
    counts: dict[str, int] = {}
    created_total = 0
    updated_total = 0
    markers_total = 0

    def place(kind: str, parent: Document, node: dict[str, Any], position: int) -> Document | None:
        nonlocal created_total, updated_total, markers_total
        if kind not in GEO_LEVELS:
            return None
        name = _text(node.get("name"), 120)
        if not name:
            return None
        attrs = node.get("attrs") if isinstance(node.get("attrs"), dict) else {}
        document, created = _upsert_card(world, parent, kind, name, attrs, types[kind], position)
        counts[kind] = counts.get(kind, 0) + 1
        # 地图上同名的同级条目（同省两座同名城镇、两条同名河）会并成一张卡 ——
        # 所以「处理了几个」与「新建了几张」不是一回事，两个数都要报出去
        if created:
            created_total += 1
        else:
            updated_total += 1
        if _pin(map_doc, document, kind, node.get("x"), node.get("y")) is not None:
            markers_total += 1
        for child_index, child in enumerate(node.get("children") or []):
            if not isinstance(child, dict):
                continue
            child_kind = _text(child.get("kind")) or GEO_LEVELS[kind]["child"]
            if child_kind != GEO_LEVELS[kind]["child"]:
                # 只在层级内嵌套：别的类型（河流…）一律走 flat，别把树拧成麻花
                child_kind = GEO_LEVELS[kind]["child"]
            place(child_kind, document, child, child_index)
        return document

    for index, node in enumerate(payload.get("nodes") or []):
        if isinstance(node, dict) and node.get("name"):
            place(_text(node.get("kind")) or "国家", root, node, index)

    for index, node in enumerate(payload.get("flat") or []):
        if not isinstance(node, dict):
            continue
        kind = _text(node.get("kind"))
        if kind not in GEO_LEVELS:
            continue
        folder = geo_folder(world, kind, parent=root, position=GEO_ORPHAN_POSITION + GEO_ORDER.index(kind))
        place(kind, folder, node, index)

    return {
        "root": root.id,
        "counts": counts,
        "created": created_total,
        "updated": updated_total,
        "markers": markers_total,
        "types": len(types),
    }


def kind_of(document: Document) -> str:
    """这张卡片属于地理层级的哪一级（不是地理条目就返回空串）。"""
    entity_type = document.entity_type
    if entity_type is None:
        return ""
    name = entity_type.name
    return name if name in GEO_LEVELS else ""


def _seed(document: Document) -> int:
    """同一条目每次铺出来的结果要一样：用它的 id 与名字派生一个稳定种子。"""
    return abs(hash(f"{document.id}:{document.name}")) % 9973


def _auto_count(document: Document) -> int:
    """数量自动算：有条目的「面积」就按面积，没有就给中位数。"""
    card = getattr(document, "card", None)
    if card is None:
        return SPREAD_DEFAULT
    props = {prop.name: prop for prop in card.entity_type.properties.all()} if card.entity_type else {}
    area_prop = props.get("面积")
    if area_prop is None:
        return SPREAD_DEFAULT
    raw = (card.values or {}).get(str(area_prop.id))
    try:
        area = float(raw)
    except (TypeError, ValueError):
        return SPREAD_DEFAULT
    if area <= 0:
        return SPREAD_DEFAULT
    return int(max(SPREAD_MIN, min(SPREAD_MAX, round(area / SPREAD_AREA_PER_CHILD))))


@transaction.atomic
def distribute_children(map_doc: Document | None, parent: Document, count: int = 0) -> dict[str, Any]:
    """给一个条目自动铺开它的下一级：卡片 + 真图钉。

    ``count`` 手填（>0）就用它；给 0 或负数则按父级的面积自动算。
    位置是以父级的图钉为锚点、按固定角度摊开的一圈（半径随层级缩小），
    所以同一个父级每次铺出来的位置一模一样 —— 用户想手改也改得回来。
    """
    kind = kind_of(parent)
    child_kind = GEO_LEVELS.get(kind, {}).get("child", "")
    if not child_kind:
        return {"ok": False, "reason": f"「{kind or parent.name}」没有可铺开的下一级"}

    world = parent.world
    types = ensure_geo_types(world)
    total = count if count > 0 else _auto_count(parent)

    anchor_document = parent
    anchor = MapMarker.objects.filter(card=anchor_document).first() if map_doc is None else (
        MapMarker.objects.filter(document=map_doc, card=anchor_document).first()
    )
    anchor_x = anchor.x if anchor else 50.0
    anchor_y = anchor.y if anchor else 50.0
    spread = float(GEO_LEVELS[kind]["spread"])

    card = getattr(parent, "card", None)
    props = {prop.name: prop for prop in card.entity_type.properties.all()} if card and card.entity_type else {}
    attrs_base: dict[str, Any] = {}
    if "所属" in props:
        attrs_base["所属"] = parent.name
    if "所属国家" in props:
        attrs_base["所属国家"] = _attribute(card, props, "所属国家") or parent.name
    if "所属省份" in props:
        attrs_base["所属省份"] = _attribute(card, props, "所属省份") or parent.name

    seed = _seed(parent)
    suffixes = SPREAD_SUFFIXES.get(child_kind) or SPREAD_FALLBACK_SUFFIXES
    base_position = Document.objects.filter(world=world, parent=parent, deleted_at__isnull=True).count()
    created: list[dict[str, Any]] = []
    for index in range(total):
        angle = (index / max(1, total)) * 2 * math.pi + (seed % 360) * math.pi / 180
        # 半径从内圈到外圈递进，避免全部挤在同一圈上
        radius = spread * (0.45 + 0.55 * ((index + 1) / max(1, total)))
        offset_x = round(math.cos(angle) * radius, 2)
        offset_y = round(math.sin(angle) * radius * 0.7, 2)
        x = round(max(0.0, min(100.0, anchor_x + offset_x)), 2)
        y = round(max(0.0, min(100.0, anchor_y + offset_y)), 2)
        name = f"{parent.name}·{suffixes[(index + seed) % len(suffixes)]}"

        attrs = dict(attrs_base)
        attrs["坐标"] = f"{x}, {y}"
        document, was_created = _upsert_card(
            world, parent, child_kind, name, attrs, types[child_kind], base_position + index
        )
        if map_doc is not None:
            _pin(map_doc, document, child_kind, x, y)
        created.append({"id": document.id, "name": document.name, "created": was_created})

    return {
        "ok": True,
        "kind": kind,
        "child_kind": child_kind,
        "count": total,
        "children": created,
    }


def _attribute(card, props: dict[str, PropertyDef], field: str) -> str:
    """读卡片上某个属性当前的文本值（用来把「所属」串起来）。"""
    prop = props.get(field)
    if prop is None or card is None:
        return ""
    return _text((card.values or {}).get(str(prop.id)), 120)
