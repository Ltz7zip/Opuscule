from django.db import models

from apps.common.models import TimeStampedModel
from apps.worlds.models import World


class Collection(TimeStampedModel):
    """A navigational node. Cards point at their single home collection."""

    world = models.ForeignKey(World, on_delete=models.CASCADE, related_name="collections")
    parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="children",
    )
    name = models.CharField(max_length=160)
    slug = models.SlugField(max_length=80)
    position_key = models.CharField(max_length=64, default="m")
    icon = models.CharField(max_length=40, blank=True, default="")
    description = models.TextField(blank=True, default="")
    is_public = models.BooleanField(default=True)

    class Meta:
        ordering = ["position_key", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["world", "slug"],
                name="collections_unique_world_slug",
            )
        ]
        indexes = [
            models.Index(fields=["world", "parent", "position_key"]),
        ]

    def __str__(self) -> str:
        return f"{self.world.slug}/{self.slug}"
