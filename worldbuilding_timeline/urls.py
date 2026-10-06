# -*- coding: utf-8 -*-
"""项目总路由。

* ``/admin/``     Django 自带后台
* ``/api/world/`` VVD 式工作区的 JSON 接口
* ``/world``      VVD 式工作区页面（文档树 + 标签页 + 卡片 / 时间线 / 图谱工具）
* ``/s/<slug>/``  发布出来的只读站点（公开，可加密码）
* ``/legacy``     上一轮的单时间轴经典视图（像素级复刻，接口在 /api/ 下）

``/`` 与旧的 ``/w`` 都 302 到 ``/world``；经典时间轴仍然在工作区里内嵌使用，
它自己那一页挪到 ``/legacy``（保留是为了不动那版逐像素校对过的界面与它的测试）。
"""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from django.views.generic import RedirectView

from world import views as world_views

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/world/", include("world.urls", namespace="world")),
    path("world", world_views.workspace, name="workspace"),
    # 旧地址保留成跳转，别让已经发出去的链接失效
    path("w", RedirectView.as_view(url="/world", permanent=False)),
    path("w/timeline/<int:doc_id>",
         RedirectView.as_view(pattern_name="timeline:classic-embedded", permanent=False)),
    path("s/", include("world.site_urls", namespace="site")),
    path("", include("timeline.urls")),
    # 账号：表单式页面（浏览器原生提交） + /api/world/auth/* 的 JSON 接口
    path("login", world_views.login_page, name="login"),
    path("register", world_views.register_page, name="register"),
    path("logout", world_views.logout_page, name="logout"),

    # 首页进工作区（用户视角：这里就是"网站首页"）
    path("", RedirectView.as_view(url="/world", permanent=False)),
]

# 非 /api/ 的 404 会把前端页面发回去（保持 404 状态码）。
# DEBUG=True 时 Django 显示调试页，不会走到这里。
handler404 = "timeline.views.page_not_found"

# 开发态直接由 Django 提供上传文件（正式部署交给前置的静态服务器 / 对象存储）
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
