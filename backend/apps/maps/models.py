from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.cards.models import Card
from apps.common.models import TimeStampedModel
from apps.worlds.models import World


class MapMarker(TimeStampedModel):
    class Kind(models.TextChoices):
        PLACE = "place", "Place"
        CITY = "city", "City"
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


class TerrainUploadToken(TimeStampedModel):
    """Per-world bearer token for uploading locally generated terrain.

    One world, one card: a leaked token can only replace that world's terrain.
    The plaintext is shown once when minted; only the SHA-256 hash is stored.
    """

    world = models.ForeignKey(
        World,
        on_delete=models.CASCADE,
        related_name="terrain_tokens",
    )
    prefix = models.CharField(max_length=12, db_index=True)
    token_hash = models.CharField(max_length=64, unique=True)
    label = models.CharField(max_length=80, blank=True, default="")
    last_used_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "地形上传令牌"
        verbose_name_plural = "地形上传令牌"

    def __str__(self) -> str:
        return f"{self.prefix}… → {self.world_id}"

    @property
    def is_active(self) -> bool:
        from django.utils import timezone

        if self.revoked_at is not None:
            return False
        return self.expires_at is None or self.expires_at > timezone.now()
