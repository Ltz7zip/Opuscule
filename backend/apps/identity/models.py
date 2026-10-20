from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel


class UserProfile(TimeStampedModel):
    """Public author page at /u/<username>.

    P0.3 keeps the stable profile fields. Legacy blocks/layout/accent editing
    stays a P0.4 parity item instead of pretending the full customizer exists.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile",
    )
    display_name = models.CharField(max_length=80, blank=True, default="")
    headline = models.CharField(max_length=120, blank=True, default="")
    bio = models.TextField(blank=True, default="")
    location = models.CharField(max_length=80, blank=True, default="")
    website = models.CharField(max_length=300, blank=True, default="")
    links = models.JSONField(default=list, blank=True)
    pinned = models.JSONField(default=list, blank=True)
    is_public = models.BooleanField(default=True)
    failed_login_count = models.PositiveSmallIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)
    accent = models.CharField(max_length=16, default="#d4d4d8")
    # Legacy parity fields: P0.3 stores them but does not render the block
    # editor yet; P0.4 decides whether to rebuild the customizer.
    layout = models.CharField(
        max_length=8,
        choices=[("two", "双栏"), ("single", "单栏")],
        default="two",
    )
    blocks = models.JSONField(default=list, blank=True)

    class Meta:
        verbose_name = "个人主页"
        verbose_name_plural = "个人主页"

    def __str__(self) -> str:
        return f"{self.user.get_username()} 的主页"

    @property
    def name(self) -> str:
        return self.display_name.strip() or self.user.get_full_name() or self.user.get_username()
