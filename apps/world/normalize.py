# -*- coding: utf-8 -*-
"""取值规则：属性值的清洗、公式求值、引用解析、区块与正文的互转。

模型（``world.models``）只负责把数据存起来，**「什么样的输入算合法」这一层判断全部收在这里**。
好处是接口、admin、导入脚本这些写入路径都调用同一套函数，同一份输入永远得到同一份规范化结果，
不会出现「从接口存进去的值和从导入脚本存进去的不一样」。

模块大致分四块：

* **基础清洗**（``as_text`` / ``as_number`` / ``as_int`` / ``as_alias_list``）：把任意输入收敛成
  文本 / 数字 / 别名列表，超长按上限截断。
* **公式**（``evaluate_formula``）：把 ``@[属性名] * @[属性名]`` 这种表达式求成一个数字。
  自己用 ``ast`` 走一遍白名单求值，不碰 ``eval``，免得公式变成注入入口。
* **属性值**（``coerce_property_value`` / ``resolve_card_values``）：按属性的值类型清洗单个值，
  并把卡片的原始值解析成前端直接能用的形态（引用带目标摘要、公式算出数字）。
* **区块与正文**（``normalize_blocks`` / ``blocks_to_text``）：把 contenteditable 送来的区块数组
  规整成固定结构，同时派生一份纯文本投影，给搜索、字数与自动识别复用。

正文里的 HTML 交给 ``world.sanitize`` 做白名单净化，本模块只负责结构。
"""

from __future__ import annotations

import ast
import operator
import re

from .services.sanitize import clean_html, html_to_text

from .models import (
    VT_DATE,
    VT_FORMULA,
    VT_MULTISELECT,
    VT_NUMBER,
    VT_REFERENCE,
    VT_SELECT,
    VT_TEXT,
)

# 属性值的长度上限（超长直接截断，避免把整篇正文塞进一个属性）
MAX_TEXT = 2000
MAX_ALIAS = 120
MAX_BLOCKS = 400
MAX_BLOCK_TEXT = 20000

FORMULA_TOKEN = re.compile(r"@\[([^\]\n]{1,60})\]")

# 公式里允许的运算
_BIN_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}
_UNARY_OPS = {ast.UAdd: operator.pos, ast.USub: operator.neg}


class ValueErrorCN(ValueError):
    """带中文提示的取值错误，接口层直接回给前端。"""


# --------------------------------------------------------------------------- #
# 基础清洗
# --------------------------------------------------------------------------- #
def as_text(value, limit: int = MAX_TEXT) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        text = format(value, "g")
    elif isinstance(value, (list, tuple)):
        text = ", ".join(as_text(v, limit) for v in value)
    elif isinstance(value, dict):
        text = as_text(value.get("text") or value.get("label") or "", limit)
    else:
        text = str(value)
    text = text.strip()
    return text[:limit]


def as_number(value):
    """能转成数字就转，否则 None（表单里空字符串表示「没填」）。"""
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return value
    match = re.search(r"-?\d+(?:\.\d+)?", str(value).replace(",", ""))
    return float(match.group()) if match else None


def as_int(value, default: int = 0) -> int:
    num = as_number(value)
    return default if num is None else int(num)


def as_alias_list(value) -> list[str]:
    """别名列表：去空、去重、限量。"""
    if value is None:
        return []
    if isinstance(value, str):
        items = re.split(r"[,\n、，]", value)
    elif isinstance(value, (list, tuple)):
        items = list(value)
    else:
        items = [value]
    out, seen = [], set()
    for item in items:
        text = as_text(item, MAX_ALIAS)
        key = text.casefold()
        if text and key not in seen:
            seen.add(key)
            out.append(text)
    return out[:30]


