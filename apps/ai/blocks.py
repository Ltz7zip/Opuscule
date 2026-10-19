# -*- coding: utf-8 -*-
"""AI 的块级编辑。

卡片正文有两套存储：

- ``blocks_doc`` 非空：BlockNote 原生 JSON 是权威副本；
- ``blocks_doc`` 为空：旧 ``blocks`` 是权威副本。

操作按块的 ``id`` 定位，应用时只改权威副本，再把派生结果（``blocks`` /
``body``）整体回写，所以两条路径不会各改一半。任何一条操作不合法都会在
保存前抛 :class:`BlockEditError`，整条改动不落地。
"""

from __future__ import annotations

import uuid

from apps.world.normalize import (
    MAX_BLOCK_TEXT,
    as_int,
    as_text,
    blocks_to_text,
    doc_to_blocks,
    normalize_blocks,
    normalize_doc,
)

MAX_OPERATIONS = 40
# 单次对话里允许一次删掉的块数上限：防止模型「清理全文」式的大范围破坏。
MAX_DELETES = 20
PREVIEW_TEXT_LIMIT = 160

# 模型可用的「规范类型」→ 两套存储各自的类型名
_LEGACY_TYPES = {
    "paragraph": "text",
    "heading": "heading",
    "quote": "quote",
    "bulleted": "bulleted",
    "numbered": "numbered",
    "todo": "todo",
    "code": "code",
    "callout": "callout",
    "divider": "divider",
}
_DOC_TYPES = {
    "paragraph": "paragraph",
    "heading": "heading",
    "quote": "quote",
    "bulleted": "bulletListItem",
    "numbered": "numberedListItem",
    "todo": "checkListItem",
    "code": "codeBlock",
    "callout": "callout",
    "divider": "divider",
}
_DOC_TO_CANONICAL = {value: key for key, value in _DOC_TYPES.items()}
_LEGACY_TO_CANONICAL = {value: key for key, value in _LEGACY_TYPES.items()}
_CONTENTLESS_DOC_TYPES = ("divider", "image", "bookmark", "card", "collection")

_TYPE_ALIASES = {
    "paragraph": "paragraph",
    "text": "paragraph",
    "heading": "heading",
    "quote": "quote",
    "bulleted": "bulleted",
    "bulletlistitem": "bulleted",
    "bullet": "bulleted",
    "numbered": "numbered",
    "numberedlistitem": "numbered",
    "number": "numbered",
    "todo": "todo",
    "checklistitem": "todo",
    "check": "todo",
    "code": "code",
    "codeblock": "code",
    "callout": "callout",
    "divider": "divider",
}


class BlockEditError(ValueError):
    """块操作不合法（找不到块 / 类型不认识 / 字段冲突）。"""


def _uses_doc(card) -> bool:
    return isinstance(card.blocks_doc, list) and bool(card.blocks_doc)


def _canonical_type(value) -> str:
    key = as_text(value, 40).lower().replace("_", "").replace("-", "").replace(" ", "")
    cleaned = _TYPE_ALIASES.get(key)
    if cleaned is None:
        raise BlockEditError(f"不认识的块类型：{value}")
    return cleaned


def _normalize_operations(operations) -> list[dict]:
    if not isinstance(operations, (list, tuple)) or not operations:
        raise BlockEditError("没有要修改的块")
    if len(operations) > MAX_OPERATIONS:
        raise BlockEditError(f"一次最多修改 {MAX_OPERATIONS} 个块")
    out = []
    for index, raw in enumerate(operations):
        if not isinstance(raw, dict):
            raise BlockEditError(f"第 {index + 1} 个操作格式不对")
        action = as_text(raw.get("action"), 20).lower() or "update"
        if action not in ("update", "delete", "insert"):
            raise BlockEditError(f"第 {index + 1} 个操作的 action 只能是 update / delete / insert")
        op: dict = {"action": action}
        if action in ("update", "delete"):
            op["block_id"] = as_text(raw.get("block_id"), 60)
            if not op["block_id"]:
                raise BlockEditError(f"第 {index + 1} 个操作缺少 block_id")
        if action == "insert":
            after = as_text(raw.get("after_block_id"), 60)
            if after:
                op["after_block_id"] = after
        if action != "delete":
            if raw.get("type") not in (None, ""):
                op["type"] = _canonical_type(raw.get("type"))
            if "text" in raw:
                op["text"] = as_text(raw.get("text"), MAX_BLOCK_TEXT)
            if "title" in raw:
                op["title"] = as_text(raw.get("title"), 300)
            if raw.get("heading_level") not in (None, ""):
                op["heading_level"] = max(1, min(as_int(raw.get("heading_level"), 1), 3))
            if raw.get("level") not in (None, ""):
                op["level"] = max(0, min(as_int(raw.get("level"), 0), 2))
        if action == "update" and len(op) == 2:
            raise BlockEditError(f"第 {index + 1} 个操作没有给出任何要修改的字段")
        out.append(op)
    deletes = sum(1 for op in out if op["action"] == "delete")
    if deletes > MAX_DELETES:
        raise BlockEditError(f"一次最多删除 {MAX_DELETES} 个块，请分批处理")
    return out


