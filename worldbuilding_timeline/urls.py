# -*- coding: utf-8 -*-
"""项目总路由。

* ``/admin/``     Django 自带后台（路径可用 OPUSCULE_ADMIN_PATH 改，见 settings.ADMIN_URL_PATH）
* ``/api/world/`` 世界工作区的全部 JSON 接口
* ``/world``      世界工作区页面（文档树 + 标签页 + 卡片 / 时间线 / 图谱工具）
* ``/robots.txt`` 约束正规搜索引擎（禁爬工作区 / 接口 / 后台）
* ``/healthz``   健康检查（进程 + 数据库连通性），给 uptime 监控用
* ``/explore``    公开世界展示页（游客从 /world 被送到这里，通向只读站点）
* ``/meta``       程序元信息（版本 / 渠道），公开可读
* ``/s/<slug>/``  发布出来的只读站点（公开，可加密码）
* ``/media/``     上传文件（鉴权后由 Django 读盘，见 ``world.views.media_file``）
* ``/legacy``     经典横向时间轴的独立入口（接口在 /api/ 下）

``/`` 与 ``/w`` 都 302 到 ``/world``；经典时间轴仍然在工作区里内嵌使用，
``/legacy`` 只是把它单独作为一页打开时的入口。
"""

from django.contrib import admin
from django.conf import settings
from django.urls import include, path
from django.views.generic import RedirectView

from world import views as world_views
from world import relationship as relationship_views
from world import mapdoc as map_views
from world import maintenance

urlpatterns = [
    # 后台路径可配（OPUSCULE_ADMIN_PATH，见 settings.ADMIN_URL_PATH）：正式部署改成
    # 猜不到的路径，扫描器按 /admin/ 找不到门。默认仍是 "admin/"，本地开发不受影响。
    path(f"{settings.ADMIN_URL_PATH}/", admin.site.urls),
    path("api/world/", include("world.urls", namespace="world")),
    path("world", world_views.workspace, name="workspace"),
    # robots.txt：约束正规搜索引擎（禁爬工作区 / 接口 / 后台，放行公开只读站点）
    path("robots.txt", world_views.robots_txt, name="robots-txt"),
    # 公开世界展示页：游客访问 /world 会被送到这里（列已公开发布的世界，通向只读站点）
    path("explore", world_views.explore, name="explore"),
    # 程序元信息（版本 / 渠道），公开可读；版本唯一来源见 settings.APP_VERSION
    path("meta", world_views.meta, name="meta"),
    # 健康检查：给 uptime 监控 / 探针用（进程 + 数据库连通性）
    path("healthz", world_views.healthz, name="healthz"),
    # Service Worker 必须从根路径发（作用域问题），见 service_worker 的注释
    path("sw.js", world_views.service_worker, name="service-worker"),
    # 关系树独立页（模版选择 + 网格画布编辑器），接口在 /api/world/relationship/ 下
    path("relationship", relationship_views.relationship_page, name="relationship"),
    # 地图独立页：/map → /map/2d；两档共用 MapLayer / MapMarker 那一份数据
    path("map", map_views.map_home, name="map-home"),
    path("map/<str:view>", map_views.map_page, name="map"),
    # 旧地址保留成跳转，别让已经发出去的链接失效
    path("w", RedirectView.as_view(url="/world", permanent=False)),
    path("w/timeline/<int:doc_id>",
         RedirectView.as_view(pattern_name="timeline:classic-embedded", permanent=False)),
    path("s/", include("world.site_urls", namespace="site")),
    path("", include("timeline.urls")),
    # 上传文件（地图底图、语音、图片…）也要鉴权：按「所属文档是否公开」放行，
    # 不再由前置静态服务器直发，否则知道路径就能下载未公开的图（见 world.views.media_file）。
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

    # 首页进工作区（用户视角：这里就是"网站首页"）
    path("", RedirectView.as_view(url="/world", permanent=False)),
]

# 非 /api/ 的 404 给一页"信号丢失"，500 给一页"重试"。
# DEBUG=True 时 Django 显示调试页，不会走到这里；测试里 DEBUG 被强制为 False，会走。
handler404 = "timeline.views.page_not_found"
handler500 = "timeline.views.server_error"
