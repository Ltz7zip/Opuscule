# -*- coding: utf-8 -*-
"""只读站点的路由（挂在 /s/ 下，公开访问）。"""

from django.urls import path

from . import site_views

app_name = "site"

# 注意：文档 slug 可能是中文（slugify_name 保留 Unicode 词字符），
# 所以这里用 str 转换器而不是 <slug:>（后者只吃 [-a-zA-Z0-9_]）。
urlpatterns = [
    path("<str:slug>/", site_views.home, name="home"),
    path("<str:slug>/search", site_views.search, name="search"),
    path("<str:slug>/era/<int:era_id>", site_views.era_page, name="era"),
    path("<str:slug>/unlock", site_views.unlock, name="unlock"),
    path("<str:slug>/<str:doc_slug>/", site_views.page, name="page"),
]
