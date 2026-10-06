# -*- coding: utf-8 -*-
"""关系树的关系词表与起步模版。

这一模块只放**纯数据**（不含 ORM、不 import models），因为 ``world.models``
要反过来 import 它来生成 ``TREE_EDGE_KINDS`` / ``TREE_EDGE_LABELS``。

三件事在这里定下来：

1. **关系词表**（``RELATION_KINDS``）：家庭 / 公司 / 军事 / 皇家宫廷共用同一套
   ``kind`` 取值，界面上的叫法按模版覆盖。这样一条边换模版不用改数据。
2. **起步模版**（``TREE_TEMPLATES``）：新建关系树时左侧那个列表。每个模版自带
   一份现成的关系清单，省得用户从零命名"父母 / 子女"这种到处都是的关系。
3. **模版示意图**（``demo``）：模版选中时右侧预览的那棵样例树。

## 网格

画布是"贴网格"的：人物的**边框**必须落在网格线上（所以卡片宽高都是整数格），
关系线则不受约束，可以任意走。坐标统一用**格数**表示，前端乘 ``GRID`` 就是像素。

一张卡片占 ``CARD_COLS × CARD_ROWS`` 格；两张卡片之间留 ``GAP`` 格空隙当走线通道。
``slot(col, row)`` 把"第几列第几行卡片"换算成格坐标——示意数据因此不写魔数。
"""

from __future__ import annotations

# --------------------------------------------------------------------------- #
# 网格
# --------------------------------------------------------------------------- #
#: 一个网格的边长（像素）。前端画布点阵的间距就是这个值。
GRID = 28
#: 一张人物卡占几格（宽 × 高）。卡片边框因此天然落在网格线上。
CARD_COLS = 5
CARD_ROWS = 8
#: 卡片之间的空隙（格）。横向留得下两张卡片各自的加号手柄，纵向窄一点就够。
GAP_X = 3
GAP_Y = 4
#: 相邻两列 / 两行卡片的格距
COL_STEP = CARD_COLS + GAP_X      # 8
ROW_STEP = CARD_ROWS + GAP_Y      # 12


def slot(col: int, row: int) -> dict:
    """把"第 col 列第 row 行卡片"换算成格坐标（左上角）。"""
    return {"col": col * COL_STEP, "row": row * ROW_STEP}


# --------------------------------------------------------------------------- #
# 关系词表
# --------------------------------------------------------------------------- #
REL_PARENT = "parent"
REL_CHILD = "child"
REL_SPOUSE = "spouse"
REL_EX = "ex"
REL_SIBLING = "sibling"
REL_HALF_SIBLING = "half_sibling"
REL_ADOPTIVE = "adoptive"
REL_STEP = "step"
REL_CUSTOM = "custom"

#: 规范关系表。``kind`` 是落库的取值，字符串是**中性**叫法（模版会覆盖成自己的词）。
RELATION_KINDS = [
    (REL_PARENT, "父母"),
    (REL_CHILD, "子女"),
    (REL_SPOUSE, "伴侣"),
    (REL_EX, "前任"),
    (REL_SIBLING, "兄弟姐妹"),
    (REL_HALF_SIBLING, "同父异母/同母异父兄弟姐妹"),
    (REL_ADOPTIVE, "养父母/养子女"),
    (REL_STEP, "继父母"),
    (REL_CUSTOM, "自定义"),
]
RELATION_KIND_VALUES = [value for value, _label in RELATION_KINDS]

#: 关系画出来是什么线型。前任 / 收养 / 继这种"非婚生直系"的关系用虚线，
#: 一眼就能和血缘直系区分开（对齐模版示意图里的画法）。
RELATION_STYLES = {
    REL_EX: "dashed",
    REL_HALF_SIBLING: "dashed",
    REL_ADOPTIVE: "dashed",
    REL_STEP: "dashed",
}


def relation_style(kind: str) -> str:
    return RELATION_STYLES.get(kind, "")


# --------------------------------------------------------------------------- #
# 起步模版
# --------------------------------------------------------------------------- #
def _relation(kind: str, label: str, hint: str = "") -> dict:
    """一条"模版自带的关系"：kind + 界面上显示的名字 + 一句说明。"""
    return {"kind": kind, "label": label, "hint": hint, "style": relation_style(kind)}


def _node(key: str, name: str, col: int, row: int, subtitle: str = "") -> dict:
    """示意图上的一个人。col/row 是"第几列 / 第几行卡片"，不是像素。

    两套坐标都给出来：``col`` / ``row`` 是格坐标（画布落点用），
    ``col_index`` / ``row_index`` 是"第几列 / 第几行"（``TreeNode.generation``
    要的是这个——工作区里那个简版渲染器按世代排 y，喂格坐标会拉成一片空白）。
    """
    return {
        "key": key, "name": name, "subtitle": subtitle,
        "col_index": col, "row_index": row,
        **slot(col, row),
    }


def _edge(source: str, target: str, kind: str, label: str = "", style: str = "") -> dict:
    return {
        "source": source,
        "target": target,
        "kind": kind,
        "label": label,
        "style": style or relation_style(kind),
    }