# --------------------------------------------------------------------------- #
# 公式
# --------------------------------------------------------------------------- #
def _safe_eval(node, lookup):
    """只允许数字与四则运算的极简求值器（不用 eval，避免注入）。"""
    if isinstance(node, ast.Expression):
        return _safe_eval(node.body, lookup)
    if isinstance(node, ast.Constant):
        if isinstance(node.value, bool) or not isinstance(node.value, (int, float)):
            raise ValueErrorCN("公式里只能出现数字")
        return float(node.value)
    if isinstance(node, ast.BinOp) and type(node.op) in _BIN_OPS:
        left = _safe_eval(node.left, lookup)
        right = _safe_eval(node.right, lookup)
        if isinstance(node.op, ast.Pow) and abs(right) > 8:
            raise ValueErrorCN("公式的幂次过大")
        return _BIN_OPS[type(node.op)](left, right)
    if isinstance(node, ast.UnaryOp) and type(node.op) in _UNARY_OPS:
        return _UNARY_OPS[type(node.op)](_safe_eval(node.operand, lookup))
    if isinstance(node, ast.Name):
        if node.id not in lookup:
            raise ValueErrorCN(f"公式里没有「{node.id}」这个属性")
        return lookup[node.id]
    raise ValueErrorCN("公式只支持数字与 + - * / ( )")


def evaluate_formula(expression: str, values_by_name: dict):
    """求值 ``@[Price] * @[Rarity]`` 这类公式；缺值或非法时返回 None（前端显示空）。

    流程：先把每个 ``@[属性名]`` 替换成它当前的数字（名字要能在 ``values_by_name`` 里找到、
    且能转成数字），再把替换后的算式交给 ``_safe_eval`` 逐节点求值。
    任何一步不成立（名字缺失、不是数字、算式语法错、结果是 NaN / inf）都返回 None，
    不抛异常——公式是给用户随手写的，算不出来就显示空，别让整张卡片渲染失败。
    """
    if not expression or not expression.strip():
        return None

    def replace(match):
        name = match.group(1).strip()
        number = as_number(values_by_name.get(name))
        if number is None:
            raise ValueErrorCN(f"「{name}」还不是数字")
        return repr(float(number))

    try:
        source = FORMULA_TOKEN.sub(replace, expression)
        tree = ast.parse(source, mode="eval")
        result = _safe_eval(tree, {})
    except ValueErrorCN:
        return None
    except Exception:  # 语法错误等一律当作「算不出来」
        return None
    if result != result or result in (float("inf"), float("-inf")):  # NaN / inf
        return None
    return result


# --------------------------------------------------------------------------- #
# 属性值
# --------------------------------------------------------------------------- #
def coerce_property_value(prop, raw, world=None):
    """按属性的值类型清洗一个值；非法就抛 ``ValueErrorCN``。"""
    vtype = prop.value_type

    if vtype == VT_FORMULA:
        return None  # 公式列不接受手填

    if vtype == VT_NUMBER:
        if raw in (None, ""):
            return None
        number = as_number(raw)
        if number is None:
            raise ValueErrorCN(f"「{prop.name}」需要一个数字")
        return number

    if vtype == VT_DATE:
        if not raw:
            return None
        if isinstance(raw, dict):
            return {
                "year": as_int(raw.get("year")),
                "month": max(1, as_int(raw.get("month"), 1)),
                "day": max(1, as_int(raw.get("day"), 1)),
            }
        return {"year": as_int(raw), "month": 1, "day": 1}

    if vtype == VT_SELECT:
        if raw in (None, ""):
            return ""
        label = as_text(raw, 120)
        if prop.option_labels and label not in prop.option_labels:
            # 允许就地新建选项：不在已有选项里也收下，顺手补进选项表，
            # 下次同名列就有候选（省得用户先去类型面板加一项再回来选）
            options = list(prop.options or [])
            options.append({"label": label, "color": ""})
            prop.options = options
            prop.save(update_fields=["options"])
        return label

    if vtype == VT_MULTISELECT:
        if raw in (None, ""):
            return []
        items = raw if isinstance(raw, (list, tuple)) else [raw]
        out = []
        for item in items:
            label = as_text(item, 120)
            if label and label not in out:
                if prop.option_labels and label not in prop.option_labels:
                    options = list(prop.options or [])
                    options.append({"label": label, "color": ""})
                    prop.options = options
                    prop.save(update_fields=["options"])
                out.append(label)
        return out

    if vtype == VT_REFERENCE:
        if raw in (None, "", []):
            return None
        target_id = as_int(raw)
        if not target_id:
            return None
        if world is not None:
            exists = world.documents.filter(pk=target_id, deleted_at__isnull=True).exists()
            if not exists:
                raise ValueErrorCN(f"「{prop.name}」引用的卡片不在这个世界里")
        return target_id

    return as_text(raw)  # 文本


