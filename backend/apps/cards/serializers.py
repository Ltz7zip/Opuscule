from django.utils.text import slugify
from rest_framework import serializers

from .models import Card, CardComment, CardRevision, Notification, plain_text

# Tiptap documents in practice nest a handful of levels (doc > list > item >
# paragraph > text). Anything past this is not an editor document.
MAX_BODY_DEPTH = 64


def json_depth(node: object) -> int:
    """Iterative maximum container nesting depth of a JSON value."""
    deepest = 0
    stack: list[tuple[object, int]] = [(node, 1)]
    while stack:
        current, depth = stack.pop()
        if depth > deepest:
            deepest = depth
            if deepest > MAX_BODY_DEPTH:
                return deepest
        if isinstance(current, dict):
            stack.extend((value, depth + 1) for value in current.values())
        elif isinstance(current, list):
            stack.extend((value, depth + 1) for value in current)
    return deepest


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
            "pinned",
            "era",
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
            "pinned",
            "era",
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

    def validate_body_json(self, value):
        if value and json_depth(value) > MAX_BODY_DEPTH:
            raise serializers.ValidationError("正文嵌套层级过深")
        return value

    def _unique_slug(self, world, title: str, current: str = "") -> str:
        base = slugify(title) or "card"
        slug = current or base
        index = 2
        qs = Card.all_objects.filter(world=world).exclude(pk=self.instance.pk if self.instance else None)
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

    REVISION_FIELDS = {
        "title": "标题",
        "body_json": "正文",
        "icon": "图标",
        "cover": "封面",
        "type_key": "类型",
        "era": "纪元",
    }

    def update(self, instance, validated_data):
        changed = [self.REVISION_FIELDS[field] for field in self.REVISION_FIELDS if field in validated_data]
        if changed:
            request = self.context.get("request")
            author = getattr(request, "user", None)
            CardRevision.objects.update_or_create(
                card=instance,
                index=instance.revision,
                defaults={
                    "snapshot": instance.snapshot(),
                    "summary": "、".join(changed),
                    "author": author if author and author.is_authenticated else None,
                },
            )
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


class TrashCardSerializer(serializers.ModelSerializer):
    class Meta:
        model = Card
        fields = ["id", "title", "slug", "type_key", "home_collection", "revision", "deleted_at"]
        read_only_fields = fields


class CardRevisionSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.username", read_only=True, allow_null=True)

    class Meta:
        model = CardRevision
        fields = ["index", "summary", "author_name", "created_at"]
        read_only_fields = fields


class CardRevisionDetailSerializer(CardRevisionSerializer):
    class Meta(CardRevisionSerializer.Meta):
        fields = CardRevisionSerializer.Meta.fields + ["snapshot"]
        read_only_fields = fields
