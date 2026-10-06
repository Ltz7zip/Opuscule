# -*- coding: utf-8 -*-
"""把别的 JSON 文件导入数据库。

    python manage.py import_legacy_json 备份.json            # 同 id 覆盖，没有 id 的当新记录
    python manage.py import_legacy_json 备份.json --replace  # 先清空条目表再导入

文件格式就是原 Flask 版 data.json 那种：``{"view": {...}, "items": [...]}``
（早期只存一个数组的版本也认）。data.json 本身已在迁移完成后删除，
所以这里必须显式给出文件路径；读不到文件会直接报错，不会往库里写示例数据。
"""

from django.core.management.base import BaseCommand, CommandError

from timeline.legacy import import_legacy_file


class Command(BaseCommand):
    help = "把老格式的 JSON（{view, items}）导入 SQLite；同 id 覆盖，没有 id 的当新记录"

    def add_arguments(self, parser):
        parser.add_argument(
            "path",
            help="要导入的 JSON 文件路径（原 Flask 版 data.json 已删除，这里必须显式指定）",
        )
        parser.add_argument(
            "--replace",
            action="store_true",
            help="导入前先清空时间轴条目表（视野不受影响）",
        )

    def handle(self, *args, **options):
        try:
            source, written = import_legacy_file(options["path"], replace=options["replace"], strict=True)
        except OSError as exc:
            raise CommandError(
                f"{exc}\n"
                "原 Flask 版的 data.json 已在数据迁移完成后删除，请显式给出要导入的文件路径；\n"
                "如果只是想看一眼示例数据长什么样，删掉 db.sqlite3 重新 migrate 即可。"
            ) from exc

        self.stdout.write(f"数据来源：{source}")
        self.stdout.write(self.style.SUCCESS(f"已写入 {written} 条时间轴记录。"))
