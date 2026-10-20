from rest_framework import generics
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.worlds.access import get_world_for_read, get_world_for_write

from .models import Era, Timeline, TimelineEntry
from .serializers import EraSerializer, TimelineEntrySerializer, TimelineSerializer


def ensure_default_timeline(world):
    timeline = world.timelines.filter(is_default=True).first()
    if timeline is None:
        timeline = world.timelines.create(name="主时间线", slug="main", is_default=True)
    world.timeline_entries.filter(timeline__isnull=True).update(timeline=timeline)
    return timeline


class WorldTimelineView(APIView):
    def get(self, request, world_slug: str):
        world = get_world_for_read(request, world_slug)
        timelines = world.timelines.all()
        if not timelines.exists():
            ensure_default_timeline(world)
            timelines = world.timelines.all()
        requested = (request.query_params.get("timeline") or "").strip()
        selected = timelines.filter(slug=requested).first() if requested else None
        if selected is None:
            selected = timelines.filter(is_default=True).first() or timelines.first()
        entries = world.timeline_entries.filter(timeline=selected).select_related("card")
        return Response(
            {
                "world": {"slug": world.slug, "name": world.name},
                "can_edit": world.can_edit(request.user),
                "timelines": TimelineSerializer(timelines, many=True).data,
                "timeline": TimelineSerializer(selected).data if selected else None,
                "eras": EraSerializer(world.eras.all(), many=True).data,
                "entries": TimelineEntrySerializer(entries, many=True).data,
            }
        )


class TimelineEntryListCreateView(generics.ListCreateAPIView):
    serializer_class = TimelineEntrySerializer

    def get_world(self):
        return get_world_for_write(self.request, self.kwargs["world_slug"])

    def get_queryset(self):
        return self.get_world().timeline_entries.select_related("card")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["world"] = self.get_world()
        return context

    def perform_create(self, serializer):
        world = self.get_world()
        timeline = serializer.validated_data.get("timeline") or ensure_default_timeline(world)
        serializer.save(world=world, timeline=timeline, created_by=self.request.user)


class TimelineEntryDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = TimelineEntrySerializer

    def get_world(self):
        return get_world_for_write(self.request, self.kwargs["world_slug"])

    def get_queryset(self):
        return self.get_world().timeline_entries.select_related("card")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["world"] = self.get_world()
        return context



class EraListCreateView(generics.ListCreateAPIView):
    serializer_class = EraSerializer

    def get_world(self):
        return get_world_for_write(self.request, self.kwargs["world_slug"])

    def get_queryset(self):
        return self.get_world().eras.all()

    def perform_create(self, serializer):
        serializer.save(world=self.get_world())


class EraDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = EraSerializer

    def get_queryset(self):
        return get_world_for_write(self.request, self.kwargs["world_slug"]).eras.all()



class TimelineListCreateView(generics.ListCreateAPIView):
    serializer_class = TimelineSerializer

    def get_world(self):
        return get_world_for_write(self.request, self.kwargs["world_slug"])

    def get_queryset(self):
        return self.get_world().timelines.all()

    def perform_create(self, serializer):
        world = self.get_world()
        is_default = serializer.validated_data.get("is_default", False)
        if is_default:
            world.timelines.update(is_default=False)
        serializer.save(world=world)


class TimelineDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = TimelineSerializer

    def get_queryset(self):
        return get_world_for_write(self.request, self.kwargs["world_slug"]).timelines.all()