def _inline_text(value) -> list[dict]:
    text = as_text(value, MAX_BLOCK_TEXT)
    if not text:
        return []
    return [{"type": "text", "text": text, "styles": {}}]


def _inline_plain(content) -> str:
    """行内节点 → 纯文本，链接递归取内容。"""
    if not isinstance(content, (list, tuple)):
        return ""
    parts = []
    for node in content:
        if not isinstance(node, dict):
            continue
        if node.get("type") == "link":
            parts.append(_inline_plain(node.get("content")))
        else:
            parts.append(as_text(node.get("text"), MAX_BLOCK_TEXT))
    return "".join(parts)


# --------------------------------------------------------------------------- #
# 给模型看的块大纲
# --------------------------------------------------------------------------- #
def block_outline(card) -> list[dict]:
    """按文档顺序列出块，``id`` 就是接下来要操作的目标。"""
    out: list[dict] = []
    if _uses_doc(card):
        _walk_doc(card.blocks_doc, 0, out)
        return out
    for raw in normalize_blocks(card.blocks):
        entry = {"id": raw["id"], "type": raw["type"]}
        if raw.get("title"):
            entry["title"] = raw["title"]
        if raw.get("text"):
            entry["text"] = raw["text"]
        if raw.get("level"):
            entry["level"] = raw["level"]
        if raw.get("type") == "heading":
            entry["heading_level"] = raw.get("heading_level", 1)
        out.append(entry)
    return out


def _walk_doc(blocks, depth: int, out: list[dict]) -> None:
    if not isinstance(blocks, (list, tuple)):
        return
    for raw in blocks:
        if not isinstance(raw, dict):
            continue
        btype = raw.get("type")
        entry = {"id": as_text(raw.get("id"), 60), "type": _DOC_TO_CANONICAL.get(btype, btype)}
        text = _inline_plain(raw.get("content"))
        if text:
            entry["text"] = text
        if depth:
            entry["level"] = min(depth, 2)
        if btype == "heading":
            props = raw.get("props") if isinstance(raw.get("props"), dict) else {}
            entry["heading_level"] = max(1, min(as_int(props.get("level"), 1), 3))
        out.append(entry)
        _walk_doc(raw.get("children"), depth + 1, out)


# --------------------------------------------------------------------------- #
# 旧结构（legacy blocks）
# --------------------------------------------------------------------------- #
def _find_legacy(blocks, block_id: str) -> int:
    for index, block in enumerate(blocks):
        if isinstance(block, dict) and block.get("id") == block_id:
            return index
    raise BlockEditError(f"找不到块 {block_id}")


def _update_legacy(block: dict, op: dict) -> None:
    if "type" in op:
        legacy_type = _LEGACY_TYPES[op["type"]]
        block["type"] = legacy_type
        if legacy_type == "heading":
            # 标题文字在 text；块标题在标题块上没有渲染位置，折进正文。
            if op.get("text") is None and op.get("title") is None:
                block["text"] = block.get("title") or block.get("text") or ""
            block["title"] = ""
            block["heading_level"] = op.get("heading_level", block.get("heading_level") or 1)
            block.pop("html", None)
        else:
            block.pop("heading_level", None)

    if "title" in op:
        if block.get("type") == "heading":
            block["text"] = op["title"] or block.get("text") or ""
            block.pop("html", None)
        else:
            block["title"] = op["title"]
    if "text" in op:
        block["text"] = op["text"]
        block.pop("html", None)
    if "heading_level" in op:
        if block.get("type") != "heading":
            raise BlockEditError("heading_level 只能用于标题块（type=heading）")
        block["heading_level"] = op["heading_level"]
    if "level" in op:
        if op["level"]:
            block["level"] = op["level"]
        else:
            block.pop("level", None)


