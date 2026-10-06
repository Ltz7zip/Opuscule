# -*- coding: utf-8 -*-
"""数据迁移：把 Flask 版留下的 data.json 导进数据库。

``python manage.py migrate`` 时自动跑这一次：

* 有可读的 data.json -> 按原 id 导入条目和视野（现有数据无缝搬过来）
* 没有 / 已损坏      -> 写入与 Flask 版一致的示例数据

导入逻辑复用 ``timeline/legacy.py``（接口写入用的是同一套 normalize），
所以导进来的数据格式和接口返回的格式必然一致。
"""

from django.db import migrations

from timeline.legacy import import_into_db, parse_legacy, read_legacy_file


def forwards(apps, schema_editor):
    item_model = apps.get_model("timeline", "TimelineItem")
    view_model = apps.get_model("timeline", "TimelineView")

    items, view = parse_legacy(read_legacy_file())
    import_into_db(items, view, item_model, view_model)


def backwards(apps, schema_editor):
    apps.get_model("timeline", "TimelineItem").objects.all().delete()
    apps.get_model("timeline", "TimelineView").objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("timeline", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
