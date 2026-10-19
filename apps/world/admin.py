# -*- coding: utf-8 -*-
"""后台：世界、类型、属性、文档、卡片、日历、纪元、事件都能直接编辑。"""

from django.contrib import admin

from .models import (
    EntityType,
    ModerationEvent,
    PropertyDef,
    Report,
    World,
)


class PropertyInline(admin.TabularInline):
    model = PropertyDef
    fk_name = "entity_type"   # PropertyDef 有两个指向 EntityType 的外键，必须指明
    extra = 0


@admin.register(World)
class WorldAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "ai_enabled", "auto_link_enabled", "is_banned_now", "updated_at")
    list_filter = ("is_published",)
    search_fields = ("name", "slug")

    @admin.display(boolean=True, description="封禁中")
    def is_banned_now(self, obj) -> bool:
        return obj.is_banned


@admin.register(EntityType)
class EntityTypeAdmin(admin.ModelAdmin):
    list_display = ("name", "world", "parent", "position", "hidden")
    list_filter = ("world", "hidden")
    inlines = [PropertyInline]


@admin.register(PropertyDef)
class PropertyDefAdmin(admin.ModelAdmin):
    list_display = ("name", "entity_type", "value_type", "required", "position")
    list_filter = ("value_type", "entity_type__world")


@admin.register(ModerationEvent)
class ModerationEventAdmin(admin.ModelAdmin):
    """治理审计只读：留痕表只增不改，后台里能看能筛，但不给改也不给删。"""

    list_display = ("action", "actor_name", "target_name", "world", "detail", "created_at")
    list_filter = ("action",)
    search_fields = ("actor_name", "target_name", "detail")
    date_hierarchy = "created_at"

    def has_add_permission(self, request) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return False

    def has_delete_permission(self, request, obj=None) -> bool:
        return False


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    """读者举报：站长在后台也能看与筛（与前端举报箱同一份数据）。"""

    list_display = ("reason", "world_name", "reporter_name", "status", "created_at")
    list_filter = ("status", "reason")
    search_fields = ("world_name", "world_slug", "detail", "reporter_name", "contact")
    date_hierarchy = "created_at"
    readonly_fields = ("created_at",)
