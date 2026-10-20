from django.conf import settings
from django.db import models

from apps.collections.models import Collection
from apps.common.models import TimeStampedModel
from apps.worlds.models import World


def plain_text(node: object) -> str:
    """Flatten a Tiptap JSON document into searchable text."""
    if not isinstance(node, dict):
        return ""
    parts: list[str] = []
    text = node.get("text")
    if isinstance(text, str):
        parts.append(text)
    for child in node.get("content") or []:
        parts.append(plain_text(child))
    return " ".join(part for part in parts if part).strip()


class Card(TimeStampedModel):
    class Kind(models.TextChoices):
        CONTENT = "content", "Content"
        TOOL = "tool", "Tool"

    world = models.ForeignKey(World, on_delete=models.CASCADE, related_name="cards")
    home_collection = models.ForeignKey(
        Collection,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="cards",
    )
    kind = models.CharField(max_length=16, choices=Kind.choices, default=Kind.CONTENT)
    type_key = models.CharField(max_length=80, blank=True, default="")
    title = models.CharField(max_length=240)
    slug = models.SlugField(max_length=120)
    icon = models.CharField(max_length=16, blank=True, default="")
    cover = models.CharField(max_length=500, blank=True, default="")
    body_json = models.JSONField(default=dict, blank=True)
    body_text = models.TextField(blank=True, default="")
    is_public = models.BooleanField(default=True)
    is_auxiliary = models.BooleanField(default=False)
    presence_json = models.JSONField(default=dict, blank=True)
    revision = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(
                fields=["world", "slug"],
                name="cards_unique_world_slug",
            )
        ]
        indexes = [
            models.Index(fields=["world", "home_collection", "is_auxiliary"]),
            models.Index(fields=["world", "is_auxiliary", "updated_at"]),
        ]

    def save(self, *args: object, **kwargs: object) -> None:
        if not self.body_text and self.body_json:
            self.body_text = plain_text(self.body_json)
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.title


class CardImage(TimeStampedModel):
    card = models.ForeignKey(Card, on_delete=models.CASCADE, related_name="images")
    file = models.FileField(upload_to="card-images/")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="card_images",
    )

    class Meta:
        ordering = ["id"]

    def __str__(self) -> str:
        return f"{self.card.title}: {self.file.name}"


class CardComment(TimeStampedModel):
    card = models.ForeignKey(Card, on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="card_comments",
    )
    body = models.TextField(max_length=2000)
    quote = models.TextField(blank=True, default="")
    anchor_id = models.CharField(max_length=64, blank=True, default="")
    resolved = models.BooleanField(default=False)
    parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="replies",
    )

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self) -> str:
        return f"{self.card.title}: {self.body[:40]}"


class Notification(TimeStampedModel):
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="sent_notifications",
    )
    card = models.ForeignKey(Card, null=True, blank=True, on_delete=models.CASCADE, related_name="notifications")
    comment = models.ForeignKey(CardComment, null=True, blank=True, on_delete=models.CASCADE, related_name="notifications")
    kind = models.CharField(max_length=32, default="comment")
    message = models.CharField(max_length=240)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self) -> str:
        return f"{self.recipient}: {self.message}"