TREE_TEMPLATES = [
    {
        "id": "family",
        "name": "家庭",
        "tagline": "父母 · 子女 · 伴侣 · 前任",
        "summary": "血缘与婚姻为主轴：直系、旁系、姻亲、收养一次备齐。",
        "accent": "sky",
        "icon": "house",
        "relations": [
            _relation(REL_PARENT, "父母", "上一代直系"),
            _relation(REL_CHILD, "子女", "下一代直系"),
            _relation(REL_SPOUSE, "伴侣", "婚姻 / 伴侣"),
            _relation(REL_EX, "前任", "已结束的伴侣关系"),
            _relation(REL_SIBLING, "兄弟姐妹", "同辈旁系"),
            _relation(REL_HALF_SIBLING, "同父异母/同母异父兄弟姐妹", "只共一位亲长"),
            _relation(REL_ADOPTIVE, "养父母/养子女", "收养关系"),
            _relation(REL_STEP, "继父母", "再婚带来的亲长"),
        ],
        "demo": {
            "nodes": [
                _node("ml", "Marie Louise", 0, 0),
                _node("np", "Napoleon", 1, 0),
                _node("jo", "Joséphine", 2, 0),
                _node("al", "Alexandre", 3, 0),
                _node("n2", "Napoleon II", 0, 1),
                _node("eu", "Eugène", 1, 1),
                _node("ho", "Hortense", 2, 1),
                _node("lo", "Louis", 3, 1),
                _node("n3", "Napoleon III", 2, 2),
            ],
            "edges": [
                _edge("ml", "np", REL_SPOUSE, "伴侣"),
                _edge("np", "jo", REL_EX, "前任"),
                _edge("jo", "al", REL_EX, "前任"),
                _edge("ml", "n2", REL_CHILD, "子女"),
                _edge("np", "eu", REL_ADOPTIVE, "养父母/养子女"),
                _edge("jo", "eu", REL_CHILD, "子女"),
                _edge("al", "ho", REL_CHILD, "子女"),
                _edge("eu", "ho", REL_SIBLING, "兄弟姐妹"),
                _edge("ho", "lo", REL_SPOUSE, "伴侣"),
                _edge("ho", "n3", REL_CHILD, "子女"),
            ],
        },
    },
    {
        "id": "corporate",
        "name": "公司",
        "tagline": "经理 · 下属 · 同事 · 导师",
        "summary": "汇报线与协作线分开画：谁管谁、谁带谁、谁跟谁平级。",
        "accent": "gold",
        "icon": "building",
        "relations": [
            _relation(REL_PARENT, "经理", "汇报对象"),
            _relation(REL_CHILD, "下属", "直接汇报"),
            _relation(REL_SPOUSE, "合伙人", "共同持股 / 共同负责"),
            _relation(REL_EX, "前合伙人", "已拆伙"),
            _relation(REL_SIBLING, "同事", "同部门平级"),
            _relation(REL_HALF_SIBLING, "跨部门同级", "不同线但同级"),
            _relation(REL_ADOPTIVE, "导师 / 学徒", "带教关系"),
            _relation(REL_STEP, "代理主管", "临时代管"),
        ],
        "demo": {
            "nodes": [
                _node("ceo", "董事长", 1, 0),
                _node("cto", "技术总监", 0, 1),
                _node("cfo", "财务总监", 2, 1),
                _node("dev", "研发经理", 0, 2),
                _node("ops", "运维经理", 1, 2),
                _node("hr", "人事经理", 2, 2),
                _node("jr", "实习生", 0, 3),
            ],
            "edges": [
                _edge("ceo", "cto", REL_CHILD, "下属"),
                _edge("ceo", "cfo", REL_CHILD, "下属"),
                _edge("cto", "dev", REL_CHILD, "下属"),
                _edge("cto", "ops", REL_CHILD, "下属"),
                _edge("cfo", "hr", REL_CHILD, "下属"),
                _edge("dev", "ops", REL_SIBLING, "同事"),
                _edge("dev", "jr", REL_ADOPTIVE, "导师 / 学徒"),
                _edge("cto", "cfo", REL_SPOUSE, "合伙人"),
            ],
        },
    },
    {
        "id": "military",
        "name": "军事",
        "tagline": "军团长 · 护民官 · 营地总管 · 百夫长",
        "summary": "指挥链与幕僚链并行：谁下命令、谁管后勤、谁跟谁同袍。",
        "accent": "red",
        "icon": "shield",
        "relations": [
            _relation(REL_PARENT, "军团长", "战役总指挥"),
            _relation(REL_CHILD, "百夫长", "带队官"),
            _relation(REL_SPOUSE, "副将", "同衔搭档"),
            _relation(REL_EX, "旧部", "已调离"),
            _relation(REL_SIBLING, "同袍", "同级同营"),
            _relation(REL_HALF_SIBLING, "友军同级", "盟军同衔"),
            _relation(REL_ADOPTIVE, "护民官 / 营地总管", "幕僚与后勤"),
            _relation(REL_STEP, "代任官", "临时接任"),
        ],
        "demo": {
            "nodes": [
                _node("leg", "军团长", 1, 0),
                _node("tri", "护民官", 0, 1),
                _node("qua", "营地总管", 2, 1),
                _node("c1", "百夫长 · 一队", 0, 2),
                _node("c2", "百夫长 · 二队", 1, 2),
                _node("c3", "百夫长 · 三队", 2, 2),
                _node("s1", "斥候", 0, 3),
            ],
            "edges": [
                _edge("leg", "tri", REL_ADOPTIVE, "护民官 / 营地总管"),
                _edge("leg", "qua", REL_ADOPTIVE, "护民官 / 营地总管"),
                _edge("leg", "c1", REL_CHILD, "百夫长"),
                _edge("leg", "c2", REL_CHILD, "百夫长"),
                _edge("leg", "c3", REL_CHILD, "百夫长"),
                _edge("c1", "c2", REL_SIBLING, "同袍"),
                _edge("c2", "c3", REL_SIBLING, "同袍"),
                _edge("c1", "s1", REL_CHILD, "百夫长"),
            ],
        },
    },
    {
        "id": "royal",
        "name": "皇家宫廷",
        "tagline": "领主 · 封臣 · 继承人 · 配偶",
        "summary": "王位与效忠两条线：谁继承谁、谁向谁称臣、谁和谁联姻。",
        "accent": "violet",
        "icon": "crown",
        "relations": [
            _relation(REL_PARENT, "领主", "效忠对象"),
            _relation(REL_CHILD, "封臣", "受封者"),
            _relation(REL_SPOUSE, "配偶", "王室婚姻"),
            _relation(REL_EX, "废后 / 离异", "已解除的婚姻"),
            _relation(REL_SIBLING, "手足", "同辈王族"),
            _relation(REL_HALF_SIBLING, "庶出手足", "非婚生同辈"),
            _relation(REL_ADOPTIVE, "继承人", "指定继承"),
            _relation(REL_STEP, "摄政", "代行王权"),
        ],
        "demo": {
            "nodes": [
                _node("king", "国王", 0, 0),
                _node("queen", "王后", 1, 0),
                _node("lord", "大领主", 2, 0),
                _node("heir", "王储", 0, 1),
                _node("prin", "二王子", 1, 1),
                _node("bast", "私生子", 2, 1),
                _node("vas", "封臣", 2, 2),
            ],
            "edges": [
                _edge("king", "queen", REL_SPOUSE, "配偶"),
                _edge("king", "lord", REL_PARENT, "领主"),
                _edge("king", "heir", REL_ADOPTIVE, "继承人"),
                _edge("king", "prin", REL_CHILD, "封臣"),
                _edge("heir", "prin", REL_SIBLING, "手足"),
                _edge("king", "bast", REL_HALF_SIBLING, "庶出手足"),
                _edge("lord", "vas", REL_CHILD, "封臣"),
            ],
        },
    },
    {
        "id": "blank",
        "name": "从空白开始",
        "tagline": "在构建过程中命名您自己的关系",
        "summary": "不带任何预设关系，画布全空白，关系名字由你随手定。",
        "accent": "slate",
        "icon": "plus",
        "relations": [],
        "demo": {"nodes": [], "edges": []},
    },
]

