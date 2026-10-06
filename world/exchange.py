# -*- coding: utf-8 -*-
"""导入 / 导出：把世界搬得出去，也搬得进来。

* 导出：整个世界打包成 zip（每份文档一个 Markdown + 一份 world.json 备份 + 媒体清单），
  或者单独导出某份文档。
* 导入：Markdown（单文件 / 多文件 / zip / Obsidian 目录），可选 JSON 备份还原。
  ``[[双链]]`` 与 ``@提及`` 会尽量接成卡片链接；标题层级变区块标题。

设计取舍：导出格式以 **Markdown 为主、JSON 为备份**，跟 VVD 一样——
用户拿出去能用别的工具打开，回头还能原样导回来。
"""

from __future__ import annotations

import io
import json
import re
import zipfile
from typing import Iterable

from django.utils import timezone

from .models import Card, Document
from .normalize import normalize_blocks

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
        for event in document.events.all().order_by("year", "month", "day", "hour", "id"):
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


def document_payload(document: Document) -> dict:
    """单份文档的 JSON（导回来时能原样重建）。"""
    data = document.to_payload(with_card=False)
    card = getattr(document, "card", None)
    if card is not None:
        data["card"] = card.to_payload()
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


def world_backup(world) -> dict:
    """整世界 JSON 备份：类型 + 纪元 + 日历 + 文档树（递归）。"""
    def walk(document: Document) -> dict:
        item = document_payload(document)
        item["children"] = [walk(child) for child in document.children.filter(deleted_at__isnull=True).order_by("position", "id")]
        return item

    roots = world.documents.filter(parent__isnull=True, deleted_at__isnull=True).order_by("position", "id")
    return {
        "format": "worldbuilding-timeline/backup",
        "version": 1,
        "exported_at": timezone.now().isoformat(),
        "world": world.to_payload(),
        "types": [t.to_payload(with_properties=True) for t in world.types.all()],
        "eras": [e.to_payload() for e in world.eras.all()],
        "calendars": [c.to_payload() for c in world.calendars.all()],
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
            "- `documents/`：每份文档一个 Markdown，方便拿去别的工具\n"
            "- `media/`：媒体清单（真正的图片仍在原来的地址）\n"
        ))
        for root in world.documents.filter(parent__isnull=True, deleted_at__isnull=True).order_by("position", "id"):
            stack = [(root, "")]
            while stack:
                document, prefix = stack.pop(0)
                folder = f"documents/{prefix}" if prefix else "documents"
                archive.writestr(f"{folder}/{unique(document.name)}", document_markdown(document))
                for child in document.children.filter(deleted_at__isnull=True).order_by("position", "id"):
                    stack.append((child, f"{prefix}{document.name}/" if prefix else f"{document.name}/"))
        media = [doc.cover for doc in world.documents.all() if doc.cover]
        archive.writestr("media/index.md", "# 媒体\n\n" + "\n".join(f"- {url}" for url in dict.fromkeys(media)))
    return buffer.getvalue()


# --------------------------------------------------------------------------- #
# 导入
# --------------------------------------------------------------------------- #
WIKI_LINK = re.compile(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]")


def _link_mentions(html: str, world) -> str:
    """把 ``[[卡片名]]`` 变成指向卡片的提及（找不到就留纯文本）。"""
    if "[[" not in html:
        return html

    def replace(match: re.Match) -> str:
        name = match.group(1).strip()
        label = (match.group(2) or name).strip()
        document = world.documents.filter(name__iexact=name, deleted_at__isnull=True).first()
        if document is None:
            document = next((c.document for c in Card.objects.filter(document__world=world)
                             if name in (c.aliases or [])), None)
        if document is None:
            return label
        return f'<span class="mentions-inline" data-target="{document.id}">{label}</span>'

    return WIKI_LINK.sub(replace, html)


def markdown_to_blocks(text: str, world) -> list[dict]:
    """Markdown -> 区块数组。``##`` 起新块，``>`` 引用/提示框，``---`` 分隔线。"""
    blocks: list[dict] = []
    current: dict | None = None
    buffer: list[str] = []

    def flush() -> None:
        nonlocal current, buffer
        if current is None:
            return
        body = "\n".join(buffer).strip()
        current["html"] = _link_mentions(_paragraph_html(body), world)
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
    order = world.documents.filter(parent=parent).count()

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
            order_now = (node.children.count() if node else world.documents.filter(parent__isnull=True).count())
            created = Document.objects.create(
                world=world, parent=node, document_type="folder", name=part[:200], position=order_now,
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
        position = parent_doc.children.count() if parent_doc else world.documents.filter(parent__isnull=True).count()
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


def import_backup(world, payload: dict) -> dict:
    """导入 world.json 备份：按原层级重建文档。"""
    if not isinstance(payload, dict) or "documents" not in payload:
        raise ValueError("这不是工作区导出的 world.json")

    created = 0

    def build(item: dict, parent: Document | None) -> None:
        nonlocal created
        position = (parent.children.count() if parent else world.documents.filter(parent__isnull=True).count())
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
        created += 1
        for child in item.get("children") or []:
            build(child, document)

    for root in payload.get("documents") or []:
        build(root, None)
    return {"created": created, "folders": 0, "documents": []}
