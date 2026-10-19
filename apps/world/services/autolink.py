# -*- coding: utf-8 -*-
"""名字自动识别：在正文里找出已经存在的卡片名 / 别名。

用法是「边写边认」：正文里写到已存在的名字就自动变成链接，而把一个被识别的名字点成链接，
又会把它存成别名。这里只做识别这一半——返回命中位置，前端负责高亮与「创建为卡片」。

难点在中文：没有空格，没法按词边界切词。所以换一个不靠分词器的思路——手里已经有一份
「名字名单」（``mention_names()`` = 主名 + 别名），直接拿名单去正文里做子串匹配，
再用三条规则收敛结果：

* **最长匹配优先**：候选名字按长度倒序试，先认长的（免得「亚历山大图书馆」只认出半截）；
* **不重叠**：一处文字只链一次，短名让位给已经占位的长名；
* **跳过已有链接**：命中区间不能落在正文本来就有的 ``[[名字]]`` 里。

另外两件事：命中会顺带吞掉英文的复数 / 所有格后缀（``Harrowdeeps``、``Harrowdeep's``），
以及用编辑距离（Levenshtein）容忍「打错一两个字母」的提及（``fuzzy_candidates``）。
"""

from __future__ import annotations

import re
import unicodedata

# 单个名字的长度上限，避免把整段话当名字
MAX_NAME = 60

# 中文启发式里要挡掉的常见虚词/助词：以它们开头或结尾的多半是切碎的短语，不是名字
CJK_STOP_HEADS = set("的了在和与是有把被就都也这那很更最又还只从对向以为上下中前后内外之而其")
CJK_STOP_TAILS = set("的了着过和与是在有被把就都也这那之其而且并以及")
# 一次识别的命中上限，防止长文把接口拖慢
MAX_MATCHES = 300

_LINK_SPAN = re.compile(r"\[\[([^\]\n]{1,80})\]\]")


