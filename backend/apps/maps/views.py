from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser
from rest_framework.views import APIView

from apps.worlds.access import get_world_for_owner, get_world_for_read, get_world_for_write

from .models import MapMarker
from .serializers import MapMarkerSerializer


class WorldMapView(APIView):
    def get(self, request, world_slug: str):
        world = get_world_for_read(request, world_slug)
        markers = world.map_markers.select_related("card").all()
        return Response(
            {
                "world": {"slug": world.slug, "name": world.name},
                "can_edit": world.can_edit(request.user),
                "background_url": request.build_absolute_uri(world.map_background.url)
                if world.map_background
                else None,
                "markers": MapMarkerSerializer(markers, many=True).data,
            }
        )


class MapMarkerListCreateView(generics.ListCreateAPIView):
    serializer_class = MapMarkerSerializer

    def get_world(self):
        return get_world_for_write(self.request, self.kwargs["world_slug"])

    def get_queryset(self):
        return self.get_world().map_markers.select_related("card")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["world"] = self.get_world()
        return context

    def perform_create(self, serializer):
        serializer.save(world=self.get_world(), created_by=self.request.user)


class MapMarkerDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = MapMarkerSerializer

    def get_world(self):
        return get_world_for_write(self.request, self.kwargs["world_slug"])

    def get_queryset(self):
        return self.get_world().map_markers.select_related("card")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["world"] = self.get_world()
        return context


class WorldMapBackgroundView(APIView):
    parser_classes = [MultiPartParser]

    MAX_BYTES = 4 * 1024 * 1024
    SIGNATURES = {
        "image/png": (b"\x89PNG\r\n\x1a\n",),
        "image/jpeg": (b"\xff\xd8\xff",),
        "image/webp": (b"RIFF",),
    }

    def post(self, request, world_slug: str):
        world = get_world_for_owner(request, world_slug)
        upload = request.FILES.get("file")
        if upload is None:
            return Response({"detail": "请选择图片"}, status=status.HTTP_400_BAD_REQUEST)
        if upload.size > self.MAX_BYTES:
            return Response({"detail": "背景图不能超过 4 MB"}, status=status.HTTP_400_BAD_REQUEST)
        prefixes = self.SIGNATURES.get(upload.content_type)
        head = upload.read(12)
        upload.seek(0)
        if prefixes is None or not any(head.startswith(prefix) for prefix in prefixes):
            return Response({"detail": "仅支持 PNG/JPEG/WebP 图片"}, status=status.HTTP_400_BAD_REQUEST)
        if world.map_background:
            world.map_background.delete(save=False)
        world.map_background.save(upload.name, upload)
        return Response({"background_url": request.build_absolute_uri(world.map_background.url)})

    def delete(self, request, world_slug: str):
        world = get_world_for_owner(request, world_slug)
        if world.map_background:
            world.map_background.delete(save=False)
            world.map_background = ""
            world.save(update_fields=["map_background", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)
