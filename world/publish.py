# -*- coding: utf-8 -*-
"""发布：把世界变成一个只读站点（调研文档 §7）。

对齐的语义：

* 站点级：``is_published`` + ``published_slug`` + ``audience``（public / unlisted / password）
  + ``publish_version``（每次发布 +1，站点页脚显示版本）；
* 文档级：``is_published``（是否包含进站点）+ ``hidden``（在维基中隐藏）+ ``published_version``
  （上次进入站点时的版本）——这三者合起来算出 §4.4 那套状态机（见 ``models.publish_state``）。

站点是**即时渲染**的（不是静态快照），所以"重新发布"只是把版本号推进、把每份文档标记成
属于最新版本；改过但还没重新发布的文档会被标成 ``stale``，这正是 VVD 界面上那句
"Edited since you published"。
"""

from __future__ import annotations

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from .normalize import blocks_to_text

from .models import (
    AUDIENCE_PASSWORD,
    AUDIENCE_PUBLIC,
    AUDIENCE_UNLISTED,
    DOC_CANVAS,
    DOC_CARD,
    DOC_FOLDER,
    DOC_GRAPH,
    DOC_MAP,
    DOC_NOTE,
    DOC_TABLE,
    DOC_TIMELINE,
    DOC_TREE,
    Document,
    World,
    make_slug,
)

# 哪些文档类型会在站点上拥有自己的页面（对齐 wikiChrome.pages.docTypes 的口径）：
# 图谱、看板、文件夹这类"工作台视图"不出版。
SITE_DOC_TYPES = (DOC_CARD, DOC_TIMELINE, DOC_MAP, DOC_CANVAS, DOC_NOTE, DOC_TABLE, DOC_TREE)

SITE_DOC_TYPE_SET = set(SITE_DOC_TYPES)

AUDIENCE_LABELS = {
    AUDIENCE_PUBLIC: "任何人可读",
    AUDIENCE_UNLISTED: "仅持链接可见",
    AUDIENCE_PASSWORD: "需要密码",
}


def site_documents(world: World):
    """站点上会出现的文档：未删除 + 未隐藏 + 包含在站点里 + 站点已发布。"""
    if not world.is_published:
        return Document.objects.none()
    return (
        world.documents.filter(
            deleted_at__isnull=True, hidden=False, is_published=True, document_type__in=SITE_DOC_TYPES
        )
        .select_related("entity_type", "era")
        .order_by("document_type", "position", "id")
    )


def filter_documents(documents, *, type_slug: str = "", era_id: int = 0):
    # 注意：type_slug 实际是实体类型的 id（EntityType 没有 slug 字段）
    """按类型 / 纪元筛站点内容（筛选 chip 用）。

    * 类型：按实体类型的 slug 筛
    * 纪元：文档自己挂在这个纪元下，或者它的卡片在纪元里可见
    """
    if type_slug:
        documents = documents.filter(entity_type_id=type_slug)
    if era_id:
        documents = documents.filter(
            Q(era_id=era_id) | Q(card__era_mode="universal") | Q(card__era_ids__contains=[era_id])
        )
    return documents


def search_documents(world: World, keyword: str, limit: int = 60) -> list[dict]:
    """发布站点上的全文检索：名称、别名、正文、区块文字、属性值、事件标题。

    只搜"会出版"的文档，游客搜不到草稿。
    """
    keyword = (keyword or "").strip()
    if not keyword:
        return []
    lowered = keyword.lower()
    hits: list[dict] = []
    for document in site_documents(world).prefetch_related("events"):
        card = getattr(document, "card", None)
        parts = [document.name]
        if card is not None:
            parts.extend(card.aliases or [])
            parts.append(card.body or "")
            parts.append(blocks_to_text(card.blocks or []))
            for value in (card.values or {}).values():
                if isinstance(value, (str, int, float)):
                    parts.append(str(value))
        event_titles = [event.title for event in document.events.all()]
        parts.extend(event_titles)
        haystack = "\n".join(part for part in parts if part)
        position = haystack.lower().find(lowered)
        matched_events = [title for title in event_titles if lowered in title.lower()]
        if position < 0 and not matched_events:
            continue
        if position < 0:
            position = 0
        snippet = haystack[max(0, position - 40):position + len(keyword) + 60].replace("\n", " ").strip()
        hits.append({
            "document": document,
            "name": document.name,
            "type_label": document.get_document_type_display(),
            "type_name": document.entity_type.name if document.entity_type else "",
            "era_name": document.era.name if document.era else "",
            "snippet": snippet,
            "matched_events": matched_events[:3],
        })
        if len(hits) >= limit:
            break
    return hits


