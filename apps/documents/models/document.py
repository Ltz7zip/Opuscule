# -*- coding: utf-8 -*-
"""文档树：``Era`` / ``Document`` / ``Card`` / ``Calendar`` / ``TimelineEvent``。

``Document`` 是树上唯一的节点类型，靠 ``document_type`` 区分文件夹 / 卡片 / 时间线 /
地图 / 画布…；不同 ``document_type`` 会「长出」各自的附属内容：卡片 → ``Card``，
时间线 → ``TimelineEvent``。``Era`` 是世界的「版本分支」，``Calendar`` 定义历法。

这些模型原本住在 ``world`` app 里，R2 拆 app 后搬到 ``documents``。``Meta.db_table``
逐个钉住旧表名（``world_*``），这样子模块换 app_label 时不会动到物理表。
"""

from __future__ import annotations

import uuid

from django.db import models

from apps.world.models.constants import (
    CAL_EARTH,
    CONFIDENCE_EXACT,
    CONFIDENCES,
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
    safe_image_url,
    slugify_name,
)
from apps.world.models.entity import EntityType
from apps.world.models.world import World


class Era(models.Model):
    """时代：总时间线上的一段**命名区间**（可重叠 / 可嵌套）。

    0.7.0 之前它是「独立坐标系」——每个纪元从 0 年起算，靠 ``position`` 首尾相连。
    现在它只是总时间线上的 ``[start_year, end_year]``：共用同一根轴，天然允许重叠。
    ``start_year`` / ``end_year`` 为空表示「还没摆放」/「开放式」，此时仍然可以按
    ``position`` + ``length_years`` 顺序铺开（兼容旧数据与旧接口）。
    """

    world = models.ForeignKey(World, on_delete=models.CASCADE, related_name="eras")
    name = models.CharField("名称", max_length=80, default="新纪元")
    position = models.PositiveIntegerField("顺序", default=0)
    #: 总时间线上的起止年份；start 为空 = 还没摆放，end 为空 = 开放式（至今 / 无尽头）
    start_year = models.FloatField("起始年", null=True, blank=True, default=None)
    end_year = models.FloatField("结束年", null=True, blank=True, default=None)
    start_precision = models.CharField("起始精度", max_length=8, choices=PRECISIONS, default=PRECISION_YEAR)
    end_precision = models.CharField("结束精度", max_length=8, choices=PRECISIONS, default=PRECISION_YEAR)
    #: 由起止推出的长度；保留成真列是为了兼容旧前端与旧接口（0 = 开放式）
    length_years = models.FloatField("长度（年）", default=0.0)
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

    def save(self, *args, **kwargs):
        # 起止是真值来源；长度只是派生列。只摆了一端（start 有、end 空）算开放式。
        if self.start_year is not None:
            self.length_years = (
                round(float(self.end_year) - float(self.start_year), 4)
                if self.end_year is not None and self.end_year > self.start_year
                else 0.0
            )
        super().save(*args, **kwargs)

    def resolved_span(self) -> tuple[float, float] | None:
        """这条时代在轴上的区间：没摆放时返回 ``None``（由调用方决定怎么铺开）。"""
        if self.start_year is None:
            return None
        start = float(self.start_year)
        if self.end_year is None or self.end_year <= start:
            end = start + (float(self.length_years or 0) or 50.0)
        else:
            end = float(self.end_year)
        return (start, end)

    def filter_span(self) -> tuple[float, float | None] | None:
        """过滤用的区间：``None`` 表示还没摆到轴上（不参与过滤）。

        与 ``resolved_span()`` 的区别在开放端：绘制时代色带时开放端要有个可视
        长度（兜底 +50 年），但判断"某条关系在这个时代里是否有效"时，开放端
        就是**不封顶**——否则"至今"的时代会在 50 年后凭空失效。
        """
        if self.start_year is None:
            return None
        start = float(self.start_year)
        if self.end_year is None or self.end_year <= start:
            return (start, None)
        return (start, float(self.end_year))

    def to_payload(self, origin: float = 0.0) -> dict:
        """``origin`` 是展示坐标的原点（显示年 = 存储年 − origin）。

        默认 0 保持世界坐标——备份 / 导出依赖这个口径；只有 UI 接口传原点。
        """
        def display(value):
            if value is None or not origin:
                return value
            return round(float(value) - origin, 4)

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
            "start_year": display(self.start_year),
            "end_year": display(self.end_year),
            "start_precision": self.start_precision,
            "end_precision": self.end_precision,
            "open_end": self.end_year is None,
        }


