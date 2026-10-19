# -*- coding: utf-8 -*-
"""项目总路由。

世界寻址（PLAN §2.2）：页面 ``/w/<slug>``，接口 ``/w/<slug>/api/world/…``；
``/w/`` 不带 slug 时是世界选择页。旧地址（``/world``、``/legacy``、``/relationship``、
``/map…``、``/w/timeline/<id>``）一律 302 到新地址，别让发出去的链接失效。

* ``/admin/``     Django 自带后台（路径可用 OPUSCULE_ADMIN_PATH 改，见 settings.ADMIN_URL_PATH）
* ``/w/<slug>/api/world/`` 世界工作区的全部 JSON 接口（规范地址）
* ``/api/world/`` 同一套接口的旧前缀（保留兼容）
* ``/w/<slug>``   世界工作区页面（文档树 + 标签页 + 卡片 / 时间线 / 图谱工具）
* ``/robots.txt`` 约束正规搜索引擎（禁爬工作区 / 接口 / 后台）
* ``/healthz``   健康检查（进程 + 数据库连通性），给 uptime 监控用
* ``/explore``    公开世界展示页（游客从 /w/ 被送到这里，通向只读站点）
* ``/meta``       程序元信息（版本 / 渠道），公开可读
* ``/s/<slug>/``  发布出来的只读站点（公开，可加密码）
* ``/media/``     上传文件（鉴权后由 Django 读盘，见 ``world.views.media_file``）
"""

from django.contrib import admin
from django.conf import settings
from django.urls import include, path, re_path
from django.views.generic import RedirectView

from apps.world import views as world_views
from apps.world import relationship as relationship_views
from apps.world import mapdoc as map_views
from apps.world import maintenance
from apps.world import urls as world_api_urls
from apps.timeline import views as timeline_views

urlpatterns = [
    # 后台路径可配（OPUSCULE_ADMIN_PATH，见 settings.ADMIN_URL_PATH）：正式部署改成
    # 猜不到的路径，扫描器按 /admin/ 找不到门。默认仍是 "admin/"，本地开发不受影响。
    path(f"{settings.ADMIN_URL_PATH}/", admin.site.urls),

    # 规范地址：世界级接口挂在 /w/<slug>/api/world/ 下。
    # 用非捕获正则（[^/]+）而不是 <str:world_slug>，免得 include 把 slug 当成 kwarg
    # 传给每一个接口视图；当前世界仍由中间件按路径解析。
    re_path(
        r"^w/[^/]+/api/world/",
        include((world_api_urls.urlpatterns, "world"), namespace="world_scoped"),
    ),
    # 旧前缀保留：老前端 / 外部脚本还在用 /api/world/*。
    path("api/world/", include("apps.world.urls", namespace="world")),

    # 世界选择页：访问 /w/ 时列出我能进的世界
    path("w/", world_views.world_picker, name="world-picker"),
    # 一次注册 / 旧书签里的 /w，统一回选择页
    path("w", world_views.legacy_w_entry, name="legacy-w"),
    # 旧地址 ``/w/timeline/<id>`` 必须在 ``/w/<slug>…`` 之前，否则 timeline 会被当成世界名
    path("w/timeline/<int:doc_id>", world_views.legacy_timeline_embedded,
         name="legacy-timeline-embedded"),

    # 世界工作区主页
    path("w/<str:world_slug>", world_views.workspace, name="workspace"),
    # 经典横向时间轴（独立页 / 工作区嵌入共用）
    path("w/<str:world_slug>/timeline", timeline_views.index, name="timeline-page"),
    path("w/<str:world_slug>/timeline/<int:doc_id>", timeline_views.classic_embedded,
         name="timeline-embedded"),
    # 关系树独立页（模版选择 + 网格画布编辑器）
    path("w/<str:world_slug>/relation", relationship_views.relationship_page,
         name="relationship-page"),
    # 地图独立页：/map → /map/2d；两档共用 MapLayer / MapMarker 那一份数据
    path("w/<str:world_slug>/map", map_views.map_home, name="map-home"),
    path("w/<str:world_slug>/map/<str:view>", map_views.map_page, name="map-page"),

    # robots.txt：约束正规搜索引擎（禁爬工作区 / 接口 / 后台，放行公开只读站点）
    path("robots.txt", world_views.robots_txt, name="robots-txt"),
    # 公开世界展示页：游客访问 /w/<slug> 会被送到这里（列已公开发布的世界，通向只读站点）
    path("explore", world_views.explore, name="explore"),
    # 程序元信息（版本 / 渠道），公开可读；版本唯一来源见 settings.APP_VERSION
    path("meta", world_views.meta, name="meta"),
    # 健康检查：给 uptime 监控 / 探针用（进程 + 数据库连通性）
    path("healthz", world_views.healthz, name="healthz"),
    # Service Worker 必须从根路径发（作用域问题），见 service_worker 的注释
    path("sw.js", world_views.service_worker, name="service-worker"),

    # ---- 旧地址 302 到新地址 ----
    path("world", world_views.legacy_workspace, name="legacy-workspace"),
    path("legacy", world_views.legacy_timeline, name="legacy-timeline"),
    path("relationship", world_views.legacy_relationship, name="legacy-relationship"),
    path("map", world_views.legacy_map_home, name="legacy-map-home"),
    path("map/<str:view>", world_views.legacy_map_page, name="legacy-map"),

    path("s/", include("apps.world.site_urls", namespace="site")),
    path("", include("apps.timeline.urls")),
    # 上传文件（地图底图、语音、图片…）也要鉴权：按「所属文档是否公开」放行，
    # 不再由前置静态服务器直发，否则知道路径就能下载未公开的图（见 apps/world/views 的 media_file）。
    path("media/<path:path>", world_views.media_file, name="media"),
    # 账号：表单式页面（浏览器原生提交） + /api/world/auth/* 的 JSON 接口
    path("login", world_views.login_page, name="login"),
    path("register", world_views.register_page, name="register"),
    path("logout", world_views.logout_page, name="logout"),
    # 忘记密码：/reset 申请重置信，邮件里的链接指到 /reset/<uid>/<token> 设新密码
    path("reset", world_views.password_reset_page, name="password-reset"),
    path("reset/<str:uidb64>/<str:token>",
         world_views.password_reset_confirm_page, name="password-reset-confirm"),
    # 维护页：直接把反代指过来，或设 OPUSCULE_MAINTENANCE=1 全站打烊
    path("maintenance", maintenance.maintenance_page, name="maintenance"),

    # 个人主页：/u/<username>（公开可读，本人登录后进入编辑模式）
    re_path(r"^u/(?P<username>[^/]+)/?$", world_views.profile_page, name="profile-page"),

    # 首页进世界选择页（用户视角：这里就是"网站首页"）
    path("", RedirectView.as_view(url="/w/", permanent=False)),
]

# 非 /api/ 的 404 给一页"信号丢失"，500 给一页"重试"。
# DEBUG=True 时 Django 显示调试页，不会走到这里；测试里 DEBUG 被强制为 False，会走。
handler404 = "apps.timeline.views.page_not_found"
handler500 = "apps.timeline.views.server_error"
