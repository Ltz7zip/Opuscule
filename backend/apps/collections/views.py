from rest_framework import generics

from apps.worlds.access import get_world_for_read, get_world_for_write

from .models import Collection
from .serializers import CollectionSerializer


class CollectionListCreateView(generics.ListCreateAPIView):
    serializer_class = CollectionSerializer

    def get_world(self):
        return get_world_for_read(self.request, self.kwargs["world_slug"])

    def get_queryset(self):
        world = self.get_world()
        qs = Collection.objects.filter(world=world)
        if world.role_for(self.request.user) is None:
            qs = qs.filter(is_public=True)
        return qs.select_related("parent").order_by("position_key", "id")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["world"] = self.get_world()
        return context

    def perform_create(self, serializer):
        world = get_world_for_write(self.request, self.kwargs["world_slug"])
        serializer.save(world=world)
