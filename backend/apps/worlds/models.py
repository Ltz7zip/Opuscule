from datetime import timedelta
import secrets

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.common.models import TimeStampedModel


class WorldQuerySet(models.QuerySet):
    def active(self):
        return self.filter(deleted_at__isnull=True)


class WorldManager(models.Manager.from_queryset(WorldQuerySet)):
    def get_queryset(self):
        return super().get_queryset().filter(deleted_at__isnull=True)


class World(TimeStampedModel):
    class Kind(models.TextChoices):
        SHARED = "shared", "Shared"
        PRIVATE = "private", "Private"

    slug = models.SlugField(max_length=80, unique=True)
    name = models.CharField(max_length=160)
    description = models.TextField(blank=True, default="")
    kind = models.CharField(max_length=16, choices=Kind.choices, default=Kind.PRIVATE)
    is_public_read = models.BooleanField(default=True)
    published_at = models.DateTimeField(null=True, blank=True)
    theme_json = models.JSONField(default=dict, blank=True)
    map_background = models.FileField(upload_to="world-map-backgrounds/", blank=True, default="")
    terrain_web = models.JSONField(default=dict, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    objects = WorldManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ["id"]

    def __str__(self) -> str:
        return self.name

    def role_for(self, user) -> str | None:
        if not getattr(user, "is_authenticated", False):
            return None
        membership = self.memberships.filter(user=user).only("role").first()
        return membership.role if membership else None

    def can_read(self, user) -> bool:
        return self.is_public_read or self.role_for(user) is not None

    def can_edit(self, user) -> bool:
        return self.role_for(user) in {
            WorldMembership.Role.OWNER,
            WorldMembership.Role.EDITOR,
        }


class WorldMembership(TimeStampedModel):
    class Role(models.TextChoices):
        OWNER = "owner", "Owner"
        EDITOR = "editor", "Editor"
        VIEWER = "viewer", "Viewer"

    world = models.ForeignKey(World, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="world_memberships",
    )
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.VIEWER)

    class Meta:
        ordering = ["world_id", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["world", "user"],
                name="worlds_unique_membership",
            )
        ]
        indexes = [
            models.Index(fields=["user", "world"]),
        ]

    def __str__(self) -> str:
        return f"{self.world.slug}:{self.user} ({self.role})"


def invite_token() -> str:
    return secrets.token_urlsafe(32)


def invite_expiry():
    return timezone.now() + timedelta(days=7)


class WorldInvite(TimeStampedModel):
    class Role(models.TextChoices):
        EDITOR = "editor", "Editor"
        VIEWER = "viewer", "Viewer"

    world = models.ForeignKey(World, on_delete=models.CASCADE, related_name="invites")
    token = models.CharField(max_length=64, unique=True, default=invite_token)
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.VIEWER)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="world_invites",
    )
    expires_at = models.DateTimeField(default=invite_expiry)
    max_uses = models.PositiveIntegerField(default=1)
    used_count = models.PositiveIntegerField(default=0)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.world.slug}:{self.role}:{self.token[:8]}"

    @property
    def is_valid(self) -> bool:
        return (
            self.revoked_at is None
            and self.used_count < self.max_uses
            and self.expires_at > timezone.now()
        )

    def invalid_reason(self) -> str:
        if self.revoked_at is not None:
            return "邀请已撤销"
        if self.used_count >= self.max_uses:
            return "邀请已使用完"
        if self.expires_at <= timezone.now():
            return "邀请已过期"
        return ""


class WorldAuditEvent(models.Model):
    class Action(models.TextChoices):
        CREATED = "world.created", "世界创建"
        SETTINGS_UPDATED = "world.settings_updated", "世界设置更新"
        PUBLISHED = "world.published", "世界公开"
        UNPUBLISHED = "world.unpublished", "世界取消公开"
        DELETED = "world.deleted", "世界移入回收站"
        RESTORED = "world.restored", "世界恢复"
        MEMBER_ADDED = "member.added", "成员加入"
        MEMBER_ROLE_CHANGED = "member.role_changed", "成员角色变更"
        MEMBER_REMOVED = "member.removed", "成员移除"
        OWNERSHIP_TRANSFERRED = "ownership.transferred", "所有权转移"
        INVITE_CREATED = "invite.created", "邀请创建"
        INVITE_REVOKED = "invite.revoked", "邀请撤销"
        INVITE_ACCEPTED = "invite.accepted", "邀请接受"
        IMPORTED = "world.imported", "世界导入"
        TERRAIN_UPLOADED = "terrain.uploaded", "地形由本地生成上传"

    world = models.ForeignKey(World, on_delete=models.CASCADE, related_name="audit_events")
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="world_audit_events",
    )
    target_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    action = models.CharField(max_length=40, choices=Action.choices)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["world", "-created_at"])]

    def __str__(self) -> str:
        return f"{self.world.slug}:{self.action}"
