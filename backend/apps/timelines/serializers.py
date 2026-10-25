from rest_framework import serializers

from apps.cards.models import Card

from .models import Era, Timeline, TimelineEntry


class TimelineSerializer(serializers.ModelSerializer):
    entry_count = serializers.SerializerMethodField()

    class Meta:
        model = Timeline
        fields = ["id", "name", "slug", "color", "is_default", "entry_count"]
        read_only_fields = ["id", "entry_count"]

    def get_entry_count(self, obj: Timeline) -> int:
        value = getattr(obj, "entry_count", None)
        return value if value is not None else obj.entries.count()

    def validate(self, attrs):
        world = self.context.get("world") or getattr(self.instance, "world", None)
        slug = attrs.get("slug") or (self.instance.slug if self.instance else None)
        if world is not None and slug:
            queryset = Timeline.objects.filter(world=world, slug=slug)
            if self.instance is not None:
                queryset = queryset.exclude(pk=self.instance.pk)
            if queryset.exists():
                raise serializers.ValidationError({"slug": "该世界已有同名时间线"})
        return attrs


class TimelineEntrySerializer(serializers.ModelSerializer):
    card_title = serializers.CharField(source="card.title", read_only=True, allow_null=True)
    card_slug = serializers.CharField(source="card.slug", read_only=True, allow_null=True)

    class Meta:
        model = TimelineEntry
        fields = [
            "id",
            "year",
            "month",
            "end_year",
            "timeline",
            "era",
            "title",
            "description",
            "card",
            "card_title",
            "card_slug",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "card_title", "card_slug", "created_at", "updated_at"]

    def validate(self, attrs):
        year = attrs.get("year", self.instance.year if self.instance else None)
        end_year = attrs.get("end_year", self.instance.end_year if self.instance else None)
        if end_year is not None and year is not None and end_year < year:
            raise serializers.ValidationError({"end_year": "结束年份不能早于开始年份"})
        return attrs

    def validate_month(self, month: int | None):
        if month is not None and not 1 <= month <= 12:
            raise serializers.ValidationError("月份必须在 1–12 之间")
        return month

    def validate_timeline(self, timeline: Timeline | None):
        world = self.context.get("world")
        if timeline is not None and world is not None and timeline.world_id != world.id:
            raise serializers.ValidationError("时间线不属于这个世界")
        return timeline

    def validate_card(self, card: Card | None):
        world = self.context.get("world")
        if card is not None and world is not None and card.world_id != world.id:
            raise serializers.ValidationError("卡片不属于这个世界")
        return card


class EraSerializer(serializers.ModelSerializer):
    class Meta:
        model = Era
        fields = ["id", "name", "start_year", "end_year", "color"]
        read_only_fields = ["id"]

    def validate(self, attrs):
        start = attrs.get("start_year", self.instance.start_year if self.instance else None)
        end = attrs.get("end_year", self.instance.end_year if self.instance else None)
        if start is not None and end is not None and end < start:
            raise serializers.ValidationError({"end_year": "结束年份不能早于开始年份"})
        return attrs
