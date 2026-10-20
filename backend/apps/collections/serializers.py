from django.utils.text import slugify
from rest_framework import serializers

from .models import Collection


class CollectionSerializer(serializers.ModelSerializer):
    card_count = serializers.SerializerMethodField()
    children_count = serializers.SerializerMethodField()

    class Meta:
        model = Collection
        fields = [
            "id",
            "parent",
            "name",
            "slug",
            "position_key",
            "icon",
            "description",
            "is_public",
            "card_count",
            "children_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "card_count", "children_count"]
        extra_kwargs = {"slug": {"required": False}}

    def get_card_count(self, obj: Collection) -> int:
        return obj.cards.filter(is_auxiliary=False).count()

    def get_children_count(self, obj: Collection) -> int:
        return obj.children.count()

    def validate_parent(self, parent: Collection | None) -> Collection | None:
        world = self.context.get("world") or getattr(self.instance, "world", None)
        if parent is None:
            return parent
        if world is not None and parent.world_id != world.id:
            raise serializers.ValidationError("Parent collection belongs to another world.")
        if self.instance is not None and parent.pk == self.instance.pk:
            raise serializers.ValidationError("A collection cannot be its own parent.")
        return parent

    def _unique_slug(self, world, name: str, current: str = "") -> str:
        base = slugify(name) or "collection"
        slug = current or base
        index = 2
        qs = Collection.objects.filter(world=world).exclude(pk=self.instance.pk if self.instance else None)
        while qs.filter(slug=slug).exists():
            slug = f"{base}-{index}"
            index += 1
        return slug

    def create(self, validated_data):
        world = validated_data["world"]
        validated_data["slug"] = self._unique_slug(world, validated_data["name"], validated_data.get("slug", ""))
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if not validated_data.get("slug"):
            validated_data["slug"] = instance.slug
        return super().update(instance, validated_data)
