# -*- coding: utf-8 -*-
"""文档树：``Era`` / ``Document`` / ``Card`` / ``Calendar`` / ``TimelineEvent``。

``Document`` 是树上唯一的节点类型，靠 ``document_type`` 区分文件夹 / 卡片 / 时间线 /
地图 / 画布…；不同 ``document_type`` 会「长出」各自的附属内容：卡片 → ``Card``，
时间线 → ``TimelineEvent``。``Era`` 是世界的「版本分支」，``Calendar`` 定义历法。

这些模型原本住在 ``world`` app 里，R2 拆 app 后搬到 ``documents``。``Meta.db_table``
逐个钉住旧表名（``world_*``），这样子模块换 app_label 时不会动到物理表。
"""

from __future__ import annotations

from django.db import models

from world.models.constants import (
    CAL_EARTH,
    DOC_CARD,
    DOC_FOLDER,
    DOC_TYPES,
    EARTH_MONTHS,
    ERA_MODES,
    ERA_MODE_HIDDEN,
    ERA_MODE_ONLY,
    ERA_MODE_UNIVERSAL,
    ERA_THEMES,
    PRECISIONS,
    PRECISION_MONTH,
    PRECISION_ORDER,
    PRECISION_TIME,
    PRECISION_YEAR,
    publish_state,
    slugify_name,
)
from world.models.entity import EntityType
from world.models.world import World


class Era(models.Model):
    """纪元：世界的「版本分支 / 时代」，每个纪元都从 0 年起算一套自己的时间。"""

    world = models.ForeignKey(World, on_delete=models.CASCADE, related_name="eras")
    name = models.CharField("名称", max_length=80, default="新纪元")
    position = models.PositiveIntegerField("顺序", default=0)
    length_years = models.FloatField("长度（年）", default=0.0)  # 0 = 开放式
    theme = models.CharField("配色", max_length=16, default="blue")
    theme_config = models.JSONField("纪元主题", default=dict, blank=True)
    icon = models.CharField("图标", max_length=40, blank=True, default="")
    description = models.TextField("描述", blank=True, default="")
    cover = models.TextField("封面", blank=True, default="")

    class Meta:
        db_table = "world_era"
        ordering = ["position", "id"]
        verbose_name = "纪元"
        verbose_name_plural = "纪元"

    def __str__(self):
        return self.name

    @property
    def start_year(self) -> float:
        """纪元在自己的坐标系里从 0 开始。"""
        return 0.0

    @property
    def end_year(self) -> float | None:
        return self.length_years or None

    def to_payload(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "position": self.position,
            "length_years": self.length_years,
            "theme": self.theme if self.theme in ERA_THEMES else "blue",
            "icon": self.icon,
            "description": self.description,
            "cover": self.cover,
            "theme_config": self.theme_config if isinstance(self.theme_config, dict) else {},
            "start_year": self.start_year,
            "end_year": self.end_year,
        }


