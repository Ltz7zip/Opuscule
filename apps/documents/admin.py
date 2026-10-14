# -*- coding: utf-8 -*-
"""后台：文档、卡片、日历、纪元、时间线事件。

这些 ModelAdmin 原本在 ``world/admin.py``，随模型一起搬到 ``documents``。
后台站点 ``OpusculeAdminSite`` 仍留在 ``world``（由 ``world.adminconfig`` 指定），
注册照旧落到它上面——``django.contrib.admin.autodiscover`` 会扫描每个 app 的
``admin.py``。
"""

from django.contrib import admin

from .models import Calendar, Card, Document, Era, TimelineEvent


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
