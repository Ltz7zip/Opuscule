# -*- coding: utf-8 -*-
"""关系树：``TreeVariant`` / ``TreeNode`` / ``TreeEdge``。

同一批人可以有多套关系视角（不同世界线 / 不同分支）；关系词表来自 ``world/relations.py``。

模型原本住在 ``world/models/tree.py``，R2 拆 app 后搬到 ``graph``；``Meta.db_table``
钉住旧表名（``world_*``）。
"""

from __future__ import annotations

from django.db import models

from apps.documents.models.document import Document
from apps.world.models.constants import (
    RELATION_LABELS,
    TREE_EDGE_KINDS,
    TREE_EDGE_LABELS,
    TREE_FAMILY,
    TREE_KINDS,
)
from apps.world.relations import template_relations


class TreeVariant(models.Model):
    """一棵关系树（"variant"）：同一批人可以有多套关系视角（不同世界线 / 不同分支）。"""

    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name="tree_variants")
    name = models.CharField("名称", max_length=60, default="Main")
    kind = models.CharField("模板", max_length=12, choices=TREE_KINDS, default=TREE_FAMILY)
    position = models.PositiveIntegerField("排序", default=1)
    # 关系名可以逐个改，覆盖模版里的默认叫法
    edge_labels = models.JSONField("关系名", default=dict, blank=True)
    settings = models.JSONField("设置", default=dict, blank=True)  # 朝向、关系名显示模式等
    created_at = models.DateTimeField("创建于", auto_now_add=True)

    class Meta:
        db_table = "world_treevariant"
        ordering = ["position", "id"]
        verbose_name = "关系树"
        verbose_name_plural = "关系树"

    def __str__(self):
        return self.name

    def stored_relations(self) -> list:
        """这棵树的关系清单原始态（不补叫法，所以能被 ``label_for`` 安全调用）。

        存在 ``settings["relations"]`` 里（``[{kind, label, style, enabled}]``），
        没存过就退回模版自带的那份。
        判断"存没存过"看的是**有没有这个键**而不是"是不是空"：用户可以把关系
        全删光，那也是他的选择，不能又给他弹回模版那套。
        """
        stored = (self.settings or {}).get("relations")
        if not isinstance(stored, list):
            stored = [
                {"kind": item["kind"], "label": item["label"],
                 "style": item.get("style") or "", "enabled": True}
                for item in template_relations(self.kind)
            ]
        clean = []
        seen = set()
        for item in stored:
            if not isinstance(item, dict):
                continue
            kind = str(item.get("kind") or "").strip()
            if not kind or kind in seen:
                continue
            seen.add(kind)
            clean.append({
                "kind": kind,
                "label": str(item.get("label") or "").strip(),
                "style": str(item.get("style") or ""),
                "enabled": bool(item.get("enabled", True)),
            })
        return clean

    def label_for(self, kind: str) -> str:
        """这条关系在这棵树里叫什么。

        优先级：这棵树里逐个改过的名字（``edge_labels``）→ 关系清单里那条的名字
        → 模版默认 → 中性叫法。让"模版关系那一列改过的名字"真的生效——
        不然用户在界面上把「军团长」改成别的，新连出来的线还印着「军团长」。
        """
        overrides = self.edge_labels or {}
        if overrides.get(kind):
            return overrides[kind]
        for item in self.stored_relations():
            if item["kind"] == kind and item["label"]:
                return item["label"]
        return TREE_EDGE_LABELS.get(self.kind, {}).get(kind) or RELATION_LABELS.get(kind) or kind

    def relations(self) -> list:
        """这棵树当前可用的关系清单：名字补齐、能直接给界面用。"""
        return [
            dict(item, label=item["label"] or self.label_for(item["kind"]))
            for item in self.stored_relations()
        ]

    def set_relations(self, relations: list) -> None:
        merged = dict(self.settings or {})
        merged["relations"] = relations
        self.settings = merged

    @property
    def is_setup(self) -> bool:
        """这棵树**选过模版**了吗。

        新建一棵关系树时它先是"没配过"的状态（关系清单、画布落点都还没有），
        这时候打开应该先给模版选择，而不是一片空画布。选完（哪怕选的是"从空白开始"）
        就打上这个标记——用户明确要了空白，就不该每次都再问一遍。
        """
        return bool((self.settings or {}).get("setup"))

    def mark_setup(self) -> None:
        merged = dict(self.settings or {})
        merged["setup"] = True
        self.settings = merged

    def fork(self, name: str = "") -> "TreeVariant":
        """复制一份：连同这棵树的节点与连线一起克隆成新的 variant。"""
        clone = TreeVariant.objects.create(
            document=self.document,
            name=name or f"Variant {self.document.tree_variants.count() + 1}",
            kind=self.kind,
            position=self.document.tree_variants.count() + 1,
            edge_labels=dict(self.edge_labels or {}),
            settings=dict(self.settings or {}),
        )
        mapping = {}
        for node in self.nodes.all():
            mapping[node.id] = TreeNode.objects.create(
                variant=clone, card=node.card, name=node.name, subtitle=node.subtitle,
                image=node.image, generation=node.generation, x=node.x, y=node.y,
                position=node.position, junction=node.junction, deceased=node.deceased,
                group=node.group, group_color=node.group_color,
                kind=node.kind, note=node.note, favourite=node.favourite,
            )
        for edge in self.edges.all():
            TreeEdge.objects.create(
                variant=clone, source=mapping.get(edge.source_id), target=mapping.get(edge.target_id),
                kind=edge.kind, label=edge.label, style=edge.style,
                start_year=edge.start_year, end_year=edge.end_year,
            )
        return clone

    def to_payload(self, with_graph: bool = False) -> dict:
        payload = {
            "id": self.id,
            "document": self.document_id,
            "name": self.name,
            "kind": self.kind,
            "kind_label": self.get_kind_display(),
            "position": self.position,
            "edge_labels": self.edge_labels or {},
            "settings": self.settings if isinstance(self.settings, dict) else {},
            "node_count": self.nodes.count(),
            "relations": self.relations(),
            "setup": self.is_setup,
        }
        payload["resolved_labels"] = {kind: self.label_for(kind) for kind, _ in TREE_EDGE_KINDS}
        if with_graph:
            payload["nodes"] = [n.to_payload() for n in self.nodes.all()]
            payload["edges"] = [e.to_payload() for e in self.edges.select_related("source", "target")]
        return payload


