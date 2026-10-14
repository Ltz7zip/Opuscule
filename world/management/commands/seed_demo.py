# -*- coding: utf-8 -*-
"""灌一份演示数据：类型 / 属性 / 文件夹 / 卡片 / 日历 / 纪元 / 时间线事件。

内容刻意贴着官网演示里的那个世界（Isarra Thornveil、Harrowdeep、The Balri Accords…），
方便一次性把各种文档类型、时间线与地图都造出来，对照着看。

    .venv/bin/python manage.py seed_demo            # 已有同名世界就跳过
    .venv/bin/python manage.py seed_demo --reset     # 先清空再灌
"""

from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from world.models import (
    CAL_CUSTOM,
    DOC_CARD,
    DOC_FOLDER,
    DOC_MAP,
    DOC_TIMELINE,
    DOC_TREE,
    EntityType,
    PropertyDef,
    World,
)
from world.normalize import blocks_to_text, normalize_blocks
from documents.models import Calendar, Card, Document, Era, TimelineEvent
from graph.models import TreeEdge, TreeNode, TreeVariant
from maps.models import MapLayer, MapMarker

WORLD_NAME = "The Grand Alchemy"


def text_block(title: str, text: str, bid: str) -> dict:
    return {"id": bid, "type": "text", "title": title, "text": text}


CARDS = [
    # (类型, 名称, 别名, 属性{属性名: 值}, 区块, 封面说明)
    ("角色", "Isarra Thornveil", ["The Untreated"], {
        "角色定位": "外交官",
        "阵营": "The Balri Accords",
        "年龄": 41,
    }, [
        text_block("概览", "Isarra Thornveil 是记载中最具分量的外交官之一：她的名字不与条约或旗帜相连，"
                           "而是与那些「就此停战」的战争相连。她没有留下文书、誓词或正式协议——只留下"
                           "敌对国家间那句不安的共识：再打下去已经不必要了。", "b1"),
        text_block("早年", "关于她的早年记载很少。出生记录给出好几种互相矛盾的说法：河城 Calreth、"
                           "Elnor 的边境、以及一处根本不存在的村庄。", "b2"),
        text_block("发现", "档案中反复出现的是：她受过的教育远超同时代女性——修辞与律法之外，还有后勤、"
                           "补给链与宗教习俗。后来的批评者会说，这正是她权力的根基。", "b3"),
    ]),
    ("地点", "Harrowdeep", [], {
        "人口": 1400,
        "主要出口": "铁矿石",
    }, [
        text_block("概览", "Harrowdeep 起初只是一处不起眼的采矿聚落，建在一条厚实的铁矿与板岩矿脉之上。"
                           "第一个世纪里它安静地扩张——用实用主义的坑道、竖井与加固过的洞室。", "b1"),
        text_block("发现", "在地质层深处，矿工们发现了大量已经凿好的洞室：石柱、拱券与走廊支撑着它们，"
                           "而通道循着某种并非为了采掘而设计的逻辑微微弯曲。", "b2"),
    ]),
    ("地点", "Redwake Harbor", [], {
        "人口": 2600,
        "主要出口": "渔获、船坞",
    }, [
        text_block("概览", "Redwake Harbor 是一处繁忙的港口城市，以造船业闻名。它坐落在一条形状像刀锋的"
                           "海湾上，工坊、码头与仓库一层层堆上斜坡。", "b1"),
        text_block("地理", "这座城是建立在与边境要塞之间的脆弱平衡上的；两者都清楚，一旦开战，"
                           "最先烧起来的是码头。", "b2"),
    ]),
    ("地点", "The Quiet Belt", [], {"人口": 320, "主要出口": "无"}, [
        text_block("概览", "一条被遗弃的矿带，只有守夜人还在。地图上它是一道细长的灰色伤痕。", "b1"),
    ]),
    ("阵营", "The Balri Accords", [], {"性质": "外交同盟"}, [
        text_block("概览", "由七座城市签署的停战协定，签字墨迹早已褪色，但边界仍在按它划分。", "b1"),
    ]),
    ("阵营", "The Second Watch", [], {"性质": "守夜人团"}, [
        text_block("概览", "驻守 The Quiet Belt 的守夜人；他们的薪饷由三座城市分摊，因此谁也不真正指挥得动他们。", "b1"),
    ]),
]

ERAS = [
    ("The Founding", "blue", 320, "铁脉被发现，第一批坑道开挖。"),
    ("The Quiet Century", "teal", 180, "没有战争的一百年，Harrowdeep 扩张到地下三层。"),
    ("The Broken Accord", "red", 0, "停战协定失效，港口第一次被点燃。"),
]

