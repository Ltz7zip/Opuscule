# -*- coding: utf-8 -*-
"""VVD 式世界模型：世界 → 文档树 → 卡片（类型 + 属性）/ 时间线（日历 + 纪元 + 事件）。

设计依据是《VVD功能调研.md》：

* §3.1 卡片 = 标题 + 类型 + 属性 + 区块正文；
* §3.2 类型可嵌套、可继承，属性有 文本/单选/多选/数字/日期/引用/公式 七种值类型；
* §6.1 时间线 = 自定义日历（月/每天小时数/卫星）+ 纪元（各自从 0 年起算）+ 事件（年/月/日/时四级精度）
  + 事件可关联卡片（含一张「特色卡片」）；
* §16.2 真实 `documents` 表的字段（parent_id / root_doc_id / position / era_id / era_ids /
  forked_from_id / is_published / published_slug / reveal_condition / tool_id / tool_version …）——
  这里按同样的思路落库，能对上的字段名尽量对齐，方便日后与真数据对照。

与既有 ``timeline`` 应用的关系：``timeline.TimelineItem`` 是上一轮的扁平模型（事件/纪元混在一张表、
时间直接用浮点年）。新模型把「时间」升级成日历 + 纪元 + 精度，把「卡片」从事件里的 JSON 附件升级成
一等实体，并用 ``Document`` 统一承载所有工具文档。旧数据可用
``manage.py import_timeline`` 迁进来。
"""

from __future__ import annotations

import re

import json
from datetime import timedelta

from django.db import models
from django.utils import timezone

from .relations import (
    RELATION_KINDS,
    TREE_TEMPLATES,
    template_labels,
    template_relations,
)

# --------------------------------------------------------------------------- #
# 常量
# --------------------------------------------------------------------------- #

# 文档类型（对应调研文档 §5 的二十种工具，这里先落常用的一半）
DOC_FOLDER = "folder"
DOC_CARD = "card"
DOC_TIMELINE = "timeline"
DOC_MAP = "map"
DOC_CANVAS = "canvas"
DOC_BOARD = "board"
DOC_NOTE = "note"
DOC_TABLE = "table"
DOC_TREE = "familyTree"
DOC_GRAPH = "graph"
# 本轮补齐的工具类型（调研文档 §2.2 的文档类型全表）
DOC_DICTIONARY = "dictionary"     # 词典 / 造语词条
DOC_TODO = "todo"                 # 待办清单
DOC_VOICE = "voice"               # 语音备忘（浏览器录音）
DOC_DICE = "dice"                 # 骰子（可存档的骰组）
DOC_SOUNDSCAPE = "soundscape"     # 环境音（分层，WebAudio 合成）
DOC_RADAR = "radar"               # 雷达图（多维对比）
DOC_CHAPTER = "chapter"           # 章节（写作）
DOC_MEDIA = "media"               # 媒体库
DOC_EMBED = "embed"               # 链接嵌入
DOC_TYPES = [
    (DOC_FOLDER, "文件夹"),
    (DOC_CARD, "卡片"),
    (DOC_TIMELINE, "时间线"),
    (DOC_MAP, "地图"),
    (DOC_CANVAS, "画布"),
    (DOC_BOARD, "看板"),
    (DOC_NOTE, "笔记"),
    (DOC_TABLE, "表格"),
    (DOC_TREE, "关系树"),
    (DOC_GRAPH, "世界图谱"),
    (DOC_DICTIONARY, "词典"),
    (DOC_TODO, "待办清单"),
    (DOC_VOICE, "语音备忘"),
    (DOC_DICE, "骰子"),
    (DOC_SOUNDSCAPE, "环境音"),
    (DOC_RADAR, "雷达图"),
    (DOC_CHAPTER, "章节"),
    (DOC_MEDIA, "媒体库"),
    (DOC_EMBED, "链接嵌入"),
]

# 属性值类型（调研文档 §3.2）
VT_TEXT = "text"
VT_SELECT = "select"
VT_MULTISELECT = "multiselect"
VT_NUMBER = "number"
VT_DATE = "date"
VT_REFERENCE = "reference"
VT_FORMULA = "formula"
VALUE_TYPES = [
    (VT_TEXT, "文本"),
    (VT_SELECT, "单选"),
    (VT_MULTISELECT, "多选"),
    (VT_NUMBER, "数字"),
    (VT_DATE, "日期"),
    (VT_REFERENCE, "引用"),
    (VT_FORMULA, "公式"),
]

