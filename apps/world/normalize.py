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
* **编辑器文档**（``blocks_to_doc`` / ``doc_to_blocks`` / ``normalize_doc``）：React 编辑器孤岛
  （BlockNote）的原生 JSON 与上面那套区块结构互转——读旧数据时惰性升格，存新数据时派生回区块。

正文里的 HTML 交给 ``world.sanitize`` 做白名单净化，本模块只负责结构。
"""

from __future__ import annotations

import ast
import json
import operator
import re

from html import escape
from html.parser import HTMLParser

from .services.sanitize import SAFE_SCHEMES, clean_html, html_to_text

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


# --------------------------------------------------------------------------- #
# 编辑器文档（BlockNote 原生 JSON）
# --------------------------------------------------------------------------- #
# 一期只搬得动这 10 种块。孤岛的 React 侧必须用**同一份白名单**注册 blockSpec，
# 否则斜杠菜单会放出 image/table 之类，用户一建就被这里的 normalize_doc 丢掉。
# 前 10 种是「原生映射」；后 4 种是「重块」——孤岛里只放一个容器，真正的 DOM 交给
# 桥接层用旧的 vanilla 渲染器画（见 TECHNO §8.4），所以这里只要保住它的 props。
_DOC_BLOCK_TYPES = ("paragraph", "heading", "quote", "bulletListItem",
                    "numberedListItem", "checkListItem", "codeBlock", "divider",
                    "toggleListItem", "callout",
                    "image", "bookmark", "card", "collection")

# 没有行内正文的块：divider 是纯装饰，四种重块的数据全在 props 里。
_DOC_CONTENTLESS = ("divider", "image", "bookmark", "card", "collection")

# 旧结构 → 孤岛；反向表由它推导，免得两处手写漂移。
_LEGACY_TO_DOC = {
    "text": "paragraph",
    "heading": "heading",
    "quote": "quote",
    "bulleted": "bulletListItem",
    "numbered": "numberedListItem",
    "todo": "checkListItem",
    "code": "codeBlock",
    "divider": "divider",
    "toggle": "toggleListItem",
    "callout": "callout",
    "image": "image",
    "bookmark": "bookmark",
    "card": "card",
    "collection": "collection",
}
_DOC_TO_LEGACY = {doc: legacy for legacy, doc in _LEGACY_TO_DOC.items()}

# 重块类型（孤岛里嵌现有渲染器）。media / tool / table / embed 是**文档级**类型
# （整篇文档即一张表 / 一个嵌入工具），没有块级渲染分支，故不在此列 —— 它们会让
# blocks_to_doc 整体返回 None，整卡照样退回 vanilla，零数据丢失。
_HEAVY_BLOCK_TYPES = ("image", "bookmark", "card", "collection")
# 这两个的旧 ``title`` 没有对应字段，折进 caption，别为它多补一个承接段落。
_HEAVY_TITLE_FOLDS = ("image", "bookmark")
_COLLECTION_VIEW_KEYS = ("table", "board", "list", "timeline", "calendar", "gallery")
_COLLECTION_SETTINGS_MAX = 2000

# BlockNote 的行内布尔样式只有这几种；颜色 / 对齐是**块 props**，不在这里。
_INLINE_STYLES = ("bold", "italic", "underline", "strike", "code")
_INLINE_TAG_STYLES = {
    "b": "bold", "strong": "bold",
    "i": "italic", "em": "italic",
    "u": "underline",
    "s": "strike", "strike": "strike", "del": "strike",
    "code": "code",
}

_ALIGNMENTS = ("left", "center", "right", "justify")
_COLOR_NAMES = ("default", "gray", "brown", "red", "orange", "yellow",
                "green", "blue", "purple", "pink")
_HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")

# 嵌套（Tab 缩进）的层数上限——目录树是递归的，客户端也能伪造，得有个底。
_DOC_MAX_DEPTH = 6


def _safe_color(value) -> str:
    """颜色只认 BlockNote 的具名色或 ``#rrggbb``，其余一律丢弃。

    颜色留在 ``blocks_doc`` 里（派生 HTML 不写颜色——sanitize 会剥 ``style``），
    所以这里只做校验，不做名字到色值的映射。
    """
    text = as_text(value, 20).lower()
    if text in _COLOR_NAMES:
        return text
    if _HEX_COLOR.match(text):
        return text
    return ""


def _safe_href(value) -> str:
    """链接目标必须落在 ``SAFE_SCHEMES`` 里，否则视作没有链接。"""
    href = as_text(value, 4000).strip()
    if href and href.startswith(SAFE_SCHEMES):
        return href
    return ""


def _inline_from_text(text) -> list[dict]:
    """纯文本 → 单个文本节点。"""
    text = as_text(text, MAX_BLOCK_TEXT)
    if not text:
        return []
    return [{"type": "text", "text": text, "styles": {}}]


class _InlineParser(HTMLParser):
    """把一段块内联 HTML 摊成 BlockNote 的行内内容数组。

    只认行内样式和链接；``br`` 变换行。嵌套里最内层是链接时，节点挂进链接的
    ``content``，这样 ``<a><b>x</b></a>`` 不会把链接拆散。
    """

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.nodes: list[dict] = []
        self.styles: list[str] = []
        self.links: list[dict] = []

    def _container(self) -> list:
        return self.links[-1]["content"] if self.links else self.nodes

    def _current_styles(self) -> dict:
        return {name: True for name in self.styles}

    def handle_starttag(self, tag, attrs):
        if tag == "br":
            self._container().append({"type": "text", "text": "\n", "styles": {}})
            return
        if tag == "a":
            node = {"type": "link", "href": _safe_href(dict(attrs).get("href")), "content": []}
            self._container().append(node)
            self.links.append(node)
            return
        style = _INLINE_TAG_STYLES.get(tag)
        if style and style not in self.styles:
            self.styles.append(style)

    def handle_endtag(self, tag):
        if tag == "a":
            if self.links:
                self.links.pop()
            return
        style = _INLINE_TAG_STYLES.get(tag)
        if style in self.styles:
            self.styles.remove(style)

    def handle_data(self, data):
        if not data:
            return
        self._container().append({"type": "text", "text": data, "styles": self._current_styles()})


def html_to_inline_content(raw_html) -> list[dict]:
    """块内联 HTML → 行内内容数组；解析失败就退化成纯文本。"""
    raw = as_text(raw_html, MAX_BLOCK_TEXT)
    if not raw:
        return []
    parser = _InlineParser()
    try:
        parser.feed(raw)
        parser.close()
    except Exception:
        return _inline_from_text(html_to_text(raw))
    return parser.nodes or _inline_from_text(html_to_text(raw))


def _plain_from_inline(content) -> str:
    """行内内容数组 → 纯文本（链接递归取内文）。"""
    parts = []
    for node in content if isinstance(content, (list, tuple)) else []:
        if not isinstance(node, dict):
            continue
        if node.get("type") == "link":
            parts.append(_plain_from_inline(node.get("content")))
        else:
            parts.append(as_text(node.get("text"), MAX_BLOCK_TEXT))
    return "".join(parts)


def inline_content_to_html(content) -> str:
    """行内内容数组 → 块内联 HTML（只产白名单标签，跟 sanitize 对齐）。"""
    out = []
    for node in content if isinstance(content, (list, tuple)) else []:
        if not isinstance(node, dict):
            continue
        if node.get("type") == "link":
            inner = inline_content_to_html(node.get("content"))
            href = _safe_href(node.get("href"))
            out.append(f'<a href="{escape(href, quote=True)}">{inner}</a>' if href else inner)
            continue
        text = escape(as_text(node.get("text"), MAX_BLOCK_TEXT), quote=False)
        if not text:
            continue
        text = text.replace("\n", "<br>")
        styles = node.get("styles") if isinstance(node.get("styles"), dict) else {}
        if styles.get("code"):
            text = f"<code>{text}</code>"
        if styles.get("bold"):
            text = f"<strong>{text}</strong>"
        if styles.get("italic"):
            text = f"<em>{text}</em>"
        if styles.get("underline"):
            text = f"<u>{text}</u>"
        if styles.get("strike"):
            text = f"<s>{text}</s>"
        out.append(text)
    return "".join(out)


def _doc_block(bid, btype, props=None, content=None, children=None) -> dict:
    """拼一个 BlockNote 块。``content=None`` 时不输出 ``content`` 键（divider 用）。"""
    block = {"id": bid, "type": btype, "props": dict(props or {})}
    if content is not None:
        block["content"] = content
    block["children"] = list(children or [])
    return block


def _normalize_collection_settings(value) -> str:
    """collection 的 settings 收敛成一个规范化 JSON **字符串**。

    BlockNote 的块 props 只认 boolean / number / string，装不下嵌套 dict，所以
    序列化成字符串存；这里做白名单清洗（免得任意 JSON 被塞进 blocks_doc）。
    ``settings`` 传进来时可能是字符串（已存过的文档）或 dict（刚由旧结构升格）。
    """
    raw = value
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except (TypeError, ValueError):
            return ""
    if not isinstance(raw, dict):
        return ""
    out = {}
    entity_type = as_int(raw.get("entity_type"), 0)
    if entity_type:
        out["entity_type"] = entity_type
    view = as_text(raw.get("view"), 20)
    if view in _COLLECTION_VIEW_KEYS:
        out["view"] = view
    columns = raw.get("columns")
    if isinstance(columns, (list, tuple)):
        out["columns"] = [text for text in (as_text(c, 40) for c in list(columns)[:60]) if text]
    for key in ("sort", "filter"):
        item = raw.get(key)
        if not isinstance(item, dict) or not as_int(item.get("id"), 0):
            continue
        entry = {"id": as_int(item.get("id"), 0)}
        if key == "sort":
            entry["dir"] = "desc" if item.get("dir") == "desc" else "asc"
        else:
            entry["text"] = as_text(item.get("text"), 300)
        out[key] = entry
    if not out:
        return ""
    return json.dumps(out, ensure_ascii=False)[:_COLLECTION_SETTINGS_MAX]


def _heavy_block_to_doc(bid, btype, raw, title) -> dict:
    """重块：旧 ``settings`` → 孤岛的分散 props（image / bookmark / card / collection）。"""
    settings = raw.get("settings") if isinstance(raw.get("settings"), dict) else {}
    if btype == "card":
        target = settings.get("document") or raw.get("url")
        document_id = int(target) if str(target or "").lstrip("-").isdigit() else 0
        return _doc_block(bid, "card", props={"document": document_id})
    if btype == "collection":
        return _doc_block(bid, "collection",
                          props={"settings": _normalize_collection_settings(settings)})
    url = as_text(settings.get("url") or raw.get("url"), 4000)
    caption = as_text(settings.get("caption"), 300) or title
    return _doc_block(bid, btype, props={"url": url, "caption": caption})


def _heavy_block_to_legacy(bid, legacy_type, props, depth) -> dict:
    """重块反向：孤岛 props → 旧 ``settings``（与 :func:`_heavy_block_to_doc` 对偶）。"""
    block = {"id": bid, "type": legacy_type, "title": "", "text": ""}
    if depth:
        block["level"] = min(depth, 2)
    if legacy_type == "card":
        document_id = as_int(props.get("document"), 0)
        if document_id:
            block["settings"] = {"document": document_id}
    elif legacy_type == "collection":
        settings = _normalize_collection_settings(props.get("settings"))
        if settings:
            block["settings"] = json.loads(settings)
    else:
        block["settings"] = {"url": as_text(props.get("url"), 4000),
                            "caption": as_text(props.get("caption"), 300)}
    return block


def blocks_to_doc(blocks):
    """旧区块数组 → 编辑器文档；**搬不进孤岛的块会返回 ``None``**。

    返回 ``None`` 时前端回退旧的 vanilla 渲染器——所以这里只放行「完全表达得了」
    的卡：块类型在白名单内、不隐藏、没有块评论。缩进（``level``）改写成编辑器
    原生的 ``children`` 嵌套；旧结构里只能往上顶 2 层，编辑器没有这个上限。
    """
    if not isinstance(blocks, (list, tuple)):
        return []
    out = []
    # 祖先链：``stack[d-1]`` 是深度 d 的父块，用来把扁平 ``level`` 还原成树。
    stack: list[dict] = []
    for index, raw in enumerate(list(blocks)[:MAX_BLOCKS]):
        if not isinstance(raw, dict):
            continue
        btype = as_text(raw.get("type"), 20) or "text"
        mapped = _LEGACY_TO_DOC.get(btype)
        if mapped is None:
            return None
        if raw.get("hidden") or raw.get("comments"):
            return None
        # 折叠是 toggle 的专属状态，别的块带 collapsed 说明数据脏了，整体退回。
        if raw.get("collapsed") and btype != "toggle":
            return None
        try:
            level = int(raw.get("level") or 0)
        except (TypeError, ValueError):
            level = 0
        # 跳级（父层不存在）就贴到现有的最深父块下，depth==0 即顶层。
        depth = min(max(level, 0), _DOC_MAX_DEPTH, len(stack))
        bid = as_text(raw.get("id"), 40) or f"b{index + 1}"
        title = as_text(raw.get("title"), 200)
        text = as_text(raw.get("text"), MAX_BLOCK_TEXT)
        html = raw.get("html")
        nodes = []
        # 旧结构里标题是块级的，孤岛没有这个字段：在正文块**之前**补一个段落承接。
        # 新卡默认块正是 {type:'text', title:'概览'}，不补的话几乎没卡进得了孤岛。
        if title and btype != "heading" and btype not in _HEAVY_TITLE_FOLDS:
            nodes.append(_doc_block(f"{bid}-t", "paragraph", content=_inline_from_text(title)))
        if btype in _HEAVY_BLOCK_TYPES:
            # 重块：孤岛里只有一个容器，真正的 DOM 交给桥接层用旧渲染器画。
            nodes.append(_heavy_block_to_doc(bid, btype, raw, title))
        elif btype == "divider":
            nodes.append(_doc_block(bid, "divider"))
        elif btype == "code":
            # 代码块只收纯文本，别把 highlight 的 <span> 当富文本带进来。
            content = _inline_from_text(text or html_to_text(html or ""))
            nodes.append(_doc_block(bid, mapped, content=content))
        else:
            if html:
                content = html_to_inline_content(html)
            else:
                content = _inline_from_text(text or (title if btype == "heading" else ""))
            if btype == "heading":
                nodes.append(_doc_block(bid, "heading", props={"level": 1}, content=content))
            elif btype == "todo":
                nodes.append(_doc_block(bid, "checkListItem",
                                        props={"checked": bool(raw.get("checked"))}, content=content))
            elif btype == "toggle":
                nodes.append(_doc_block(bid, "toggleListItem",
                                        props={"collapsed": bool(raw.get("collapsed"))}, content=content))
            else:
                nodes.append(_doc_block(bid, mapped, content=content))
        # 标题承接段与正文块同深度并列，故整批共用一次 depth。
        for node in nodes:
            if depth == 0:
                out.append(node)
            else:
                stack[depth - 1]["children"].append(node)
            stack = stack[:depth] + [node]
    return out


def _normalize_inline_content(value) -> list[dict]:
    """行内内容数组的白名单清洗：样式收敛、文本截断、链接不合规就降级成纯文本。"""
    if not isinstance(value, (list, tuple)):
        return []
    out = []
    for node in value:
        if not isinstance(node, dict):
            continue
        if node.get("type") == "link":
            inner = _normalize_inline_content(node.get("content"))
            href = _safe_href(node.get("href"))
            if href and inner:
                out.append({"type": "link", "href": href, "content": inner})
            else:
                out.extend(inner)
            continue
        text = as_text(node.get("text"), MAX_BLOCK_TEXT)
        if not text:
            continue
        raw_styles = node.get("styles") if isinstance(node.get("styles"), dict) else {}
        out.append({
            "type": "text",
            "text": text,
            "styles": {name: True for name in _INLINE_STYLES if raw_styles.get(name)},
        })
    return out


def _normalize_doc_props(btype, raw_props) -> dict:
    """块 props 的白名单清洗：只留这个类型认得的字段。"""
    props = raw_props if isinstance(raw_props, dict) else {}
    out = {}
    if btype == "heading":
        out["level"] = max(1, min(3, as_int(props.get("level"), 1)))
    if btype == "checkListItem":
        out["checked"] = bool(props.get("checked"))
    if btype == "toggleListItem":
        # BlockNote 不给 toggleListItem 开 collapsed prop（那是内部 UI 状态），
        # 但旧结构里有，本端既存续也放行，免得保存一次就把折叠态抹掉。
        out["collapsed"] = bool(props.get("collapsed"))
    if btype == "codeBlock":
        out["language"] = as_text(props.get("language"), 40) or "text"
    align = as_text(props.get("textAlignment"), 20)
    if align in _ALIGNMENTS:
        out["textAlignment"] = align
    for key in ("textColor", "backgroundColor"):
        color = _safe_color(props.get(key))
        if color and color != "default":
            out[key] = color
    if btype in ("image", "bookmark"):
        out["url"] = as_text(props.get("url"), 4000)
        out["caption"] = as_text(props.get("caption"), 300)
    if btype == "card":
        # 旧 settings.document 是卡片 id；BlockNote props 只收 number，故用 0 表示空。
        out["document"] = max(0, as_int(props.get("document"), 0))
    if btype == "collection":
        # 嵌套 dict 塞不进 props（只允许 boolean/number/string），序列化成 JSON 字符串。
        out["settings"] = _normalize_collection_settings(props.get("settings"))
    return out


def _normalize_doc_blocks(blocks, depth, budget) -> list[dict]:
    """递归清洗块数组；``budget`` 是跨层级共享的剩余块数，防止嵌套撑爆。"""
    if not isinstance(blocks, (list, tuple)) or budget[0] <= 0:
        return []
    out = []
    for index, raw in enumerate(blocks):
        if budget[0] <= 0:
            break
        if not isinstance(raw, dict):
            continue
        btype = raw.get("type")
        if btype not in _DOC_BLOCK_TYPES:
            continue
        budget[0] -= 1
        bid = as_text(raw.get("id"), 40) or f"b{index + 1}"
        props = _normalize_doc_props(btype, raw.get("props"))
        block = {"id": bid, "type": btype, "props": props}
        if btype not in _DOC_CONTENTLESS:
            block["content"] = _normalize_inline_content(raw.get("content"))
        block["children"] = (_normalize_doc_blocks(raw.get("children"), depth + 1, budget)
                             if depth < _DOC_MAX_DEPTH else [])
        out.append(block)
    return out


def normalize_doc(value) -> list[dict]:
    """编辑器文档的入口清洗：非数组 → ``[]``，类型白名单之外的块直接丢。"""
    if not isinstance(value, (list, tuple)):
        return []
    return _normalize_doc_blocks(value, 0, [MAX_BLOCKS])


def _doc_blocks_to_legacy(blocks, out, depth=0) -> None:
    """递归把编辑器文档拍平成旧区块，子块接在父块之后（保证派生正文不丢字）。

    ``depth`` 回写成旧结构的 ``level``：vanilla 渲染器只认 0..2（``renderBlock``
    自己也会 clamp），所以派生投影跟着截；``blocks_doc`` 仍是完整深度的权威副本。
    """
    if not isinstance(blocks, (list, tuple)):
        return
    for raw in blocks:
        if len(out) >= MAX_BLOCKS:
            return
        if not isinstance(raw, dict):
            continue
        legacy_type = _DOC_TO_LEGACY.get(raw.get("type"))
        if legacy_type is None:
            continue
        props = raw.get("props") if isinstance(raw.get("props"), dict) else {}
        if legacy_type in _HEAVY_BLOCK_TYPES:
            # 重块没有行内正文，数据全在 props 里，反向写回旧 settings 后原样拍平。
            block = _heavy_block_to_legacy(
                as_text(raw.get("id"), 40) or f"b{len(out) + 1}", legacy_type, props, depth)
            out.append(block)
            children = raw.get("children")
            if children:
                _doc_blocks_to_legacy(children, out, depth + 1)
            continue
        content = raw.get("content")
        block = {
            "id": as_text(raw.get("id"), 40) or f"b{len(out) + 1}",
            "type": legacy_type,
            "title": "",
            "text": _plain_from_inline(content),
        }
        if depth:
            block["level"] = min(depth, 2)
        if legacy_type not in ("divider", "code"):
            html = inline_content_to_html(content)
            if html:
                block["html"] = html
        if legacy_type == "todo" and props.get("checked"):
            block["checked"] = True
        if legacy_type == "toggle" and props.get("collapsed"):
            block["collapsed"] = True
        out.append(block)
        children = raw.get("children")
        if children:
            _doc_blocks_to_legacy(children, out, depth + 1)


def doc_to_blocks(doc) -> list[dict]:
    """编辑器文档 → 旧区块数组（派生的 ``blocks`` / ``body`` 都由它来）。"""
    if not isinstance(doc, (list, tuple)):
        return []
    out: list[dict] = []
    _doc_blocks_to_legacy(doc, out)
    return out[:MAX_BLOCKS]


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