class Document(models.Model):
    """文档：文件夹 / 卡片 / 时间线 / 地图 / 画布… 都在这张表里，靠 ``document_type`` 区分。"""

    world = models.ForeignKey(World, on_delete=models.CASCADE, related_name="documents")
    document_type = models.CharField("文档类型", max_length=16, choices=DOC_TYPES, default=DOC_CARD)
    name = models.CharField("名称", max_length=160, default="未命名")
    slug = models.CharField("slug", max_length=80, blank=True, default="", db_index=True)
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
        # 同世界内 slug 唯一：站点 URL 就是 slug，重名会让其中一份文档在站点上打不开
        # （见 Document._unique_slug 与 0002 迁移）。
        constraints = [
            models.UniqueConstraint(fields=["world", "slug"], name="uniq_document_slug_per_world"),
        ]

    def __str__(self):
        return f"{self.get_document_type_display()}：{self.name}"

    @property
    def cover_safe(self) -> str:
        """能安全写进内联 ``style="background-image:url('…')"`` 的封面地址。

        不合法（含引号 / 括号 / 分号等能改写 CSS 的字符）就回空串，模板据此不画封面
        ——站点是公开页面，封面是用户可控值（2026-10-15 体检 F3）。
        """
        return safe_image_url(self.cover)

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
        if not kwargs.get("raw"):        # loaddata 等按原样灌数据时不去重
            self.slug = self._unique_slug()
        super().save(*args, **kwargs)

    def _unique_slug(self) -> str:
        """保证同一世界内 slug 唯一：重名时追加 ``-2``、``-3``…

        站点 URL 就是 slug，同世界内两份已发布文档共用同一个 slug 时，
        ``document_by_slug()`` 只会命中其中一份，另一份在站点上永远打不开
        （2026-10-15 体检 F1：库里已出现两篇「未命名」）。

        连回收站里的文档也一起避开，是**故意**的：一篇文档被删掉后它在站点上的
        URL 就失效了，若让新文档原地接手同一个 slug，读者手里的旧链接会悄悄打开
        另一篇内容。宁可让新文档多一个序号，也不复用已经释放出去的地址。

        DB 层另有 ``UniqueConstraint(world, slug)`` 兜底（见 0002 迁移），
        这里查一次是常态、只在真的撞名时才继续往下找。
        """
        base = slugify_name(self.slug or self.name)
        candidate = base
        index = 2
        while Document.objects.filter(world_id=self.world_id, slug=candidate).exclude(pk=self.pk).exists():
            if index > 200:              # 理论上到不了：真是这种数据，交给随机后缀收尾
                return f"{base[:70]}-{uuid.uuid4().hex[:6]}"
            candidate = f"{base}-{index}"
            index += 1
        return candidate

    # -- 输出 -------------------------------------------------------------- #
    def to_payload(self, with_children: bool = False, with_card: bool = False, world=None,
                   children_map: dict | None = None) -> dict:
        # 同一个世界的序列化只解析一次 world，子文档 / 卡片都复用它
        world = world if world is not None else self.world
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
            "publish_state": publish_state(self, world),
            "published_version": self.published_version,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if with_children:
            # 回收站里的子文档不再出现在树里（否则点进去只会得到一个 404）
            if children_map is not None:
                children = children_map.get(self.id, [])
            else:
                children = self.children.filter(deleted_at__isnull=True).order_by("position", "id")
            payload["children"] = [
                child.to_payload(with_children=True, world=world, children_map=children_map)
                for child in children
            ]
        if with_card and self.document_type == DOC_CARD:
            payload["card"] = self.card_payload(world=world)
        return payload

    def card_payload(self, world=None) -> dict:
        """卡片正文：类型、别名、属性值、区块（非卡片文档返回空壳）。"""
        card = getattr(self, "card", None)
        if card is None:
            return {"aliases": [], "values": {}, "blocks": [], "body": ""}
        return card.to_payload(world=world)


