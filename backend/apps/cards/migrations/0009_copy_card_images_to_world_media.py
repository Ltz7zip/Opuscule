from django.db import migrations


def copy_card_images(apps, schema_editor):
    """Backfill the shared world media library from legacy card images.

    The legacy CardImage table is intentionally retained: this is a copy, not
    a destructive migration. The card image API also dual-writes WorldMedia so
    old clients keep the shared library in sync.
    """
    CardImage = apps.get_model("cards", "CardImage")
    WorldMedia = apps.get_model("worlds", "WorldMedia")

    for image in CardImage.objects.select_related("card").iterator():
        name = image.file.name.rsplit("/", 1)[-1] if image.file else ""
        media = WorldMedia.objects.create(
            world_id=image.card.world_id,
            file=image.file.name if image.file else "",
            name=name,
            uploaded_by_id=image.created_by_id,
        )
        WorldMedia.objects.filter(pk=media.pk).update(
            created_at=image.created_at,
            updated_at=image.updated_at,
        )


class Migration(migrations.Migration):
    dependencies = [
        ("cards", "0008_alter_card_options_card_deleted_at_card_deleted_by_and_more"),
        ("worlds", "0012_alter_worldauditevent_action_worldconcept_worldmedia"),
    ]

    operations = [
        migrations.RunPython(copy_card_images, migrations.RunPython.noop),
    ]