def site_filters(world: World) -> dict:
    """筛选 chip 的选项：有哪些类型、哪些纪元（只列站点上真有的）。"""
    types: dict[str, dict] = {}
    eras: dict[int, dict] = {}
    for document in site_documents(world):
        if document.entity_type_id:
            entry = types.setdefault(str(document.entity_type_id), {
                "slug": str(document.entity_type_id),
                "name": document.entity_type.name,
                "count": 0,
            })
            entry["count"] += 1
        if document.era_id:
            entry = eras.setdefault(document.era_id, {
                "id": document.era_id,
                "name": document.era.name,
                "count": 0,
            })
            entry["count"] += 1
    return {
        "types": sorted(types.values(), key=lambda item: (-item["count"], item["name"])),
        "eras": sorted(eras.values(), key=lambda item: item["name"]),
    }


def site_sections(world: World, documents=None) -> list[dict]:
    """按卡片类型分组（对齐 VVD 的 "Group by type" 分组方式）。"""
    sections: dict[str, dict] = {}
    for document in (documents if documents is not None else site_documents(world)):
        if document.document_type == DOC_TIMELINE:
            key, title = "timeline", "时间线"
        else:
            type_name = document.entity_type.name if document.entity_type else "未分类"
            key, title = f"type:{type_name}", type_name
        section = sections.setdefault(key, {"key": key, "title": title, "documents": []})
        section["documents"].append(document)
    order = {"timeline": 0}
    return sorted(sections.values(), key=lambda s: (order.get(s["key"], 1), s["title"]))


@transaction.atomic
def publish(world: World, *, audience: str | None = None, password: str | None = None,
            note_hidden: bool = True) -> dict:
    """发布 / 重新发布：推进版本号，并把当前所有该上站点的文档打上这个版本。"""
    if audience:
        world.audience = audience if audience in AUDIENCE_LABELS else AUDIENCE_PUBLIC
    if password is not None:
        world.publish_password = password.strip()[:60]
    if not world.published_slug:
        world.published_slug = make_slug("site", world.name, timezone.now().isoformat())
    world.is_published = True
    world.publish_version = (world.publish_version or 0) + 1
    world.published_at = timezone.now()
    world.save()

    version = world.publish_version
    now = timezone.now()
    targets = world.documents.filter(deleted_at__isnull=True)
    if note_hidden:
        targets = targets.exclude(hidden=True)
    targets.update(published_version=version, published_at=now)
    return {"publish": world.publish_summary(), "version": version}


def unpublish(world: World) -> dict:
    """下线：站点立刻 404，内容与版本号都保留（再发布时会继续往上加）。"""
    world.is_published = False
    world.save(update_fields=["is_published"])
    return world.publish_summary()


def can_view(world: World, session) -> bool:
    """密码档的放行判断：会话里记一个 per-world 的标记。"""
    if world.audience != AUDIENCE_PASSWORD or not world.publish_password:
        return True
    return bool(session.get(_unlock_key(world)))


def unlock(world: World, session, password: str) -> bool:
    if world.audience != AUDIENCE_PASSWORD or not world.publish_password:
        return True
    if (password or "").strip() == world.publish_password:
        session[_unlock_key(world)] = True
        return True
    return False


def _unlock_key(world: World) -> str:
    return f"site_unlocked_{world.id}"


def document_by_slug(world: World, slug: str):
    """站点页：按 slug 找文档（允许用 id 兜底）。"""
    query = site_documents(world)
    document = query.filter(slug=slug).first()
    if document is None and slug.isdigit():
        document = query.filter(pk=int(slug)).first()
    return document


def related_documents(document) -> list[dict]:
    """页面底部的"相关"：引用了它 / 它引用了谁 / 一起出现在事件里。"""
    world = document.world
    card = getattr(document, "card", None)
    out: list[dict] = []
    seen = {document.id}

    def push(target, reason):
        if target is None or target.id in seen or target.hidden or not target.is_published:
            return
        seen.add(target.id)
        out.append({"id": target.id, "name": target.name, "slug": target.slug, "reason": reason})

    if card is not None:
        for entry in card.resolved_values().values():
            if entry.get("value_type") == "reference" and entry.get("ref"):
                target = world.documents.filter(pk=entry["ref"]["id"]).first()
                push(target, f"引用（{entry.get('name')}）")
        # 反向引用
        for other in site_documents(world).filter(document_type="card"):
            other_card = getattr(other, "card", None)
            if other_card is None:
                continue
            for entry in other_card.resolved_values().values():
                if entry.get("value_type") == "reference" and entry.get("ref", {}).get("id") == document.id:
                    push(other, "被引用")

    for event in document.linked_events.all():
        push(event.document, f"出现在「{event.title}」")
    for event in document.events.prefetch_related("linked_cards").all():
        for linked in event.linked_cards.all():
            push(linked, f"关联到「{event.title}」")
    return out[:12]