class Card(models.Model):
    """卡片内容（与 Document 一对一）：别名 + 属性值 + 区块正文。"""

    document = models.OneToOneField(Document, on_delete=models.CASCADE, related_name="card")
    entity_type = models.ForeignKey(
        EntityType, null=True, blank=True, on_delete=models.SET_NULL, related_name="cards"
    )
    aliases = models.JSONField("别名", default=list, blank=True)  # ["The Untreated", ...]
    values = models.JSONField("属性值", default=dict, blank=True)  # {property_id: raw}
    blocks = models.JSONField("区块", default=list, blank=True)
    # 编辑器文档：React 编辑器孤岛（BlockNote）的原生 JSON，正文的**权威存储**。
    # ``blocks`` / ``body`` 由它派生（见 world.normalize.doc_to_blocks），下游
    # （发布站 / 自动识别 / 搜索 / 导入导出）只认派生结果，所以一行都不用改。
    # 为空表示这张卡还没被孤岛编辑过，读取时按需从旧 ``blocks`` 惰性转换。
    blocks_doc = models.JSONField("编辑器文档", default=list, blank=True)
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

    def resolved_values(self, world=None) -> dict:
        """把原始值解析成前端直接可用的结构（引用转摘要、公式求值）。"""
        from apps.world.normalize import resolve_card_values

        return resolve_card_values(self, world=world)

    def editor_doc(self):
        """编辑器文档（BlockNote 原生 JSON）；``None`` 表示这张卡还搬不进孤岛。

        存过就用存的；没存过就从旧 ``blocks`` 惰性升格一次。升格不了（老结构里有
        一期表达不了的块）返回 ``None``，前端据此回退到旧的 vanilla 渲染器。
        """
        from apps.world.normalize import blocks_to_doc

        if isinstance(self.blocks_doc, list) and self.blocks_doc:
            return self.blocks_doc
        return blocks_to_doc(self.blocks)

    def to_payload(self, with_doc: bool = False, world=None) -> dict:
        """``with_doc=True`` 才带 ``blocks_doc`` —— 内联数据库一次拉一整个类型的卡片，
        无条件附带编辑器文档会把那个响应撑大，所以默认不带。

        ``world`` 由调用方传入时，引用解析可以复用它，少一次 ``card.document.world`` 查询。
        """
        payload = {
            "id": self.id,
            "document": self.document_id,
            "entity_type": self.entity_type_id,
            "aliases": self.aliases if isinstance(self.aliases, list) else [],
            "comments": self.comments if isinstance(self.comments, list) else [],
            "values": self.values if isinstance(self.values, dict) else {},
            "resolved": self.resolved_values(world=world),
            "blocks": self.blocks if isinstance(self.blocks, list) else [],
            "body": self.body,
            "era_mode": self.era_mode,
            "era_ids": self.era_ids if isinstance(self.era_ids, list) else [],
        }
        if with_doc:
            payload["blocks_doc"] = self.editor_doc()
        return payload

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
    """自定义日历：定义一年有几个月、每月几天、每天几小时，以及卫星（月亮）。

    0.7.0 起一本历法可以只在一段年份里生效（``start_year`` / ``end_year`` 为空 =
    无限），用来表达「A 历 → 某事件后切 B 历」；切换点因此落在历法自己身上。
    """

    world = models.ForeignKey(World, on_delete=models.CASCADE, related_name="calendars")
    name = models.CharField("名称", max_length=80, default="地球历")
    mode = models.CharField("模式", max_length=8, default=CAL_EARTH)
    hours_per_day = models.PositiveIntegerField("每天小时数", default=24)
    months = models.JSONField("月份", default=list, blank=True)  # [{"name","days"}]
    moons = models.JSONField("卫星", default=list, blank=True)
    open_past = models.BooleanField("开放过去", default=False)
    default_precision = models.CharField("默认精度", max_length=8, choices=PRECISIONS, default=PRECISION_YEAR)
    #: 这本历法的生效区间；为空 = 不设限（旧数据即如此）
    start_year = models.FloatField("生效起始年", null=True, blank=True, default=None)
    end_year = models.FloatField("生效结束年", null=True, blank=True, default=None)
    is_preset = models.BooleanField("日历预设", default=False)
    created_at = models.DateTimeField("创建于", auto_now_add=True)

    class Meta:
        db_table = "world_calendar"
        ordering = ["id"]
        verbose_name = "日历"
        verbose_name_plural = "日历"

    def __str__(self):
        return self.name

    def covers(self, year) -> bool:
        """这一年是否归这本历法管（区间为空的一端表示不设限）。"""
        try:
            value = float(year)
        except (TypeError, ValueError):
            return True
        if self.start_year is not None and value < self.start_year:
            return False
        if self.end_year is not None and value > self.end_year:
            return False
        return True

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
            "start_year": self.start_year,
            "end_year": self.end_year,
        }


