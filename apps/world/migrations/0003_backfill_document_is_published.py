# -*- coding: utf-8 -*-
"""把历史文档的 ``is_published`` 置为 True。

这个字段在 0002 之前是「已发布」（默认 False，其实没人写过），
语义改成「包含进站点」之后默认值变成 True——但已经存在的行还是 False，
会让所有老文档在站点上被当成"已排除"。这里统一回填一次。
"""

from django.db import migrations


def forwards(apps, schema_editor):
    Document = apps.get_model("world", "Document")
    Document.objects.filter(is_published=False, hidden=False).update(is_published=True)


def backwards(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [("world", "0002_document_published_at_document_published_version_and_more")]
    operations = [migrations.RunPython(forwards, backwards)]
