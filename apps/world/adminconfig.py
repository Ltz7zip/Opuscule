# -*- coding: utf-8 -*-
"""用自定义后台替换 Django 默认后台。

Django 的惯例做法：把 ``INSTALLED_APPS`` 里的 ``django.contrib.admin`` 换成
``AdminConfig`` 的子类，并指向自定义的 ``AdminSite``。这样 ``admin.site`` 本身就是
``OpusculeAdminSite``，autodiscover 会把 world 与 auth 的后台注册都挂到它
上面——``/admin/`` 因此既管世界模型，也能管用户与用户组（任命管理员靠的就是用户组）。

站点类放在 ``apps.world.adminsite``，本模块不导入它（也不导入任何模型）：本模块会
在 ``INSTALLED_APPS`` 解析时被导入，此时应用注册表还没就绪，导入 auth 模型会报
``AppRegistryNotReady``；而站点类交给 ``default_site`` 在 ``admin.site`` 初始化时
惰性导入。
"""
from django.contrib.admin.apps import AdminConfig


class OpusculeAdminConfig(AdminConfig):
    default_site = "apps.world.adminsite.OpusculeAdminSite"