# 事件精度（调研文档 §6.1：年 / 月 / 日 / 时间）
PRECISION_YEAR = "year"
PRECISION_MONTH = "month"
PRECISION_DAY = "day"
PRECISION_TIME = "time"
PRECISIONS = [
    (PRECISION_YEAR, "年"),
    (PRECISION_MONTH, "月"),
    (PRECISION_DAY, "日"),
    (PRECISION_TIME, "时间"),
]
PRECISION_ORDER = {PRECISION_YEAR: 0, PRECISION_MONTH: 1, PRECISION_DAY: 2, PRECISION_TIME: 3}

# 日历模式
CAL_EARTH = "earth"
CAL_CUSTOM = "custom"

# 站点访问范围（调研文档 §7.1：Public / Unlisted / Password）
AUDIENCE_PUBLIC = "public"
AUDIENCE_UNLISTED = "unlisted"
AUDIENCE_PASSWORD = "password"
AUDIENCES = [
    (AUDIENCE_PUBLIC, "任何人可读"),
    (AUDIENCE_UNLISTED, "仅持链接可见"),
    (AUDIENCE_PASSWORD, "需要密码"),
]

# 文档的发布状态（对齐 §4.4 海报式的四态语义）
STATE_UNPUBLISHED = "unpublished"   # 站点还没发布过
STATE_PENDING = "pending"           # 站点已发布，这张卡是后加的
STATE_LIVE = "live"                 # 与站点一致
STATE_STALE = "stale"               # 站点还是旧版
STATE_EXCLUDED = "excluded"         # 被排除 / 在维基里隐藏

# 卫星显示策略（timeline.settings.moonsShown）
MOON_EVERY_NIGHT = "every"
MOON_QUARTERS = "quarters"
MOON_FULL = "full"

# 关系树的起步模板（对齐 familyTree：Family / Corporate / Military / Royal court / Blank）
# 模版清单本身放在 ``world/relations.py``（纯数据、无 ORM，models 反过来 import 它），
# 这样"关系词表"只有一份，界面、接口和落库不会各说各话。
TREE_FAMILY = "family"
TREE_CORPORATE = "corporate"
TREE_MILITARY = "military"
TREE_ROYAL = "royal"
TREE_BLANK = "blank"
TREE_KINDS = [(item["id"], item["name"]) for item in TREE_TEMPLATES]

# 每种模板默认的关系名（可在界面上逐个改）
TREE_EDGE_LABELS = {
    template["id"]: template_labels(template["id"]) for template in TREE_TEMPLATES
}
# 兜底叫法：模版没覆盖某个 kind 时用中性的那个（对齐 relations.RELATION_KINDS）
RELATION_LABELS = dict(RELATION_KINDS)
# 关系种类：所有模版共用一套 kind，界面上的叫法按模版覆盖
TREE_EDGE_KINDS = list(RELATION_KINDS)

# 地图标注的三种形态（对齐 mapTool.toolbar 的 Pins / Zones / Text）
MARKER_PIN = "pin"
MARKER_ZONE = "zone"
MARKER_LABEL = "label"
MARKER_KINDS = [
    (MARKER_PIN, "图钉"),
    (MARKER_ZONE, "区域"),
    (MARKER_LABEL, "文字"),
]
MARKER_COLORS = ("gold", "sky", "violet", "red", "teal", "blue")

# 世界主题默认值（对齐调研文档 §16.1 实测到的 theme_config）
DEFAULT_THEME = {
    "mode": "dark",
    "grain": 22,
    "headingFont": "EB Garamond",
    "bodyFont": "DM Sans",
    "primaryColor": "#3f3416",
    "background": "",
}

# 纪元配色（沿用上一轮已量产的六个色板）
ERA_THEMES = ("blue", "sky", "violet", "red", "teal", "gold")
ERA_COLORS_RGB = {
    "blue": (98, 105, 128),
    "sky": (52, 117, 243),
    "violet": (82, 81, 193),
    "red": (236, 58, 58),
    "teal": (26, 176, 121),
    "gold": (224, 148, 36),
}

# 地球历（12 月 × 30 天，与 VVD 的「通用 12 × 30」一致）
EARTH_MONTHS = [{"name": f"Month {i}", "days": 30} for i in range(1, 13)]


