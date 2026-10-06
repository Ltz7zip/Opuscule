# -*- coding: utf-8 -*-
"""世界工作区的 URL 表（全部挂在 /api/world/ 下，路径结尾不带斜杠）。"""

from django.urls import path, re_path

from . import views

app_name = "world"

urlpatterns = [
    path("state", views.state, name="state"),
    path("world", views.world_detail, name="world-detail"),

    # 文档树
    path("documents", views.document_collection, name="document-collection"),
    path("documents/<int:doc_id>", views.document_detail, name="document-detail"),
    path("documents/<int:doc_id>/duplicate", views.document_duplicate, name="document-duplicate"),
    path("documents/<int:doc_id>/restore", views.document_restore, name="document-restore"),
    path("trash", views.trash_collection, name="trash"),

    # 导入 / 导出
    path("suggestions", views.suggestions, name="suggestions"),
    path("calendars/<int:calendar_id>/month", views.calendar_month, name="calendar-month"),
    path("documents/<int:doc_id>/data", views.document_data, name="document-data"),
    path("documents/<int:doc_id>/media", views.document_media, name="document-media"),
    path("tables/<int:doc_id>", views.table_detail, name="table-detail"),
    path("tables/<int:doc_id>/cell", views.table_cell, name="table-cell"),
    path("tables/<int:doc_id>/rows", views.table_rows, name="table-rows"),
    path("tables/<int:doc_id>/csv", views.table_csv, name="table-csv"),

    # 账号 / 成员 / 在线 / 版本
    path("auth/me", views.auth_me, name="auth-me"),
    path("auth/register", views.auth_register, name="auth-register"),
    path("auth/login", views.auth_login, name="auth-login"),
    path("auth/logout", views.auth_logout, name="auth-logout"),
    path("collaborators", views.collaborators, name="collaborators"),
    path("collaborators/invites", views.invite_create, name="invite-create"),
    path("collaborators/invites/<int:invite_id>", views.invite_delete, name="invite-delete"),
    path("collaborators/<int:member_id>", views.member_detail, name="member-detail"),
    path("presence", views.presence, name="presence"),
    path("documents/<int:doc_id>/versions", views.document_versions, name="document-versions"),
    path("documents/<int:doc_id>/versions/<int:index>", views.document_version_detail, name="document-version"),
    path("export", views.export_world, name="export-world"),
    path("import", views.import_files, name="import-files"),
    path("documents/<int:doc_id>/export", views.export_document, name="export-document"),

    # 类型与属性
    path("types", views.type_collection, name="type-collection"),
    path("types/<int:type_id>", views.type_detail, name="type-detail"),
    path("types/<int:type_id>/properties", views.property_collection, name="property-collection"),
    path("properties/<int:property_id>", views.property_detail, name="property-detail"),

    # 卡片
    path("cards/<int:doc_id>", views.card_detail, name="card-detail"),

    # 时间线
    path("timelines/<int:doc_id>", views.timeline_state_view, name="timeline-state"),
    path("timelines/<int:doc_id>/events", views.event_collection, name="event-collection"),
    path("timelines/<int:doc_id>/apply-preset", views.calendar_apply_preset, name="calendar-apply-preset"),
    path("events/<int:event_id>", views.event_detail, name="event-detail"),
    path("events/<int:event_id>/cards", views.event_cards, name="event-cards"),
    path("events/<int:event_id>/cards/<int:card_id>", views.event_cards, name="event-card-detail"),

    # 日历与纪元
    path("calendars", views.calendar_collection, name="calendar-collection"),
    path("calendars/<int:calendar_id>", views.calendar_detail, name="calendar-detail"),
    path("calendars/<int:calendar_id>/preset", views.calendar_preset, name="calendar-preset"),
    path("eras", views.era_collection, name="era-collection"),
    path("eras/<int:era_id>", views.era_detail, name="era-detail"),

    # 经典编辑器适配
    path("timelines/<int:doc_id>/classic", views.classic_timeline, name="classic-timeline"),
    path("timelines/<int:doc_id>/classic/items", views.classic_items, name="classic-items"),
    path("timelines/<int:doc_id>/classic/items/<int:item_id>", views.classic_item_detail,
         name="classic-item-detail"),
    path("timelines/<int:doc_id>/classic/view", views.classic_view, name="classic-view"),

    # 关系树
    path("trees/<int:doc_id>", views.tree_state_view, name="tree-state"),
    path("trees/<int:doc_id>/variants", views.tree_variant_collection, name="tree-variants"),
    path("tree-variants/<int:variant_id>", views.tree_variant_detail, name="tree-variant-detail"),
    path("tree-variants/<int:variant_id>/nodes", views.tree_node_collection, name="tree-nodes"),
    path("tree-variants/<int:variant_id>/edges", views.tree_edge_collection, name="tree-edges"),
    path("tree-nodes/<int:node_id>", views.tree_node_detail, name="tree-node-detail"),
    path("tree-nodes/<int:node_id>/card", views.tree_node_card, name="tree-node-card"),
    path("tree-edges/<int:edge_id>", views.tree_edge_detail, name="tree-edge-detail"),

    # 经典地图
    path("maps/<int:doc_id>", views.map_state_view, name="map-state"),
    path("maps/<int:doc_id>/background", views.map_background, name="map-background"),
    path("maps/<int:doc_id>/layers", views.map_layer_collection, name="map-layers"),
    path("maps/<int:doc_id>/markers", views.map_marker_collection, name="map-markers"),
    path("map-layers/<int:layer_id>", views.map_layer_detail, name="map-layer-detail"),
    path("map-markers/<int:marker_id>", views.map_marker_detail, name="map-marker-detail"),

    # 图谱
    path("graph", views.graph_view, name="graph"),

    # 发布
    path("publish/preview", views.publish_preview_view, name="publish-preview"),
    path("publish/log", views.publish_log_view, name="publish-log"),
    path("publish", views.publish_view, name="publish"),
    path("unpublish", views.unpublish_view, name="unpublish"),

    # 搜索与识别
    path("search", views.search, name="search"),
    path("autolink", views.autolink_view, name="autolink"),
    path("backlinks/<int:doc_id>", views.backlinks, name="backlinks"),

    # 兜底
    re_path(r"^", views.api_fallback, name="api-fallback"),
]