class TreeNode(models.Model):
    """树上的一格：一个人（可以没有卡片，也可以吸附到一张卡片），或者一张备注。"""

    #: 卡片上的两种内容：人物卡 / 便签。便签不参与关系连线，只用来在画布上写字。
    NODE_PERSON = "person"
    NODE_NOTE = "note"
    NODE_KINDS = [(NODE_PERSON, "人物"), (NODE_NOTE, "备注")]

    variant = models.ForeignKey(TreeVariant, on_delete=models.CASCADE, related_name="nodes")
    card = models.ForeignKey(Document, null=True, blank=True, on_delete=models.SET_NULL, related_name="tree_nodes")
    name = models.CharField("名称", max_length=120, default="新成员")
    subtitle = models.CharField("副标题", max_length=120, blank=True, default="")
    image = models.TextField("图片", blank=True, default="")
    #: 关系树画布上这一格的类型：人物 / 备注（右键菜单里"在此处添加备注"）
    kind = models.CharField("格类型", max_length=8, choices=NODE_KINDS, default=NODE_PERSON)
    #: 备注正文（只有 NODE_NOTE 用）
    note = models.TextField("备注", blank=True, default="")
    generation = models.IntegerField("世代", default=0)
    x = models.FloatField("横向位置", default=0.0)
    y = models.FloatField("纵向位置", default=0.0)
    position = models.PositiveIntegerField("排序", default=0)
    junction = models.BooleanField("交汇点", default=False)
    deceased = models.BooleanField("已故", default=False)
    #: 卡片工具条上那个心（"重点人物"），纯标记，不影响结构
    favourite = models.BooleanField("重点", default=False)
    group = models.CharField("分组名", max_length=60, blank=True, default="")
    group_color = models.CharField("分组颜色", max_length=24, blank=True, default="")

    class Meta:
        db_table = "world_treenode"
        ordering = ["generation", "x", "position", "id"]
        verbose_name = "关系树成员"
        verbose_name_plural = "关系树成员"

    def __str__(self):
        return self.name or (self.note[:20] if self.note else "未命名")

    @property
    def is_note(self) -> bool:
        return self.kind == self.NODE_NOTE

    def to_payload(self) -> dict:
        return {
            "id": self.id,
            "variant": self.variant_id,
            "card": self.card_id,
            "card_name": self.card.name if self.card_id else None,
            # 只读画布点人要跳站点页，那边按 slug 走，所以顺手带上
            "card_slug": self.card.slug if self.card_id else None,
            "name": self.name,
            "subtitle": self.subtitle,
            "image": self.image,
            "kind": self.kind,
            "is_note": self.is_note,
            "note": self.note,
            "generation": self.generation,
            "x": self.x,
            "y": self.y,
            "position": self.position,
            "junction": self.junction,
            "deceased": self.deceased,
            "favourite": self.favourite,
            "group": self.group,
            "group_color": self.group_color,
        }


class TreeEdge(models.Model):
    """两个人之间的关系；关系名按 variant 的模板 + 覆盖来显示。

    0.7.0 起关系带**有效区间**（§4.4 D）：``start_year`` / ``end_year`` 为空表示
    「一直有效」，与当前时代是否相交决定这条边显不显示。
    """

    variant = models.ForeignKey(TreeVariant, on_delete=models.CASCADE, related_name="edges")
    source = models.ForeignKey(TreeNode, on_delete=models.CASCADE, related_name="out_edges")
    target = models.ForeignKey(TreeNode, on_delete=models.CASCADE, related_name="in_edges")
    kind = models.CharField("关系", max_length=32, choices=TREE_EDGE_KINDS, default="parent")
    label = models.CharField("自定义关系名", max_length=40, blank=True, default="")
    style = models.CharField("线型", max_length=10, blank=True, default="")  # "" / dashed / dotted
    #: 有效区间（总时间线坐标）；一端为空 = 该端不设限
    start_year = models.FloatField("起始年", null=True, blank=True, default=None)
    end_year = models.FloatField("结束年", null=True, blank=True, default=None)

    class Meta:
        db_table = "world_treeedge"
        ordering = ["id"]
        unique_together = [("variant", "source", "target", "kind")]
        verbose_name = "关系"
        verbose_name_plural = "关系"

    def __str__(self):
        return f"{self.source_id} -> {self.target_id} ({self.kind})"

    def display_label(self) -> str:
        return self.label or self.variant.label_for(self.kind)

    def active_in_span(self, start, end) -> bool:
        """这条关系与给定区间是否相交（区间缺失的一端不设限）。"""
        if start is None and end is None:
            return True
        low = self.start_year
        high = self.end_year
        if start is not None and high is not None and high < start:
            return False
        if end is not None and low is not None and low > end:
            return False
        return True

    def to_payload(self) -> dict:
        return {
            "id": self.id,
            "variant": self.variant_id,
            "source": self.source_id,
            "target": self.target_id,
            "kind": self.kind,
            "label": self.label,
            "display_label": self.display_label(),
            "style": self.style,
            "start_year": self.start_year,
            "end_year": self.end_year,
        }
