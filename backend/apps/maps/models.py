from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.cards.models import Card
from apps.common.models import TimeStampedModel
from apps.worlds.models import World


class MapMarker(TimeStampedModel):
    class Kind(models.TextChoices):
        PLACE = "place", "Place"
        EVENT = "event", "Event"
        CHARACTER = "character", "Character"
        NOTE = "note", "Note"

    world = models.ForeignKey(World, on_delete=models.CASCADE, related_name="map_markers")
    card = models.ForeignKey(
        Card,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="map_markers",
    )
    label = models.CharField(max_length=120)
    kind = models.CharField(max_length=16, choices=Kind.choices, default=Kind.PLACE)
    x = models.FloatField(validators=[MinValueValidator(0), MaxValueValidator(1)])
    y = models.FloatField(validators=[MinValueValidator(0), MaxValueValidator(1)])
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="map_markers",
    )

    class Meta:
        ordering = ["id"]

    def __str__(self) -> str:
        return self.label