def slugify_name(name: str, fallback: str = "untitled") -> str:
    """把名称变成 slug：去音标、去符号、转小写、截断 50 字符（对齐 §2.4 实测规则）。"""
    import unicodedata

    normalized = unicodedata.normalize("NFKD", name or "")
    normalized = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    normalized = re.sub(r"[^\w\s-]", "", normalized, flags=re.UNICODE).strip().lower()
    normalized = re.sub(r"[\s_]+", "-", normalized)
    normalized = normalized[:50].strip("-")
    return normalized or fallback


def publish_state(document) -> str:
    """算出某份文档相对当前站点的状态（§4.4 的发布状态机）。

    判断依据是**时间**而不是版本号：``published_at`` 是这份文档上次进入站点的时刻，
    ``updated_at`` 是它最后一次被改的时刻；改过就是 stale——这正是界面上那句
    "Edited since you published"。
    """
    world = document.world
    if document.hidden or not document.is_published:
        return STATE_EXCLUDED
    if not world.is_published or world.publish_version == 0:
        return STATE_UNPUBLISHED
    if document.published_at is None:
        return STATE_PENDING
    if document.updated_at and document.updated_at > document.published_at:
        return STATE_STALE
    return STATE_LIVE


def make_slug(*seeds: str) -> str:
    """生成 6 位十六进制短码（VVD 的 ``/worlds/a045ca`` 就是这个形态）。"""
    import hashlib

    raw = "|".join(str(s) for s in seeds if s) or str(timezone.now().timestamp())
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:6]


# --------------------------------------------------------------------------- #
# 世界
# --------------------------------------------------------------------------- #
class World(models.Model):
    """顶层容器：一个世界可以发布成一个 wiki（调研文档 §2.1）。"""

    owner = models.ForeignKey(
        "auth.User", null=True, blank=True, on_delete=models.SET_NULL,
        related_name="owned_worlds", verbose_name="所有者",
    )
    name = models.CharField("名称", max_length=120, default="新世界")
    slug = models.CharField("短链", max_length=16, unique=True, blank=True)
    description = models.TextField("简介", blank=True, default="")
    # {"mode", "grain", "headingFont", "bodyFont", "primaryColor", "background"}
    theme_config = models.JSONField("世界主题", default=dict, blank=True)
    ai_enabled = models.BooleanField("AI 功能", default=True)
    auto_link_enabled = models.BooleanField("名字自动识别", default=True)
    link_entrance_enabled = models.BooleanField("链接入口", default=True)
    genres = models.JSONField("题材", default=list, blank=True)
    # 发布（调研文档 §7.1 / §4.4 的站点侧语义）
    is_published = models.BooleanField("已发布站点", default=False)
    published_slug = models.CharField("站点地址", max_length=40, blank=True, default="")
    audience = models.CharField("访问范围", max_length=10, choices=AUDIENCES, default=AUDIENCE_PUBLIC)
    publish_password = models.CharField("访问密码", max_length=60, blank=True, default="")
    publish_version = models.PositiveIntegerField("发布版本", default=0)
    published_at = models.DateTimeField("发布于", null=True, blank=True)
    created_at = models.DateTimeField("创建于", auto_now_add=True)
    updated_at = models.DateTimeField("更新于", auto_now=True)

    class Meta:
        ordering = ["id"]
        verbose_name = "世界"
        verbose_name_plural = "世界"

    def __str__(self):
        return self.name or "未命名世界"

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = make_slug(self.name, timezone.now().isoformat())
        super().save(*args, **kwargs)

    @property
    def theme(self) -> dict:
        """主题与默认值合并后的结果（前端只读这一份）。"""
        merged = dict(DEFAULT_THEME)
        if isinstance(self.theme_config, dict):
            merged.update({k: v for k, v in self.theme_config.items() if v is not None})
        return merged

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = make_slug(self.name, timezone.now().isoformat())
        if self.is_published and not self.published_slug:
            self.published_slug = make_slug("site", self.name, self.slug)
        super().save(*args, **kwargs)

    @property
    def site_url(self) -> str:
        return f"/s/{self.published_slug}/" if self.published_slug else ""

    def publish_summary(self) -> dict:
        """站点状态：版本、范围、各状态的文档计数（前端分享面板直接用）。"""
        counts = {"live": 0, "stale": 0, "pending": 0, "excluded": 0, "unpublished": 0}
        for document in self.documents.filter(deleted_at__isnull=True).exclude(document_type=DOC_FOLDER):
            counts[publish_state(document)] = counts.get(publish_state(document), 0) + 1
        return {
            "published": self.is_published,
            "url": self.site_url,
            "audience": self.audience,
            "has_password": bool(self.publish_password),
            "version": self.publish_version,
            "published_at": self.published_at.isoformat() if self.published_at else None,
            "counts": counts,
        }

    def to_payload(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "slug": self.slug,
            "description": self.description,
            "theme": self.theme,
            "ai_enabled": self.ai_enabled,
            "auto_link_enabled": self.auto_link_enabled,
            "link_entrance_enabled": self.link_entrance_enabled,
            "genres": self.genres if isinstance(self.genres, list) else [],
            "publish": self.publish_summary(),
        }