def build_value_map(card) -> dict:
    """把卡片的原始值整理成 {属性名: 值}，公式求值用。"""
    entity_type = card.effective_type()
    raw = card.values if isinstance(card.values, dict) else {}
    out = {}
    if entity_type is None:
        return out
    for prop in entity_type.all_properties():
        out[prop.name] = raw.get(str(prop.id), prop.default_value)
    return out


def resolve_card_values(card) -> dict:
    """前端直接可用的属性值：``{属性id: {name, value_type, value, display}}``。

    引用会带上目标卡片的摘要，公式会算出数字——前端不用再懂类型。
    """
    entity_type = card.effective_type()
    if entity_type is None:
        return {}
    raw = card.values if isinstance(card.values, dict) else {}
    by_name = {}
    for prop in entity_type.all_properties():
        by_name[prop.name] = raw.get(str(prop.id), prop.default_value)

    resolved = {}
    for prop in entity_type.all_properties():
        value = by_name.get(prop.name)
        display = ""
        extra = {}
        if prop.value_type == VT_REFERENCE and value:
            target = card.document.world.documents.filter(pk=as_int(value)).first()
            if target is not None:
                extra = {"ref": {"id": target.id, "name": target.name, "type": target.document_type}}
                display = target.name
            else:
                display = "无法访问的卡片"
        elif prop.value_type == VT_FORMULA:
            value = evaluate_formula(prop.formula, by_name)
            display = "" if value is None else format(value, "g")
        elif prop.value_type == VT_MULTISELECT:
            value = value if isinstance(value, list) else ([] if not value else [value])
            display = "、".join(as_text(v, 120) for v in value)
        elif prop.value_type == VT_NUMBER:
            value = as_number(value)
            display = "" if value is None else format(value, "g")
        elif prop.value_type == VT_DATE:
            if isinstance(value, dict):
                display = f"{as_int(value.get('year'))} 年 {as_int(value.get('month'), 1)} 月"
            else:
                value = None
        else:
            value = as_text(value, 400)
            display = value

        resolved[str(prop.id)] = {
            "name": prop.name,
            "value_type": prop.value_type,
            "value": value,
            "display": display,
            "inherited": prop.entity_type_id != entity_type.id,
            **extra,
        }
    return resolved


def default_values_for(entity_type) -> dict:
    """新建卡片时按类型定义铺一份默认值。"""
    if entity_type is None:
        return {}
    out = {}
    for prop in entity_type.all_properties():
        if prop.default_value not in (None, "", []):
            out[str(prop.id)] = prop.default_value
    return out


# --------------------------------------------------------------------------- #
# 区块与正文
# --------------------------------------------------------------------------- #
BLOCK_TYPES = ("text", "heading", "quote", "divider", "callout", "media", "tool",
               "table", "todo", "card", "image", "embed", "toggle",
               "code", "bulleted", "numbered", "bookmark", "collection")


