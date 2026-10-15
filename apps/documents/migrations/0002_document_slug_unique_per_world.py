# -*- coding: utf-8 -*-
"""文档 slug 在同一世界内唯一（2026-10-15 前端体检 F1）。

站点 URL 就是 ``slug``：一个世界内两份已发布文档共用同一个 slug 时，
``document_by_slug()`` 只命中其中一份，另一份在站点上永远打不开。
体检在真实库里抓到 `world=7 slug='未命名'` 两篇，所以分三步：

1. 先给历史重复数据去重（保留 id 最小的那条的原 slug，其余追加 ``-2``、``-3``…）；
2. 给 slug 加索引——站点每次打开文档都要按 slug 查，之前是无索引全表扫描；
3. 补一条数据库级唯一约束，兜住以后新写入的数据。

去重把回收站里的文档一起算：一篇文档被删掉后它在站点上的 URL 就失效了，
让新文档接手同一个 slug 会让读者手里的旧链接悄悄打开另一篇内容。
"""

from django.db import migrations, models


def dedupe_slugs(apps, schema_editor):
    """按 (world, slug) 把重复的 slug 改成 ``-2``、``-3``…（保留 id 最小的那条）。"""
    Document = apps.get_model("documents", "Document")
    seen = {}
    for doc in Document.objects.order_by("world_id", "id").iterator():
        key = (doc.world_id, doc.slug)
        if key not in seen:
            seen[key] = doc.pk
            continue
        base = (doc.slug or "untitled")[:74]        # 留出 `-NNN` 的位置（上限 80）
        index = 2
        while (doc.world_id, f"{base}-{index}") in seen:
            index += 1
        new_slug = f"{base}-{index}"
        doc.slug = new_slug
        doc.save(update_fields=["slug"])
        seen[(doc.world_id, new_slug)] = doc.pk


class Migration(migrations.Migration):

    dependencies = [("documents", "0001_initial")]

    operations = [
        migrations.RunPython(dedupe_slugs, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="document",
            name="slug",
            field=models.CharField(blank=True, db_index=True, default="", max_length=80, verbose_name="slug"),
        ),
        migrations.AddConstraint(
            model_name="document",
            constraint=models.UniqueConstraint(fields=["world", "slug"], name="uniq_document_slug_per_world"),
        ),
    ]
