# -*- coding: utf-8 -*-
"""时间轴的持久化模型。

这个 app 是「经典单时间轴」视图：一条横向的轴，上面既有时间点（事件），
也有时间段（纪元）。它把前端传来的 JSON 存进 Django ORM + SQLite：

* 一条「事件 / 纪元」    -> TimelineItem 的一行（``kind="event"`` 或 ``"era"``）
* 用户最后浏览的时间范围 -> TimelineView 单例（主键固定为 1）

字段的取值规则全部收在 ``timeline.normalize`` 里，模型本身只负责存储，
所以写入路径（接口 / admin / 导入脚本）拿到的规范化结果始终一致。

在整个项目里它是 ``world`` 主工作区之外的次应用，而且从 0.7.0 起只剩“老数据”：
编辑器读写的是世界的总时间线（``WorldTimeline`` + ``Era`` + ``TimelineEvent``），
不再碰这张表。这里的条目可以用 world 的 ``import_timeline`` 命令迁进世界总时间线。
"""

from django.db import models

KIND_EVENT = "event"
KIND_ERA = "era"
KIND_CHOICES = [
    (KIND_EVENT, "事件"),
    (KIND_ERA, "纪元"),
]

# 纪元可用的配色，和 timeline.normalize.THEMES、前端 script.js 的 THEMES 一一对应
THEMES = ("blue", "sky", "violet", "red", "teal", "gold")

# 全新数据库的默认视野（首次打开时间轴时显示的年份范围）
DEFAULT_VIEW = {"start": 1500.0, "end": 1900.0}


class TimelineItem(models.Model):
    """时间轴上的一条记录：``kind="event"`` 是时间点，``kind="era"`` 是时间段。"""

    kind = models.CharField("类型", max_length=8, choices=KIND_CHOICES, default=KIND_EVENT)
    title = models.CharField("名称", max_length=120, default="")
    start = models.FloatField("开始", default=0.0)
    end = models.FloatField("结束", default=0.0)
    desc = models.TextField("介绍", blank=True, default="")
    row = models.PositiveIntegerField("行", default=0)
    # 只有纪元用得到：blue / violet / red / teal；事件留空
    theme = models.CharField("配色", max_length=16, blank=True, default="")
    # 封面可能是图片 URL，也可能是前端 FileReader 生成的 data URL，所以用 TextField
    cover = models.TextField("封面", blank=True, default="")
    # [{"title": ..., "url": ..., "cover": ...}, ...]
    cards = models.JSONField("卡片", default=list, blank=True)

    class Meta:
        # 时间轴按添加顺序展示（先添加的排前面）
        ordering = ["id"]
        verbose_name = "时间轴条目"
        verbose_name_plural = "时间轴条目"

    def __str__(self):
        return self.title or "未命名"

    def to_payload(self):
        """转成前端认识的结构，供接口直接返回。

        事件不带 ``theme`` 键，纪元才带 ``theme``（认不出来的配色落回 ``blue``）。
        """
        payload = {
            "id": self.id,
            "kind": self.kind,
            "title": self.title,
            "start": self.start,
            "end": self.end,
            "desc": self.desc,
            "row": self.row,
            "cover": self.cover,
            "cards": self.cards if isinstance(self.cards, list) else [],
        }
        if self.kind == KIND_ERA:
            payload["theme"] = self.theme if self.theme in THEMES else "blue"
        return payload


class TimelineView(models.Model):
    """单例：记住用户最后一次浏览到的时间范围，刷新后回到原处。"""

    start = models.FloatField("开始", default=DEFAULT_VIEW["start"])
    end = models.FloatField("结束", default=DEFAULT_VIEW["end"])

    class Meta:
        verbose_name = "视野范围"
        verbose_name_plural = "视野范围"

    def __str__(self):
        return f"{self.start} ~ {self.end}"

    @classmethod
    def load(cls):
        """取出唯一的那一行；被误删就按默认视野重建。"""
        obj, _created = cls.objects.get_or_create(pk=1, defaults=dict(DEFAULT_VIEW))
        return obj

    def to_payload(self):
        return {"start": self.start, "end": self.end}
