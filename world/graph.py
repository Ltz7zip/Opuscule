# -*- coding: utf-8 -*-
"""世界图谱（调研文档 §6.3 / §9.1 的 World Graph）。

连线有三个来源，正好对应 VVD 里"属性引用也会画成连线"的行为：

1. **引用属性**：卡片上 `value_type="reference"` 的属性值 -> 一条 ``reference`` 连线；
2. **事件关联**：时间线事件挂的卡片 -> 一条 ``event`` 连线（时间是这张图的另一种边）；
3. **正文提及**：卡片正文里写到别的卡片名 / 别名 -> 一条 ``mention`` 连线（走 autolink）。

图谱本身不落库：节点与连线都是即时算出来的，只有"钉住哪些节点"这种视图状态存在
``Document(settings)`` 里（前端直接复用 documents 的 settings 接口）。
"""

from __future__ import annotations

from collections import deque

from .models import DOC_CARD, DOC_FOLDER, TimelineEvent

MAX_NODES = 400
MAX_MENTION_SCAN = 120  # 正文提及只扫这么多张卡，避免大世界把接口拖慢


def _node_payload(document, degree, entity_type_names):
    return {
        "id": document.id,
        "name": document.name,
        "type": document.document_type,
        "entity_type": document.entity_type_id,
        "entity_type_name": entity_type_names.get(document.entity_type_id),
        "degree": degree,
        "hidden": document.hidden,
        "updated_at": document.updated_at.isoformat() if document.updated_at else None,
    }


def build_graph(world, *, query: str = "", hide_isolated: bool = False, limit: int = MAX_NODES,
                center: int | None = None, depth: int = 1) -> dict:
    """算出世界的节点与连线。

    ``center`` 不为空时只返回该节点 ``depth`` 跳以内的邻域（VVD 的「以某节点为中心看邻域」）。
    """
    documents = list(
        world.documents.filter(deleted_at__isnull=True)
        .exclude(document_type=DOC_FOLDER)
        .select_related("entity_type")
        .order_by("document_type", "position", "id")[:limit]
    )
    by_id = {d.id: d for d in documents}
    entity_type_names = {t.id: t.name for t in world.types.all()}

    links: list[dict] = []
    seen_links: set[tuple] = set()

    def add_link(source_id, target_id, kind, label=""):
        if not source_id or not target_id or source_id == target_id:
            return
        if source_id not in by_id or target_id not in by_id:
            return
        key = (source_id, target_id, kind, label)
        if key in seen_links:
            return
        seen_links.add(key)
        links.append({"source": source_id, "target": target_id, "kind": kind, "label": label})

    # 1) 引用属性
    for document in documents:
        card = getattr(document, "card", None)
        if card is None:
            continue
        for entry in card.resolved_values().values():
            if entry.get("value_type") != "reference":
                continue
            ref = entry.get("ref")
            if ref:
                add_link(document.id, ref["id"], "reference", entry.get("name", ""))

    # 2) 事件关联（事件所在的文档 -> 卡片）
    events = (
        TimelineEvent.objects.filter(document__world=world, document__deleted_at__isnull=True)
        .prefetch_related("linked_cards")
        .select_related("document")
    )
    for event in events:
        for card_doc in event.linked_cards.all():
            add_link(event.document_id, card_doc.id, "event", event.title)

    # 3) 正文提及（最长匹配，跳过已经算过的"
    from . import autolink

    scans = [d for d in documents if d.document_type == DOC_CARD][:MAX_MENTION_SCAN]
    for document in scans:
        card = getattr(document, "card", None)
        if card is None or not card.body:
            continue
        for match in autolink.find_mentions(world, card.body, exclude_document_id=document.id)[:40]:
            add_link(document.id, match["document_id"], "mention", match["matched"])

    # 邻域裁剪
    if center:
        keep = _neighborhood(links, center, depth)
        links = [l for l in links if l["source"] in keep and l["target"] in keep]
        keep.add(center)
        documents = [d for d in documents if d.id in keep]

    degree: dict[int, int] = {}
    for link in links:
        degree[link["source"]] = degree.get(link["source"], 0) + 1
        degree[link["target"]] = degree.get(link["target"], 0) + 1

    nodes = [
        _node_payload(d, degree.get(d.id, 0), entity_type_names)
        for d in documents
    ]
    if hide_isolated:
        nodes = [n for n in nodes if n["degree"] > 0]
        alive = {n["id"] for n in nodes}
        links = [l for l in links if l["source"] in alive and l["target"] in alive]

    query_lower = (query or "").strip().casefold()
    if query_lower:
        hit = {n["id"] for n in nodes if query_lower in n["name"].casefold()
               or query_lower in (n["entity_type_name"] or "").casefold()}
        # 命中节点 + 它们的一跳邻居
        for link in links:
            if link["source"] in hit:
                hit.add(link["target"])
            if link["target"] in hit:
                hit.add(link["source"])
        nodes = [n for n in nodes if n["id"] in hit]
        alive = {n["id"] for n in nodes}
        links = [l for l in links if l["source"] in alive and l["target"] in alive]

    total_documents = world.documents.filter(deleted_at__isnull=True).exclude(
        document_type=DOC_FOLDER).count()
    return {
        "nodes": nodes,
        "links": links,
        "center": center,
        "stats": {
            "documents": len(nodes),
            "links": len(links),
            "total_documents": total_documents,
            "isolated": sum(1 for n in nodes if n["degree"] == 0),
        },
        "kinds": {
            "reference": "引用",
            "event": "时间线关联",
            "mention": "正文提及",
        },
    }


def _neighborhood(links: list[dict], center: int, depth: int) -> set[int]:
    """从中心节点做 BFS，返回 depth 跳以内的节点集合。"""
    adjacency: dict[int, set[int]] = {}
    for link in links:
        adjacency.setdefault(link["source"], set()).add(link["target"])
        adjacency.setdefault(link["target"], set()).add(link["source"])
    keep = {center}
    frontier = deque([(center, 0)])
    while frontier:
        node, level = frontier.popleft()
        if level >= depth:
            continue
        for neighbor in adjacency.get(node, ()):  # 邻居
            if neighbor in keep:
                continue
            keep.add(neighbor)
            frontier.append((neighbor, level + 1))
    return keep


def suggestions(world, limit: int = 8) -> list[dict]:
    """孤立卡片：还没有任何连线的卡片，建议去连一下（空状态用）。"""
    graph = build_graph(world)
    return [n for n in graph["nodes"] if n["degree"] == 0][:limit]