class WorldTimeline(models.Model):
    """每个世界唯一的「总时间线」：时间点与时间段共用的一根轴。

    0.7.0 之前时间线是文档（``document_type="timeline"``），一个世界可以有好几份。
    现在时间线脱离文档树成为一个世界级实体：``origin_year`` 定义「0 年」落在哪，
    ``calendar`` 指向默认历法，``settings`` 存视野与旧版 ``era_spans`` 兼容数据。
    """

    world = models.OneToOneField(World, on_delete=models.CASCADE, related_name="timeline")
    #: 「0 年」对应哪一年：改它就是迁轴（与历法切换是两件事）
    origin_year = models.FloatField("坐标原点", default=0.0)
    calendar = models.ForeignKey(Calendar, null=True, blank=True, on_delete=models.SET_NULL,
                                 related_name="timelines")
    settings = models.JSONField("设置", default=dict, blank=True)
    created_at = models.DateTimeField("创建于", auto_now_add=True)
    updated_at = models.DateTimeField("更新于", auto_now=True)

    class Meta:
        db_table = "world_timeline"
        verbose_name = "总时间线"
        verbose_name_plural = "总时间线"

    def __str__(self):
        return f"{self.world.name} · 总时间线"

    @classmethod
    def for_world(cls, world: World) -> "WorldTimeline":
        """取世界的时间线；没有就自动生成一根（每世界唯一，拍板 ①/⑤）。"""
        timeline = cls.objects.filter(world=world).first()
        if timeline is not None:
            if timeline.calendar_id is None:
                timeline.calendar = world.calendars.order_by("id").first()
                timeline.save(update_fields=["calendar", "updated_at"])
            return timeline
        return cls.objects.create(world=world, calendar=world.calendars.order_by("id").first())

    @property
    def name(self) -> str:
        """经典适配层与文档同形：模板里直接拿它当标题。"""
        return "世界时间线"

    def to_payload(self) -> dict:
        settings_ = self.settings if isinstance(self.settings, dict) else {}
        return {
            "id": self.id,
            "world": self.world_id,
            "name": self.name,
            "origin_year": self.origin_year,
            "calendar": self.calendar_id,
            "settings": settings_,
            "view": settings_.get("view") or {
                "start": float(settings_.get("view_start", -100.0) or -100.0),
                "end": float(settings_.get("view_end", 900.0) or 900.0),
            },
        }


