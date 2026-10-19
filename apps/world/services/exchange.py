# -*- coding: utf-8 -*-
"""导入 / 导出：把世界搬得出去，也搬得进来。

* 导出：整个世界打包成 zip（每份文档一个 Markdown + 一份 world.json 备份 + 媒体清单），
  或者单独导出某份文档。
* 导入：Markdown（单文件 / 多文件 / zip / Obsidian 目录），可选 JSON 备份还原。
  ``[[双链]]`` 与 ``@提及`` 会尽量接成卡片链接；标题层级变区块标题。

设计取舍：导出格式以 **Markdown 为主、JSON 为备份**——
Markdown 用户拿出去能用别的工具打开，JSON 则用于回头原样导回来。
"""

from __future__ import annotations

import io
import json
import re
import zipfile
from typing import Iterable

from django.utils import timezone

from ..normalize import normalize_blocks
from apps.documents.models import Card, Document, Era, TimelineEvent, WorldTimeline
from apps.world.models.constants import CONFIDENCE_EXACT, PRECISION_YEAR

DOC_TYPE_LABEL = {
    "card": "卡片", "folder": "文件夹", "timeline": "时间线", "map": "地图",
    "familyTree": "关系树", "graph": "世界图谱", "note": "笔记", "table": "表格",
    "board": "看板", "canvas": "画布",
}


# --------------------------------------------------------------------------- #
# 导出
# --------------------------------------------------------------------------- #
def _escape_cell(value) -> str:
    text = "" if value is None else str(value)
    return text.replace("|", "\\|").replace("\n", " ")


def property_lines(card: Card, document: Document) -> list[str]:
    """卡片属性 -> Markdown 表格行。"""
    entity_type = card.effective_type()
    if entity_type is None:
        return []
    values = card.values if isinstance(card.values, dict) else {}
    lines = ["| 属性 | 值 |", "| --- | --- |"]
    for prop in entity_type.all_properties():
        raw = values.get(str(prop.id))
        if raw in (None, "", []):
            continue
        if isinstance(raw, list):
            shown = "、".join(str(v) for v in raw)
        else:
            shown = str(raw)
        lines.append(f"| {_escape_cell(prop.name)} | {_escape_cell(shown)} |")
    return lines if len(lines) > 2 else []


def block_lines(blocks: Iterable[dict]) -> list[str]:
    """区块 -> Markdown。标题块用 ``##``，正文原样，提示框用引用块。"""
    out: list[str] = []
    for block in blocks or []:
        if not isinstance(block, dict) or block.get("hidden"):
            continue
        btype = block.get("type", "text")
        title = (block.get("title") or "").strip()
        text = (block.get("html") or block.get("text") or "").strip()
        if btype == "divider":
            out.append("---")
            continue
        if btype == "heading":
            out.append(f"## {title or _plain(text)}")
        else:
            if title:
                out.append(f"### {title}")
            if btype == "quote":
                out.extend(f"> {line}" for line in (text or "").splitlines() or [""])
            elif btype == "callout":
                out.append("> [!info]")
                out.extend(f"> {line}" for line in (text or "").splitlines() or [""])
            elif text:
                out.append(text)
        for comment in block.get("comments") or []:
            flag = "已解决" if comment.get("resolved") else "未解决"
            out.append(f"<!-- 评论（{flag}）{comment.get('author', '我')}：{comment.get('text', '')} -->")
        out.append("")
    return out


def _plain(html_or_text: str) -> str:
    from .sanitize import html_to_text
    return html_to_text(html_or_text or "")


