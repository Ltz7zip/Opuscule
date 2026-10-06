# -*- coding: utf-8 -*-
"""名字自动识别（调研文档 §4.2）：在正文里找出已经存在的卡片名 / 别名。

VVD 的行为是「边写边认」：正文里写到已存在的名字就自动变成链接，链接一个被识别的名字
会把它存成别名。这里只做识别这一半——返回命中位置，前端负责高亮与「创建为卡片」。
中文没有词边界，所以用「最长匹配优先 + 不重叠」的策略，并跳过已经处在链接里的区间。
"""

from __future__ import annotations

import re

# 单个名字的长度上限，避免把整段话当名字
MAX_NAME = 60

# 中文启发式里要挡掉的常见虚词/助词：以它们开头或结尾的多半是切碎的短语，不是名字
CJK_STOP_HEADS = set("的了在和与是有把被就都也这那很更最又还只从对向以为上下中前后内外之而其")
CJK_STOP_TAILS = set("的了着过和与是在有被把就都也这那之其而且并以及")
# 一次识别的命中上限，防止长文把接口拖慢
MAX_MATCHES = 300

_LINK_SPAN = re.compile(r"\[\[([^\]\n]{1,80})\]\]")


def _candidates(world, exclude_document_id=None):
    """候选名字：{名字: 卡片文档}，长的排前面（最长匹配优先）。"""
    from .models import DOC_CARD

    pairs = []
    cards = (
        world.documents.filter(document_type=DOC_CARD, deleted_at__isnull=True)
        .select_related("card", "entity_type")
    )
    for document in cards:
        if exclude_document_id and document.id == exclude_document_id:
            continue
        card = getattr(document, "card", None)
        names = card.mention_names() if card is not None else [document.name]
        for name in names:
            text = (name or "").strip()
            if 1 < len(text) <= MAX_NAME:
                pairs.append((text, document))
    pairs.sort(key=lambda item: len(item[0]), reverse=True)
    return pairs


# 英文的复数 / 所有格后缀：链接的时候一起吃掉，别把 "Harrowdeeps" 漏掉
_PLURAL_TAILS = ("'s", "’s", "s", "es")
# 拼写容错的最小长度门槛：太短的名字（≤4）不做模糊匹配，否则到处都是误链
FUZZY_MIN_LENGTH = 5
FUZZY_MAX_DISTANCE = 2


def _edits_within(a: str, b: str, limit: int) -> bool:
    """a 与 b 的编辑距离是否在 limit 之内（带上限的 Levenshtein，提前退出）。"""
    if abs(len(a) - len(b)) > limit:
        return False
    if a == b:
        return True
    previous = list(range(len(b) + 1))
    for i, char_a in enumerate(a, start=1):
        current = [i]
        best = current[0]
        for j, char_b in enumerate(b, start=1):
            cost = 0 if char_a == char_b else 1
            value = min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost)
            current.append(value)
            best = min(best, value)
        if best > limit:
            return False
        previous = current
    return previous[-1] <= limit


def _match_span(text: str, name: str, start: int) -> int:
    """返回命中结束位置（会把复数 / 所有格一起算进去）。"""
    end = start + len(name)
    tail = text[end:end + 2]
    for candidate in _PLURAL_TAILS:
        if tail.startswith(candidate) and (candidate != "s" or not name.endswith("s")):
            return end + len(candidate)
    return end


def fuzzy_candidates(world, text: str, exclude_document_id=None, limit: int = 6) -> list[dict]:
    """"打错一点"的名字：typo-tolerant 提及用。

    只在长度 ≥ FUZZY_MIN_LENGTH 的词上做，且距离 ≤ 2，避免把普通词链成卡片。
    """
    if not text:
        return []
    words = re.findall(r"[A-Za-z][A-Za-z'’-]{%d,}" % (FUZZY_MIN_LENGTH - 1), text)
    seen: set[tuple[str, str]] = set()
    out: list[dict] = []
    for word in dict.fromkeys(words):
        for name, document in _candidates(world, exclude_document_id):
            if not re.match(r"^[A-Za-z]", name):
                continue                       # 中文名字不做模糊匹配（误报太多）
            if abs(len(word) - len(name)) > FUZZY_MAX_DISTANCE:
                continue
            if word.casefold() == name.casefold():
                continue                       # 精确命中的在 find_mentions 里处理
            if _edits_within(word.casefold(), name.casefold(), FUZZY_MAX_DISTANCE):
                key = (word.casefold(), name.casefold())
                if key in seen:
                    continue
                seen.add(key)
                out.append({
                    "document_id": document.id,
                    "name": document.name,
                    "matched": word,
                    "distance": 1 if len(word) == len(name) else 2,
                    "entity_type": document.entity_type.name if document.entity_type else None,
                })
                if len(out) >= limit:
                    return out
    return out


def _linked_spans(text: str) -> list[tuple[int, int]]:
    """已有的 ``[[名字]]`` 链接区间，识别时直接跳过。"""
    return [(m.start(), m.end()) for m in _LINK_SPAN.finditer(text)]


def _overlaps(start: int, end: int, spans) -> bool:
    return any(start < s_end and end > s_start for s_start, s_end in spans)


def find_mentions(world, text: str, exclude_document_id=None) -> list[dict]:
    """返回 ``[{document_id, name, alias, start, end}]``，按出现位置排序。"""
    if not text:
        return []
    spans = _linked_spans(text)
    taken: list[tuple[int, int]] = []
    matches: list[dict] = []

    for name, document in _candidates(world, exclude_document_id):
        start = text.find(name)
        while start >= 0:
            end = _match_span(text, name, start)
            if not _overlaps(start, end, spans) and not _overlaps(start, end, taken):
                taken.append((start, end))
                matches.append({
                    "document_id": document.id,
                    "name": document.name,
                    "matched": text[start:end],
                    "alias": name != document.name,
                    "start": start,
                    "end": end,
                    "entity_type": document.entity_type.name if document.entity_type else None,
                })
                if len(matches) >= MAX_MATCHES:
                    break
            start = text.find(name, end)
        if len(matches) >= MAX_MATCHES:
            break

    matches.sort(key=lambda m: m["start"])
    return matches


def link_text(matches: list[dict]) -> str:
    """把命中位置渲染成 ``[[名字]]`` 的文本形式（服务端预览用）。"""
    return "\n".join(f"{m['start']}-{m['end']} {m['name']}" for m in matches)


def detect_new_names(world, text: str, exclude_document_id=None) -> list[str]:
    """正文里反复出现、但还不是卡片的名字（前端「创建为卡片」的候选）。

    只做一个保守的启发式：连续 2-8 个汉字 / 拉丁词，出现两次以上，且不与已有名字相同。
    """
    from .models import DOC_CARD

    known = {name.casefold() for name, _doc in _candidates(world, exclude_document_id)}
    counter: dict[str, int] = {}
    for raw in re.findall(r"[\u4e00-\u9fff]{2,6}|[A-Z][a-z]{2,15}", text or ""):
        key = raw.casefold()
        if key in known:
            continue
        if raw[0] in CJK_STOP_HEADS or raw[-1] in CJK_STOP_TAILS:
            continue                       # 「的洞室」这种碎片不算名字
        counter[raw] = counter.get(raw, 0) + 1
    ranked = sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))
    return [name for name, count in ranked if count >= 2][:20]


def aliases_for_insert(document) -> list[str]:
    """新建链接时可用作别名候选项的名字。"""
    card = getattr(document, "card", None)
    return card.mention_names() if card is not None else [document.name]
