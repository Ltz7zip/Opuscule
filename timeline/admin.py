# -*- coding: utf-8 -*-
"""Django admin：换框架后白捡一个可视化后台，不写代码也能改数据。

    python manage.py createsuperuser
    python manage.py runserver   ->  http://127.0.0.1:8000/admin/
"""

from django.contrib import admin

from .models import TimelineItem, TimelineView


@admin.register(TimelineItem)
class TimelineItemAdmin(admin.ModelAdmin):
    list_display = ("id", "kind", "title", "start", "end", "row", "theme")
    list_filter = ("kind", "theme")
    search_fields = ("title", "desc")
    ordering = ("id",)
    fieldsets = (
        (None, {"fields": ("kind", "title", "theme", "row")}),
        ("时间", {"fields": ("start", "end")}),
        ("内容", {"fields": ("desc", "cover", "cards")}),
    )


@admin.register(TimelineView)
class TimelineViewAdmin(admin.ModelAdmin):
    """视野只有一行，所以禁掉增删，只让改。"""

    list_display = ("start", "end")

    def has_add_permission(self, request):
        return not TimelineView.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False