def document_markdown(document: Document) -> str:
    """一份文档 -> Markdown 文本。"""
    lines: list[str] = [f"# {document.name}", ""]
    meta = [f"- 类型：{DOC_TYPE_LABEL.get(document.document_type, document.document_type)}"]
    card_obj = getattr(document, "card", None)
    aliases = list(card_obj.aliases or []) if card_obj is not None else []
    if aliases:
        meta.append(f"- 别名：{'、'.join(aliases)}")
    if document.hidden:
        meta.append("- 状态：已从站点隐藏")
    if document.entity_type:
        meta.append(f"- 卡片类型：{document.entity_type.name}")
    lines.extend(meta)
    lines.append("<!-- 由世界工作区导出 -->")
    lines.append("")

    if document.document_type == "timeline":
        lines.append("## 事件")
        lines.append("")
        for event in document.events.all().order_by("year", "month", "day", "hour", "id").prefetch_related("linked_cards"):
            when = event.display_date() if hasattr(event, "display_date") else str(event.year)
            links = "、".join(c.name for c in event.linked_cards.all())
            suffix = f"（关联：{links}）" if links else ""
            lines.append(f"- **{when}** {event.title}{suffix}")
            if event.description:
                lines.append(f"  - {event.description}")
        lines.append("")
        return "\n".join(lines)

    if document.document_type == "familyTree":
        variants = list(document.tree_variants.all())
        lines.append("## 成员")
        lines.append("")
        for variant in variants:
            for node in variant.nodes.select_related("card").all():
                sub = f" — {node.subtitle}" if node.subtitle else ""
                lines.append(f"- **{node.name}**{sub}")
        lines.append("")
        lines.append("## 关系")
        lines.append("")
        for variant in variants:
            for edge in variant.edges.select_related("source", "target").all():
                lines.append(f"- {edge.source.name} → {edge.target.name}（{edge.label or '关系'}）")
        lines.append("")
        return "\n".join(lines)

    if document.document_type == "map":
        lines.append("## 标注")
        lines.append("")
        for marker in document.map_markers.select_related("card").all():
            link = f"（关联：{marker.card.name}）" if marker.card else ""
            lines.append(f"- **{marker.name or '未命名'}**{link}")
        lines.append("")
        return "\n".join(lines)

    card = getattr(document, "card", None)
    if card is not None:
        props = property_lines(card, document)
        if props:
            lines.extend(props)
            lines.append("")
        lines.extend(block_lines(card.blocks))
    return "\n".join(lines).rstrip() + "\n"


def document_payload(document: Document, world=None) -> dict:
    """单份文档的 JSON（导回来时能原样重建）。

    ``world`` 由调用方（整世界备份）传入时，卡片引用解析可以复用它，
    不必每张卡再顺着 ``card.document.world`` 查一次库。
    """
    data = document.to_payload(with_card=False)
    card = getattr(document, "card", None)
    if card is not None:
        data["card"] = card.to_payload(world=world)
    if document.document_type == "timeline":
        data["events"] = [e.to_payload() for e in document.events.all()]
    if document.document_type == "familyTree":
        data["variants"] = [
            {
                "id": variant.id,
                "name": variant.name,
                "nodes": [n.to_payload() for n in variant.nodes.all()],
                "edges": [e.to_payload() for e in variant.edges.all()],
            }
            for variant in document.tree_variants.all()
        ]
    if document.document_type == "map":
        data["layers"] = [l.to_payload() for l in document.map_layers.all()]
        data["markers"] = [m.to_payload() for m in document.map_markers.all()]
    return data


def _era_span(era: Era) -> str:
    if era.start_year is None:
        return ""
    if era.end_year is None:
        return f"（{era.start_year:g} 年 — 至今）"
    return f"（{era.start_year:g} – {era.end_year:g} 年）"


def timeline_markdown(world, timeline: WorldTimeline | None = None) -> str:
    """世界总时间线 -> Markdown：时代区间 + 事件（0.7.0 起它不再是文档）。"""
    timeline = timeline if timeline is not None else getattr(world, "timeline", None)
    lines = ["# 世界时间线", ""]
    if timeline is None:
        return "\n".join(lines)

    lines.append(f"- 坐标原点：{timeline.origin_year:g} 年")
    if timeline.calendar_id:
        lines.append(f"- 历法：{timeline.calendar.name}")
    lines.append("")

    eras = list(world.eras.order_by("position", "id"))
    if eras:
        lines.extend(["## 时代", ""])
        for era in eras:
            lines.append(f"- **{era.name}**{_era_span(era)}")
        lines.append("")

    lines.extend(["## 事件", ""])
    events = (
        timeline.events.order_by("year", "month", "day", "hour", "position", "id")
        # 历法取事件的 timeline.calendar；时代名与关联卡片都在循环里用到，一次取齐
        .select_related("timeline__calendar", "era")
        .prefetch_related("linked_cards")
    )
    for event in events:
        era = f"（{event.era.name}）" if event.era_id else ""
        links = "、".join(c.name for c in event.linked_cards.all())
        suffix = f"（关联：{links}）" if links else ""
        lines.append(f"- **{event.date_label()}** {event.title}{era}{suffix}")
        if event.description:
            lines.append(f"  - {event.description}")
    lines.append("")
    return "\n".join(lines)


