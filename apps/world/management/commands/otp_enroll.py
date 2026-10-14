# -*- coding: utf-8 -*-
"""给后台超级管理员录入两步验证设备（TOTP / 静态备用码）。

为什么需要一个命令行入口：后台（``OTPAdminSite``）要求登录者**已通过两步验证**，
而新账号还没有任何设备——「要进后台才能建设备、要建设备才能进后台」是个死结。
所以首次录入、以及换手机后重录，都从命令行做（见 docs/13-部署与运维.md §4.11）。

用法：

    # 录入（或重新查看）TOTP 设备：把打印的 otpauth:// 串或密钥填进认证器 App
    python manage.py otp_enroll root

    # 换手机／密钥疑似泄露：丢掉旧设备、换一个全新密钥
    python manage.py otp_enroll root --reset

    # 顺带打印 5 个一次性备用码（认证器丢了用它救急，每个只能用一次）
    python manage.py otp_enroll root --backup-codes 5

打印出的密钥等同于登录凭据，请勿贴进聊天记录／工单，用完结即从屏幕与终端历史里清掉。
"""
from base64 import b32encode

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django_otp.plugins.otp_static.models import StaticDevice, StaticToken
from django_otp.plugins.otp_totp.models import TOTPDevice


class Command(BaseCommand):
    help = "给指定用户录入后台两步验证设备（TOTP），可选生成一次性备用码。"

    def add_arguments(self, parser):
        parser.add_argument("username", help="要录入设备的用户名（后台超级管理员）")
        parser.add_argument(
            "--name",
            default="authenticator",
            help="设备名，认证器 App 里用它区分多台设备（默认 authenticator）",
        )
        parser.add_argument(
            "--reset",
            action="store_true",
            help="丢弃该用户已有的 TOTP 设备，换一个全新密钥（旧密钥随之作废）",
        )
        parser.add_argument(
            "--backup-codes",
            type=int,
            default=0,
            metavar="N",
            help="另外生成 N 个一次性备用码（默认 0，不生成）",
        )

    def handle(self, *args, **options):
        username = options["username"]
        User = get_user_model()
        try:
            user = User.objects.get_by_natural_key(username)
        except User.DoesNotExist:
            raise CommandError(f'用户 "{username}" 不存在。')

        if not user.is_superuser:
            # 不拦死，但要说清楚：后台只认超级管理员，给普通用户录了也没用。
            self.stdout.write(self.style.WARNING(
                f'注意："{username}" 不是超级管理员，录了也进不了后台（后台只认 is_superuser）。'
            ))

        device = self._enroll_totp(user, options["name"], options["reset"])

        secret = b32encode(device.bin_key).decode()
        self.stdout.write(self.style.SUCCESS(f'已为 "{username}" 准备 TOTP 设备（{device.name}）。'))
        self.stdout.write("用认证器 App（Google Authenticator / 1Password 等）扫或以手动方式录入：")
        self.stdout.write("")
        self.stdout.write(f"  otpauth:  {device.config_url}")
        self.stdout.write(f"  密钥:     {secret}")
        self.stdout.write("")
        self.stdout.write("录入后打开后台登录页，除口令外再填 App 显示的 6 位验证码即可进入。")

        if options["backup_codes"]:
            self._print_backup_codes(user, options["backup_codes"])

    def _enroll_totp(self, user, name, reset):
        """取该用户已有的 TOTP 设备；没有（或 --reset）就新建一个。"""
        existing = TOTPDevice.objects.filter(user=user)
        if reset:
            existing.delete()
        else:
            device = existing.first()
            if device is not None:
                return device
        return TOTPDevice.objects.create(user=user, name=name, confirmed=True)

    def _print_backup_codes(self, user, count):
        """把一次性备用码挂在（必要时新建的）Backup Code 静态设备上。"""
        device = StaticDevice.objects.filter(user=user).first()
        if device is None:
            device = StaticDevice.objects.create(user=user, name="Backup Code")
        tokens = [device.token_set.create(token=StaticToken.random_token()).token
                  for _ in range(count)]

        self.stdout.write("")
        self.stdout.write(self.style.WARNING(
            f"以下 {count} 个备用码各只能用一次，请离线抄下、妥善保管（屏幕上的这份不会再显示）："
        ))
        for token in tokens:
            self.stdout.write(f"  {token}")
        self.stdout.write("登录时在「OTP Device」里选 Backup Code，填任意一个未用过的即可。")
