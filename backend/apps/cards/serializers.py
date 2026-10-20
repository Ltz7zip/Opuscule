from django.utils.text import slugify
from rest_framework import serializers

from .models import Card, CardComment, Notification, plain_text


class CardListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Card
        fields = [
            "id",
            "kind",
            "type_key",
            "title",
            "slug",
            "icon",
            "cover",
            "home_collection",
            "is_public",
            "is_auxiliary",
            "body_text",
            "revision",
            "updated_at",
        ]
        read_only_fields = fields


class CardDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = Card
        fields = [
            "id",
            "kind",
            "type_key",
            "title",
            "slug",
            "icon",
            "cover",
            "home_collection",
            "body_json",
            "body_text",
            "is_public",
            "is_auxiliary",
            "presence_json",
            "revision",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "body_text", "revision", "created_at", "updated_at"]
        extra_kwargs = {"slug": {"required": False}}

    def validate_home_collection(self, collection):
        world = self.context.get("world") or getattr(self.instance, "world", None)
        if collection is not None and world is not None and collection.world_id != world.id:
            raise serializers.ValidationError("Collection belongs to another world.")
        return collection

    def _unique_slug(self, world, title: str, current: str = "") -> str:
        base = slugify(title) or "card"
        slug = current or base
        index = 2
        qs = Card.objects.filter(world=world).exclude(pk=self.instance.pk if self.instance else None)
        while qs.filter(slug=slug).exists():
            slug = f"{base}-{index}"
            index += 1
        return slug

    def create(self, validated_data):
        world = validated_data["world"]
        validated_data["slug"] = self._unique_slug(
            world, validated_data["title"], validated_data.get("slug", "")
        )
        validated_data["body_text"] = plain_text(validated_data.get("body_json") or {})
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if "body_json" in validated_data:
            validated_data["body_text"] = plain_text(validated_data["body_json"] or {})
        if not validated_data.get("slug"):
            validated_data["slug"] = instance.slug
        validated_data["revision"] = instance.revision + 1
        return super().update(instance, validated_data)


class SearchResultSerializer(serializers.Serializer):
    world_slug = serializers.CharField()
    world_name = serializers.CharField()
    card_slug = serializers.CharField()
    title = serializers.CharField()
    type_key = serializers.CharField(allow_blank=True)
    snippet = serializers.CharField()
    updated_at = serializers.DateTimeField()


class CardCommentSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.username", read_only=True, allow_null=True)

    class Meta:
        model = CardComment
        fields = ["id", "body", "quote", "anchor_id", "resolved", "parent", "author_name", "created_at", "updated_at"]
        read_only_fields = ["id", "author_name", "created_at", "updated_at"]

    def validate_body(self, value: str):
        if not value.strip():
            raise serializers.ValidationError("评论不能为空")
        return value.strip()

    def validate_parent(self, parent):
        if parent is None:
            return parent
        card = self.context.get("card")
        if card is not None and parent.card_id != card.id:
            raise serializers.ValidationError("回复必须属于同一张卡片")
        if parent.parent_id is not None:
            raise serializers.ValidationError("只支持一层回复")
        return parent


class NotificationSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source="actor.username", read_only=True, allow_null=True)
    card_title = serializers.CharField(source="card.title", read_only=True, allow_null=True)
    card_slug = serializers.CharField(source="card.slug", read_only=True, allow_null=True)
    card_id = serializers.IntegerField(source="card.id", read_only=True, allow_null=True)
    world_slug = serializers.CharField(source="card.world.slug", read_only=True, allow_null=True)

    class Meta:
        model = Notification
        fields = ["id", "kind", "message", "actor_name", "card_title", "card_slug", "card_id", "world_slug", "read_at", "created_at"]
        read_only_fields = ["id", "kind", "message", "actor_name", "card_title", "card_slug", "created_at"]