def world_backup(world) -> dict:
    """整世界 JSON 备份：类型 + 纪元 + 日历 + 总时间线 + 文档树（递归）。"""
    # 一次取回整棵树，在内存里按 parent 分组；避免每层递归各查一次 children。
    # map_data 只在打开地图时用，备份里用不到，先 defer 掉省内存。
    all_documents = list(
        world.documents.filter(deleted_at__isnull=True)
        .select_related("world", "entity_type")
        # 卡片连同它自己的类型一次预取，避免每份文档各查一次卡 / 类型
        .prefetch_related("card__entity_type")
        .defer("map_data").order_by("position", "id")
    )
    children_map: dict[int, list] = {}
    roots: list = []
    for document in all_documents:
        if document.parent_id is None:
            roots.append(document)
        else:
            children_map.setdefault(document.parent_id, []).append(document)

    def walk(document: Document) -> dict:
        item = document_payload(document, world=world)
        item["children"] = [walk(child) for child in children_map.get(document.id, ())]
        return item

    timeline = getattr(world, "timeline", None)
    return {
        "format": "worldbuilding-timeline/backup",
        "version": 1,
        "exported_at": timezone.now().isoformat(),
        "world": world.to_payload(),
        "types": [t.to_payload(with_properties=True) for t in world.types.all()],
        "eras": [e.to_payload() for e in world.eras.all()],
        "calendars": [c.to_payload() for c in world.calendars.all()],
        # 0.7.0：事件挂在世界总时间线上；旧时间线文档里的事件仍随文档各存一份，
        # 导入时按事件 id 去重，旧备份（没有 timeline 键）也能照常还原。
        "timeline": (
            {
                **timeline.to_payload(),
                "events": [
                    e.to_payload()
                    for e in timeline.events.order_by("year", "month", "day", "hour", "position", "id")
                ],
            }
            if timeline is not None else None
        ),
        "documents": [walk(root) for root in roots],
    }


def world_zip(world) -> bytes:
    """整个世界 -> zip 字节（Markdown + JSON 备份 + 媒体清单）。"""
    buffer = io.BytesIO()
    used: set[str] = set()

    def unique(name: str) -> str:
        base = re.sub(r'[\\/:*?"<>|]+', "-", name).strip() or "document"
        candidate = f"{base}.md"
        index = 2
        while candidate in used:
            candidate = f"{base}-{index}.md"
            index += 1
        used.add(candidate)
        return candidate

    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("world.json", json.dumps(world_backup(world), ensure_ascii=False, indent=2))
        archive.writestr("README.md", (
            f"# {world.name}\n\n"
            f"导出时间：{timezone.now().strftime('%Y-%m-%d %H:%M')}\n\n"
            "- `world.json`：完整备份，可以用工作区的「导入」原样导回来\n"
            "- `timeline.md`：世界总时间线（时代与事件）\n"
            "- `documents/`：每份文档一个 Markdown，方便拿去别的工具\n"
            "- `media/`：媒体清单（真正的图片仍在原来的地址）\n"
        ))
        timeline = getattr(world, "timeline", None)
        if timeline is not None:
            archive.writestr("timeline.md", timeline_markdown(world, timeline))
        # 一次取回整棵树，在内存里按 parent 分组；避免每个有子节点的文档各查一次。
        # 地图数据 / 工具设置这些大字段导出树时用不到，先 defer 掉。
        all_documents = list(
            world.documents.filter(deleted_at__isnull=True)
            # 每份文档的 Markdown 都要读卡片、别名与类型名，连同文档类型一起预取
            .select_related("entity_type", "card", "card__entity_type")
            .defer("map_data", "settings", "preview")
            .order_by("position", "id")
        )
        children_map: dict[int, list] = {}
        roots: list = []
        for document in all_documents:
            if document.parent_id is None:
                roots.append(document)
            else:
                children_map.setdefault(document.parent_id, []).append(document)
        for root in roots:
            stack = [(root, "")]
            while stack:
                document, prefix = stack.pop(0)
                folder = f"documents/{prefix}" if prefix else "documents"
                archive.writestr(f"{folder}/{unique(document.name)}", document_markdown(document))
                for child in children_map.get(document.id, ()):
                    stack.append((child, f"{prefix}{document.name}/" if prefix else f"{document.name}/"))
        media = world.documents.exclude(cover="").values_list("cover", flat=True)
        archive.writestr("media/index.md", "# 媒体\n\n" + "\n".join(f"- {url}" for url in dict.fromkeys(media)))
    return buffer.getvalue()


