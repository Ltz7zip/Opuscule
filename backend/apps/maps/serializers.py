from rest_framework import serializers

from apps.cards.models import Card

from .models import MapMarker


class MapMarkerSerializer(serializers.ModelSerializer):
    card_title = serializers.CharField(source="card.title", read_only=True, allow_null=True)
    card_slug = serializers.CharField(source="card.slug", read_only=True, allow_null=True)

    class Meta:
        model = MapMarker
        fields = [
            "id",
            "label",
            "kind",
            "x",
            "y",
            "card",
            "card_title",
            "card_slug",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "card_title", "card_slug", "created_at", "updated_at"]

    def validate_card(self, card: Card | None):
        world = self.context.get("world")
        if card is not None and world is not None and card.world_id != world.id:
            raise serializers.ValidationError("卡片不属于这个世界")
        return card
