# -*- coding: utf-8 -*-
"""世界模型的公共常量与工具函数。

原来这些都摊在 ``world/models.py`` 里；拆包后集中到这里，模型文件只放模型本身。
按主题分组：文档类型 / 属性值类型 / 事件精度 / 日历 / 站点访问与发布状态 /
主题与配色 / 关系树 / 地图标注 / 成员与治理 / 版本。
"""

from __future__ import annotations

import re

from django.utils import timezone

from ..relations import (
    RELATION_KINDS,
    TREE_TEMPLATES,
    template_labels,
)

# --------------------------------------------------------------------------- #
# 文档类型
# --------------------------------------------------------------------------- #

# 文档类型：标注一份文档是文件夹、卡片、时间线还是别的工具
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
# 其余工具类型：词典 / 待办 / 语音 等，各有一套自己的附属内容
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

# --------------------------------------------------------------------------- #
# 属性值类型
# --------------------------------------------------------------------------- #

# 属性值类型：一条属性存的是哪种值
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

# --------------------------------------------------------------------------- #
# 事件精度
# --------------------------------------------------------------------------- #

# 事件精度：时间线上的事件知道自己精确到哪一级
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

# --------------------------------------------------------------------------- #
# 日历
# --------------------------------------------------------------------------- #

# 日历模式
CAL_EARTH = "earth"
CAL_CUSTOM = "custom"

# 地球历：12 个月、每月 30 天，自定义历没配置时的兜底
EARTH_MONTHS = [{"name": f"Month {i}", "days": 30} for i in range(1, 13)]

# --------------------------------------------------------------------------- #
# 站点访问范围与发布状态
# --------------------------------------------------------------------------- #

# 站点访问范围：任何人可读 / 仅持链接可见 / 需要密码
AUDIENCE_PUBLIC = "public"
AUDIENCE_UNLISTED = "unlisted"
AUDIENCE_PASSWORD = "password"
AUDIENCES = [
    (AUDIENCE_PUBLIC, "任何人可读"),
    (AUDIENCE_UNLISTED, "仅持链接可见"),
    (AUDIENCE_PASSWORD, "需要密码"),
]

# 文档的发布状态：相对只读站点的五种状态
STATE_UNPUBLISHED = "unpublished"   # 站点还没发布过
STATE_PENDING = "pending"           # 站点已发布，这张卡是后加的
STATE_LIVE = "live"                 # 与站点一致
STATE_STALE = "stale"               # 上过站，但之后又改过
STATE_EXCLUDED = "excluded"         # 被排除 / 在维基里隐藏

# --------------------------------------------------------------------------- #
# 主题与配色
# --------------------------------------------------------------------------- #

# 卫星显示策略（timeline.settings.moonsShown）
MOON_EVERY_NIGHT = "every"
MOON_QUARTERS = "quarters"
MOON_FULL = "full"

# 世界主题的默认值：没配过时用这一套
DEFAULT_THEME = {
    "mode": "dark",
    "grain": 22,
    "headingFont": "EB Garamond",
    "bodyFont": "DM Sans",
    "primaryColor": "#3f3416",
    "background": "",
}

# 纪元可用的六种配色
ERA_THEMES = ("blue", "sky", "violet", "red", "teal", "gold")
ERA_COLORS_RGB = {
    "blue": (98, 105, 128),
    "sky": (52, 117, 243),
    "violet": (82, 81, 193),
    "red": (236, 58, 58),
    "teal": (26, 176, 121),
    "gold": (224, 148, 36),
}

# --------------------------------------------------------------------------- #
# 关系树
# --------------------------------------------------------------------------- #

# 关系树的起步模板：家族 / 公司 / 军队 / 王室 / 空白
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

# --------------------------------------------------------------------------- #
# 地图标注
# --------------------------------------------------------------------------- #

# 地图标注的三种形态：图钉 / 区域 / 文字
MARKER_PIN = "pin"
MARKER_ZONE = "zone"
MARKER_LABEL = "label"
MARKER_KINDS = [
    (MARKER_PIN, "图钉"),
    (MARKER_ZONE, "区域"),
    (MARKER_LABEL, "文字"),
]
MARKER_COLORS = ("gold", "sky", "violet", "red", "teal", "blue")

# --------------------------------------------------------------------------- #
# 纪元可见性
# --------------------------------------------------------------------------- #

ERA_MODE_UNIVERSAL = "universal"   # 所有纪元都出现
ERA_MODE_ONLY = "only"             # 只在选定纪元里出现
ERA_MODE_HIDDEN = "hidden"         # 在选定纪元里隐藏
ERA_MODES = [
    (ERA_MODE_UNIVERSAL, "所有纪元"),
    (ERA_MODE_ONLY, "只在选定纪元"),
    (ERA_MODE_HIDDEN, "在选定纪元里隐藏"),
]

# --------------------------------------------------------------------------- #
# 成员与治理
# --------------------------------------------------------------------------- #

ROLE_OWNER = "owner"
ROLE_EDITOR = "editor"
ROLE_VIEWER = "viewer"
ROLES = [
    (ROLE_OWNER, "所有者"),
    (ROLE_EDITOR, "可编辑"),
    (ROLE_VIEWER, "只读"),
]

# 成员变更动作（``MemberEvent.action``）
MEMBER_ACTIONS = [
    ("join", "加入"),
    ("role", "改角色"),
    ("remove", "移除"),
    ("invite", "发码"),
    ("revoke", "作废码"),
]

# 平台治理动作（``ModerationEvent.action``）
MODERATION_ACTIONS = [
    ("appoint", "任命管理员"),
    ("dismiss", "撤销管理员"),
    ("ban", "封禁"),
    ("unban", "解封"),
]

# 举报理由（``Report.reason``）
REPORT_REASONS = [
    ("content", "内容问题"),
    ("copyright", "侵权 / 版权"),
    ("spam", "垃圾信息"),
    ("abuse", "辱骂 / 攻击"),
    ("privacy", "隐私泄露"),
    ("other", "其他"),
]

# 举报处置状态（``Report.status``）
REPORT_STATUSES = [
    ("open", "待处理"),
    ("handled", "已处理"),
    ("dismissed", "已驳回"),
]

# --------------------------------------------------------------------------- #
# 世界配额
# --------------------------------------------------------------------------- #

# 每个用户最多能自建（当所有者）的世界数（§9 #5 拍板：允许自建，上限 7 个）。
# 只约束"自己新建"这个动作，不影响被邀请加入别人的世界。
MAX_OWNED_WORLDS = 7


# --------------------------------------------------------------------------- #
# 版本
# --------------------------------------------------------------------------- #

MAX_VERSIONS = 30


# --------------------------------------------------------------------------- #
# 工具函数
# --------------------------------------------------------------------------- #
def slugify_name(name: str, fallback: str = "untitled") -> str:
    """把名称变成 slug：去音标、去符号、转小写、截断 50 字符。"""
    import unicodedata

    normalized = unicodedata.normalize("NFKD", name or "")
    normalized = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    normalized = re.sub(r"[^\w\s-]", "", normalized, flags=re.UNICODE).strip().lower()
    normalized = re.sub(r"[\s_]+", "-", normalized)
    normalized = normalized[:50].strip("-")
    return normalized or fallback


def publish_state(document) -> str:
    """算出某份文档相对当前站点的状态（五态发布状态机）。

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
    """生成 6 位十六进制短码，用作世界短链与站点地址。"""
    import hashlib

    raw = "|".join(str(s) for s in seeds if s) or str(timezone.now().timestamp())
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:6]