# --------------------------------------------------------------------------- #
# 类型与属性
# --------------------------------------------------------------------------- #
class EntityType(models.Model):
    """卡片类型（可嵌套子类型），对应调研文档 §3.2。"""

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
        payload = {
            "id": self.id,
            "name": self.name,
            "parent": self.parent_id,
            "icon": self.icon,
            "color": self.color,
            "position": self.position,
            "hidden": self.hidden,
            "field_count": self.properties.count(),
        }
        if with_properties:
            payload["properties"] = [p.to_payload() for p in self.all_properties()]
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


# --------------------------------------------------------------------------- #
# 文档树
# --------------------------------------------------------------------------- #
class Era(models.Model):
    """纪元：每个纪元都从 0 年起算（调研文档 §6.1）。"""

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
    """文档：文件夹 / 卡片 / 时间线 / 地图 / 画布… 都在这张表里（对齐 §16.2 的真实结构）。"""

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
    preview = models.JSONField("预览", default=dict, blank=True)
    cover = models.TextField("封面", blank=True, default="")
    pinned = models.BooleanField("置顶", default=False)
    hidden = models.BooleanField("在维基中隐藏", default=False)
    # 发布相关（对齐真实字段名）
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


# --------------------------------------------------------------------------- #
# 卡片
# --------------------------------------------------------------------------- #
ERA_MODE_UNIVERSAL = "universal"   # 所有纪元都出现
ERA_MODE_ONLY = "only"             # 只在选定纪元里出现
ERA_MODE_HIDDEN = "hidden"         # 在选定纪元里隐藏
ERA_MODES = [
    (ERA_MODE_UNIVERSAL, "所有纪元"),
    (ERA_MODE_ONLY, "只在选定纪元"),
    (ERA_MODE_HIDDEN, "在选定纪元里隐藏"),
]


