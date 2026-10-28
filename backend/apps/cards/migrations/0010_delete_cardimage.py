"""Retire the legacy per-card image table.

Its rows were copied into ``worlds.WorldMedia`` by ``0009`` and a read-only
audit reported zero remaining rows, so the table and its API can be dropped.
Shared world media is unaffected.
"""

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("cards", "0009_copy_card_images_to_world_media"),
    ]

    operations = [
        migrations.DeleteModel(name="CardImage"),
    ]
