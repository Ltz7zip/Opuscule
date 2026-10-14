# -*- coding: utf-8 -*-
"""类型与属性：卡片类型、属性定义（值类型 / 选项 / 引用 / 公式）。

（原 ``world/views.py`` 的「类型与属性」分区；
拆包后行为不变，对外仍通过 ``world.views`` 访问。）
"""

from __future__ import annotations

from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from ..models import EntityType, PropertyDef
from ..normalize import as_int, as_text
from documents.models import Card

from .common import current_world, error, get_type, json_response, parse_json


@csrf_exempt
@require_http_methods(["GET", "POST"])
def type_collection(request):
    """类型列表 / 新建类型（可以做子类型，属性会继承下来）。"""
    world = current_world()
    if request.method == "GET":
        return json_response({"types": [entity_type.to_payload() for entity_type in world.types.all()]})

    payload = parse_json(request)
    name = as_text(payload.get("name"), 60) or "新类型"
    if world.types.filter(name=name).exists():
        return error(f"已经有一个叫「{name}」的类型了")

    parent = get_type(world, payload.get("parent"))
    entity_type = EntityType.objects.create(
        world=world,
        name=name,
        parent=parent,
        icon=as_text(payload.get("icon"), 40),
        color=as_text(payload.get("color"), 20),
        position=as_int(payload.get("position"), world.types.count()),
    )
    return json_response(entity_type.to_payload())


@csrf_exempt
@require_http_methods(["GET", "PUT", "DELETE"])
def type_detail(request, type_id):
    """单个类型：读 / 改（改名、图标、颜色、换父类）/ 删（子类型会被提到上一层）。"""
    world = current_world()
    entity_type = get_type(world, type_id)
    if entity_type is None:
        return json_response({"error": "未找到该类型"}, status=404)

    if request.method == "GET":
        return json_response(entity_type.to_payload())

    if request.method == "DELETE":
        # 删之前把子类型挂到自己的父级上，不能让它们跟着蒸发
        entity_type.children.update(parent=entity_type.parent)
        entity_type.delete()
        return json_response({"success": True, "removed": True})

    payload = parse_json(request)
    if "name" in payload:
        name = as_text(payload.get("name"), 60)
        if name and world.types.filter(name=name).exclude(pk=entity_type.pk).exists():
            return error(f"已经有一个叫「{name}」的类型了")
        if name:
            entity_type.name = name
    for field in ("icon", "color"):
        if field in payload:
            setattr(entity_type, field, as_text(payload.get(field), 40))
    if "parent" in payload:
        parent_id = payload.get("parent")
        if parent_id in (None, "", 0, "0"):
            entity_type.parent = None
        else:
            parent = get_type(world, parent_id)
            if parent is not None and parent.pk == entity_type.pk:
                return error("类型不能把自己当父类")
            entity_type.parent = parent
    if "hidden" in payload:
        entity_type.hidden = bool(payload.get("hidden"))
    if "position" in payload:
        entity_type.position = as_int(payload.get("position"), entity_type.position)
    entity_type.save()
    return json_response(entity_type.to_payload())


@csrf_exempt
@require_http_methods(["GET", "POST"])
def property_collection(request, type_id):
    """某个类型下的属性列表 / 新建属性（值类型、选项、引用目标、公式）。"""
    world = current_world()
    entity_type = get_type(world, type_id)
    if entity_type is None:
        return json_response({"error": "未找到该类型"}, status=404)

    if request.method == "GET":
        return json_response({"properties": [prop.to_payload() for prop in entity_type.properties.all()]})

    payload = parse_json(request)
    name = as_text(payload.get("name"), 60) or "新属性"
    if entity_type.properties.filter(name=name).exists():
        return error(f"「{entity_type.name}」已经有「{name}」这个属性了")

    options = payload.get("options") if isinstance(payload.get("options"), list) else []
    reference_type = get_type(world, payload.get("reference_type"))
    prop = PropertyDef.objects.create(
        entity_type=entity_type,
        name=name,
        value_type=as_text(payload.get("value_type"), 20) or "text",
        options=[as_text(item, 60) for item in options if as_text(item, 60)],
        reference_type=reference_type,
        required=bool(payload.get("required")),
        default_value=payload.get("default"),
        formula=as_text(payload.get("formula"), 400),
        position=entity_type.properties.count(),
        show_on_existing=bool(payload.get("show_on_existing")),
    )

    # 新属性给已有卡片补上默认值（「同步到已有卡片」打开时也补），
    # 不然表格 / 卡片里这一列是空的
    if prop.show_on_existing or prop.default_value not in (None, ""):
        for card in Card.objects.filter(entity_type=entity_type):
            values = dict(card.values or {})
            if str(prop.id) not in values:
                values[str(prop.id)] = prop.default_value
                card.values = values
                card.save(update_fields=["values"])
    return json_response(prop.to_payload())


@csrf_exempt
@require_http_methods(["GET", "PUT", "DELETE"])
def property_detail(request, property_id):
    """单个属性：读 / 改 / 删。"""
    world = current_world()
    prop = PropertyDef.objects.filter(pk=as_int(property_id), entity_type__world=world).first()
    if prop is None:
        return json_response({"error": "未找到该属性"}, status=404)

    if request.method == "GET":
        return json_response(prop.to_payload())

    if request.method == "DELETE":
        prop.delete()
        return json_response({"success": True, "removed": True})

    payload = parse_json(request)
    if "name" in payload:
        prop.name = as_text(payload.get("name"), 60) or prop.name
    if "value_type" in payload:
        prop.value_type = as_text(payload.get("value_type"), 20) or prop.value_type
    if "options" in payload and isinstance(payload.get("options"), list):
        prop.options = [as_text(item, 60) for item in payload["options"] if as_text(item, 60)]
    if "reference_type" in payload:
        prop.reference_type = get_type(world, payload.get("reference_type"))
    if "required" in payload:
        prop.required = bool(payload.get("required"))
    if "show_on_existing" in payload:
        prop.show_on_existing = bool(payload.get("show_on_existing"))
    if "default" in payload:
        prop.default_value = payload.get("default")
    if "formula" in payload:
        prop.formula = as_text(payload.get("formula"), 400)
    if "position" in payload:
        prop.position = as_int(payload.get("position"), prop.position)
    prop.save()
    return json_response(prop.to_payload())