class Card(models.Model):
    """卡片内容（与 Document 一对一）：别名 + 属性值 + 区块正文。"""

    document = models.OneToOneField(Document, on_delete=models.CASCADE, related_name="card")
    entity_type = models.ForeignKey(
        EntityType, null=True, blank=True, on_delete=models.SET_NULL, related_name="cards"
    )
    aliases = models.JSONField("别名", default=list, blank=True)  # ["The Untreated", ...]
    values = models.JSONField("属性值", default=dict, blank=True)  # {property_id: raw}
    blocks = models.JSONField("区块", default=list, blank=True)
    body = models.TextField("正文纯文本", blank=True, default="")  # 供搜索与自动识别
    # Eras 作为"世界版本分支"：这张卡在纪元里的可见性（调研文档 §7.2）
    era_mode = models.CharField("纪元可见性", max_length=10, choices=ERA_MODES, default=ERA_MODE_UNIVERSAL)
    era_ids = models.JSONField("生效的纪元", default=list, blank=True)

    class Meta:
        verbose_name = "卡片"
        verbose_name_plural = "卡片"

    def __str__(self):
        return self.document.name

    # -- 属性 -------------------------------------------------------------- #
    def effective_type(self) -> EntityType | None:
        return self.entity_type or self.document.entity_type

    def resolved_values(self) -> dict:
        """把原始值解析成前端直接可用的结构（引用转摘要、公式求值）。"""
        from .normalize import resolve_card_values

        return resolve_card_values(self)

    def to_payload(self) -> dict:
        return {
            "id": self.id,
            "document": self.document_id,
            "entity_type": self.entity_type_id,
            "aliases": self.aliases if isinstance(self.aliases, list) else [],
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
        """能被自动识别成这张卡的名字：主名 + 别名（调研文档 §4.2）。"""
        names = [self.document.name]
        names += [str(a) for a in (self.aliases or []) if str(a).strip()]
        return [n for n in names if n and n.strip()]


# --------------------------------------------------------------------------- #
# 日历与时间线
# --------------------------------------------------------------------------- #
class Calendar(models.Model):
    """自定义日历：月、每天小时数、卫星（调研文档 §6.1）。"""

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
        """按精度输出人类可读日期，形如 ``12 Month 3, Year -14``（对齐官网演示里的写法）。"""
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
    """时间线上的事件：四级精度 + 纪元 + 关联卡片（调研文档 §6.1）。"""

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


# --------------------------------------------------------------------------- #
# 关系树（调研文档 §6.3 / familyTree）
# --------------------------------------------------------------------------- #
class TreeVariant(models.Model):
    """一棵关系树（"variant"）：同一批人可以有多套关系视角（不同世界线 / 不同分支）。"""

    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name="tree_variants")
    name = models.CharField("名称", max_length=60, default="Main")
    kind = models.CharField("模板", max_length=12, choices=TREE_KINDS, default=TREE_FAMILY)
    position = models.PositiveIntegerField("排序", default=1)
    # 关系名可以逐个改（对齐 "rename its relationships"）
    edge_labels = models.JSONField("关系名", default=dict, blank=True)
    settings = models.JSONField("设置", default=dict, blank=True)  # 朝向、关系名显示模式等
    created_at = models.DateTimeField("创建于", auto_now_add=True)

    class Meta:
        ordering = ["position", "id"]
        verbose_name = "关系树"
        verbose_name_plural = "关系树"

    def __str__(self):
        return self.name

    def stored_relations(self) -> list:
        """这棵树的关系清单原始态（不补叫法，所以能被 ``label_for`` 安全调用）。

        存在 ``settings["relations"]`` 里（``[{kind, label, style, enabled}]``），
        没存过就用模版自带的那份——所以老数据不需要迁移。
        判断"存没存过"看的是**有没有这个键**而不是"是不是空"：用户可以把关系
        全删光，那也是他的选择，不能又给他弹回模版那套。
        """
        stored = (self.settings or {}).get("relations")
        if not isinstance(stored, list):
            stored = [
                {"kind": item["kind"], "label": item["label"],
                 "style": item.get("style") or "", "enabled": True}
                for item in template_relations(self.kind)
            ]
        clean = []
        seen = set()
        for item in stored:
            if not isinstance(item, dict):
                continue
            kind = str(item.get("kind") or "").strip()
            if not kind or kind in seen:
                continue
            seen.add(kind)
            clean.append({
                "kind": kind,
                "label": str(item.get("label") or "").strip(),
                "style": str(item.get("style") or ""),
                "enabled": bool(item.get("enabled", True)),
            })
        return clean

    def label_for(self, kind: str) -> str:
        """这条关系在这棵树里叫什么。

        优先级：这棵树里逐个改过的名字（``edge_labels``）→ 关系清单里那条的名字
        → 模版默认 → 中性叫法。让"模版关系那一列改过的名字"真的生效——
        不然用户在界面上把「军团长」改成别的，新连出来的线还印着「军团长」。
        """
        overrides = self.edge_labels or {}
        if overrides.get(kind):
            return overrides[kind]
        for item in self.stored_relations():
            if item["kind"] == kind and item["label"]:
                return item["label"]
        return TREE_EDGE_LABELS.get(self.kind, {}).get(kind) or RELATION_LABELS.get(kind) or kind

    def relations(self) -> list:
        """这棵树当前可用的关系清单：名字补齐、能直接给界面用。"""
        return [
            dict(item, label=item["label"] or self.label_for(item["kind"]))
            for item in self.stored_relations()
        ]

    def set_relations(self, relations: list) -> None:
        merged = dict(self.settings or {})
        merged["relations"] = relations
        self.settings = merged

    def fork(self, name: str = "") -> "TreeVariant":
        """复制一份（对齐 "New variant (forks the current one)"）。"""
        clone = TreeVariant.objects.create(
            document=self.document,
            name=name or f"Variant {self.document.tree_variants.count() + 1}",
            kind=self.kind,
            position=self.document.tree_variants.count() + 1,
            edge_labels=dict(self.edge_labels or {}),
            settings=dict(self.settings or {}),
        )
        mapping = {}
        for node in self.nodes.all():
            mapping[node.id] = TreeNode.objects.create(
                variant=clone, card=node.card, name=node.name, subtitle=node.subtitle,
                image=node.image, generation=node.generation, x=node.x, y=node.y,
                position=node.position, junction=node.junction, deceased=node.deceased,
                group=node.group, group_color=node.group_color,
                kind=node.kind, note=node.note, favourite=node.favourite,
            )
        for edge in self.edges.all():
            TreeEdge.objects.create(
                variant=clone, source=mapping.get(edge.source_id), target=mapping.get(edge.target_id),
                kind=edge.kind, label=edge.label, style=edge.style,
            )
        return clone

    def to_payload(self, with_graph: bool = False) -> dict:
        payload = {
            "id": self.id,
            "document": self.document_id,
            "name": self.name,
            "kind": self.kind,
            "kind_label": self.get_kind_display(),
            "position": self.position,
            "edge_labels": self.edge_labels or {},
            "settings": self.settings if isinstance(self.settings, dict) else {},
            "node_count": self.nodes.count(),
            "relations": self.relations(),
        }
        payload["resolved_labels"] = {kind: self.label_for(kind) for kind, _ in TREE_EDGE_KINDS}
        if with_graph:
            payload["nodes"] = [n.to_payload() for n in self.nodes.all()]
            payload["edges"] = [e.to_payload() for e in self.edges.select_related("source", "target")]
        return payload


