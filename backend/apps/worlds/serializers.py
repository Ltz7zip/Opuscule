from django.db.models import Count, Q
from rest_framework import serializers

from apps.cards.models import Card
from apps.cards.serializers import CardListSerializer
from apps.collections.models import Collection
from apps.collections.serializers import CollectionSerializer
from apps.common.tiptap import MAX_BODY_DEPTH, json_depth

from .models import (
    World,
    WorldAuditEvent,
    WorldConcept,
    WorldConceptComment,
    WorldConceptRevision,
    WorldInvite,
    WorldMembership,
)

_ROLE_MISSING = object()


class WorldSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    card_count = serializers.SerializerMethodField()
    collection_count = serializers.SerializerMethodField()

    class Meta:
        model = World
        fields = [
            "id",
            "slug",
            "name",
            "description",
            "kind",
            "is_public_read",
            "published_at",
            "theme_json",
            "role",
            "can_edit",
            "card_count",
            "collection_count",
            "updated_at",
            "deleted_at",
        ]
        read_only_fields = fields

    def get_role(self, obj: World) -> str | None:
        role = getattr(obj, "viewer_role", _ROLE_MISSING)
        if role is not _ROLE_MISSING:
            return role
        request = self.context.get("request")
        return obj.role_for(getattr(request, "user", None))

    def get_can_edit(self, obj: World) -> bool:
        return self.get_role(obj) in {
            WorldMembership.Role.OWNER,
            WorldMembership.Role.EDITOR,
        }

    def get_card_count(self, obj: World) -> int:
        # ``getattr`` evaluates its default argument eagerly, so probe first:
        # the list views annotate public_card_count to avoid a COUNT per world.
        value = getattr(obj, "public_card_count", None)
        if value is not None:
            return value
        return obj.cards.filter(
            is_public=True, is_auxiliary=False, deleted_at__isnull=True
        ).count()

    def get_collection_count(self, obj: World) -> int:
        value = getattr(obj, "public_collection_count", None)
        if value is not None:
            return value
        return obj.collections.filter(is_public=True).count()


class WorldDetailSerializer(WorldSerializer):
    collections = serializers.SerializerMethodField()
    cards = serializers.SerializerMethodField()

    class Meta(WorldSerializer.Meta):
        fields = WorldSerializer.Meta.fields + ["collections", "cards"]

    def _viewer_is_member(self, obj: World) -> bool:
        return self.get_role(obj) is not None

    def get_collections(self, obj: World) -> list[dict]:
        collections = Collection.objects.filter(world=obj)
        if not self._viewer_is_member(obj):
            collections = collections.filter(is_public=True)
        collections = collections.annotate(
            card_count=Count(
                "cards",
                filter=Q(cards__is_auxiliary=False, cards__deleted_at__isnull=True),
                distinct=True,
            ),
            children_count=Count("children", distinct=True),
        ).order_by("position_key", "id")
        return CollectionSerializer(collections, many=True).data

    def get_cards(self, obj: World) -> list[dict]:
        # ``obj.cards`` is a reverse manager and therefore still exposes
        # recycled cards; go through the filtered default manager instead.
        cards = Card.objects.filter(world=obj, is_auxiliary=False)
        if not self._viewer_is_member(obj):
            cards = cards.filter(is_public=True)
        cards = cards.select_related("home_collection")
        return CardListSerializer(cards, many=True).data


class WorldCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=160)
    description = serializers.CharField(max_length=4000, required=False, allow_blank=True, default="")
    is_public_read = serializers.BooleanField(required=False, default=False)

    def validate_name(self, value: str) -> str:
        name = value.strip()
        if not name:
            raise serializers.ValidationError("世界名不能为空")
        return name


class WorldUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = World
        fields = ["name", "description", "is_public_read"]
        extra_kwargs = {
            "name": {"required": False},
            "description": {"required": False, "allow_blank": True},
            "is_public_read": {"required": False},
        }

    def validate_name(self, value: str) -> str:
        name = value.strip()
        if not name:
            raise serializers.ValidationError("世界名不能为空")
        return name

    def update(self, instance: World, validated_data: dict) -> World:
        if validated_data.get("is_public_read") and not instance.published_at:
            from django.utils import timezone

            instance.published_at = timezone.now()
        return super().update(instance, validated_data)


class WorldMemberSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)
    display_name = serializers.SerializerMethodField()

    class Meta:
        model = WorldMembership
        fields = ["id", "user_id", "username", "display_name", "role", "created_at"]
        read_only_fields = fields

    def get_display_name(self, obj) -> str:
        profile = getattr(obj.user, "profile", None)
        if profile is not None and profile.display_name:
            return profile.display_name
        return obj.user.get_full_name() or obj.user.get_username()


class WorldMemberCreateSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    role = serializers.ChoiceField(choices=["editor", "viewer"], default="viewer")


class WorldMemberUpdateSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=["editor", "viewer"])


class WorldInviteSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorldInvite
        fields = [
            "id",
            "token",
            "role",
            "expires_at",
            "max_uses",
            "used_count",
            "revoked_at",
            "created_at",
        ]
        read_only_fields = fields


class WorldInviteCreateSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=["editor", "viewer"], default="viewer")


class OwnershipTransferSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)


class WorldAuditEventSerializer(serializers.ModelSerializer):
    actor_username = serializers.CharField(source="actor.username", allow_null=True, read_only=True)
    target_username = serializers.CharField(source="target_user.username", allow_null=True, read_only=True)
    action_label = serializers.CharField(source="get_action_display", read_only=True)

    class Meta:
        model = WorldAuditEvent
        fields = [
            "id",
            "action",
            "action_label",
            "actor_username",
            "target_username",
            "metadata",
            "created_at",
        ]
        read_only_fields = fields


class WorldConceptAuthorsMixin:
    created_by = serializers.SerializerMethodField()
    updated_by = serializers.SerializerMethodField()

    def get_created_by(self, obj) -> str | None:
        return obj.created_by.username if obj.created_by_id and obj.created_by else None

    def get_updated_by(self, obj) -> str | None:
        return obj.updated_by.username if obj.updated_by_id and obj.updated_by else None


class WorldConceptPublicSerializer(WorldConceptAuthorsMixin, serializers.ModelSerializer):
    created_by = serializers.SerializerMethodField()
    updated_by = serializers.SerializerMethodField()

    class Meta:
        model = WorldConcept
        fields = [
            "body_json",
            "body_text",
            "published_at",
            "created_at",
            "updated_at",
            "revision",
            "created_by",
            "updated_by",
        ]
        read_only_fields = fields


class WorldConceptEditSerializer(WorldConceptAuthorsMixin, serializers.ModelSerializer):
    exists = serializers.SerializerMethodField()
    body_json = serializers.SerializerMethodField()
    created_by = serializers.SerializerMethodField()
    updated_by = serializers.SerializerMethodField()

    class Meta:
        model = WorldConcept
        fields = [
            "exists",
            "draft_json",
            "draft_text",
            "body_json",
            "body_text",
            "published_at",
            "created_at",
            "updated_at",
            "revision",
            "created_by",
            "updated_by",
        ]
        read_only_fields = fields
        extra_kwargs = {"body_json": {"allow_null": True}}

    def get_exists(self, obj) -> bool:
        return obj.pk is not None

    def get_body_json(self, obj):
        return obj.body_json if obj.published_at else None


class WorldConceptRevisionSummarySerializer(serializers.ModelSerializer):
    created_by = serializers.SerializerMethodField()
    char_count = serializers.SerializerMethodField()
    is_current = serializers.SerializerMethodField()

    class Meta:
        model = WorldConceptRevision
        fields = ["revision", "published_at", "created_at", "created_by", "char_count", "is_current"]
        read_only_fields = fields

    def get_created_by(self, obj) -> str | None:
        return obj.created_by.username if obj.created_by_id and obj.created_by else None

    def get_char_count(self, obj) -> int:
        return len("".join((obj.body_text or "").split()))

    def get_is_current(self, obj) -> bool:
        return obj.concept.revision == obj.revision


class WorldConceptRevisionDetailSerializer(WorldConceptRevisionSummarySerializer):
    class Meta(WorldConceptRevisionSummarySerializer.Meta):
        fields = [*WorldConceptRevisionSummarySerializer.Meta.fields, "body_json", "body_text"]
        read_only_fields = fields


class WorldConceptDraftSerializer(serializers.Serializer):
    body_json = serializers.JSONField()
    expected_updated_at = serializers.DateTimeField(required=False, allow_null=True)

    def validate_body_json(self, value):
        if value and json_depth(value) > MAX_BODY_DEPTH:
            raise serializers.ValidationError("正文嵌套层级过深")
        return value


class WorldConceptCommentSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.username", read_only=True, allow_null=True)

    class Meta:
        model = WorldConceptComment
        fields = [
            "id",
            "body",
            "quote",
            "anchor_id",
            "resolved",
            "parent",
            "author_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "author_name", "created_at", "updated_at"]
        extra_kwargs = {"body": {"trim_whitespace": True}}

    def validate_body(self, value: str) -> str:
        if not value.strip():
            raise serializers.ValidationError("评论不能为空")
        return value.strip()

    def validate_parent(self, value):
        concept = self.context.get("concept")
        if value is not None and concept is not None and value.concept_id != concept.id:
            raise serializers.ValidationError("回复的评论不属于这篇概念")
        return value
