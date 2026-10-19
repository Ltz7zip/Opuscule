# -*- coding: utf-8 -*-
"""世界工作区的接口层（/api/world/*）与页面。

这个模块是「工作区」的全部后端：前端每敲一次键盘、拖一个节点、按一下发布，
最终都会落到这里的一个视图函数上。请求怎么走到这儿，见同目录的 ``urls.py``——
它把 ``/api/world/*`` 的每条路径映射到本文件（以及 ``relationship.py``）里的函数。

通用约定
========
· 鉴权：请求先经 ``ActiveWorldMiddleware`` 解析出「当前世界」（规则见 ``permissions``），
  视图再按需检查登录与角色——未登录回 401，没权限回 403。
· 返回：一律 JSON，由 ``json_response`` 统一输出（中文不转义、显式禁用缓存）。
  成功直接给数据，失败给 ``{"error": "..."}``；业务上「找不到」用 404。
· 写入：除少数只读接口外都挂了 ``@csrf_exempt``；请求体统一走 ``parse_json``
  （解不出来当空字典），所以写接口都能容忍前端少传字段。
· 副作用：写文档通常会 ``touch_document`` 顶一下时间、必要时留一版快照，
  这是横切的公共逻辑，很多写视图末尾都会调一次。

功能分组（与下方分区标题一一对应）
==================================
· 基础与启动：JSON 工具、世界作用域、快照 / 版本等公共函数。
· 页面与启动数据：工作区页面、``/state`` 首屏、Service Worker。
· 文档树与卡片：文档增删改查、回收站、卡片正文与属性。
· 类型与属性：卡片类型、属性定义（值类型 / 选项 / 引用 / 公式）。
· 时间线：事件、历法（含预设）、纪元、日历月视图。
· 经典编辑器适配：把经典横向时间轴的接口映射到时间线文档上。
· 关系树 / 地图 / 图谱：三块「画布」各自的节点、连线、图层、标注。
· 账号 / 成员 / 在线 / 版本：注册登录、邀请码、成员角色、在线心跳、文档版本。
· 工具数据 / 媒体 / 表格 / 搜索 / 导入导出：小工具的数据、媒体文件、表格双向绑定、
  全库搜索、Markdown / JSON 导入导出。
· 地图底图 / 发布 / 兜底：底图上传、发布与只读站点、未知路径的兜底响应。

拆包说明
========
本模块已拆为 ``world/views/`` 包（见 ``推进计划.md`` §2.1 第一步「拆包」）。
各子模块按原分区切分；此处显式 re-export 全部原有名字，
使 ``from world.views import X``、``world.views.X`` 等外部引用路径保持不变。
"""

from __future__ import annotations

import pathlib
import hashlib
import json
import logging
import mimetypes
import posixpath
import re
import secrets
from datetime import timedelta
from django.conf import settings
from django.http import Http404, HttpResponse, JsonResponse
from django.core.cache import cache
from django.core.files.storage import default_storage
from django.db import transaction
from django.shortcuts import redirect, render
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods, require_safe
from django.views.static import serve as static_serve
from .. import classic as classic_service, permissions, version as app_version
from ..services import (
    autolink,
    geo as geo_service,
    graph as graph_service,
    publish as publish_service,
)
from ..models import (
    AUDIENCES,
    AUDIENCE_PUBLIC,
    CAL_CUSTOM,
    CAL_EARTH,
    DEFAULT_THEME,
    DOC_CARD,
    DOC_FOLDER,
    DOC_MAP,
    DOC_TIMELINE,
    DOC_TREE,
    DOC_TYPES,
    ERA_COLORS_RGB,
    ERA_THEMES,
    EntityType,
    InviteCode,
    MARKER_COLORS,
    MARKER_KINDS,
    MARKER_LABEL,
    MARKER_PIN,
    MAX_VERSIONS,
    MOON_EVERY_NIGHT,
    MOON_FULL,
    MOON_QUARTERS,
    MemberEvent,
    Membership,
    ModerationEvent,
    PRECISIONS,
    PropertyDef,
    RELATION_LABELS,
    REPORT_STATUSES,
    ROLE_EDITOR,
    ROLE_OWNER,
    ROLE_VIEWER,
    Report,
    TREE_EDGE_KINDS,
    TREE_KINDS,
    VT_DATE,
    VT_FORMULA,
    VT_MULTISELECT,
    VT_NUMBER,
    VT_REFERENCE,
    VT_SELECT,
    World,
    make_slug,
)
from ..classic import ERA_ID_BASE
from ..relations import relation_style
from apps.documents.models import (
    Calendar,
    Card,
    Document,
    DocumentVersion,
    Era,
    Presence,
    TimelineEvent,
)
from apps.graph.models import TreeEdge, TreeNode, TreeVariant
from apps.maps.models import MapLayer, MapMarker
from apps.publishing.models import PublishLog
from ..normalize import (
    ValueErrorCN,
    as_alias_list,
    as_int,
    as_number,
    as_text,
    blocks_to_text,
    build_value_map,
    coerce_property_value,
    default_values_for,
    evaluate_formula,
    normalize_block_comments,
    normalize_blocks,
    resolve_card_values,
)