class TreeNode(models.Model):
    """树上的一格：一个人（可以没有卡片，也可以吸附到一张卡片），或者一张备注。"""

    #: 卡片上的两种内容：人物卡 / 便签。便签不参与关系连线，只用来在画布上写字。
    NODE_PERSON = "person"
    NODE_NOTE = "note"
    NODE_KINDS = [(NODE_PERSON, "人物"), (NODE_NOTE, "备注")]

    variant = models.ForeignKey(TreeVariant, on_delete=models.CASCADE, related_name="nodes")
    card = models.ForeignKey(Document, null=True, blank=True, on_delete=models.SET_NULL, related_name="tree_nodes")
    name = models.CharField("名称", max_length=120, default="新成员")
    subtitle = models.CharField("副标题", max_length=120, blank=True, default="")
    image = models.TextField("图片", blank=True, default="")
    #: 关系树画布上这一格的类型：人物 / 备注（右键菜单里"在此处添加备注"）
    kind = models.CharField("格类型", max_length=8, choices=NODE_KINDS, default=NODE_PERSON)
    #: 备注正文（只有 NODE_NOTE 用）
    note = models.TextField("备注", blank=True, default="")
    generation = models.IntegerField("世代", default=0)
    x = models.FloatField("横向位置", default=0.0)
    y = models.FloatField("纵向位置", default=0.0)
    position = models.PositiveIntegerField("排序", default=0)
    junction = models.BooleanField("交汇点", default=False)
    deceased = models.BooleanField("已故", default=False)
    #: 卡片工具条上那个心（"重点人物"），纯标记，不影响结构
    favourite = models.BooleanField("重点", default=False)
    group = models.CharField("分组名", max_length=60, blank=True, default="")
    group_color = models.CharField("分组颜色", max_length=24, blank=True, default="")

    class Meta:
        ordering = ["generation", "x", "position", "id"]
        verbose_name = "关系树成员"
        verbose_name_plural = "关系树成员"

    def __str__(self):
        return self.name or (self.note[:20] if self.note else "未命名")

    @property
    def is_note(self) -> bool:
        return self.kind == self.NODE_NOTE

    def to_payload(self) -> dict:
        return {
            "id": self.id,
            "variant": self.variant_id,
            "card": self.card_id,
            "card_name": self.card.name if self.card_id else None,
            "name": self.name,
            "subtitle": self.subtitle,
            "image": self.image,
            "kind": self.kind,
            "is_note": self.is_note,
            "note": self.note,
            "generation": self.generation,
            "x": self.x,
            "y": self.y,
            "position": self.position,
            "junction": self.junction,
            "deceased": self.deceased,
            "favourite": self.favourite,
            "group": self.group,
            "group_color": self.group_color,
        }


class TreeEdge(models.Model):
    """两个人之间的关系；关系名按 variant 的模板 + 覆盖来显示。"""

    variant = models.ForeignKey(TreeVariant, on_delete=models.CASCADE, related_name="edges")
    source = models.ForeignKey(TreeNode, on_delete=models.CASCADE, related_name="out_edges")
    target = models.ForeignKey(TreeNode, on_delete=models.CASCADE, related_name="in_edges")
    kind = models.CharField("关系", max_length=32, choices=TREE_EDGE_KINDS, default="parent")
    label = models.CharField("自定义关系名", max_length=40, blank=True, default="")
    style = models.CharField("线型", max_length=10, blank=True, default="")  # "" / dashed / dotted

    class Meta:
        ordering = ["id"]
        unique_together = [("variant", "source", "target", "kind")]
        verbose_name = "关系"
        verbose_name_plural = "关系"

    def __str__(self):
        return f"{self.source_id} -> {self.target_id} ({self.kind})"

    def display_label(self) -> str:
        return self.label or self.variant.label_for(self.kind)

    def to_payload(self) -> dict:
        return {
            "id": self.id,
            "variant": self.variant_id,
            "source": self.source_id,
            "target": self.target_id,
            "kind": self.kind,
            "label": self.label,
            "display_label": self.display_label(),
            "style": self.style,
        }


