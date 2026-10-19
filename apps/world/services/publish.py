# -*- coding: utf-8 -*-
"""发布：把世界变成一个只读站点。

发布分两层，站点级和文档级各自记状态：

* 站点级：``is_published``（是否开站）+ ``published_slug``（站点地址里的短名）
  + ``audience``（public / unlisted / password 可见范围）+ ``publish_version``
  （每次发布 +1，站点页脚显示版本）；
* 文档级：``is_published``（是否包含进站点）+ ``hidden``（是否在维基里隐藏）
  + ``published_version``（上次进入站点时的版本号）——这三者合起来推出一份文档在
  站点上的展示状态（见 ``models.publish_state``）。

站点是**即时渲染**的，不生成静态快照：访问时按当前数据现渲染。所以"重新发布"并不复制
内容，只是把版本号推进、把每份文档标记成属于最新版本；改过但还没重新发布的文档会被标成
``stale``，表示"你发布后它又变了，该重发一次"。
"""

from __future__ import annotations

from django.contrib.auth.hashers import check_password, make_password
from django.db import transaction
from django.db.models import Count
from django.utils import timezone

from ..normalize import blocks_to_text

from ..models import (
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
    World,
    make_slug,
)
from apps.documents.models import Document, TimelineEvent

# 哪些文档类型会在站点上拥有自己的页面：
# 图谱、看板、文件夹这类"工作台视图"不出版。
SITE_DOC_TYPES = (DOC_CARD, DOC_TIMELINE, DOC_MAP, DOC_GRAPH, DOC_CANVAS, DOC_NOTE, DOC_TABLE, DOC_TREE)

SITE_DOC_TYPE_SET = set(SITE_DOC_TYPES)

#: 站点上世界总时间线的地址段（``/s/<slug>/timeline/``）
TIMELINE_SITE_SLUG = "timeline"


class SiteTimeline:
    """站点列表里的「世界时间线」。

    0.7.0 起时间线不是文档了，但站点首页仍需要它占一格——这个轻量对象只提供
    模板与搜索需要的最小字段，不落库。
    """

    id = TIMELINE_SITE_SLUG
    name = "世界时间线"
    slug = TIMELINE_SITE_SLUG
    document_type = DOC_TIMELINE
    entity_type = None
    era = None
    preview = ""
    cover_safe = ""

    def get_document_type_display(self) -> str:
        return "时间线"


def world_timeline(world: World):
    """世界的总时间线；还没有就返回 ``None``（站点只读，不顺手创建）。"""
    return getattr(world, "timeline", None)


def timeline_events(world: World, era=None):
    """总时间线上的事件（可选只看某个时代）。"""
    timeline = world_timeline(world)
    if timeline is None:
        return TimelineEvent.objects.none()
    query = (
        timeline.events
        .select_related("document", "featured_card", "timeline__calendar")
        .prefetch_related("linked_cards")
        .order_by("year", "month", "day", "hour", "id")
    )
    if era is not None:
        query = query.filter(era=era)
    return query

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
    """按类型 / 纪元筛站点内容（站点上的筛选 chip 用）。

    * ``type_slug``：名字叫 slug，实际传进来的是实体类型的 id
      （``EntityType`` 没有 slug 字段），按它过滤卡片；
    * ``era_id``：文档自己挂在这个纪元下，或者它的卡片在纪元里可见
      ——后者只问 ``Card.visible_in_era``，与工作区、地图、关系树同一口径。
    """
    if type_slug:
        documents = documents.filter(entity_type_id=type_slug)
    if era_id:
        visible_ids = [
            document.id for document in documents.select_related("card")
            if document.era_id == era_id
            or (getattr(document, "card", None) is not None
                and document.card.visible_in_era(era_id))
        ]
        documents = documents.filter(id__in=visible_ids)
    return documents


