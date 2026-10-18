# -*- coding: utf-8 -*-
"""时间轴的 URL 表（所有路径结尾都不带斜杠）。

页面入口（``/w/<slug>/timeline`` 与嵌入版）由项目总路由接管，因为要带世界 slug；
这里只剩它自身的 ``/api/*`` JSON 接口。
"""

from django.urls import path, re_path

from . import views

# 命名空间，方便 reverse("timeline:item-detail", args=[1])
app_name = "timeline"

urlpatterns = [
    path("api/timeline", views.timeline, name="timeline"),
    path("api/items", views.item_collection, name="item-collection"),
    path("api/items/<int:item_id>", views.item_detail, name="item-detail"),
    path("api/view", views.view_state, name="view-state"),

    # 兜底必须放在最后：/api 与 /api/ 下其它路径统一回 JSON 404。
    # 写成 ^api(?:/|$) 而不是 ^api/，是为了让 "/api" 本身也能直接命中：
    # 否则 APPEND_SLASH 会想把它重定向成 "/api/"，而带请求体的 POST 会因此报 500。
    re_path(r"^api(?:/|$)", views.api_fallback, name="api-fallback"),
]