# --------------------------------------------------------------------------- #
# 导入
# --------------------------------------------------------------------------- #
WIKI_LINK = re.compile(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]")


def _link_mentions(html: str, world, cache: dict | None = None) -> str:
    """把 ``[[卡片名]]`` 变成指向卡片的提及（找不到就留纯文本）。

    ``cache`` 由 ``markdown_to_blocks`` 在一次转换里共用：同一个名字只查一次，
    别名兜底也最多全量扫一次卡片——正文里链接很多时不用每条都查库。
    """
    if "[[" not in html:
        return html
    cache = cache if cache is not None else {}
    by_name: dict[str, Document | None] = cache.setdefault("documents", {})

    def replace(match: re.Match) -> str:
        name = match.group(1).strip()
        label = (match.group(2) or name).strip()
        if name in by_name:
            document = by_name[name]
        else:
            document = world.documents.filter(name__iexact=name, deleted_at__isnull=True).first()
            by_name[name] = document
        if document is None:
            aliases = cache.get("aliases")
            if aliases is None:
                # 按与逐张卡片遍历相同的顺序铺开，先出现的卡片优先
                aliases = {}
                for card in Card.objects.filter(document__world=world).select_related("document"):
                    for alias in (card.aliases or []):
                        aliases.setdefault(alias, card.document)
                cache["aliases"] = aliases
            document = aliases.get(name)
            by_name[name] = document
        if document is None:
            return label
        return f'<span class="mentions-inline" data-target="{document.id}">{label}</span>'

    return WIKI_LINK.sub(replace, html)


def markdown_to_blocks(text: str, world) -> list[dict]:
    """Markdown -> 区块数组。``##`` 起新块，``>`` 引用/提示框，``---`` 分隔线。"""
    blocks: list[dict] = []
    current: dict | None = None
    buffer: list[str] = []
    link_cache: dict = {}

    def flush() -> None:
        nonlocal current, buffer
        if current is None:
            return
        body = "\n".join(buffer).strip()
        current["html"] = _link_mentions(_paragraph_html(body), world, link_cache)
        blocks.append(current)
        current = None
        buffer = []

    for raw in text.splitlines():
        line = raw.rstrip()
        if line.startswith("# "):
            continue                                    # 一级标题 = 文档名，不重复
        heading = re.match(r"^(#{2,3})\s+(.*)$", line)
        if heading:
            flush()
            current = {
                "id": f"b{len(blocks) + 1}",
                "type": "heading" if len(heading.group(1)) == 2 else "text",
                "title": heading.group(2).strip(),
                "text": "",
            }
            continue
        if line.strip() in ("---", "***", "___"):
            flush()
            blocks.append({"id": f"b{len(blocks) + 1}", "type": "divider", "title": "", "text": ""})
            continue
        callout = line.strip().lower().startswith("> [!info]")
        if callout:
            flush()
            current = {"id": f"b{len(blocks) + 1}", "type": "callout", "title": "", "text": ""}
            continue
        if line.startswith(">"):
            if current is None or current["type"] != "quote":
                flush()
                current = {"id": f"b{len(blocks) + 1}", "type": "quote", "title": "", "text": ""}
            buffer.append(line.lstrip("> ").rstrip())
            continue
        if not line.strip():
            if current is not None and buffer:
                flush()
            continue
        if current is None:
            current = {"id": f"b{len(blocks) + 1}", "type": "text", "title": "", "text": ""}
        buffer.append(_inline_markdown(line))
    flush()
    return normalize_blocks(blocks)


def _inline_markdown(line: str) -> str:
    """粗体/斜体/行内代码 -> HTML（导入时保留一点排版）。"""
    line = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", line)
    line = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<i>\1</i>", line)
    line = re.sub(r"`([^`]+)`", r"<code>\1</code>", line)
    line = re.sub(r"^\s*[-*+]\s+", "• ", line)
    return line


def _paragraph_html(body: str) -> str:
    if not body:
        return ""
    if "<" in body:
        return "".join(f"<p>{line}</p>" if line.strip() else "" for line in body.splitlines())
    return "".join(f"<p>{line}</p>" for line in body.splitlines() if line.strip())


