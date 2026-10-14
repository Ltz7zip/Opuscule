# -*- coding: utf-8 -*-
"""只读站点的路由（挂在 /s/ 下，公开访问）。"""

from django.urls import path

from . import site_views

app_name = "site"

# 注意：文档 slug 可能是中文（slugify_name 保留 Unicode 词字符），
# 所以这里用 str 转换器而不是 <slug:>（后者只吃 [-a-zA-Z0-9_]）。
urlpatterns = [
    path("<str:slug>/", site_views.home, name="home"),
    # 分享卡片（OG 图）——放在文档路由之前，免得 og.svg 被当成文档 slug
    path("<str:slug>/og.svg", site_views.og_card, name="og"),
    # 订阅：阅读器里加 /s/<slug>/feed.xml（"订阅提示"要有真东西可订）
    path("<str:slug>/feed.xml", site_views.feed, name="feed"),
    path("<str:slug>/search", site_views.search, name="search"),
    path("<str:slug>/era/<int:era_id>", site_views.era_page, name="era"),
    path("<str:slug>/unlock", site_views.unlock, name="unlock"),
    # 读者举报入口（匿名可提交；无尾斜杠，免得被文档路由吞掉）
    path("<str:slug>/report", site_views.report, name="report"),
    path("<str:slug>/<str:doc_slug>/", site_views.page, name="page"),
]
