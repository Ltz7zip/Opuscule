# -*- coding: utf-8 -*-
"""后台：世界、类型、属性、文档、卡片、日历、纪元、事件都能直接编辑。"""

from django.contrib import admin
from django_otp.admin import OTPAdminSite

from .models import (
    EntityType,
    ModerationEvent,
    PropertyDef,
    Report,
    World,
)


class OpusculeAdminSite(OTPAdminSite):
    """后台站点：只给超级管理员进，且必须过两步验证（TOTP）。

    两道门叠在一起：

    1. **只认超级管理员**。Django 默认的 ``AdminSite.has_permission`` 是
       ``is_active and is_staff``——任何 ``is_staff`` 用户都能进 ``/admin/`` 并给自己
       或别人点权限（就是那条「借超管的浏览器自设 staff」的风险面）。这里收紧到只认
       ``is_superuser``，跟 S7「``is_staff`` 不穿透」保持一致：staff 依旧只是个普通
       用户，后台的门只给站长开。
    2. **两步验证**。继承 ``django_otp.admin.OTPAdminSite`` 后，还要求
       ``request.user.is_verified()``——口令之外再要一个 TOTP 验证码（设备用
       ``manage.py otp_enroll`` 录入）。这样即便口令泄露，光凭口令也进不了后台。

    ``OTPAdminSite`` 的默认站点名是 ``otpadmin``，会改掉 ``admin:`` 这个 URL 命名空间
    （Django 用 ``default_site`` 无参实例化本站点）。所以这里覆写 ``__init__`` 把默认名
    钉回 ``admin``，让 ``{% url 'admin:...' %}`` 与 robots / 维护白名单都照旧。

    本站点由 ``world.adminconfig.OpusculeAdminConfig`` 通过 ``default_site`` 指定，
    所以 ``admin.site`` 本身就是它，既有 ``@admin.register`` 与 auth 的 User/Group
    后台注册都自动落到这里（任命管理员靠的就是用户组）。
    """

    site_header = "Opuscule 后台"
    site_title = "Opuscule 后台"
    index_title = "平台治理"

    def __init__(self, name: str = "admin"):
        super().__init__(name)

    def has_permission(self, request) -> bool:
        return bool(
            request.user.is_active
            and request.user.is_superuser
            and request.user.is_verified()
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
