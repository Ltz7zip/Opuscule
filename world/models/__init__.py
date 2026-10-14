# -*- coding: utf-8 -*-
"""世界模型（Opuscule 的核心数据模型）。

结构主线是「世界 → 文档树 → 各种内容」：

* ``World`` 是一部作品（顶层容器），下面挂一棵 ``Document`` 树；
* ``Document`` 是树上唯一的节点类型，靠 ``document_type`` 区分文件夹 / 卡片 / 时间线 / 地图 /
  画布 / 看板 / 笔记 / …… ；名称、位置、发布状态、纪元归属、删除时间等通用信息都挂在它上面；
* 不同 ``document_type`` 会「长出」各自的附属内容：卡片 → ``Card``，时间线 → ``TimelineEvent``，
  关系树 → ``TreeVariant`` / ``TreeNode`` / ``TreeEdge``，地图 → ``MapLayer`` / ``MapMarker``。

原来这些全摊在一个 ``world/models.py`` 里，现已按主题拆成同名子模块，本文件负责
把公开名字**原样再导出**——``from world.models import X`` 与 ``from .models import X``
等既有引用路径全部保持不变。

R2 拆 app 后这里只剩**核心**模型（世界 / 类型 / 属性 / 成员 / 邀请 / 治理）与常量；
文档、关系树、地图、发布、版本、在线状态已各自搬到独立 app：

* ``documents`` —— ``Document`` / ``Card`` / ``Era`` / ``Calendar`` / ``TimelineEvent``
  / ``Presence`` / ``DocumentVersion``；
* ``graph`` —— ``TreeVariant`` / ``TreeNode`` / ``TreeEdge``；
* ``maps`` —— ``MapLayer`` / ``MapMarker``；
* ``publishing`` —— ``PublishLog``。

跨 app 的模型请改从对应 app 的 ``models`` 导入（如 ``from documents.models import Document``）。

子模块与依赖顺序（皆为无环 DAG，跨模型外键都是直接类引用）：

``constants`` → ``world`` → ``entity`` → ``membership`` / ``invite`` / ``governance``
"""

from .constants import (
    # 文档类型
    DOC_FOLDER,
    DOC_CARD,
    DOC_TIMELINE,
    DOC_MAP,
    DOC_CANVAS,
    DOC_BOARD,
    DOC_NOTE,
    DOC_TABLE,
    DOC_TREE,
    DOC_GRAPH,
    DOC_DICTIONARY,
    DOC_TODO,
    DOC_VOICE,
    DOC_DICE,
    DOC_SOUNDSCAPE,
    DOC_RADAR,
    DOC_CHAPTER,
    DOC_MEDIA,
    DOC_EMBED,
    DOC_TYPES,
    # 属性值类型
    VT_TEXT,
    VT_SELECT,
    VT_MULTISELECT,
    VT_NUMBER,
    VT_DATE,
    VT_REFERENCE,
    VT_FORMULA,
    VALUE_TYPES,
    # 事件精度
    PRECISION_YEAR,
    PRECISION_MONTH,
    PRECISION_DAY,
    PRECISION_TIME,
    PRECISIONS,
    PRECISION_ORDER,
    # 日历
    CAL_EARTH,
    CAL_CUSTOM,
    EARTH_MONTHS,
    # 站点访问范围与发布状态
    AUDIENCE_PUBLIC,
    AUDIENCE_UNLISTED,
    AUDIENCE_PASSWORD,
    AUDIENCES,
    STATE_UNPUBLISHED,
    STATE_PENDING,
    STATE_LIVE,
    STATE_STALE,
    STATE_EXCLUDED,
    # 主题与配色
    MOON_EVERY_NIGHT,
    MOON_QUARTERS,
    MOON_FULL,
    DEFAULT_THEME,
    ERA_THEMES,
    ERA_COLORS_RGB,
    # 关系树
    TREE_FAMILY,
    TREE_CORPORATE,
    TREE_MILITARY,
    TREE_ROYAL,
    TREE_BLANK,
    TREE_KINDS,
    TREE_EDGE_LABELS,
    RELATION_LABELS,
    TREE_EDGE_KINDS,
    # 地图标注
    MARKER_PIN,
    MARKER_ZONE,
    MARKER_LABEL,
    MARKER_KINDS,
    MARKER_COLORS,
    # 纪元可见性
    ERA_MODE_UNIVERSAL,
    ERA_MODE_ONLY,
    ERA_MODE_HIDDEN,
    ERA_MODES,
    # 成员与治理
    ROLE_OWNER,
    ROLE_EDITOR,
    ROLE_VIEWER,
    ROLES,
    MEMBER_ACTIONS,
    MODERATION_ACTIONS,
    REPORT_REASONS,
    REPORT_STATUSES,
    # 版本
    MAX_VERSIONS,
    # 世界配额
    MAX_OWNED_WORLDS,
    # 工具函数
    slugify_name,
    publish_state,
    make_slug,
)

from .world import World
from .entity import EntityType, PropertyDef
from .membership import MemberEvent, Membership
from .invite import InviteCode
from .governance import ModerationEvent, Report