from .common import (
    ALLOWED_IMAGE_TYPES,
    ALLOWED_MEDIA_TYPES,
    DOC_NOT_FOUND,
    DOC_TYPE_LABEL,
    ITEM_NOT_FOUND,
    MAX_UPLOAD_BYTES,
    STARTER_TYPES,
    VALID_MOON_SHOWN,
    VALID_PRECISIONS,
    _any_document,
    _summarize,
    _upload_content_type,
    _upload_problem,
    bootstrap_types,
    create_world,
    current_world,
    current_world_or_none,
    error,
    get_document,
    get_event,
    get_type,
    json_response,
    logger,
    page_embed_document,
    parse_json,
    save_document_settings,
    snapshot_document,
    timeline_state,
    touch_document,
    world_page_allowed,
    world_page_denied,
)

from .site import (
    explore,
    healthz,
    legacy_map_home,
    legacy_map_page,
    legacy_relationship,
    legacy_timeline,
    legacy_timeline_embedded,
    legacy_w_entry,
    legacy_workspace,
    meta,
    robots_txt,
    safe_primary_color,
    service_worker,
    state,
    workspace,
    world_collection,
    world_detail,
    world_picker,
    world_switch,
)

from .documents import (
    apply_card_payload,
    card_detail,
    document_collection,
    document_detail,
    document_duplicate,
    document_restore,
    trash_collection,
)

from .types import (
    property_collection,
    property_detail,
    type_collection,
    type_detail,
)

from .timeline import (
    _clean_calendar_payload,
    _clean_event_payload,
    _timeline_document,
    calendar_apply_preset,
    calendar_collection,
    calendar_detail,
    calendar_month,
    calendar_preset,
    era_collection,
    era_detail,
    event_cards,
    event_collection,
    event_detail,
    event_featured,
    timeline_state_view,
    world_calendar_apply_preset,
    world_event_collection,
    world_timeline_state,
)

from .archives import (
    archive_collection,
    archive_detail,
    archive_restore,
)

from .classic_adapter import (
    _document_or_404,
    classic_item_detail,
    classic_items,
    classic_timeline,
    classic_view,
    world_classic_item_detail,
    world_classic_items,
    world_classic_timeline,
    world_classic_view,
)

from .canvases import (
    clamp_int,
    clamp_size,
    document_distribute,
    get_marker,
    get_tree_node,
    get_variant,
    graph_view,
    map_data_view,
    map_import_entities,
    map_layer_collection,
    map_layer_detail,
    map_marker_collection,
    map_marker_detail,
    map_state,
    map_state_view,
    markers_in_era,
    tree_edge_collection,
    tree_edge_detail,
    tree_node_card,
    tree_node_collection,
    tree_node_detail,
    tree_state,
    tree_state_view,
    tree_variant_collection,
    tree_variant_detail,
)

from .accounts import (
    LOGIN_IP_LIMIT,
    LOGIN_IP_WINDOW,
    LOGIN_USER_LIMIT,
    LOGIN_USER_WINDOW,
    REGISTER_IP_LIMIT,
    REGISTER_IP_WINDOW,
    _activate_default_world,
    _display_name,
    _log_member_event,
    _log_moderation_event,
    _login_throttle,
    _login_throttle_reset,
    _rate_hit,
    _register_throttle,
    _register_user,
    _session_expiry,
    _too_many,
    _user_payload,
    auth_login,
    auth_logout,
    auth_me,
    auth_register,
    auth_renew,
    client_ip,
)

from .password import (
    PASSWORD_CHANGE_LIMIT,
    PASSWORD_CHANGE_WINDOW,
    RESET_REQUEST_LIMIT,
    RESET_REQUEST_WINDOW,
    _find_reset_user,
    _reset_page,
    _reset_user_from_token,
    _send_reset_email,
    auth_email,
    auth_password,
    password_reset_confirm_page,
    password_reset_page,
)

from .profile import (
    INVITE_PROBE_LIMIT,
    INVITE_PROBE_WINDOW,
    _auth_page,
    _invite_probe_key,
    _notice_variant,
    _owned_worlds,
    account_delete,
    account_export,
    auth_invite_check,
    collaborators,
    invite_create,
    invite_delete,
    login_page,
    logout_page,
    member_detail,
    register_page,
)

from .personal import (
    profile_data,
    profile_page,
)

from .moderators import (
    _moderator_payload,
    moderator_collection,
    moderator_detail,
)

from .moderation import (
    DEFAULT_BAN_DAYS,
    MAX_BAN_DAYS,
    MIN_BAN_DAYS,
    _ban_payload,
    _moderation_target,
    moderation_ban,
    moderation_console,
    moderation_unban,
)

from .reports import (
    report_collection,
    report_detail,
)

from .activity import (
    _member_event_text,
    activity,
    document_version_detail,
    document_versions,
    presence,
)

from .content import (
    MEDIA_OWNER_PATTERN,
    TABLE_FILTER_OPS,
    TABLE_SORT_DIRS,
    TABLE_VIEW_KEYS,
    _clock_stamp,
    _document_or_json_404,
    _schema_token,
    _table_aggregates,
    _table_cell_result,
    _table_cell_text,
    _table_column,
    _table_config,
    _table_groups,
    _table_has_value,
    _table_match_filter,
    _table_name_cache,
    _table_row,
    _table_sort_key,
    _table_view,
    autolink_view,
    backlinks,
    complete,
    document_data,
    document_media,
    export_document,
    export_world,
    import_files,
    media_file,
    search,
    suggestions,
    table_cell,
    table_csv,
    table_detail,
    table_payload,
    table_rows,
)

from .publishing import (
    api_fallback,
    map_background,
    publish_log_view,
    publish_preview_view,
    publish_view,
    unpublish_view,
)
