import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from apps.cards.models import Card
from apps.collections.models import Collection
from apps.identity.models import UserProfile
from apps.worlds.models import World, WorldMembership


def doc(*blocks: dict) -> dict:
    return {"type": "doc", "content": list(blocks)}


def paragraph(text: str) -> dict:
    return {"type": "paragraph", "content": [{"type": "text", "text": text}]}


def heading(text: str, level: int = 2) -> dict:
    return {
        "type": "heading",
        "attrs": {"level": level},
        "content": [{"type": "text", "text": text}],
    }


def bullet_list(*items: str) -> dict:
    return {
        "type": "bulletList",
        "content": [
            {
                "type": "listItem",
                "content": [paragraph(item)],
            }
            for item in items
        ],
    }


class Command(BaseCommand):
    help = "Create the local demo world, collections, cards and owner login."

    def add_arguments(self, parser):
        parser.add_argument("--username", default="traveler")
        parser.add_argument(
            "--password",
            default=os.environ.get("OPUSCULE_DEMO_PASSWORD", "opuscule-demo"),
            help="Password for a newly created demo user.",
        )
        parser.add_argument(
            "--reset-password",
            action="store_true",
            help="Reset an existing demo user's password (invalidates its sessions).",
        )

    def handle(self, *args, **options):
        user_model = get_user_model()
        owner, created = user_model.objects.get_or_create(
            username=options["username"],
            defaults={"is_staff": True},
        )
        if created or options["reset_password"]:
            owner.set_password(options["password"])
            owner.is_staff = True
            owner.save(update_fields=["password", "is_staff"])

        world, _ = World.objects.update_or_create(
            slug="wuhai",
            defaults={
                "name": "雾海纪年",
                "description": "群屿被长雾切开，航海者用钟声与灯火辨认彼此。一个关于雾、潮汐与旧航线的世界。",
                "kind": World.Kind.PRIVATE,
                "is_public_read": True,
                "theme_json": {"accent": "#d4d4d8", "mood": "fog"},
            },
        )

        collections = {}
        for position, (name, slug, icon) in enumerate(
            [
                ("人物", "characters", "users"),
                ("地点", "places", "map-pin"),
                ("事件", "events", "clock"),
            ]
        ):
            collection, _ = Collection.objects.update_or_create(
                world=world,
                slug=slug,
                defaults={
                    "name": name,
                    "icon": icon,
                    "position_key": f"{position:04d}",
                    "is_public": True,
                },
            )
            collections[slug] = collection

        cards = [
            {
                "slug": "world-overview",
                "title": "世界概览",
                "type_key": "note",
                "home_collection": None,
                "body_json": doc(
                    heading("雾海纪年", 1),
                    paragraph(
                        "群屿被长雾切开，航海者用钟声与灯火辨认彼此。"
                        "潮汐历把一年分成十二次涨落，每次涨落都对应一段被记录的历史。"
                    ),
                    heading("当前焦点"),
                    bullet_list(
                        "白塔沉没后，雾港的航线被迫向北迁移。",
                        "旧王朝的航海图仍在使用，但标注已经与海底地形不符。",
                        "守夜人正在寻找能够重绘潮汐历的人。",
                    ),
                ),
            },
            {
                "slug": "livia",
                "title": "船长 · 莉薇娅",
                "type_key": "character",
                "home_collection": collections["characters"],
                "body_json": doc(
                    heading("船长 · 莉薇娅"),
                    paragraph(
                        "雾港最年轻的远洋船长。她相信雾不是障碍，而是尚未被读懂的地图。"
                    ),
                    heading("关系"),
                    bullet_list("与航海士柯尔共同持有“白塔残图”。", "对守夜人的封锁令保持公开敌意。"),
                ),
            },
            {
                "slug": "korr",
                "title": "航海士 · 柯尔",
                "type_key": "character",
                "home_collection": collections["characters"],
                "body_json": doc(
                    heading("航海士 · 柯尔"),
                    paragraph("负责潮汐测算与旧图校正，擅长在能见度不足时依靠钟声定位。"),
                ),
            },
            {
                "slug": "fog-harbor",
                "title": "雾港",
                "type_key": "place",
                "home_collection": collections["places"],
                "body_json": doc(
                    heading("雾港"),
                    paragraph("群岛北缘的深水港，以钟楼、船坞和终年不散的雾闻名。"),
                    heading("地标"),
                    bullet_list("七钟楼", "旧王朝船坞", "北岸灯塔"),
                ),
            },
            {
                "slug": "white-tower",
                "title": "白塔沉没",
                "type_key": "event",
                "home_collection": collections["events"],
                "body_json": doc(
                    heading("白塔沉没"),
                    paragraph("潮汐历 487 年，白塔在一次异常涨潮中沉入海底，旧航线自此失效。"),
                ),
            },
            {
                "slug": "tide-calendar",
                "title": "潮汐历",
                "type_key": "note",
                "home_collection": None,
                "body_json": doc(
                    heading("潮汐历"),
                    paragraph("以十二次涨落为一年的历法；每次涨落都有独立的潮名与守夜人记录。"),
                ),
            },
        ]

        WorldMembership.objects.update_or_create(
            world=world,
            user=owner,
            defaults={"role": WorldMembership.Role.OWNER},
        )
        UserProfile.objects.update_or_create(
            user=owner,
            defaults={
                "display_name": "旅人",
                "headline": "在雾里写世界的人",
                "bio": "记录群岛、钟声与潮汐。这里是我公开的世界入口。",
                "location": "雾港",
                "website": "/w/wuhai",
                "links": [
                    {"label": "公开世界", "url": "/"},
                    {"label": "工作区", "url": "/w/wuhai"},
                ],
                "pinned": [world.id],
                "is_public": True,
            },
        )

        for item in cards:
            Card.objects.update_or_create(
                world=world,
                slug=item["slug"],
                defaults={
                    "title": item["title"],
                    "type_key": item["type_key"],
                    "home_collection": item["home_collection"],
                    "body_json": item["body_json"],
                    "is_public": True,
                    "is_auxiliary": False,
                },
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"seeded {world.name}: {world.collections.count()} collections, "
                f"{world.cards.count()} cards; login={owner.username} "
                f"(password from --password / OPUSCULE_DEMO_PASSWORD)"
            )
        )
