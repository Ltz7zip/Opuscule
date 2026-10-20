from django.conf import settings
from django.db import models

from apps.cards.models import Card
from apps.common.models import TimeStampedModel
from apps.worlds.models import World


class Timeline(TimeStampedModel):
    world = models.ForeignKey(World, on_delete=models.CASCADE, related_name="timelines")
    name = models.CharField(max_length=80)
    slug = models.SlugField(max_length=80)
    color = models.CharField(max_length=16, blank=True, default="blue")
    is_default = models.BooleanField(default=False)

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(fields=["world", "slug"], name="timelines_unique_world_slug")
        ]

    def __str__(self) -> str:
        return f"{self.world.name}: {self.name}"


class TimelineEntry(TimeStampedModel):
    world = models.ForeignKey(World, on_delete=models.CASCADE, related_name="timeline_entries")
    timeline = models.ForeignKey(
        Timeline,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="entries",
    )
    card = models.ForeignKey(
        Card,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="timeline_entries",
    )
    year = models.IntegerField()
    month = models.PositiveSmallIntegerField(null=True, blank=True)
    end_year = models.IntegerField(null=True, blank=True)
    era = models.CharField(max_length=80, blank=True, default="")
    title = models.CharField(max_length=160)
    description = models.TextField(blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="timeline_entries",
    )

    class Meta:
        ordering = ["year", "id"]

    def __str__(self) -> str:
        return f"{self.year} · {self.title}"


class Era(TimeStampedModel):
    world = models.ForeignKey(World, on_delete=models.CASCADE, related_name="eras")
    name = models.CharField(max_length=80)
    start_year = models.IntegerField()
    end_year = models.IntegerField()
    color = models.CharField(max_length=16, blank=True, default="blue")

    class Meta:
        ordering = ["start_year", "id"]
        constraints = [
            models.UniqueConstraint(fields=["world", "name"], name="eras_unique_world_name")
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.start_year}–{self.end_year})"