TREE_TEMPLATE_MAP = {item["id"]: item for item in TREE_TEMPLATES}
TREE_TEMPLATE_IDS = [item["id"] for item in TREE_TEMPLATES]


def template(template_id: str) -> dict:
    """按 id 取模版，取不到就退回"家庭"（老数据只有 family 这类值）。"""
    return TREE_TEMPLATE_MAP.get(template_id) or TREE_TEMPLATE_MAP["family"]


def template_labels(template_id: str) -> dict:
    """模版的关系名覆盖表：``{kind: 叫法}``，直接喂给 ``TreeVariant.label_for``。"""
    return {item["kind"]: item["label"] for item in template(template_id)["relations"]}


def template_relations(template_id: str) -> list:
    """模版自带的关系清单（界面左侧那一列）。"""
    return [dict(item) for item in template(template_id)["relations"]]


def template_payload(template_id: str) -> dict:
    """给前端的模版说明（含示意图）。"""
    item = template(template_id)
    return {
        "id": item["id"],
        "name": item["name"],
        "tagline": item["tagline"],
        "summary": item["summary"],
        "accent": item["accent"],
        "icon": item["icon"],
        "relations": template_relations(item["id"]),
        "demo": item["demo"],
    }


def grid_payload() -> dict:
    """画布网格参数：前后端必须用同一份，不然卡片就贴不上网格了。"""
    return {
        "grid": GRID,
        "card_cols": CARD_COLS,
        "card_rows": CARD_ROWS,
        "gap_x": GAP_X,
        "gap_y": GAP_Y,
        "col_step": COL_STEP,
        "row_step": ROW_STEP,
    }
