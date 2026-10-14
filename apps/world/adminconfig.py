# -*- coding: utf-8 -*-
"""用自定义后台替换 Django 默认后台。

Django 的惯例做法：把 ``INSTALLED_APPS`` 里的 ``django.contrib.admin`` 换成
``AdminConfig`` 的子类，并指向自定义的 ``AdminSite``。这样 ``admin.site`` 本身就是
``apps.world.admin.OpusculeAdminSite``，autodiscover 会把 world 与 auth 的后台注册都挂到它
上面——``/admin/`` 因此既管世界模型，也能管用户与用户组（任命管理员靠的就是用户组）。

详见 ``apps/world/admin.py`` 里 ``OpusculeAdminSite`` 的说明。
"""
from django.contrib.admin.apps import AdminConfig


class OpusculeAdminConfig(AdminConfig):
    default_site = "apps.world.admin.OpusculeAdminSite"
