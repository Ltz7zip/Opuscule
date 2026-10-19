# -*- coding: utf-8 -*-
"""世界工作区的 URL 表（全部挂在 /api/world/ 下，路径结尾不带斜杠）。"""

from django.urls import path, re_path

from apps.ai import views as ai_views

from . import views
from . import relationship

app_name = "world"

urlpatterns = [
    path("state", views.state, name="state"),
    path("world", views.world_detail, name="world-detail"),
    # 我的世界：列出 / 新建 / 切换
    path("worlds", views.world_collection, name="world-collection"),
    path("worlds/<int:world_id>/switch", views.world_switch, name="world-switch"),
    # 最近发生的事（通知中心的数据源）
    path("activity", views.activity, name="activity"),
    # 个人主页（/u/<username>）的资料与排版
    path("profile", views.profile_data, name="profile-data"),

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
    path("auth/renew", views.auth_renew, name="auth-renew"),
    path("auth/invite", views.auth_invite_check, name="auth-invite-check"),
    path("auth/register", views.auth_register, name="auth-register"),
    path("auth/login", views.auth_login, name="auth-login"),
    path("auth/logout", views.auth_logout, name="auth-logout"),
    # 改密（登录态，方案①）与登记邮箱（方案②）
    path("auth/password", views.auth_password, name="auth-password"),
    path("auth/email", views.auth_email, name="auth-email"),
    # 销号 / 数据导出（A4）
    path("account/export", views.account_export, name="account-export"),
    path("account/delete", views.account_delete, name="account-delete"),
    path("collaborators", views.collaborators, name="collaborators"),
    path("collaborators/invites", views.invite_create, name="invite-create"),
    path("collaborators/invites/<int:invite_id>", views.invite_delete, name="invite-delete"),
    path("collaborators/<int:member_id>", views.member_detail, name="member-detail"),
    path("moderators", views.moderator_collection, name="moderator-collection"),
    path("moderators/<int:user_id>", views.moderator_detail, name="moderator-detail"),
    # 平台治理：封禁 / 解封公开 wiki（站长或管理员）
    path("moderation", views.moderation_console, name="moderation-console"),
    path("moderation/ban", views.moderation_ban, name="moderation-ban"),
    path("moderation/unban", views.moderation_unban, name="moderation-unban"),
    # 举报箱（仅站长）
    path("reports", views.report_collection, name="report-collection"),
    path("reports/<int:report_id>", views.report_detail, name="report-detail"),
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
    # 世界总时间线（0.7.0）：一个世界一条轴，事件 / 时代 / 历法都挂在这上面
    path("timeline", views.world_timeline_state, name="world-timeline"),
    path("timeline/events", views.world_event_collection, name="world-event-collection"),
    path("timeline/apply-preset", views.world_calendar_apply_preset,
         name="world-calendar-apply-preset"),
    path("events/<int:event_id>", views.event_detail, name="event-detail"),
    path("events/<int:event_id>/cards", views.event_cards, name="event-cards"),
    path("events/<int:event_id>/cards/<int:card_id>", views.event_cards, name="event-card-detail"),

    # 世界存档（0.7.0）：整包快照 / 读档，上限 20
    path("archives", views.archive_collection, name="archive-collection"),
    path("archives/<int:archive_id>", views.archive_detail, name="archive-detail"),
    path("archives/<int:archive_id>/restore", views.archive_restore, name="archive-restore"),

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
    # 世界总时间线的同一套经典接口（不带 doc_id）
    path("timeline/classic", views.world_classic_timeline, name="world-classic-timeline"),
    path("timeline/classic/items", views.world_classic_items, name="world-classic-items"),
    path("timeline/classic/items/<int:item_id>", views.world_classic_item_detail,
         name="world-classic-item-detail"),
    path("timeline/classic/view", views.world_classic_view, name="world-classic-view"),

    # 关系树
    path("trees/<int:doc_id>", views.tree_state_view, name="tree-state"),
    path("trees/<int:doc_id>/variants", views.tree_variant_collection, name="tree-variants"),
    path("tree-variants/<int:variant_id>", views.tree_variant_detail, name="tree-variant-detail"),
    path("tree-variants/<int:variant_id>/nodes", views.tree_node_collection, name="tree-nodes"),
    path("tree-variants/<int:variant_id>/edges", views.tree_edge_collection, name="tree-edges"),
    path("tree-nodes/<int:node_id>", views.tree_node_detail, name="tree-node-detail"),
    path("tree-nodes/<int:node_id>/card", views.tree_node_card, name="tree-node-card"),
    path("tree-edges/<int:edge_id>", views.tree_edge_detail, name="tree-edge-detail"),

    # 关系树独立页（/relationship）自己那套：模版目录 / 新建 / 编辑区状态 / 关系清单
    path("relationship/templates", relationship.template_collection, name="relationship-templates"),
    path("relationship/trees", relationship.tree_collection, name="relationship-trees"),
    path("relationship/trees/<int:doc_id>", relationship.tree_detail, name="relationship-tree"),
    path("relationship/trees/<int:doc_id>/relations", relationship.tree_relations,
         name="relationship-tree-relations"),
    path("relationship/trees/<int:doc_id>/setup", relationship.tree_setup,
         name="relationship-tree-setup"),

    # 经典地图
    path("maps/<int:doc_id>", views.map_state_view, name="map-state"),
    path("maps/<int:doc_id>/data", views.map_data_view, name="map-data"),
    path("maps/<int:doc_id>/background", views.map_background, name="map-background"),
    path("maps/<int:doc_id>/layers", views.map_layer_collection, name="map-layers"),
    path("maps/<int:doc_id>/markers", views.map_marker_collection, name="map-markers"),
    path("map-layers/<int:layer_id>", views.map_layer_detail, name="map-layer-detail"),
    path("map-markers/<int:marker_id>", views.map_marker_detail, name="map-marker-detail"),
    # 地图 ⇄ 编辑器的桥：导入实体、给条目自动铺开下一级
    path("maps/<int:doc_id>/import-entities", views.map_import_entities, name="map-import-entities"),
    path("documents/<int:doc_id>/distribute", views.document_distribute, name="document-distribute"),

    # 图谱
    path("graph", views.graph_view, name="graph"),

    # 发布
    path("publish/preview", views.publish_preview_view, name="publish-preview"),
    path("publish/log", views.publish_log_view, name="publish-log"),
    path("publish", views.publish_view, name="publish"),
    path("unpublish", views.unpublish_view, name="unpublish"),

    # 搜索与识别
    path("search", views.search, name="search"),
    path("complete", views.complete, name="complete"),
    path("autolink", views.autolink_view, name="autolink"),
    path("backlinks/<int:doc_id>", views.backlinks, name="backlinks"),

    # AI 横切层（0.6.0）：凭据 / 会话 / 对话 / 变更集
    path("ai/credentials", ai_views.credential_collection, name="ai-credentials"),
    path("ai/credentials/<int:credential_id>", ai_views.credential_detail, name="ai-credential"),
    path("ai/conversations", ai_views.conversation_collection, name="ai-conversations"),
    path("ai/conversations/<int:conversation_id>", ai_views.conversation_detail,
         name="ai-conversation"),
    path("ai/chat", ai_views.chat, name="ai-chat"),
    path("ai/chat/stream", ai_views.chat_stream, name="ai-chat-stream"),
    path("ai/changesets", ai_views.changeset_collection, name="ai-changesets"),
    path("ai/changesets/<int:changeset_id>", ai_views.changeset_detail, name="ai-changeset"),
    path("ai/changesets/<int:changeset_id>/apply", ai_views.changeset_apply,
         name="ai-changeset-apply"),
    path("ai/changesets/<int:changeset_id>/reject", ai_views.changeset_reject,
         name="ai-changeset-reject"),

    # 兜底
    re_path(r"^", views.api_fallback, name="api-fallback"),
]
