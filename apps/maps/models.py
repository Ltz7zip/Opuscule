# -*- coding: utf-8 -*-
"""经典地图：``MapLayer`` 图层 + ``MapMarker`` 标注（图钉 / 区域 / 文字）。

模型原本住在 ``world/models/map.py``，R2 拆 app 后搬到 ``maps``；``Meta.db_table``
钉住旧表名（``world_*``）。
"""

from __future__ import annotations

from django.db import models

from apps.documents.models.document import Document
from apps.world.models.constants import ERA_COLORS_RGB, MARKER_KINDS, MARKER_PIN


class MapLayer(models.Model):
    """图层：Pin / Zone / Label 都挂在某一层上，可整体显隐与调透明度。"""

    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name="map_layers")
    name = models.CharField("名称", max_length=60, default="默认")
    position = models.PositiveIntegerField("排序", default=1)
    visible = models.BooleanField("显示", default=True)
    opacity = models.FloatField("透明度", default=1.0)

    class Meta:
        db_table = "world_maplayer"
        ordering = ["position", "id"]
        verbose_name = "地图图层"
        verbose_name_plural = "地图图层"

    def __str__(self):
        return self.name

    def to_payload(self) -> dict:
        return {
            "id": self.id,
            "document": self.document_id,
            "name": self.name,
            "position": self.position,
            "visible": self.visible,
            "opacity": self.opacity,
            "marker_count": self.markers.count(),
        }


class MapMarker(models.Model):
    """地图上的一个标注：图钉 / 区域 / 文字三种形态。"""

    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name="map_markers")
    layer = models.ForeignKey(MapLayer, null=True, blank=True, on_delete=models.SET_NULL,
                              related_name="markers")
    kind = models.CharField("类型", max_length=8, choices=MARKER_KINDS, default=MARKER_PIN)
    name = models.CharField("名称", max_length=120, blank=True, default="")
    description = models.TextField("描述", blank=True, default="")
    # 图钉与文字用 x/y（百分比），区域用 points（[[x, y], ...] 百分比多边形）
    x = models.FloatField("x", default=50.0)
    y = models.FloatField("y", default=50.0)
    points = models.JSONField("多边形", default=list, blank=True)
    color = models.CharField("颜色", max_length=16, default="gold")
    icon = models.CharField("图标", max_length=40, blank=True, default="")
    scale = models.FloatField("大小", default=1.0)
    rotation = models.FloatField("旋转", default=0.0)
    # 关联到一张卡片（图钉/区域指向世界里的条目）；与所属地图文档是两个不同的外键
    card = models.ForeignKey(Document, null=True, blank=True, on_delete=models.SET_NULL,
                             related_name="marker_links")
    position = models.PositiveIntegerField("排序", default=0)
    created_at = models.DateTimeField("创建于", auto_now_add=True)

    class Meta:
        db_table = "world_mapmarker"
        ordering = ["position", "id"]
        verbose_name = "地图标注"
        verbose_name_plural = "地图标注"

    def __str__(self):
        return self.name or self.get_kind_display()

    @property
    def color_rgb(self) -> tuple:
        return ERA_COLORS_RGB.get(self.color, ERA_COLORS_RGB["gold"])

    def to_payload(self) -> dict:
        return {
            "id": self.id,
            "document": self.document_id,
            "layer": self.layer_id,
            "kind": self.kind,
            "name": self.name,
            "description": self.description,
            "x": self.x,
            "y": self.y,
            "points": self.points if isinstance(self.points, list) else [],
            "color": self.color,
            "icon": self.icon,
            "scale": self.scale,
            "rotation": self.rotation,
            "card": self.card_id,
            "card_name": self.card.name if self.card_id else None,
            "group": (self.card.name if self.card_id else None),
            "position": self.position,
        }
