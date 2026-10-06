# -*- coding: utf-8 -*-
"""后台：世界、类型、属性、文档、卡片、日历、纪元、事件都能直接编辑。"""

from django.contrib import admin

from .models import (
    Calendar,
    Card,
    Document,
    EntityType,
    Era,
    PropertyDef,
    TimelineEvent,
    World,
)


class PropertyInline(admin.TabularInline):
    model = PropertyDef
    fk_name = "entity_type"   # PropertyDef 有两个指向 EntityType 的外键，必须指明
    extra = 0


@admin.register(World)
class WorldAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "ai_enabled", "auto_link_enabled", "updated_at")
    search_fields = ("name", "slug")


@admin.register(EntityType)
class EntityTypeAdmin(admin.ModelAdmin):
    list_display = ("name", "world", "parent", "position", "hidden")
    list_filter = ("world", "hidden")
    inlines = [PropertyInline]


@admin.register(PropertyDef)
class PropertyDefAdmin(admin.ModelAdmin):
    list_display = ("name", "entity_type", "value_type", "required", "position")
    list_filter = ("value_type", "entity_type__world")


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ("name", "document_type", "world", "parent", "position", "pinned", "hidden",
                    "deleted_at")
    list_filter = ("document_type", "world", "pinned", "hidden")
    search_fields = ("name",)


@admin.register(Card)
class CardAdmin(admin.ModelAdmin):
    list_display = ("document", "entity_type")
    search_fields = ("document__name",)


@admin.register(Calendar)
class CalendarAdmin(admin.ModelAdmin):
    list_display = ("name", "world", "mode", "hours_per_day", "is_preset")
    list_filter = ("world", "mode", "is_preset")


@admin.register(Era)
class EraAdmin(admin.ModelAdmin):
    list_display = ("name", "world", "position", "length_years", "theme")


@admin.register(TimelineEvent)
class TimelineEventAdmin(admin.ModelAdmin):
    list_display = ("title", "document", "precision", "year", "month", "day", "hour", "era")
    list_filter = ("precision", "era")
    search_fields = ("title",)