class TimelineEvent(models.Model):
    """时间线上的事件：年 / 月 / 日 / 时四级精度，可归属一个时代、关联若干卡片。

    0.7.0 起事件挂在世界的总时间线上（``timeline``）。``document`` 保留成可空外键，
    只为兼容旧接口与旧的「时间线文档」数据：文档内的事件照样能读写，同时也会出现在
    总时间线上。
    """

    timeline = models.ForeignKey(WorldTimeline, null=True, blank=True, on_delete=models.CASCADE,
                                related_name="events")
    document = models.ForeignKey(Document, null=True, blank=True, on_delete=models.SET_NULL,
                                 related_name="events")
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
    #: 模糊 / 相对时间（§4.4 E）：确信度 + 区间半径（0 = 精确单点）
    confidence = models.CharField("确信度", max_length=8, choices=CONFIDENCES, default=CONFIDENCE_EXACT)
    range_years = models.FloatField("不确定范围（±年）", default=0.0)
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

    def save(self, *args, **kwargs):
        # 旧路径（按文档建事件）自动挂到世界总时间线上，两个入口看到的是同一批事件。
        if self.timeline_id is None and self.document_id and not kwargs.get("raw"):
            self.timeline = WorldTimeline.for_world(self.document.world)
        super().save(*args, **kwargs)

    @property
    def world_id(self):
        if self.timeline_id:
            return self.timeline.world_id
        if self.document_id:
            return self.document.world_id
        return None

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

    def _calendar(self):
        """按事件所在年份挑历法：总时间线默认 → 生效区间覆盖这一年的 → 世界第一本。"""
        world_id = self.world_id
        if not world_id:
            return None
        preferred = self.timeline.calendar if self.timeline_id else None
        if preferred is not None and preferred.covers(self.year):
            return preferred
        calendars = list(Calendar.objects.filter(world_id=world_id).order_by("id"))
        for calendar in calendars:
            if calendar.covers(self.year):
                return calendar
        if preferred is not None:
            return preferred
        if self.document_id:
            settings_ = self.document.settings if isinstance(self.document.settings, dict) else {}
            chosen = next((c for c in calendars if c.pk == settings_.get("calendar")), None)
            if chosen is not None:
                return chosen
        return calendars[0] if calendars else None

    def date_label(self, origin: float = 0.0) -> str:
        cal = self._calendar()
        year = self.year if not origin else round(self.year - origin, 4)
        if cal is None:
            return f"Year {year}"
        return cal.format_date(year, self.month, self.day, self.hour, self.precision)

    def to_payload(self, origin: float = 0.0) -> dict:
        """``origin`` 是展示坐标的原点（显示年 = 存储年 − origin）。

        默认 0 保持世界坐标——备份 / 导出依赖这个口径；只有 UI 接口传原点。
        """
        year = self.year if not origin else round(self.year - origin, 4)
        sort_key = list(self.sort_key)
        sort_key[0] = year
        return {
            "id": self.id,
            "timeline": self.timeline_id,
            "document": self.document_id,
            "title": self.title,
            "precision": self.precision,
            "year": year,
            "month": self.month,
            "day": self.day,
            "hour": self.hour,
            "era": self.era_id,
            "description": self.description,
            "cover": self.cover,
            "row": self.row,
            "position": self.position,
            "confidence": self.confidence,
            "range_years": self.range_years,
            "sort_key": sort_key,
            "date_label": self.date_label(origin),
            "linked_cards": [
                {"id": d.id, "name": d.name, "type": d.document_type}
                for d in self.linked_cards.all()
            ],
            "featured_card": self.featured_card_id,
        }
