from django.db.models import Count, Q
from rest_framework import generics
from rest_framework.permissions import AllowAny

from apps.worlds.access import get_world_for_read, get_world_for_write

from .models import Collection
from .serializers import CollectionSerializer


class CollectionListCreateView(generics.ListCreateAPIView):
    serializer_class = CollectionSerializer
    permission_classes = [AllowAny]

    def get_world(self):
        return get_world_for_read(self.request, self.kwargs["world_slug"])

    def get_queryset(self):
        world = self.get_world()
        qs = Collection.objects.filter(world=world)
        if world.role_for(self.request.user) is None:
            qs = qs.filter(is_public=True)
        return (
            qs.select_related("parent")
            .annotate(
                card_count=Count(
                    "cards",
                    filter=Q(cards__is_auxiliary=False, cards__deleted_at__isnull=True),
                    distinct=True,
                ),
                children_count=Count("children", distinct=True),
            )
            .order_by("position_key", "id")
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["world"] = self.get_world()
        return context

    def perform_create(self, serializer):
        world = get_world_for_write(self.request, self.kwargs["world_slug"])
        serializer.save(world=world)
