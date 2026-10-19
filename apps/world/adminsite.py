# -*- coding: utf-8 -*-
"""自定义后台站点（由 ``OpusculeAdminConfig.default_site`` 指向）。

必须单独成模块：``default_site`` 会在 ``admin.site`` 初始化期间被导入，若与本模块
同处一个模块的还有 ``@admin.register(...)``，注册就会落到尚未创建完成的 LazyObject
上，生成废弃实例，导致 world 的模型全部从后台消失。这里只定义站点类，不导入模型。
"""
from django_otp.admin import OTPAdminSite


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