EVENTS = [
    ("Harrowdeep 建镇", "The Founding", 12, ["Harrowdeep"]),
    ("发现深层洞室", "The Quiet Century", 340, ["Harrowdeep"]),
    ("Balri 协定签署", "The Quiet Century", 402, ["The Balri Accords"]),
    ("Isarra 出任调停人", "The Quiet Century", 455, ["Isarra Thornveil", "The Balri Accords"]),
    ("港口大火", "The Broken Accord", 31, ["Redwake Harbor"]),
    ("守夜人接管矿带", "The Broken Accord", 34, ["The Quiet Belt", "The Second Watch"]),
]


class Command(BaseCommand):
    help = "灌入一份演示数据（类型 / 属性 / 卡片 / 日历 / 纪元 / 时间线）"

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="先删掉同名世界再灌")

    @transaction.atomic
    def handle(self, *args, **options):
        if options["reset"]:
            World.objects.filter(name=WORLD_NAME).delete()
        if World.objects.filter(name=WORLD_NAME).exists():
            self.stdout.write(self.style.WARNING(f"「{WORLD_NAME}」已存在，跳过（用 --reset 覆盖）"))
            return

        world = World.objects.create(
            name=WORLD_NAME,
            description="一份用来演示各项功能的示例世界。",
            theme_config={
                "mode": "dark",
                "grain": 22,
                "headingFont": "EB Garamond",
                "bodyFont": "DM Sans",
                "primaryColor": "#3f3416",
            },
            genres=["dark-fantasy"],
        )
        calendar = self._calendar(world)
        types = self._types(world)
        cards = self._cards(world, types)
        eras = self._eras(world)
        self._timeline(world, calendar, eras, cards)
        self._tree(world, types, cards)
        self._map(world, cards)
        self.stdout.write(self.style.SUCCESS(
            f"完成：{world.name}（{world.slug}）· {len(types)} 个类型 · {len(cards)} 张卡片 · "
            f"{len(eras)} 个纪元 · {len(EVENTS)} 个事件"
        ))

    # -- 日历 -------------------------------------------------------------- #
    def _calendar(self, world: World) -> Calendar:
        return Calendar.objects.create(
            world=world,
            name="The Reckoning",
            mode=CAL_CUSTOM,
            hours_per_day=24,
            months=[
                {"name": "Frostfall", "days": 28}, {"name": "Thaw", "days": 30},
                {"name": "Seedtime", "days": 31}, {"name": "Highsun", "days": 30},
                {"name": "Emberfall", "days": 31}, {"name": "Longnight", "days": 29},
            ],
            moons=[
                {"name": "Vess", "color": "sky", "cycle_days": 28, "full_on": 14, "shown": "quarters"},
                {"name": "Morrow", "color": "violet", "cycle_days": 45, "full_on": 22, "shown": "full"},
            ],
            default_precision="day",
        )

    # -- 类型与属性 -------------------------------------------------------- #
    def _types(self, world: World) -> dict:
        def make(name, icon, color, position, parent=None, properties=()):
            entity = EntityType.objects.create(
                world=world, name=name, icon=icon, color=color, position=position, parent=parent
            )
            for index, (pname, vtype, extra) in enumerate(properties, start=1):
                PropertyDef.objects.create(
                    entity_type=entity, name=pname, value_type=vtype, position=index, **extra
                )
            return entity

        role = make("角色", "user", "gold", 1, properties=(
            ("角色定位", "text", {"description": "在外交 / 军事 / 宗教里的位置"}),
            ("阵营", "reference", {"reference_type": None}),
            ("年龄", "number", {}),
            ("头衔", "multiselect", {"options": [{"label": "调停人", "color": "sky"},
                                                 {"label": "无冕者", "color": "violet"}]}),
        ))
        place = make("地点", "pin", "teal", 2, properties=(
            ("人口", "number", {}),
            ("主要出口", "text", {}),
            ("危险等级", "select", {"options": [{"label": "低", "color": "green"},
                                                {"label": "中", "color": "orange"},
                                                {"label": "高", "color": "red"}]}),
        ))
        faction = make("阵营", "flag", "violet", 3, properties=(
            ("性质", "text", {}),
            ("成员数", "number", {}),
            ("影响力", "formula", {"formula": "@[成员数] * 2"}),
        ))
        make("事件", "clock", "red", 4, properties=(
            ("发生地", "reference", {}),
            ("影响", "text", {}),
        ))
        make("物品", "gem", "blue", 5, properties=(
            ("稀有度", "number", {}),
            ("价格", "number", {}),
            ("估值", "formula", {"formula": "@[稀有度] * @[价格]"}),
        ))
        # 子类型演示：角色 → 统治者
        make("统治者", "crown", "gold", 6, parent=role, properties=(("在位年限", "number", {}),))
        return {t.name: t for t in world.types.all()}

    # -- 卡片 -------------------------------------------------------------- #
    def _cards(self, world: World, types: dict) -> dict:
        folders = {}
        for index, (name, icon, color) in enumerate(
            [("人物与势力", "users", "gold"), ("地点", "map", "teal"), ("势力与组织", "flag", "violet")],
            start=1,
        ):
            folders[name] = Document.objects.create(
                world=world, document_type=DOC_FOLDER, name=name, position=index,
                settings={"icon": icon, "color": color},
            )

        folder_of = {"角色": "人物与势力", "统治者": "人物与势力", "地点": "地点", "阵营": "势力与组织"}

        def position_for(folder_name, type_name):
            parent = folders.get(folder_name)
            return Document.objects.filter(parent=parent).count() + 1, parent

        cards = {}
        # 先建主名，便于阵营引用回填
        for type_name, name, aliases, props, blocks in CARDS:
            folder_name = folder_of.get(type_name, "")
            position, parent = position_for(folder_name, type_name)
            document = Document.objects.create(
                world=world, document_type=DOC_CARD, name=name, position=position, parent=parent,
                entity_type=types[type_name],
            )
            card = Card.objects.create(
                document=document,
                entity_type=types[type_name],
                aliases=aliases,
                blocks=normalize_blocks(blocks),
            )
            card.body = blocks_to_text(card.blocks)
            card.save(update_fields=["body"])
            cards[name] = (document, props)

        # 回填属性（引用类型要等目标卡片存在）
        for name, (document, props) in cards.items():
            entity_type = document.entity_type
            by_name = {p.name: p for p in entity_type.all_properties()}
            values = dict(getattr(document, "card").values or {})
            for prop_name, raw in props.items():
                prop = by_name.get(prop_name)
                if prop is None:
                    continue
                if prop.value_type == "reference":
                    target = cards.get(str(raw))
                    values[str(prop.id)] = target[0].id if target else None
                else:
                    values[str(prop.id)] = raw
            card = document.card
            card.values = values
            card.save(update_fields=["values"])
        return {name: doc for name, (doc, _props) in cards.items()}

    # -- 关系树 ------------------------------------------------------------ #
    def _tree(self, world: World, types: dict, cards: dict) -> None:
        document = Document.objects.create(
            world=world, document_type=DOC_TREE, name="Isarra 家谱", position=4,
        )
        variant = TreeVariant.objects.create(document=document, name="Main", kind="family",
                                             edge_labels={"parent": "生父 / 生母"})
        people = [
            ("Elder Marrow", 0, 0, {"junction": False, "subtitle": "家族之长"}),
            ("Sera Thornveil", 0, 220, {
                "subtitle": "记录者",
                "image": ("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'>"
                          "<rect width='100' height='100' fill='%233f3416'/>"
                          "<circle cx='50' cy='38' r='20' fill='%23e0c07a'/>"
                          "<path d='M14 100 Q50 58 86 100 Z' fill='%23e0c07a'/></svg>"),
            }),
            ("Isarra Thornveil", 1, 110, {"card": cards.get("Isarra Thornveil")}),
            ("Brother Calyx", 1, 330, {"subtitle": "守夜人"}),
            ("Tamsin of the Third", 2, 60, {"deceased": True, "subtitle": "殁于港口大火"}),
            ("Kesh the Listener", 2, 300, {"junction": True, "subtitle": "支系交汇"}),
        ]
        nodes = {}
        for name, generation, x, extra in people:
            card = extra.pop("card", None)
            nodes[name] = TreeNode.objects.create(
                variant=variant, name=name, generation=generation, x=x,
                position=len(nodes) + 1, **extra,
            )
            if card is not None:
                nodes[name].card = card
                nodes[name].save(update_fields=["card"])

        for source, target, kind in [
            ("Elder Marrow", "Isarra Thornveil", "parent"),
            ("Sera Thornveil", "Isarra Thornveil", "parent"),
            ("Elder Marrow", "Brother Calyx", "parent"),
            ("Isarra Thornveil", "Tamsin of the Third", "parent"),
            ("Brother Calyx", "Kesh the Listener", "parent"),
            ("Elder Marrow", "Sera Thornveil", "spouse"),
        ]:
            TreeEdge.objects.create(variant=variant, source=nodes[source], target=nodes[target], kind=kind)
        variant.settings = {"labels": "hover"}
        variant.save(update_fields=["settings"])
        document.settings = {"active_variant": variant.id}
        document.save(update_fields=["settings"])

    # -- 经典地图 ---------------------------------------------------------- #
    def _map(self, world: World, cards: dict) -> None:
        document = Document.objects.create(
            world=world, document_type=DOC_MAP, name="世界地图", position=5,
            cover="",
        )
        layer = MapLayer.objects.create(document=document, name="地表", position=1)
        deep = MapLayer.objects.create(document=document, name="地下", position=2, opacity=0.7)

        # 底图用一个内联 SVG（离线也能看），真实使用时上传或粘贴图片地址
        document.settings = {
            "background": (
                "data:image/svg+xml;utf8,"
                "<svg xmlns='http://www.w3.org/2000/svg' width='1280' height='800'>"
                "<defs><linearGradient id='sea' x1='0' y1='0' x2='0' y2='1'>"
                "<stop offset='0' stop-color='%231b3a4a'/><stop offset='1' stop-color='%230f2430'/>"
                "</linearGradient></defs>"
                "<rect width='1280' height='800' fill='url(%23sea)'/>"
                "<path d='M120 520 L260 300 L430 260 L560 360 L520 560 L330 640 Z' fill='%233c4a2a' stroke='%235d6b3a' stroke-width='6'/>"
                "<path d='M700 200 L980 180 L1120 320 L1040 520 L820 560 L700 420 Z' fill='%234a4a2c' stroke='%236e6a3c' stroke-width='6'/>"
                "<path d='M600 620 L760 600 L800 700 L640 740 Z' fill='%233a4a30' stroke='%235d6b3a' stroke-width='5'/>"
                "</svg>"
            ),
            "bg_zoom": 1,
        }
        document.save(update_fields=["settings"])

        pins = [
            ("Harrowdeep", 34, 46, "teal", cards.get("Harrowdeep")),
            ("Redwake Harbor", 78, 40, "gold", cards.get("Redwake Harbor")),
            ("The Quiet Belt", 24, 52, "violet", cards.get("The Quiet Belt")),
            ("Balri 会址", 58, 30, "sky", cards.get("The Balri Accords")),
        ]
        for name, x, y, color, card in pins:
            MapMarker.objects.create(
                document=document, layer=layer, kind="pin", name=name, x=x, y=y, color=color,
                card=card, position=1,
            )
        MapMarker.objects.create(
            document=document, layer=deep, kind="zone", name="深层洞室", color="red",
            points=[[30, 44], [40, 40], [46, 48], [38, 54]], position=2,
        )
        MapMarker.objects.create(
            document=document, layer=layer, kind="zone", name="The Saltbound Coast", color="sky",
            points=[[62, 18], [92, 14], [96, 44], [70, 50]], position=3,
        )
        MapMarker.objects.create(
            document=document, layer=layer, kind="label", name="The Shattered Vale",
            x=22, y=22, color="gold", scale=1.8, rotation=-4, position=4,
        )
        MapMarker.objects.create(
            document=document, layer=layer, kind="label", name="Harrow I.", x=36, y=58,
            color="teal", scale=1.2, position=5,
        )

    # -- 纪元与时间线 ------------------------------------------------------ #
    def _eras(self, world: World) -> dict:
        eras = {}
        for index, (name, theme, length, desc) in enumerate(ERAS, start=1):
            eras[name] = Era.objects.create(
                world=world, name=name, position=index, length_years=length, theme=theme, description=desc
            )
        return eras

    def _timeline(self, world: World, calendar: Calendar, eras: dict, cards: dict) -> Document:
        document = Document.objects.create(
            world=world, document_type=DOC_TIMELINE, name="世界时间线", position=3,
            settings={"calendar": calendar.id, "view_start": -20.0, "view_end": 520.0},
        )
        for index, (title, era_name, year, linked) in enumerate(EVENTS, start=1):
            event = TimelineEvent.objects.create(
                document=document, title=title, precision="year", year=year, month=1, day=1,
                era=eras.get(era_name), position=index, row=index % 3,
                description=f"{era_name} · 第 {year} 年",
            )
            for name in linked:
                target = cards.get(name)
                if target is not None:
                    event.linked_cards.add(target)
            first = cards.get(linked[0]) if linked else None
            if first is not None:
                event.featured_card = first
                event.save(update_fields=["featured_card"])
        return document