def search_documents(world: World, keyword: str, limit: int = 400) -> list[dict]:
    """发布站点上的全文检索：名称、别名、正文、区块文字、属性值、事件标题。

    只搜"会出版"的文档，游客搜不到草稿。片段切成 ``parts``（``hit=True`` 的是命中处），
    模板据此加 ``<mark>``，不用在前端再算一遍。
    """
    keyword = (keyword or "").strip()
    if not keyword:
        return []
    lowered = keyword.lower()
    hits: list[dict] = []

    def split_parts(text: str) -> list[dict]:
        """把片段按命中处切开（大小写不敏感，全部命中都标）。"""
        parts, cursor = [], 0
        low = text.lower()
        while True:
            found = low.find(lowered, cursor)
            if found < 0:
                break
            if found > cursor:
                parts.append({"text": text[cursor:found], "hit": False})
            parts.append({"text": text[found:found + len(keyword)], "hit": True})
            cursor = found + len(keyword)
        if cursor < len(text):
            parts.append({"text": text[cursor:], "hit": False})
        return parts or [{"text": text, "hit": False}]

    for document in site_documents(world).select_related("card").prefetch_related("events"):
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
        window = haystack[max(0, position - 40):position + len(keyword) + 60].replace("\n", " ").strip()
        # 排序权重：名字开头 > 名字里 > 别名 > 正文 > 属性/事件
        name_low = document.name.lower()
        if name_low.startswith(lowered):
            score = 100
        elif lowered in name_low:
            score = 80
        elif any(lowered in (alias or "").lower() for alias in (card.aliases if card else []) or []):
            score = 60
        elif lowered in (card.body or "").lower() if card else False:
            score = 40
        elif matched_events:
            score = 35
        else:
            score = 20
        hits.append({
            "document": document,
            "score": score,
            "name": document.name,
            "name_hit": lowered in name_low,
            "type_label": document.get_document_type_display(),
            "type_name": document.entity_type.name if document.entity_type else "",
            "era_name": document.era.name if document.era else "",
            "snippet": window,
            "parts": split_parts(window),
            "matched_events": matched_events[:3],
        })
        if len(hits) >= limit:
            break

    # 总时间线的事件不再挂在文档上，单独给「世界时间线」一个搜索命中
    timeline = world_timeline(world)
    if timeline is not None and len(hits) < limit:
        event_titles = [
            title for title in timeline.events.values_list("title", flat=True)
            if lowered in (title or "").lower()
        ][:3]
        if event_titles:
            snippet = "、".join(event_titles)
            hits.append({
                "document": SiteTimeline(),
                "score": 35,
                "name": SiteTimeline.name,
                "name_hit": False,
                "type_label": "时间线",
                "type_name": "",
                "era_name": "",
                "snippet": snippet,
                "parts": split_parts(snippet),
                "matched_events": event_titles,
            })

    hits.sort(key=lambda item: (-item["score"], item["name"]))
    return hits


def suggest_similar(world: World, keyword: str, limit: int = 5) -> list[dict]:
    """搜不到时的"你是不是想找"：拿已发布文档的名字做近似匹配。"""
    import difflib

    keyword = (keyword or "").strip()
    if len(keyword) < 2:
        return []
    names = {}
    for document in site_documents(world):
        names[document.name] = document
    if world_timeline(world) is not None:
        names[SiteTimeline.name] = SiteTimeline()
    close = difflib.get_close_matches(keyword, list(names), n=limit, cutoff=0.6)
    if not close:
        lowered = keyword.lower()
        close = [name for name in names if lowered in name.lower() or name.lower() in lowered][:limit]
    return [{"name": name, "slug": names[name].slug, "type": names[name].document_type}
            for name in close]