def candidates(world, exclude_document_id=None):
    """候选名字：{名字: 卡片文档}，长的排前面（最长匹配优先）。

    名单在同一个请求里常被多处使用（逐卡识别、图谱、建议），调用方可自行缓存
    结果并通过 ``candidates=`` 参数传回，避免反复全量查询和排序。
    """
    from ..models import DOC_CARD

    pairs = []
    cards = (
        world.documents.filter(document_type=DOC_CARD, deleted_at__isnull=True)
        .select_related("card", "entity_type")
        # 只取识别名字与类型显示要用的列，别把正文 / 地图这些大字段整份读出来
        .only("id", "name", "entity_type__name", "card__aliases")
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


# 兼容旧的模块内部名字
_candidates = candidates


def _without_document(pairs, exclude_document_id):
    """共享的候选名单里剔除指定文档（自引用不该链到自己）。"""
    if not exclude_document_id:
        return pairs
    return [item for item in pairs if item[1].id != exclude_document_id]


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


def fuzzy_candidates(world, text: str, exclude_document_id=None, limit: int = 6,
                     candidates=None) -> list[dict]:
    """"打错一点"的名字：typo-tolerant 提及用。

    只在长度 ≥ FUZZY_MIN_LENGTH 的词上做，且距离 ≤ 2，避免把普通词链成卡片。
    """
    if not text:
        return []
    words = re.findall(r"[A-Za-z][A-Za-z'’-]{%d,}" % (FUZZY_MIN_LENGTH - 1), text)
    if not words:
        return []
    pairs = candidates
    if pairs is None:
        pairs = _candidates(world, exclude_document_id)
    else:
        pairs = _without_document(pairs, exclude_document_id)
    # 中文名字不做模糊匹配（误报太多），预先过滤一遍，别在每个词里重复判断
    english_pairs = [
        (name, name.casefold(), document)
        for name, document in pairs
        if re.match(r"^[A-Za-z]", name)
    ]
    if not english_pairs:
        return []
    seen: set[tuple[str, str]] = set()
    out: list[dict] = []
    for word in dict.fromkeys(words):
        folded_word = word.casefold()
        for name, folded_name, document in english_pairs:
            if abs(len(word) - len(name)) > FUZZY_MAX_DISTANCE:
                continue
            if folded_word == folded_name:
                continue                       # 精确命中的在 find_mentions 里处理
            if _edits_within(folded_word, folded_name, FUZZY_MAX_DISTANCE):
                key = (folded_word, folded_name)
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


def find_mentions(world, text: str, exclude_document_id=None, candidates=None) -> list[dict]:
    """返回 ``[{document_id, name, alias, start, end}]``，按出现位置排序。"""
    if not text:
        return []
    pairs = candidates
    if pairs is None:
        pairs = _candidates(world, exclude_document_id)
    else:
        pairs = _without_document(pairs, exclude_document_id)
    spans = _linked_spans(text)
    taken: list[tuple[int, int]] = []
    matches: list[dict] = []

    for name, document in pairs:
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


def detect_new_names(world, text: str, exclude_document_id=None,
                     candidates=None, known_names=None) -> list[str]:
    """正文里反复出现、但还不是卡片的名字（前端「创建为卡片」的候选）。

    只做一个保守的启发式：连续 2-8 个汉字 / 拉丁词，出现两次以上，且不与已有名字相同。
    """
    if known_names is None:
        pairs = candidates
        if pairs is None:
            pairs = _candidates(world, exclude_document_id)
        else:
            pairs = _without_document(pairs, exclude_document_id)
        known = {name.casefold() for name, _doc in pairs}
    else:
        known = known_names
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


# --------------------------------------------------------------------------- #
# 打字补全（精确名字档）
# --------------------------------------------------------------------------- #

# 补全的候选上限：够挑就行，别把整份名单怼到用户眼前
COMPLETE_LIMIT = 8


def _fold(text: str) -> str:
    """归一化：NFKC（全角→半角）+ 去首尾空白 + casefold（大小写不敏感）。"""
    return unicodedata.normalize("NFKC", text or "").strip().casefold()


def _describe(document) -> str:
    """候选里那行"描述"：卡片取正文开头一小段，没有就给个空串。"""
    from ..normalize import blocks_to_text

    card = getattr(document, "card", None)
    if card is None:
        return ""
    body = (card.body or "").strip() or blocks_to_text(card.blocks).strip()
    return re.sub(r"\s+", " ", body)[:48]


def complete_names(world, query: str, exclude_document_id=None, limit: int = COMPLETE_LIMIT) -> list[dict]:
    """打字补全：在已知名字名单里按「前缀优先、包含兜底」找匹配。

    只做**精确名字**档——先把输入归一化，再做前缀 / 包含匹配；不做编辑距离容错、
    也不做拼音（那两档留给以后，见推进计划 §9）。候选带类型与描述，供选择器显示。
    """
    key = _fold(query)
    if not key:
        return []

    ranked = []
    documents = (world.documents.filter(deleted_at__isnull=True)
                 .select_related("card", "entity_type")
                 # 补全只需要名字、类型和描述摘要，其余大字段不必读
                 .only("id", "name", "document_type", "entity_type__name",
                       "card__aliases", "card__body", "card__blocks"))
    for document in documents:
        if exclude_document_id and document.id == exclude_document_id:
            continue
        card = getattr(document, "card", None)
        names = card.mention_names() if card is not None else [document.name]
        best = None
        for name in names:
            folded = _fold(name)
            if not folded:
                continue
            if folded.startswith(key):
                rank = 0                       # 前缀命中排前面
            elif key in folded:
                rank = 1                       # 包含命中兜底
            else:
                continue
            # 同档内：短名优先（越短越像"就是在找它"），再按名字稳定排序
            score = (rank, len(folded), folded)
            if best is None or score < best[0]:
                best = (score, name)
        if best is None:
            continue
        ranked.append((best[0], document, best[1]))

    ranked.sort(key=lambda item: item[0])
    out = []
    for _score, document, matched in ranked[:limit]:
        entity = document.entity_type
        out.append({
            "document_id": document.id,
            "name": document.name,
            "matched": matched,
            "type": document.document_type,
            "entity_type": entity.name if entity is not None else None,
            "description": _describe(document),
        })
    return out
