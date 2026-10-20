import re
from rest_framework import serializers

from apps.worlds.models import WorldMembership

from .models import UserProfile

_SCHEME = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*:")
_ACCENT = re.compile(r"^#[0-9a-fA-F]{6}$")


def clean_url(value: object, limit: int = 300) -> str:
    text = str(value or "").strip()[:limit]
    if not text:
        return ""
    low = text.lower()
    if low.startswith(("http://", "https://", "mailto:")):
        return text
    if text.startswith("/") and not text.startswith("//"):
        return text
    if _SCHEME.match(text):
        return ""
    return f"https://{text}"


def clean_links(raw: object) -> list[dict]:
    result: list[dict] = []
    if not isinstance(raw, list):
        return result
    for item in raw:
        if not isinstance(item, dict):
            continue
        url = clean_url(item.get("url"))
        if not url:
            continue
        label = str(item.get("label") or url).strip()[:80]
        result.append({"label": label, "url": url})
        if len(result) >= 12:
            break
    return result


class UserProfileSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    name = serializers.CharField(read_only=True)
    avatar_initial = serializers.SerializerMethodField()
    links = serializers.JSONField(required=False)
    pinned = serializers.JSONField(required=False)

    class Meta:
        model = UserProfile
        fields = [
            "username",
            "name",
            "display_name",
            "headline",
            "bio",
            "location",
            "website",
            "links",
            "pinned",
            "is_public",
            "accent",
            "avatar_initial",
        ]
        extra_kwargs = {
            "display_name": {"required": False, "allow_blank": True},
            "headline": {"required": False, "allow_blank": True},
            "bio": {"required": False, "allow_blank": True},
            "location": {"required": False, "allow_blank": True},
            "website": {"required": False, "allow_blank": True},
            "is_public": {"required": False},
            "accent": {"required": False},
        }

    def get_avatar_initial(self, obj: UserProfile) -> str:
        source = obj.name.strip() or obj.user.get_username()
        return source[:1].upper()

    def validate_bio(self, value: str) -> str:
        return (value or "")[:4000]

    def validate_website(self, value: str) -> str:
        return clean_url(value)

    def validate_links(self, value: object) -> list[dict]:
        return clean_links(value)

    def validate_pinned(self, value: object) -> list[int]:
        if not isinstance(value, list):
            return []
        request = self.context.get("request")
        user = getattr(request, "user", None)
        allowed = set(
            WorldMembership.objects.filter(user=user).values_list("world_id", flat=True)
        )
        result: list[int] = []
        for item in value:
            try:
                world_id = int(item)
            except (TypeError, ValueError):
                continue
            if world_id in allowed and world_id not in result:
                result.append(world_id)
            if len(result) >= 12:
                break
        return result

    def validate_accent(self, value: str) -> str:
        return value if _ACCENT.match(value or "") else "#d4d4d8"
