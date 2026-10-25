"""Mint, list and revoke per-world terrain upload tokens."""

from django.core.management.base import BaseCommand, CommandError

from apps.maps.models import TerrainUploadToken
from apps.maps.terrain_tokens import mint_token
from apps.worlds.models import World


class Command(BaseCommand):
    help = "创建/列出/吊销地形上传令牌（一世界一卡）"

    def add_arguments(self, parser):
        parser.add_argument("--world", help="世界 slug")
        parser.add_argument("--label", default="", help="备注，例如设备名")
        parser.add_argument("--list", action="store_true", help="列出令牌")
        parser.add_argument("--revoke", help="吊销前缀")

    def handle(self, *args, **options):
        if options["list"]:
            rows = TerrainUploadToken.objects.select_related("world").all()
            if not rows:
                self.stdout.write("没有令牌")
                return
            for row in rows:
                state = "有效" if row.is_active else "已失效"
                self.stdout.write(
                    f"{row.prefix}…  world={row.world.slug}  {state}  "
                    f"label={row.label or '-'}  last_used={row.last_used_at or '-'}"
                )
            return

        if options["revoke"]:
            updated = TerrainUploadToken.objects.filter(
                prefix=options["revoke"], revoked_at__isnull=True
            ).update(revoked_at=__import__("django.utils.timezone", fromlist=["now"]).now())
            if not updated:
                raise CommandError("没有找到可吊销的令牌")
            self.stdout.write(self.style.SUCCESS(f"已吊销 {updated} 个令牌"))
            return

        if not options["world"]:
            raise CommandError("需要 --world，或使用 --list / --revoke")
        try:
            world = World.objects.get(slug=options["world"])
        except World.DoesNotExist as exc:
            raise CommandError(f"世界不存在：{options['world']}") from exc

        row, plaintext = mint_token(world, label=options["label"])
        self.stdout.write(self.style.SUCCESS("令牌只显示这一次，请立即保存："))
        self.stdout.write(plaintext)
        self.stdout.write(f"prefix={row.prefix}… world={world.slug}")