def _insert_legacy(blocks: list[dict], op: dict) -> dict:
    block_type = op.get("type") or "paragraph"
    legacy_type = _LEGACY_TYPES[block_type]
    block = {
        "id": f"ai{uuid.uuid4().hex[:10]}",
        "type": legacy_type,
        "title": "",
        "text": op.get("text", ""),
    }
    if legacy_type == "heading":
        block["text"] = op.get("text") or op.get("title") or ""
        block["heading_level"] = op.get("heading_level", 1)
    else:
        block["title"] = op.get("title", "")
        if op.get("level"):
            block["level"] = op["level"]
    index = len(blocks)
    if op.get("after_block_id"):
        index = _find_legacy(blocks, op["after_block_id"]) + 1
    blocks.insert(index, block)
    return block


def _apply_legacy(blocks: list[dict], op: dict) -> None:
    if op["action"] == "insert":
        _insert_legacy(blocks, op)
        return
    index = _find_legacy(blocks, op["block_id"])
    if op["action"] == "delete":
        blocks.pop(index)
        return
    _update_legacy(blocks[index], op)


# --------------------------------------------------------------------------- #
# 编辑器文档（BlockNote）
# --------------------------------------------------------------------------- #
def _find_doc(blocks, block_id: str, depth: int = 0):
    """返回 ``(同级列表, 下标, 块, 深度)``；找不到返回 ``None``。"""
    if not isinstance(blocks, (list, tuple)):
        return None
    for index, raw in enumerate(blocks):
        if not isinstance(raw, dict):
            continue
        if raw.get("id") == block_id:
            return blocks, index, raw, depth
        found = _find_doc(raw.get("children"), block_id, depth + 1)
        if found is not None:
            return found
    return None


def _require_doc(blocks, block_id: str):
    found = _find_doc(blocks, block_id)
    if found is None:
        raise BlockEditError(f"找不到块 {block_id}")
    return found


def _update_doc(block: dict, op: dict) -> None:
    if op.get("title"):
        raise BlockEditError("编辑器文档没有块标题：请把标题文字放进 text，或把 type 设为 heading")
    if "type" in op:
        doc_type = _DOC_TYPES[op["type"]]
        if doc_type != block.get("type"):
            block["type"] = doc_type
            block["props"] = {}
            block.setdefault("children", [])
    if "text" in op:
        if block.get("type") in _CONTENTLESS_DOC_TYPES:
            raise BlockEditError("这种块没有正文")
        block["content"] = _inline_text(op["text"])
    if "heading_level" in op:
        if block.get("type") != "heading":
            raise BlockEditError("heading_level 只能用于标题块（type=heading）")
        props = block.get("props") if isinstance(block.get("props"), dict) else {}
        props["level"] = op["heading_level"]
        block["props"] = props
    # ``level`` 是旧结构的缩进语义；编辑器文档用 children 表达嵌套，这里不处理。


def _insert_doc(blocks: list[dict], op: dict) -> dict:
    block_type = op.get("type") or "paragraph"
    doc_type = _DOC_TYPES[block_type]
    block = {
        "id": f"ai{uuid.uuid4().hex[:10]}",
        "type": doc_type,
        "props": {},
        "children": [],
    }
    if doc_type == "heading":
        block["props"]["level"] = op.get("heading_level", 1)
    elif doc_type == "checkListItem":
        block["props"]["checked"] = False
    elif doc_type == "codeBlock":
        block["props"]["language"] = "text"
    elif doc_type == "toggleListItem":
        block["props"]["collapsed"] = False
    if doc_type not in _CONTENTLESS_DOC_TYPES:
        block["content"] = _inline_text(op.get("text", ""))
    if op.get("after_block_id"):
        siblings, index, _block, _depth = _require_doc(blocks, op["after_block_id"])
        siblings.insert(index + 1, block)
    else:
        blocks.append(block)
    return block


def _apply_doc(doc: list[dict], op: dict) -> None:
    if op["action"] == "insert":
        _insert_doc(doc, op)
        return
    siblings, index, block, _depth = _require_doc(doc, op["block_id"])
    if op["action"] == "delete":
        # 删掉父块时把子块顶上来，别让嵌套内容跟着消失。
        children = block.get("children") if isinstance(block.get("children"), list) else []
        siblings[index:index + 1] = children
        return
    _update_doc(block, op)