def paginate(items: list, page: int = 1, per_page: int = 20) -> dict:
    """朴素分页（站点搜索结果用）。"""
    total = len(items)
    pages = max(1, (total + per_page - 1) // per_page)
    page = min(max(1, page), pages)
    start = (page - 1) * per_page
    return {
        "items": items[start:start + per_page],
        "page": page,
        "pages": pages,
        "total": total,
        "has_prev": page > 1,
        "has_next": page < pages,
    }


def publish_preview(world: World) -> dict:
    """发布差异预览：这次发布会新增 / 更新 / 下架哪些文档。

    * ``added``：还没上过站点的（pending）
    * ``changed``：上过但之后改过的（stale）
    * ``removed``：站点上不再收录的（excluded / unpublished / 已隐藏 / 已删）
    """
    from ..models import publish_state

    first_time = not world.is_published      # 第一次发布：所有该上站的都是"新增"
    added, changed, removed = [], [], []
    for document in world.documents.filter(deleted_at__isnull=True).exclude(document_type=DOC_FOLDER):
        state = publish_state(document, world)
        if first_time and state == "unpublished":
            state = "pending"
        entry = {"id": document.id, "name": document.name, "type": document.document_type,
                 "state": state, "updated_at": document.updated_at.isoformat() if document.updated_at else None}
        if state == "pending":
            added.append(entry)
        elif state == "stale":
            changed.append(entry)
        elif state in ("excluded", "unpublished"):
            removed.append(entry)
    for document in world.documents.filter(deleted_at__isnull=False, is_published=True).exclude(document_type=DOC_FOLDER):
        removed.append({"id": document.id, "name": document.name, "type": document.document_type,
                        "state": "deleted", "updated_at": None})
    return {
        "added": added,
        "changed": changed,
        "removed": removed,
        "summary": {"added": len(added), "changed": len(changed), "removed": len(removed)},
    }


def era_summary(world: World, era) -> dict:
    """一个纪元在站点上的样子：说明、颜色、以及按时间排好的事件。"""
    rows = []
    for event in timeline_events(world, era):
        rows.append({
            "id": event.id,
            "title": event.title,
            "date_label": event.date_label,
            "description": event.description,
            "document": event.document,
            "cards": list(event.linked_cards.all())[:6],
        })
    linked_documents = [
        document for document in site_documents(world).select_related("card")
        if document.era_id == era.id
        or (getattr(document, "card", None) is not None
            and document.card.visible_in_era(era.id))
    ]
    return {"era": era, "events": rows, "documents": linked_documents[:24]}


def site_eras(world: World, counts=None) -> list[dict]:
    """站点上"有内容"的纪元（有事件、或挂着文档）。

    ``counts`` 可以传 ``site_filters(world)["eras"]``，让同一页里已经算过的
    纪元文档数直接复用，省一次整表遍历。
    """
    era_counts = site_filters(world)["eras"] if counts is None else counts
    counts = {item["id"]: item["count"] for item in era_counts}
    # 一次聚合把所有纪元的事件数取回来，避免每个纪元都单独 count 一次
    timeline = world_timeline(world)
    event_counts = {}
    if timeline is not None:
        event_counts = {
            row["era_id"]: row["total"]
            for row in timeline.events.order_by().values("era_id").annotate(total=Count("id"))
            if row["era_id"] is not None
        }
    rows = []
    for era in world.eras.order_by("position", "id"):
        events = event_counts.get(era.id, 0)
        if era.id in counts or events:
            rows.append({"id": era.id, "name": era.name, "theme": era.theme,
                         "description": era.description, "cover": era.cover,
                         "length_years": era.length_years,
                         "count": counts.get(era.id, 0) + events})
    return rows


def site_filters(world: World, documents=None) -> dict:
    """筛选 chip 的选项：有哪些类型、哪些纪元（只列站点上真有的）。

    ``documents`` 可传入已经取好的站点文档 QuerySet，与 ``site_sections``
    共用同一份查询缓存。
    """
    types: dict[str, dict] = {}
    eras: dict[int, dict] = {}
    for document in (documents if documents is not None else site_documents(world)):
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


def site_sections(world: World, documents=None, include_timeline: bool = True) -> list[dict]:
    """把站点文档按类型分组：时间线归一节，其余按卡片类型名各归一节（站点列表分栏用）。

    0.7.0 起时间线不再是文档，而是每世界唯一的总时间线；只要它有事件，就在
    「时间线」分区里放一个 ``SiteTimeline`` 占位。``include_timeline=False`` 用于
    调用方已经在别处展示时间线的情况。
    """
    sections: dict[str, dict] = {}
    if include_timeline:
        timeline = world_timeline(world)
        if timeline is not None and timeline.events.exists():
            sections["timeline"] = {"key": "timeline", "title": "时间线", "documents": [SiteTimeline()]}
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
            note_hidden: bool = True, author=None) -> dict:
    """发布 / 重新发布：推进版本号，把该上站点的文档打上这个版本，并留一条发布记录。"""
    from apps.publishing.models import PublishLog

    diff = publish_preview(world)
    if audience:
        world.audience = audience if audience in AUDIENCE_LABELS else AUDIENCE_PUBLIC
    if password is not None:
        # 密码只存哈希（make_password）：明文一旦落库，库被拖走就等于把站点的
        # 访问口令一起交出去。空串表示"取消密码"，此时落到空值。
        secret = password.strip()
        world.publish_password = make_password(secret) if secret else ""
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

    def names(rows):
        return [{"id": row["id"], "name": row["name"], "type": row["type"]} for row in rows][:60]

    PublishLog.objects.create(
        world=world,
        version=version,
        audience=world.audience,
        counts=world.publish_summary()["counts"],
        added=names(diff["added"]),
        changed=names(diff["changed"]),
        removed=names(diff["removed"]),
        author=author if getattr(author, "is_authenticated", False) else None,
        author_name=(author.get_username() if getattr(author, "is_authenticated", False) else "匿名"),
    )
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
    if check_password((password or "").strip(), world.publish_password):
        session[_unlock_key(world)] = True
        return True
    return False