def normalize_blocks(value) -> list[dict]:
    """区块数组：保证每块有 id/type，文本类块带 text。"""
    if not isinstance(value, (list, tuple)):
        return []
    out = []
    for index, raw in enumerate(list(value)[:MAX_BLOCKS]):
        if not isinstance(raw, dict):
            continue
        btype = as_text(raw.get("type"), 20) or "text"
        if btype not in BLOCK_TYPES:
            btype = "text"
        # 正文可以带 HTML（粗体 / 斜体 / 列表…）：过白名单后存 html，
        # 同时派生一份纯文本 text，给搜索、字数与自动识别用。
        html = clean_html(raw.get("html"))
        plain = as_text(raw.get("text"), MAX_BLOCK_TEXT)
        if html:
            plain = html_to_text(html)[:MAX_BLOCK_TEXT]
        block = {
            "id": as_text(raw.get("id"), 40) or f"b{index + 1}",
            "type": btype,
            "title": as_text(raw.get("title"), 200),
            "text": plain,
            "hidden": bool(raw.get("hidden")),
        }
        if html:
            block["html"] = html
        comments = normalize_block_comments(raw.get("comments"))
        if comments:
            block["comments"] = comments
        for key in ("url", "tool", "settings", "items", "level"):
            if key in raw and raw.get(key) not in (None, "", []):
                block[key] = raw.get(key)
        if raw.get("collapsed"):
            block["collapsed"] = True               # 折叠的块（toggle）
        if raw.get("checked"):
            block["checked"] = True                 # 打勾的块（todo）
        if btype in ("card", "image", "embed", "bookmark"):
            settings_ = block.get("settings") if isinstance(block.get("settings"), dict) else {}
            clean_settings = {}
            if btype == "card":
                target = settings_.get("document") or raw.get("url")
                if str(target or "").lstrip("-").isdigit():
                    clean_settings["document"] = int(target)
            if btype in ("image", "embed", "bookmark"):
                clean_settings["url"] = as_text(settings_.get("url") or raw.get("url"), 4000)
                clean_settings["caption"] = as_text(settings_.get("caption"), 300)
            # 这三个类型的 settings 必须以清洗结果为准，别让脏数据透传
            if clean_settings:
                block["settings"] = clean_settings
            else:
                block.pop("settings", None)
        out.append(block)
    return out


MAX_BLOCK_COMMENTS = 50
MAX_COMMENT_TEXT = 2000


def normalize_block_comments(value) -> list[dict]:
    """块评论：正文当纯文本存（不给评论开富文本，省得又一条 XSS 面）。"""
    if not isinstance(value, (list, tuple)):
        return []
    out = []
    for index, raw in enumerate(list(value)[:MAX_BLOCK_COMMENTS]):
        if not isinstance(raw, dict):
            continue
        text = html_to_text(as_text(raw.get("text"), MAX_COMMENT_TEXT)).strip()
        if not text:
            continue
        out.append({
            "id": as_text(raw.get("id"), 40) or f"c{index + 1}",
            "author": as_text(raw.get("author"), 80) or "我",
            "text": text,
            "at": as_text(raw.get("at"), 40),
            "resolved": bool(raw.get("resolved")),
        })
    return out


def blocks_to_text(blocks) -> str:
    """区块正文的纯文本投影：搜索、自动识别、字数统计都用它。"""
    if not isinstance(blocks, (list, tuple)):
        return ""
    parts = []
    for block in blocks:
        if not isinstance(block, dict):
            continue
        if block.get("hidden"):
            continue
        text = as_text(block.get("text"), MAX_BLOCK_TEXT) or html_to_text(block.get("html", ""))
        title = as_text(block.get("title"), 200)
        if title:
            parts.append(title)
        if text:
            parts.append(text)
        items = block.get("items")
        if isinstance(items, (list, tuple)):
            parts.extend(as_text(i, 500) for i in items if as_text(i, 500))
    return "\n".join(parts)


def card_search_text(card) -> str:
    """卡片进搜索索引的文本：标题 + 别名 + 正文 + 属性值。"""
    from apps.documents.models import Document

    document: Document = card.document
    chunks = [document.name]
    chunks += as_alias_list(card.aliases)
    if card.body:
        chunks.append(card.body)
    else:
        chunks.append(blocks_to_text(card.blocks))
    for entry in resolve_card_values(card).values():
        if entry.get("display"):
            chunks.append(str(entry["display"]))
    return "\n".join(c for c in chunks if c)