class Document(models.Model):
    """文档：文件夹 / 卡片 / 时间线 / 地图 / 画布… 都在这张表里，靠 ``document_type`` 区分。"""

    world = models.ForeignKey(World, on_delete=models.CASCADE, related_name="documents")
    document_type = models.CharField("文档类型", max_length=16, choices=DOC_TYPES, default=DOC_CARD)
    name = models.CharField("名称", max_length=160, default="未命名")
    slug = models.CharField("slug", max_length=80, blank=True, default="")
    parent = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.CASCADE, related_name="children"
    )
    position = models.PositiveIntegerField("排序", default=0)
    era = models.ForeignKey(Era, null=True, blank=True, on_delete=models.SET_NULL, related_name="documents")
    era_ids = models.JSONField("所属纪元", default=list, blank=True)
    entity_type = models.ForeignKey(
        EntityType, null=True, blank=True, on_delete=models.SET_NULL, related_name="documents"
    )
    # 卡片以外的工具文档用 settings 存各自的状态（时间线视野、地图图层…）
    settings = models.JSONField("设置", default=dict, blank=True)
    # 地图的整包数据：Opuscule（Fantasy Map Generator）自己的 .map 文本，原样存取。
    # 世界状态全在里面（pack / grid / styles / layers…），所以不拆字段、不做解析，
    # 前端拿 Opuscule 的 save/load 直接吃这套文本，升级 Opuscule 时不会因为我们改过结构而崩。
    map_data = models.TextField("地图数据", blank=True, default="")
    preview = models.JSONField("预览", default=dict, blank=True)
    cover = models.TextField("封面", blank=True, default="")
    icon = models.CharField("页面图标", max_length=40, blank=True, default="")
    pinned = models.BooleanField("置顶", default=False)
    hidden = models.BooleanField("在维基中隐藏", default=False)
    # 每份文档在站点里的发布状态：是否包含、发布地址、版本与时间
    is_published = models.BooleanField("包含在站点里", default=True)
    published_slug = models.CharField("发布地址", max_length=120, blank=True, default="")
    published_version = models.PositiveIntegerField("发布版本", default=0)
    published_at = models.DateTimeField("发布于", null=True, blank=True)
    listed = models.BooleanField("可被搜索", default=True)
    reveal_condition = models.CharField("揭示条件", max_length=200, blank=True, default="")
    forked_from = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL, related_name="forks"
    )
    created_at = models.DateTimeField("创建于", auto_now_add=True)
    updated_at = models.DateTimeField("更新于", auto_now=True)
    deleted_at = models.DateTimeField("删除于", null=True, blank=True)

    class Meta:
        db_table = "world_document"
        ordering = ["position", "id"]
        verbose_name = "文档"
        verbose_name_plural = "文档"

    def __str__(self):
        return f"{self.get_document_type_display()}：{self.name}"

    # -- 树 ---------------------------------------------------------------- #
    @property
    def is_folder(self) -> bool:
        return self.document_type == DOC_FOLDER

    @property
    def root_doc(self) -> "Document":
        node = self
        while node.parent is not None:
            node = node.parent
        return node

    def descendants(self, include_self: bool = False):
        """宽度优先遍历子树（文件夹批量操作时用）。"""
        found = [self] if include_self else []
        queue = list(self.children.all())
        while queue:
            node = queue.pop(0)
            found.append(node)
            queue.extend(node.children.all())
        return found

    def is_descendant_of(self, other: "Document") -> bool:
        node = self.parent
        while node is not None:
            if node.pk == other.pk:
                return True
            node = node.parent
        return False

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify_name(self.name)
        super().save(*args, **kwargs)

    # -- 输出 -------------------------------------------------------------- #
    def to_payload(self, with_children: bool = False, with_card: bool = False) -> dict:
        payload = {
            "id": self.id,
            "type": self.document_type,
            "name": self.name,
            "slug": self.slug,
            "parent": self.parent_id,
            "position": self.position,
            "era": self.era_id,
            "era_ids": self.era_ids if isinstance(self.era_ids, list) else [],
            "entity_type": self.entity_type_id,
            "settings": self.settings if isinstance(self.settings, dict) else {},
            "cover": self.cover,
            "icon": self.icon,
            "pinned": self.pinned,
            "hidden": self.hidden,
            "is_published": self.is_published,
            "published_slug": self.published_slug,
            "publish_state": publish_state(self),
            "published_version": self.published_version,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if with_children:
            # 回收站里的子文档不再出现在树里（否则点进去只会得到一个 404）
            payload["children"] = [
                child.to_payload(with_children=True)
                for child in self.children.filter(deleted_at__isnull=True).order_by("position", "id")
            ]
        if with_card and self.document_type == DOC_CARD:
            payload["card"] = self.card_payload()
        return payload

    def card_payload(self) -> dict:
        """卡片正文：类型、别名、属性值、区块（非卡片文档返回空壳）。"""
        card = getattr(self, "card", None)
        if card is None:
            return {"aliases": [], "values": {}, "blocks": [], "body": ""}
        return card.to_payload()


class Card(models.Model):
    """卡片内容（与 Document 一对一）：别名 + 属性值 + 区块正文。"""

    document = models.OneToOneField(Document, on_delete=models.CASCADE, related_name="card")
    entity_type = models.ForeignKey(
        EntityType, null=True, blank=True, on_delete=models.SET_NULL, related_name="cards"
    )
    aliases = models.JSONField("别名", default=list, blank=True)  # ["The Untreated", ...]
    values = models.JSONField("属性值", default=dict, blank=True)  # {property_id: raw}
    blocks = models.JSONField("区块", default=list, blank=True)
    comments = models.JSONField("页面评论", default=list, blank=True)   # 页面级评论（挂在卡片上，不在块里）
    body = models.TextField("正文纯文本", blank=True, default="")  # 供搜索与自动识别
    # 纪元作为「世界版本分支」：这张卡在哪些纪元里出现
    era_mode = models.CharField("纪元可见性", max_length=10, choices=ERA_MODES, default=ERA_MODE_UNIVERSAL)
    era_ids = models.JSONField("生效的纪元", default=list, blank=True)

    class Meta:
        db_table = "world_card"
        verbose_name = "卡片"
        verbose_name_plural = "卡片"

    def __str__(self):
        return self.document.name

    # -- 属性 -------------------------------------------------------------- #
    def effective_type(self) -> EntityType | None:
        return self.entity_type or self.document.entity_type

    def resolved_values(self) -> dict:
        """把原始值解析成前端直接可用的结构（引用转摘要、公式求值）。"""
        from world.normalize import resolve_card_values

        return resolve_card_values(self)

    def to_payload(self) -> dict:
        return {
            "id": self.id,
            "document": self.document_id,
            "entity_type": self.entity_type_id,
            "aliases": self.aliases if isinstance(self.aliases, list) else [],
            "comments": self.comments if isinstance(self.comments, list) else [],
            "values": self.values if isinstance(self.values, dict) else {},
            "resolved": self.resolved_values(),
            "blocks": self.blocks if isinstance(self.blocks, list) else [],
            "body": self.body,
            "era_mode": self.era_mode,
            "era_ids": self.era_ids if isinstance(self.era_ids, list) else [],
        }

    def visible_in_era(self, era_id) -> bool:
        """在某个纪元里这张卡是否出现（没选纪元 = 全部可见）。"""
        if self.era_mode == ERA_MODE_UNIVERSAL or not self.era_ids:
            return True
        selected = [int(x) for x in self.era_ids if str(x).isdigit()]
        if not selected or era_id is None:
            return True
        if self.era_mode == ERA_MODE_ONLY:
            return int(era_id) in selected
        if self.era_mode == ERA_MODE_HIDDEN:
            return int(era_id) not in selected
        return True

    def mention_names(self) -> list[str]:
        """能被自动识别成这张卡的名字：主名 + 全部别名。"""
        names = [self.document.name]
        names += [str(a) for a in (self.aliases or []) if str(a).strip()]
        return [n for n in names if n and n.strip()]


class Calendar(models.Model):
    """自定义日历：定义一年有几个月、每月几天、每天几小时，以及卫星（月亮）。"""

    world = models.ForeignKey(World, on_delete=models.CASCADE, related_name="calendars")
    name = models.CharField("名称", max_length=80, default="地球历")
    mode = models.CharField("模式", max_length=8, default=CAL_EARTH)
    hours_per_day = models.PositiveIntegerField("每天小时数", default=24)
    months = models.JSONField("月份", default=list, blank=True)  # [{"name","days"}]
    moons = models.JSONField("卫星", default=list, blank=True)
    open_past = models.BooleanField("开放过去", default=False)
    default_precision = models.CharField("默认精度", max_length=8, choices=PRECISIONS, default=PRECISION_YEAR)
    is_preset = models.BooleanField("日历预设", default=False)
    created_at = models.DateTimeField("创建于", auto_now_add=True)

    class Meta:
        db_table = "world_calendar"
        ordering = ["id"]
        verbose_name = "日历"
        verbose_name_plural = "日历"

    def __str__(self):
        return self.name

    # -- 历法计算 ---------------------------------------------------------- #
    def month_list(self) -> list[dict]:
        """月份表：自定义历没配置时退回通用的 12 × 30。"""
        months = self.months if isinstance(self.months, list) else []
        clean = []
        for i, m in enumerate(months, start=1):
            if isinstance(m, dict):
                clean.append({"name": str(m.get("name") or f"Month {i}"), "days": int(m.get("days") or 30)})
            elif isinstance(m, str):
                clean.append({"name": m, "days": 30})
        return clean or [dict(m) for m in EARTH_MONTHS]

    @property
    def days_per_year(self) -> int:
        return sum(m["days"] for m in self.month_list())

    def month_name(self, month: int) -> str:
        months = self.month_list()
        if 1 <= month <= len(months):
            return months[month - 1]["name"]
        return f"Month {month}"

    @property
    def month_count(self) -> int:
        return len(self.month_list())

    def clamp(self, year, month=1, day=1, hour=0) -> tuple:
        """把越界的月/日/时收进合法范围（自定义历的月份长度各不相同）。"""
        months = self.month_list()
        month = int(month or 1)
        month = min(max(month, 1), len(months))
        max_day = months[month - 1]["days"]
        day = min(max(int(day or 1), 1), max_day)
        hour = min(max(int(hour or 0), 0), max(0, self.hours_per_day - 1))
        return int(year or 0), month, day, hour

    def format_date(self, year: int, month: int = 1, day: int = 1, hour: int = 0,
                    precision: str = PRECISION_YEAR) -> str:
        """按精度输出人类可读日期，形如 ``12 Month 3, Year -14``。"""
        if precision == PRECISION_YEAR:
            return f"Year {year}"
        if precision == PRECISION_MONTH:
            return f"{self.month_name(month)}, Year {year}"
        stamp = f"{day} {self.month_name(month)}, Year {year}"
        if precision == PRECISION_TIME:
            stamp += f" · {hour:02d}:00"
        return stamp

    def to_payload(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "mode": self.mode,
            "hours_per_day": self.hours_per_day,
            "months": self.month_list(),
            "moons": self.moons if isinstance(self.moons, list) else [],
            "open_past": self.open_past,
            "default_precision": self.default_precision,
            "is_preset": self.is_preset,
            "days_per_year": self.days_per_year,
        }


class TimelineEvent(models.Model):
    """时间线上的事件：年 / 月 / 日 / 时四级精度，可归属一个纪元、关联若干卡片。"""

    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name="events")
    title = models.CharField("名称", max_length=160, default="未命名事件")
    precision = models.CharField("精度", max_length=8, choices=PRECISIONS, default=PRECISION_YEAR)
    year = models.IntegerField("年", default=0)
    month = models.PositiveIntegerField("月", default=1)
    day = models.PositiveIntegerField("日", default=1)
    hour = models.PositiveIntegerField("时", default=0)
    era = models.ForeignKey(Era, null=True, blank=True, on_delete=models.SET_NULL, related_name="events")
    description = models.TextField("描述", blank=True, default="")
    cover = models.TextField("封面", blank=True, default="")
    row = models.PositiveIntegerField("行", default=0)
    position = models.PositiveIntegerField("排序", default=0)
    # 事件自己的零碎设置（标记 / 颜色一类），不进正式字段免得每加一个就迁移一次
    settings = models.JSONField("设置", default=dict, blank=True)
    linked_cards = models.ManyToManyField(Document, blank=True, related_name="linked_events")
    featured_card = models.ForeignKey(
        Document, null=True, blank=True, on_delete=models.SET_NULL, related_name="featured_in_events"
    )
    created_at = models.DateTimeField("创建于", auto_now_add=True)
    updated_at = models.DateTimeField("更新于", auto_now=True)

    class Meta:
        db_table = "world_timelineevent"
        ordering = ["year", "month", "day", "hour", "position", "id"]
        verbose_name = "时间线事件"
        verbose_name_plural = "时间线事件"

    def __str__(self):
        return self.title

    @property
    def sort_key(self) -> tuple:
        """按精度取排序键：精度不到就不参与更细粒度的排序。"""
        depth = PRECISION_ORDER.get(self.precision, 0)
        return (
            self.year,
            self.month if depth >= 1 else 1,
            self.day if depth >= 2 else 1,
            self.hour if depth >= 3 else 0,
            self.position,
            self.id or 0,
        )

    def date_label(self) -> str:
        calendar = self.document.settings.get("calendar") if isinstance(self.document.settings, dict) else None
        cal = Calendar.objects.filter(pk=calendar).first() if calendar else None
        cal = cal or Calendar.objects.filter(world_id=self.document.world_id).first()
        if cal is None:
            return f"Year {self.year}"
        return cal.format_date(self.year, self.month, self.day, self.hour, self.precision)

    def to_payload(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "precision": self.precision,
            "year": self.year,
            "month": self.month,
            "day": self.day,
            "hour": self.hour,
            "era": self.era_id,
            "description": self.description,
            "cover": self.cover,
            "row": self.row,
            "position": self.position,
            "sort_key": list(self.sort_key),
            "date_label": self.date_label(),
            "linked_cards": [
                {"id": d.id, "name": d.name, "type": d.document_type}
                for d in self.linked_cards.all()
            ],
            "featured_card": self.featured_card_id,
        }