def _unlock_key(world: World) -> str:
    return f"site_unlocked_{world.id}"


def document_by_slug(world: World, slug: str):
    """站点页：按 slug 找文档（允许用 id 兜底）。"""
    query = site_documents(world).select_related("card")
    document = query.filter(slug=slug).first()
    if document is None and slug.isdigit():
        document = query.filter(pk=int(slug)).first()
    return document


def related_documents(document, world=None) -> list[dict]:
    """页面底部的"相关"：引用了它 / 它引用了谁 / 一起出现在事件里。"""
    world = world if world is not None else document.world
    card = getattr(document, "card", None)
    out: list[dict] = []
    seen = {document.id}

    def push(target, reason):
        if target is None or target.id in seen or target.hidden or not target.is_published:
            return
        seen.add(target.id)
        out.append({"id": target.id, "name": target.name, "slug": target.slug, "reason": reason})

    if card is not None:
        values = card.resolved_values(world=world)
        # 引用目标先把 id 收齐，一次取回，避免每条引用都单独查一次库
        ref_ids = [
            entry["ref"]["id"] for entry in values.values()
            if entry.get("value_type") == "reference" and entry.get("ref")
        ]
        references = world.documents.in_bulk(ref_ids)
        for entry in values.values():
            if entry.get("value_type") == "reference" and entry.get("ref"):
                target = references.get(entry["ref"]["id"])
                push(target, f"引用（{entry.get('name')}）")
        # 反向引用
        for other in site_documents(world).select_related("card").filter(document_type="card"):
            other_card = getattr(other, "card", None)
            if other_card is None:
                continue
            for entry in other_card.resolved_values(world=world).values():
                if entry.get("value_type") == "reference" and entry.get("ref", {}).get("id") == document.id:
                    push(other, "被引用")

    for event in document.linked_events.select_related("document").all():
        push(event.document, f"出现在「{event.title}」")
    for event in document.events.prefetch_related("linked_cards").all():
        for linked in event.linked_cards.all():
            push(linked, f"关联到「{event.title}」")
    return out[:12]