def import_markdown_files(world, files: list[dict], parent: Document | None = None,
                          as_type: str = "card") -> dict:
    """把一批 Markdown 文件导入成卡片（按目录名建文件夹）。"""
    created_docs: list[Document] = []
    folders: dict[str, Document] = {}
    # 每个父节点下一次可用的排序号；只在该父节点第一次用到时数一次库
    next_positions: dict[int, int] = {}

    def take_position(node: Document | None) -> int:
        key = node.pk if node is not None else 0
        if key not in next_positions:
            next_positions[key] = (
                node.children.count() if node is not None
                else world.documents.filter(parent__isnull=True).count()
            )
        value = next_positions[key]
        next_positions[key] = value + 1
        return value

    def folder_for(path: str) -> Document | None:
        parts = [p for p in path.split("/")[:-1] if p and p not in (".", "..")]
        if not parts:
            return parent
        key = "/".join(parts)
        if key in folders:
            return folders[key]
        node = parent
        walked = []
        for part in parts:
            walked.append(part)
            sub_key = "/".join(walked)
            if sub_key in folders:
                node = folders[sub_key]
                continue
            created = Document.objects.create(
                world=world, parent=node, document_type="folder", name=part[:200],
                position=take_position(node),
            )
            folders[sub_key] = created
            node = created
        return node

    text_files = [f for f in files if not f["name"].lower().endswith(".zip")]
    for item in text_files:
        name = item["name"]
        content = item.get("content") or ""
        title = ""
        for line in content.splitlines():
            if line.startswith("# "):
                title = line[2:].strip()
                break
        title = title or re.sub(r"\.(md|markdown|txt)$", "", name.split("/")[-1], flags=re.I)
        parent_doc = folder_for(name)
        position = take_position(parent_doc)
        blocks = markdown_to_blocks(content, world)
        document = Document.objects.create(
            world=world, parent=parent_doc, document_type=as_type, name=title[:200], position=position,
        )
        card, _ = Card.objects.get_or_create(document=document, defaults={"entity_type": document.entity_type})
        card.blocks = blocks
        card.body = "\n".join(
            b.get("text", "") for b in blocks if isinstance(b, dict) and b.get("type") != "divider"
        )
        card.save()
        created_docs.append(document)

    if parent is not None:
        parent.save(update_fields=["updated_at"])
    return {
        "created": len(created_docs),
        "folders": len(folders),
        "documents": [{"id": d.id, "name": d.name} for d in created_docs],
    }