# --------------------------------------------------------------------------- #
# 经典地图（调研文档 §6.2 的 Classic map / mapTool）
# --------------------------------------------------------------------------- #
class MapLayer(models.Model):
    """图层：Pin / Zone / Label 都挂在某一层上，可整体显隐与调透明度。"""

    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name="map_layers")
    name = models.CharField("名称", max_length=60, default="默认")
    position = models.PositiveIntegerField("排序", default=1)
    visible = models.BooleanField("显示", default=True)
    opacity = models.FloatField("透明度", default=1.0)

    class Meta:
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
    """地图上的一个标注：图钉 / 区域 / 文字（对齐 mapTool 的 Pins / Zones / Text）。"""

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


# --------------------------------------------------------------------------- #
# 账号 / 协作（调研文档 §6、§14）
# --------------------------------------------------------------------------- #
ROLE_OWNER = "owner"
ROLE_EDITOR = "editor"
ROLE_VIEWER = "viewer"
ROLES = [
    (ROLE_OWNER, "所有者"),
    (ROLE_EDITOR, "可编辑"),
    (ROLE_VIEWER, "只读"),
]


class Membership(models.Model):
    """谁可以动这个世界。第一个注册的人自动成为 owner。"""

    world = models.ForeignKey(World, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey("auth.User", on_delete=models.CASCADE, related_name="memberships")
    role = models.CharField("角色", max_length=10, choices=ROLES, default=ROLE_EDITOR)
    invited_by = models.ForeignKey("auth.User", null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="invited_memberships")
    created_at = models.DateTimeField("加入于", auto_now_add=True)

    class Meta:
        unique_together = [("world", "user")]
        ordering = ["id"]

    def __str__(self) -> str:
        return f"{self.user.username}@{self.world.name}:{self.role}"

    def can_edit(self) -> bool:
        return self.role in (ROLE_OWNER, ROLE_EDITOR)

    def to_payload(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "username": self.user.get_full_name() or self.user.username,
            "handle": self.user.username,
            "handle": self.user.username,
            "role": self.role,
            "role_label": dict(ROLES).get(self.role, self.role),
            "joined_at": self.created_at.isoformat() if self.created_at else "",
        }


class InviteCode(models.Model):
    """邀请码：现在注册需要它（第一个账号例外，它就是所有者）。"""

    code = models.CharField("邀请码", max_length=32, unique=True)
    world = models.ForeignKey(World, null=True, blank=True, on_delete=models.CASCADE, related_name="invites")
    created_by = models.ForeignKey("auth.User", null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="created_invites")
    note = models.CharField("备注", max_length=120, blank=True, default="")
    role = models.CharField("加入后的角色", max_length=10, choices=ROLES, default=ROLE_EDITOR)
    max_uses = models.PositiveIntegerField("可用次数", default=1)
    uses = models.PositiveIntegerField("已用次数", default=0)
    expires_at = models.DateTimeField("过期时间", null=True, blank=True)
    created_at = models.DateTimeField("创建于", auto_now_add=True)

    class Meta:
        ordering = ["-id"]

    def __str__(self) -> str:
        return self.code

    def is_valid(self) -> bool:
        if self.uses >= self.max_uses:
            return False
        if self.expires_at and timezone.now() > self.expires_at:
            return False
        return True

    def to_payload(self) -> dict:
        return {
            "id": self.id,
            "code": self.code,
            "note": self.note,
            "role": self.role,
            "uses": self.uses,
            "max_uses": self.max_uses,
            "valid": self.is_valid(),
            "expires_at": self.expires_at.isoformat() if self.expires_at else "",
            "created_at": self.created_at.isoformat() if self.created_at else "",
        }


class PublishLog(models.Model):
    """每次发布留一条记录：版本、范围、以及这次动了哪些文档（站点页脚与发布面板都用）。"""

    world = models.ForeignKey(World, on_delete=models.CASCADE, related_name="publish_logs")
    version = models.PositiveIntegerField("版本", default=1)
    audience = models.CharField("访问范围", max_length=10, choices=AUDIENCES, default=AUDIENCE_PUBLIC)
    counts = models.JSONField("统计", default=dict, blank=True)
    added = models.JSONField("新增", default=list, blank=True)
    changed = models.JSONField("更新", default=list, blank=True)
    removed = models.JSONField("移除", default=list, blank=True)
    author = models.ForeignKey("auth.User", null=True, blank=True, on_delete=models.SET_NULL,
                               related_name="publish_logs", verbose_name="发布人")
    author_name = models.CharField("发布人", max_length=150, blank=True, default="")
    created_at = models.DateTimeField("时间", auto_now_add=True)

    class Meta:
        ordering = ["-version", "-id"]
        verbose_name = "发布记录"
        verbose_name_plural = "发布记录"

    def __str__(self):
        return f"v{self.version} @ {self.created_at:%Y-%m-%d %H:%M}"

    def to_payload(self) -> dict:
        return {
            "id": self.id,
            "version": self.version,
            "audience": self.audience,
            "counts": self.counts or {},
            "added": self.added or [],
            "changed": self.changed or [],
            "removed": self.removed or [],
            "author": self.author_name or (self.author.username if self.author else "匿名"),
            "created_at": self.created_at.isoformat() if self.created_at else "",
            "added_count": len(self.added or []),
            "changed_count": len(self.changed or []),
            "removed_count": len(self.removed or []),
        }


class Presence(models.Model):
    """谁在线（心跳式，不搞长连接）：20 秒没心跳就算离开了。"""

    world = models.ForeignKey(World, on_delete=models.CASCADE, related_name="presence")
    user = models.ForeignKey("auth.User", on_delete=models.CASCADE, related_name="presence")
    document = models.ForeignKey("Document", null=True, blank=True, on_delete=models.SET_NULL,
                                 related_name="presence")
    updated_at = models.DateTimeField("最后在线", auto_now=True)

    ONLINE_WINDOW = 60      # 秒

    class Meta:
        unique_together = [("world", "user")]

    @classmethod
    def touch(cls, world, user, document=None) -> "Presence":
        entry, _created = cls.objects.get_or_create(world=world, user=user)
        if document is not None:
            entry.document = document
        entry.save()
        return entry

    @classmethod
    def online(cls, world):
        since = timezone.now() - timedelta(seconds=cls.ONLINE_WINDOW)
        return cls.objects.filter(world=world, updated_at__gte=since).select_related("user", "document")

    def to_payload(self) -> dict:
        return {
            "user_id": self.user_id,
            "username": self.user.get_full_name() or self.user.username,
            "handle": self.user.username,
            "initial": (self.user.get_full_name() or self.user.username)[:1].upper(),
            "document": self.document_id,
            "document_name": self.document.name if self.document else "",
            "updated_at": self.updated_at.isoformat() if self.updated_at else "",
        }


MAX_VERSIONS = 30


class DocumentVersion(models.Model):
    """文档版本快照：每次内容变化留一版，可预览、可回滚（调研文档 §5.3）。"""

    document = models.ForeignKey("Document", on_delete=models.CASCADE, related_name="versions")
    index = models.PositiveIntegerField("第几版", default=1)
    author = models.ForeignKey("auth.User", null=True, blank=True, on_delete=models.SET_NULL,
                               related_name="versions")
    author_name = models.CharField("作者", max_length=80, blank=True, default="")
    label = models.CharField("做了什么", max_length=80, blank=True, default="")
    payload = models.JSONField("内容快照", default=dict, blank=True)
    summary = models.CharField("摘要", max_length=200, blank=True, default="")
    created_at = models.DateTimeField("保存于", auto_now_add=True)

    class Meta:
        ordering = ["-index", "-id"]
        unique_together = [("document", "index")]

    def __str__(self) -> str:
        return f"{self.document.name} v{self.index}"

    def to_payload(self, with_body: bool = False) -> dict:
        data = {
            "id": self.id,
            "index": self.index,
            "author": self.author_name or (self.author.username if self.author else "匿名"),
            "label": self.label,
            "summary": self.summary,
            "created_at": self.created_at.isoformat() if self.created_at else "",
            "size": len(json.dumps(self.payload, ensure_ascii=False)) if self.payload else 0,
        }
        if with_body:
            data["payload"] = self.payload
        return data
