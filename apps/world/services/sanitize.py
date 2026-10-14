# -*- coding: utf-8 -*-
"""区块富文本的白名单净化。

卡片正文是 contenteditable，浏览器会塞进来各种标签（粘贴时尤其脏），所以入库前
必须过一遍白名单：只留排版相关的标签与属性，其余一律丢掉（标签脱掉、属性删掉），
``script`` / ``style`` / ``iframe`` 这种连同内容一起扔掉。

与 ``world.normalize`` 的分工：那边负责"什么值算合法"，这里负责"哪段 HTML 能存"。
"""

from __future__ import annotations

from html import escape
from html.parser import HTMLParser

# 允许的标签：只放行排版相关的（粗体 / 斜体 / 列表 / 引用 / 标题 / 链接…）
ALLOWED_TAGS = {
    "p", "br", "b", "strong", "i", "em", "u", "s", "strike", "del", "code", "mark",
    "ul", "ol", "li", "blockquote", "span", "a", "h1", "h2", "h3",
}
# 允许的属性：链接的 href / 提及的 data-target
ALLOWED_ATTRS = {
    "a": {"href"},
    "span": {"data-target", "class"},
}
# class 只放行这几个（自己的语义类），其余一律丢掉——不给白名单外的样式留口子
ALLOWED_CLASSES = {
    "span": {"mentions-inline"},
}
# 连同内容一起丢弃的标签
DROP_WITH_CONTENT = {"script", "style", "iframe", "object", "embed", "template", "svg"}
# 自闭合标签
VOID_TAGS = {"br", "img", "hr"}
# 允许的链接协议
SAFE_SCHEMES = ("http://", "https://", "mailto:", "/", "#")

MAX_HTML = 40000


class _Cleaner(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.open_tags: list[str] = []
        self.drop_depth = 0

    # -- 标签 -------------------------------------------------------------- #
    def handle_starttag(self, tag, attrs):
        if tag in DROP_WITH_CONTENT:
            self.drop_depth += 1
            return
        if self.drop_depth or tag not in ALLOWED_TAGS:
            return
        allowed = ALLOWED_ATTRS.get(tag, set())
        kept = []
        for name, value in attrs:
            if name not in allowed or value is None:
                continue
            if name == "href" and not str(value).strip().lower().startswith(SAFE_SCHEMES):
                continue
            if name == "class":
                permitted = ALLOWED_CLASSES.get(tag, set())
                tokens = [t for t in str(value).split() if t in permitted]
                if not tokens:
                    continue
                value = " ".join(tokens)
            kept.append(f'{name}="{escape(str(value), quote=True)}"')
        self.parts.append(f"<{tag}{(' ' + ' '.join(kept)) if kept else ''}>")
        if tag not in VOID_TAGS:
            self.open_tags.append(tag)

    def handle_startendtag(self, tag, attrs):
        if tag in DROP_WITH_CONTENT or self.drop_depth:
            return
        if tag in ALLOWED_TAGS:
            self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        if tag in DROP_WITH_CONTENT:
            self.drop_depth = max(0, self.drop_depth - 1)
            return
        if self.drop_depth or tag not in ALLOWED_TAGS or tag in VOID_TAGS:
            return
        if tag in self.open_tags:
            # 关掉它以及它上面所有没闭合的标签，保证结构合法
            while self.open_tags:
                current = self.open_tags.pop()
                self.parts.append(f"</{current}>")
                if current == tag:
                    break

    def handle_data(self, data):
        if self.drop_depth:
            return
        self.parts.append(escape(data, quote=False))

    def result(self) -> str:
        while self.open_tags:
            self.parts.append(f"</{self.open_tags.pop()}>")
        return "".join(self.parts)


def clean_html(raw: str, limit: int = MAX_HTML) -> str:
    """净化一段 HTML；空串 / 纯空白的输入返回空串。"""
    if not raw:
        return ""
    text = str(raw)[:limit]
    if not text.strip():
        return ""
    cleaner = _Cleaner()
    try:
        cleaner.feed(text)
        cleaner.close()
    except Exception:  # 解析炸了就退化成纯文本，绝不把原样存进去
        return escape(text, quote=False)
    return cleaner.result().strip()


def html_to_text(raw: str) -> str:
    """把 HTML 拍平成纯文本（搜索、字数、自动识别都用它）。"""
    if not raw:
        return ""
    text = str(raw)
    if "<" not in text:
        return text
    out: list[str] = []
    drop = {"script", "style", "iframe", "object", "embed", "template", "svg"}

    class _Flattener(HTMLParser):
        depth = 0

        def handle_starttag(self, tag, attrs):
            if tag in drop:
                self.depth += 1
            elif tag in ("br", "p", "div", "li", "h1", "h2", "h3", "blockquote"):
                out.append("\n")

        def handle_endtag(self, tag):
            if tag in drop:
                self.depth = max(0, self.depth - 1)
            elif tag in ("p", "li", "h1", "h2", "h3", "blockquote"):
                out.append("\n")

        def handle_data(self, data):
            if not self.depth:
                out.append(data)

    parser = _Flattener()
    try:
        parser.feed(text)
        parser.close()
    except Exception:
        return text
    joined = "".join(out)
    lines = [line.strip() for line in joined.split("\n")]
    return "\n".join(line for line in lines if line).strip()