def _as_int(value, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _as_float(value, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _as_optional_float(value):
    try:
        return None if value is None else float(value)
    except (TypeError, ValueError):
        return None


def _import_eras(world, payload: dict) -> dict:
    """备份里的时代 -> 世界里的同名时代；没有才新建（反复导入不会堆出一串同名时代）。"""
    era_map: dict[int, Era] = {}
    existing = {era.name.strip().lower(): era for era in world.eras.all()}
    for item in payload.get("eras") or []:
        if not isinstance(item, dict):
            continue
        name = (item.get("name") or "新纪元").strip()[:80] or "新纪元"
        era = existing.get(name.lower())
        if era is None:
            era = Era.objects.create(
                world=world,
                name=name,
                position=_as_int(item.get("position")),
                start_year=_as_optional_float(item.get("start_year")),
                end_year=_as_optional_float(item.get("end_year")),
                start_precision=item.get("start_precision") or PRECISION_YEAR,
                end_precision=item.get("end_precision") or PRECISION_YEAR,
                theme=item.get("theme") or "blue",
                theme_config=item.get("theme_config") if isinstance(item.get("theme_config"), dict) else {},
                icon=item.get("icon") or "",
                description=item.get("description") or "",
                cover=item.get("cover") or "",
            )
            existing[name.lower()] = era
        if item.get("id") is not None:
            era_map[item.get("id")] = era
    return era_map


def _import_event(item: dict, timeline: WorldTimeline, doc_map: dict, era_map: dict,
                  document: Document | None = None) -> TimelineEvent | None:
    """备份里的一条事件 -> 世界总时间线上的事件；文档 / 时代 / 关联卡片都重新对号。"""
    title = (item.get("title") or "").strip()[:160]
    if not title:
        return None
    linked = [doc_map[c.get("id")] for c in (item.get("linked_cards") or [])
              if isinstance(c, dict) and c.get("id") in doc_map]
    event = TimelineEvent.objects.create(
        timeline=timeline,
        document=doc_map.get(item.get("document")) or document,
        title=title,
        precision=item.get("precision") or PRECISION_YEAR,
        year=_as_int(item.get("year")),
        month=_as_int(item.get("month"), 1) or 1,
        day=_as_int(item.get("day"), 1) or 1,
        hour=_as_int(item.get("hour")),
        era=era_map.get(item.get("era")),
        description=item.get("description") or "",
        cover=item.get("cover") or "",
        row=_as_int(item.get("row")),
        position=_as_int(item.get("position")),
        confidence=item.get("confidence") or CONFIDENCE_EXACT,
        range_years=_as_float(item.get("range_years")),
        settings=item.get("settings") if isinstance(item.get("settings"), dict) else {},
        featured_card=doc_map.get(item.get("featured_card")),
    )
    if linked:
        event.linked_cards.set(linked)
    return event


def import_backup(world, payload: dict) -> dict:
    """导入 world.json 备份：按原层级重建文档，并把时代与总时间线事件一并还原。"""
    if not isinstance(payload, dict) or "documents" not in payload:
        raise ValueError("这不是工作区导出的 world.json")

    created = 0
    doc_map: dict[int, Document] = {}           # 备份里的文档 id -> 新文档
    doc_items: list[tuple[dict, Document]] = []
    # 每个父节点下一次可用的排序号；只在该父节点第一次用到时数一次库
    next_positions: dict[int, int] = {}

    def take_position(parent: Document | None) -> int:
        key = parent.pk if parent is not None else 0
        if key not in next_positions:
            next_positions[key] = (
                parent.children.count() if parent is not None
                else world.documents.filter(parent__isnull=True).count()
            )
        value = next_positions[key]
        next_positions[key] = value + 1
        return value

    def build(item: dict, parent: Document | None) -> None:
        nonlocal created
        position = take_position(parent)
        document = Document.objects.create(
            world=world,
            parent=parent,
            document_type=item.get("type") or "card",
            name=(item.get("name") or "未命名")[:200],
            position=position,
            settings=item.get("settings") or {},
            cover=item.get("cover") or "",
        )
        card_payload = item.get("card")
        if card_payload:
            card, _ = Card.objects.get_or_create(document=document, defaults={"entity_type": document.entity_type})
            card.aliases = card_payload.get("aliases") or []
            card.blocks = normalize_blocks(card_payload.get("blocks") or [])
            card.body = "\n".join(b.get("text", "") for b in card.blocks if isinstance(b, dict))
            card.values = card_payload.get("values") or {}
            card.save()
        if item.get("id") is not None:
            doc_map[item.get("id")] = document
        doc_items.append((item, document))
        created += 1
        for child in item.get("children") or []:
            build(child, document)

    for root in payload.get("documents") or []:
        build(root, None)

    era_map = _import_eras(world, payload)
    timeline = WorldTimeline.for_world(world)
    imported: dict[int, TimelineEvent] = {}
    event_count = 0

    timeline_payload = payload.get("timeline")
    if isinstance(timeline_payload, dict):
        # 目标世界的总时间线还是空的时候才采纳备份里的坐标原点 / 视野设置
        if not timeline.events.exists():
            timeline.origin_year = _as_float(timeline_payload.get("origin_year"), timeline.origin_year)
            settings_ = timeline_payload.get("settings")
            timeline.settings = settings_ if isinstance(settings_, dict) else {}
            timeline.save(update_fields=["origin_year", "settings", "updated_at"])
        for item in timeline_payload.get("events") or []:
            if not isinstance(item, dict):
                continue
            event = _import_event(item, timeline, doc_map, era_map)
            if event is None:
                continue
            event_count += 1
            if item.get("id") is not None:
                imported[item.get("id")] = event

    # 旧备份没有 timeline 键：事件只随旧时间线文档一起导出，这里按 id 去重后补上
    for item, document in doc_items:
        for event_item in item.get("events") or []:
            if not isinstance(event_item, dict):
                continue
            if event_item.get("id") is not None and event_item.get("id") in imported:
                continue
            if _import_event(event_item, timeline, doc_map, era_map, document=document) is not None:
                event_count += 1

    return {"created": created, "folders": 0, "documents": [],
            "events": event_count, "eras": len(era_map)}
