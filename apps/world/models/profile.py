# -*- coding: utf-8 -*-
"""``UserProfile``：个人主页（``/u/<username>``）的内容与排版。

个人主页是「我」这个人的公开门面，仿 GitHub 的做法：头像是用户名首字母，
下面是可自定义的区块（简介 / 统计 / 链接 / 精选世界 / 动态 / 自定义文字）。
排版与显隐全存在这里，页面本身按这份配置渲染，登录本人时多出一层编辑模式。
"""

from __future__ import annotations

from django.db import models

#: 区块类型 → 中文名。``note`` 可以有多个，其余每种最多一个。
BLOCK_LABELS = {
    "bio": "个人简介",
    "stats": "数字统计",
    "links": "外部链接",
    "genres": "题材标签",
    "pinned": "精选世界",
    "worlds": "全部世界",
    "activity": "最近动态",
    "note": "自定义文字",
}

#: 区块落在哪一栏：``side`` 是双栏布局的左侧栏，``main`` 是主栏。
#: 单栏布局时全部进主栏。
BLOCK_REGIONS = {
    "bio": "side",
    "stats": "side",
    "links": "side",
    "genres": "side",
    "pinned": "main",
    "worlds": "main",
    "activity": "main",
    "note": "main",
}

BLOCK_TYPES = tuple(BLOCK_LABELS)
SINGLETON_BLOCKS = frozenset(t for t in BLOCK_TYPES if t != "note")

LAYOUT_SINGLE = "single"
LAYOUT_TWO = "two"
LAYOUTS = [(LAYOUT_TWO, "双栏"), (LAYOUT_SINGLE, "单栏")]

DEFAULT_ACCENT = "#3ddc97"


def default_blocks() -> list[dict]:
    """默认排版：左侧简介 / 统计 / 链接，右侧精选世界与最近动态。"""
    return [
        {"id": "bio", "type": "bio", "visible": True},
        {"id": "stats", "type": "stats", "visible": True},
        {"id": "links", "type": "links", "visible": True},
        {"id": "pinned", "type": "pinned", "visible": True},
        {"id": "activity", "type": "activity", "visible": True},
    ]


def region_for(block_type: str) -> str:
    return BLOCK_REGIONS.get(block_type, "main")


class UserProfile(models.Model):
    """一个人的个人主页配置。没有这一行时视图会按默认值现建。"""

    user = models.OneToOneField(
        "auth.User", on_delete=models.CASCADE, related_name="profile",
        verbose_name="用户",
    )
    display_name = models.CharField("显示名", max_length=80, blank=True, default="")
    headline = models.CharField("一句话简介", max_length=120, blank=True, default="")
    bio = models.TextField("简介", blank=True, default="")
    location = models.CharField("所在地", max_length=80, blank=True, default="")
    website = models.CharField("个人网站", max_length=300, blank=True, default="")
    #: [{"label": "...", "url": "..."}]
    links = models.JSONField("外部链接", default=list, blank=True)
    accent = models.CharField("主题色", max_length=16, default=DEFAULT_ACCENT)
    layout = models.CharField("布局", max_length=8, choices=LAYOUTS, default=LAYOUT_TWO)
    #: [{"id","type","visible","title","content"}]
    blocks = models.JSONField("区块", default=default_blocks, blank=True)
    #: 有序的世界 id 列表（精选世界）
    pinned = models.JSONField("精选世界", default=list, blank=True)
    is_public = models.BooleanField("公开主页", default=True)
    created_at = models.DateTimeField("创建于", auto_now_add=True)
    updated_at = models.DateTimeField("更新于", auto_now=True)

    class Meta:
        verbose_name = "个人主页"
        verbose_name_plural = "个人主页"

    def __str__(self) -> str:
        return f"{self.user.username} 的主页"

    @property
    def name(self) -> str:
        """页面上显示的名字：自定义显示名 → 账号姓名 → 用户名。"""
        return (self.display_name or "").strip() or self.user.get_full_name() or self.user.username
