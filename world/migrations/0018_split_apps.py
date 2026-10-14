# -*- coding: utf-8 -*-
"""R2 拆 app：把文档 / 发布 / 地图 / 关系树从 ``world`` 迁到各自的应用。

**这条迁移不碰数据库**：表名沿用了 ``world_*``（各模型的 ``Meta.db_table`` 已钉死），
所以「旧模型删除 + 新模型创建」只发生在 Django 的迁移状态里，
``database_operations`` 留空即代表零 SQL、零数据搬运。

历史迁移（``world/0001~0017``）仍会照常建出全部 ``world_*`` 表，
故全新库也能从零跑到这里；已有库则仅记录这条迁移为已应用。
"""

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("world", "0017_world_ban_reason_world_banned_until_report"),
    ]

    #: 状态操作：把已迁出的模型从 ``world`` 的迁移状态里摘掉（不生成任何 SQL）。
    state_operations = [
        migrations.RemoveField(
            model_name="card",
            name="document",
        ),
        migrations.RemoveField(
            model_name="card",
            name="entity_type",
        ),
        migrations.RemoveField(
            model_name="document",
            name="entity_type",
        ),
        migrations.RemoveField(
            model_name="document",
            name="era",
        ),
        migrations.RemoveField(
            model_name="document",
            name="forked_from",
        ),
        migrations.RemoveField(
            model_name="document",
            name="parent",
        ),
        migrations.RemoveField(
            model_name="document",
            name="world",
        ),
        migrations.RemoveField(
            model_name="mapmarker",
            name="card",
        ),
        migrations.RemoveField(
            model_name="presence",
            name="document",
        ),
        migrations.RemoveField(
            model_name="treenode",
            name="card",
        ),
        migrations.RemoveField(
            model_name="treevariant",
            name="document",
        ),
        migrations.RemoveField(
            model_name="documentversion",
            name="document",
        ),
        migrations.RemoveField(
            model_name="mapmarker",
            name="document",
        ),
        migrations.RemoveField(
            model_name="timelineevent",
            name="featured_card",
        ),
        migrations.RemoveField(
            model_name="timelineevent",
            name="linked_cards",
        ),
        migrations.RemoveField(
            model_name="maplayer",
            name="document",
        ),
        migrations.RemoveField(
            model_name="timelineevent",
            name="document",
        ),
        migrations.AlterUniqueTogether(
            name="documentversion",
            unique_together=None,
        ),
        migrations.RemoveField(
            model_name="documentversion",
            name="author",
        ),
        migrations.RemoveField(
            model_name="era",
            name="world",
        ),
        migrations.RemoveField(
            model_name="timelineevent",
            name="era",
        ),
        migrations.RemoveField(
            model_name="mapmarker",
            name="layer",
        ),
        migrations.AlterUniqueTogether(
            name="presence",
            unique_together=None,
        ),
        migrations.RemoveField(
            model_name="presence",
            name="user",
        ),
        migrations.RemoveField(
            model_name="presence",
            name="world",
        ),
        migrations.RemoveField(
            model_name="publishlog",
            name="author",
        ),
        migrations.RemoveField(
            model_name="publishlog",
            name="world",
        ),
        migrations.AlterUniqueTogether(
            name="treeedge",
            unique_together=None,
        ),
        migrations.RemoveField(
            model_name="treeedge",
            name="source",
        ),
        migrations.RemoveField(
            model_name="treeedge",
            name="target",
        ),
        migrations.RemoveField(
            model_name="treeedge",
            name="variant",
        ),
        migrations.RemoveField(
            model_name="treenode",
            name="variant",
        ),
        migrations.DeleteModel(
            name="Calendar",
        ),
        migrations.DeleteModel(
            name="Card",
        ),
        migrations.DeleteModel(
            name="Document",
        ),
        migrations.DeleteModel(
            name="DocumentVersion",
        ),
        migrations.DeleteModel(
            name="Era",
        ),
        migrations.DeleteModel(
            name="TimelineEvent",
        ),
        migrations.DeleteModel(
            name="MapLayer",
        ),
        migrations.DeleteModel(
            name="MapMarker",
        ),
        migrations.DeleteModel(
            name="Presence",
        ),
        migrations.DeleteModel(
            name="PublishLog",
        ),
        migrations.DeleteModel(
            name="TreeEdge",
        ),
        migrations.DeleteModel(
            name="TreeNode",
        ),
        migrations.DeleteModel(
            name="TreeVariant",
        ),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=state_operations,
            database_operations=[],
        ),
    ]
