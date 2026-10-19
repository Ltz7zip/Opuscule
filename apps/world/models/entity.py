# -*- coding: utf-8 -*-
"""类型与属性：``EntityType`` 描述卡片类型，``PropertyDef`` 是挂在其上的属性定义。"""

from __future__ import annotations

from django.db import models

from .constants import VALUE_TYPES, VT_TEXT
from .world import World


class EntityType(models.Model):
    """卡片类型：卡片靠它归类、也决定卡片拥有哪些属性，类型之间可以嵌套继承。"""

    world = models.ForeignKey(World, on_delete=models.CASCADE, related_name="types")
    name = models.CharField("名称", max_length=60)
    parent = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.CASCADE, related_name="children"
    )
    icon = models.CharField("图标", max_length=40, blank=True, default="")
    color = models.CharField("颜色", max_length=24, blank=True, default="")
    position = models.PositiveIntegerField("排序", default=0)
    hidden = models.BooleanField("从选择器隐藏", default=False)
    created_at = models.DateTimeField("创建于", auto_now_add=True)

    class Meta:
        ordering = ["position", "id"]
        unique_together = [("world", "name")]
        verbose_name = "卡片类型"
        verbose_name_plural = "卡片类型"

    def __str__(self):
        return self.name

    def ancestry(self) -> list["EntityType"]:
        """从根到自己的类型链（属性会沿链继承）。"""
        chain, node, seen = [], self, set()
        while node is not None and node.pk not in seen:
            seen.add(node.pk)
            chain.append(node)
            node = node.parent
        return list(reversed(chain))

    def is_ancestor_of(self, other: "EntityType") -> bool:
        return any(t.pk == self.pk for t in other.ancestry()[:-1])

    def all_properties(self) -> list["PropertyDef"]:
        """自己的属性 + 继承来的属性（子类同名属性覆盖父类）。"""
        merged: dict[str, PropertyDef] = {}
        for t in self.ancestry():
            for prop in t.properties.all():
                merged[prop.name] = prop
        return sorted(merged.values(), key=lambda p: (p.position, p.id))

    def to_payload(self, with_properties: bool = True) -> dict:
        # 合并后的属性已经包含自己的全部属性（同名时自己覆盖父类），
        # 不再单独对 properties 做一次 COUNT——大世界的类型列表因此少一半查询。
        properties = self.all_properties() if with_properties else None
        payload = {
            "id": self.id,
            "name": self.name,
            "parent": self.parent_id,
            "icon": self.icon,
            "color": self.color,
            "position": self.position,
            "hidden": self.hidden,
            "field_count": (
                sum(1 for prop in properties if prop.entity_type_id == self.id)
                if properties is not None else self.properties.count()
            ),
        }
        if properties is not None:
            payload["properties"] = [p.to_payload() for p in properties]
        return payload


class PropertyDef(models.Model):
    """类型上的一条属性定义（值类型的语义收在 world.normalize 里）。"""

    entity_type = models.ForeignKey(EntityType, on_delete=models.CASCADE, related_name="properties")
    name = models.CharField("属性名", max_length=60)
    value_type = models.CharField("值类型", max_length=16, choices=VALUE_TYPES, default=VT_TEXT)
    options = models.JSONField("选项", default=list, blank=True)  # [{"label","color"}]
    required = models.BooleanField("必填", default=False)
    default_value = models.JSONField("默认值", null=True, blank=True)
    formula = models.CharField("公式", max_length=200, blank=True, default="")
    description = models.CharField("说明", max_length=200, blank=True, default="")
    position = models.PositiveIntegerField("排序", default=0)
    show_on_existing = models.BooleanField("同步到已有卡片", default=False)
    reference_type = models.ForeignKey(
        EntityType, null=True, blank=True, on_delete=models.SET_NULL, related_name="referenced_by"
    )

    class Meta:
        ordering = ["position", "id"]
        unique_together = [("entity_type", "name")]
        verbose_name = "属性定义"
        verbose_name_plural = "属性定义"

    def __str__(self):
        return f"{self.entity_type.name}.{self.name}"

    @property
    def option_labels(self) -> list[str]:
        out = []
        for opt in self.options or []:
            if isinstance(opt, dict) and opt.get("label"):
                out.append(str(opt["label"]))
            elif isinstance(opt, str):
                out.append(opt)
        return out

    def to_payload(self) -> dict:
        return {
            "id": self.id,
            "type_id": self.entity_type_id,
            "name": self.name,
            "value_type": self.value_type,
            "options": self.options if isinstance(self.options, list) else [],
            "required": self.required,
            "default": self.default_value,
            "formula": self.formula,
            "description": self.description,
            "position": self.position,
            "show_on_existing": self.show_on_existing,
            "reference_type": self.reference_type_id,
        }