# --------------------------------------------------------------------------- #
# 改动预览（给用户看 before → after）
# --------------------------------------------------------------------------- #
def _clip(value) -> str:
    text = as_text(value, MAX_BLOCK_TEXT)
    if len(text) > PREVIEW_TEXT_LIMIT:
        return text[: PREVIEW_TEXT_LIMIT - 1] + "…"
    return text


def _legacy_snapshot(block: dict) -> dict:
    raw_type = block.get("type")
    return {
        "type": _LEGACY_TO_CANONICAL.get(raw_type, raw_type or "paragraph"),
        "title": _clip(block.get("title")),
        "text": _clip(block.get("text")),
    }


def _doc_snapshot(block: dict) -> dict:
    raw_type = block.get("type")
    return {
        "type": _DOC_TO_CANONICAL.get(raw_type, raw_type or "paragraph"),
        "title": "",
        "text": _clip(_inline_plain(block.get("content"))),
    }


def _preview_legacy(blocks: list[dict], op: dict) -> dict:
    if op["action"] == "insert":
        block = _insert_legacy(blocks, op)
        return {
            "action": "insert",
            "after_block_id": op.get("after_block_id", ""),
            "after": _legacy_snapshot(block),
        }
    index = _find_legacy(blocks, op["block_id"])
    block = blocks[index]
    before = _legacy_snapshot(block)
    if op["action"] == "delete":
        blocks.pop(index)
        return {"action": "delete", "block_id": op["block_id"], "before": before}
    _update_legacy(block, op)
    return {
        "action": "update",
        "block_id": op["block_id"],
        "before": before,
        "after": _legacy_snapshot(block),
    }


def _preview_doc(doc: list[dict], op: dict) -> dict:
    if op["action"] == "insert":
        block = _insert_doc(doc, op)
        return {
            "action": "insert",
            "after_block_id": op.get("after_block_id", ""),
            "after": _doc_snapshot(block),
        }
    _siblings, _index, block, _depth = _require_doc(doc, op["block_id"])
    before = _doc_snapshot(block)
    if op["action"] == "delete":
        _apply_doc(doc, op)
        return {"action": "delete", "block_id": op["block_id"], "before": before}
    _update_doc(block, op)
    return {
        "action": "update",
        "block_id": op["block_id"],
        "before": before,
        "after": _doc_snapshot(block),
    }


def _ensure_not_empty(blocks) -> None:
    if not blocks:
        raise BlockEditError("不能删空正文：至少要保留一个块")


# --------------------------------------------------------------------------- #
# 对外入口
# --------------------------------------------------------------------------- #
def _prepare(card, operations):
    """在副本上跑完所有操作；任何一步失败都不会碰 ``card`` 的字段。"""
    ops = _normalize_operations(operations)
    if _uses_doc(card):
        doc = normalize_doc(card.blocks_doc)
        for op in ops:
            _apply_doc(doc, op)
        _ensure_not_empty(doc)
        return doc, None, len(ops)
    blocks = normalize_blocks(card.blocks)
    for op in ops:
        _apply_legacy(blocks, op)
    _ensure_not_empty(blocks)
    return None, blocks, len(ops)


def validate_operations(card, operations) -> int:
    """只校验不落库；返回操作条数。"""
    return _prepare(card, operations)[2]


def preview_operations(card, operations) -> list[dict]:
    """按顺序在副本上执行，返回每条操作的 before / after 快照。

    和 :func:`_prepare` 一样，任何一步失败都会抛 :class:`BlockEditError`，
    调用方应把它当作「整批不可用」处理。
    """
    ops = _normalize_operations(operations)
    preview: list[dict] = []
    if _uses_doc(card):
        doc = normalize_doc(card.blocks_doc)
        for op in ops:
            preview.append(_preview_doc(doc, op))
        _ensure_not_empty(doc)
        return preview
    blocks = normalize_blocks(card.blocks)
    for op in ops:
        preview.append(_preview_legacy(blocks, op))
    _ensure_not_empty(blocks)
    return preview


def apply_operations(card, operations) -> int:
    """把操作落到权威副本，并同步派生字段。"""
    doc, blocks, count = _prepare(card, operations)
    if doc is not None:
        card.blocks_doc = normalize_doc(doc)
        card.blocks = normalize_blocks(doc_to_blocks(card.blocks_doc))
    else:
        card.blocks = normalize_blocks(blocks)
        card.blocks_doc = []
    card.body = blocks_to_text(card.blocks)
    card.save(update_fields=["blocks_doc", "blocks", "body"])
    return count
