from django.db.models import Case, IntegerField, Q, Value, When
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser
from rest_framework.views import APIView

from apps.identity.models import UserProfile
from apps.worlds.access import get_world_for_read, get_world_for_write
from apps.worlds.models import World, WorldMembership

from .models import Card, CardComment, CardImage, Notification
from .serializers import CardCommentSerializer, CardDetailSerializer, NotificationSerializer, SearchResultSerializer


class CardListCreateView(generics.ListCreateAPIView):
    serializer_class = CardDetailSerializer

    def get_world(self):
        return get_world_for_read(self.request, self.kwargs["world_slug"])

    def get_queryset(self):
        world = self.get_world()
        qs = Card.objects.filter(world=world).select_related("home_collection")
        if world.role_for(self.request.user) is None:
            qs = qs.filter(is_public=True)
        if self.request.query_params.get("include_auxiliary") not in {"1", "true", "yes"}:
            qs = qs.filter(is_auxiliary=False)
        collection = self.request.query_params.get("collection")
        if collection:
            qs = qs.filter(home_collection_id=collection)
        return qs.order_by("id")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["world"] = self.get_world()
        return context

    def perform_create(self, serializer):
        world = get_world_for_write(self.request, self.kwargs["world_slug"])
        serializer.save(world=world)


class CardDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = CardDetailSerializer
    lookup_field = "pk"

    def get_world(self):
        return get_world_for_read(self.request, self.kwargs["world_slug"])

    def get_queryset(self):
        world = self.get_world()
        qs = Card.objects.filter(world=world).select_related("home_collection")
        if world.role_for(self.request.user) is None:
            qs = qs.filter(is_public=True)
        return qs

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["world"] = self.get_world()
        return context

    def update(self, request, *args, **kwargs):
        get_world_for_write(request, self.kwargs["world_slug"])
        return super().update(request, *args, **kwargs)


class CardBySlugView(generics.RetrieveAPIView):
    serializer_class = CardDetailSerializer
    lookup_field = "slug"

    def get_world(self):
        return get_world_for_read(self.request, self.kwargs["world_slug"])

    def get_queryset(self):
        world = self.get_world()
        qs = Card.objects.filter(world=world).select_related("home_collection")
        if world.role_for(self.request.user) is None:
            qs = qs.filter(is_public=True)
        return qs

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["world"] = self.get_world()
        return context


def _snippet(text: str, query: str) -> str:
    flat = " ".join((text or "").split())
    if not flat:
        return ""
    index = flat.lower().find(query.lower())
    if index < 0:
        return flat[:160] + ("…" if len(flat) > 160 else "")
    start = max(0, index - 60)
    end = min(len(flat), index + len(query) + 120)
    prefix = "…" if start else ""
    suffix = "…" if end < len(flat) else ""
    return f"{prefix}{flat[start:end]}{suffix}"


class SearchView(APIView):
    def get(self, request):
        query = (request.query_params.get("q") or "").strip()[:80]
        if not query:
            response = Response(
                {"query": "", "worlds": [], "users": [], "results": [], "total": 0, "has_more": False}
            )
            response["Cache-Control"] = "public, max-age=30"
            return response
        cards = (
            Card.objects.filter(
                world__is_public_read=True,
                world__deleted_at__isnull=True,
                is_public=True,
                is_auxiliary=False,
            )
            .select_related("world")
            .filter(Q(title__icontains=query) | Q(body_text__icontains=query))
            .annotate(
                search_rank=Case(
                    When(title__iexact=query, then=Value(0)),
                    When(title__istartswith=query, then=Value(1)),
                    When(title__icontains=query, then=Value(2)),
                    default=Value(3),
                    output_field=IntegerField(),
                )
            )
            .order_by("search_rank", "-updated_at")
        )
        world_slug = request.query_params.get("world")
        if world_slug:
            cards = cards.filter(world__slug=world_slug)
        try:
            limit = min(max(int(request.query_params.get("limit", 30)), 1), 50)
        except ValueError as exc:
            raise ValidationError({"detail": "limit 必须是整数"}) from exc
        try:
            offset = max(int(request.query_params.get("offset", 0)), 0)
        except ValueError as exc:
            raise ValidationError({"detail": "offset 必须是整数"}) from exc
        total = cards.count()
        cards = list(cards[offset : offset + limit])
        worlds = (
            World.objects.filter(
                is_public_read=True,
                deleted_at__isnull=True,
            )
            .filter(Q(name__icontains=query) | Q(description__icontains=query))
            .annotate(
                search_rank=Case(
                    When(name__iexact=query, then=Value(0)),
                    When(name__istartswith=query, then=Value(1)),
                    When(name__icontains=query, then=Value(2)),
                    default=Value(3),
                    output_field=IntegerField(),
                )
            )
            .order_by("search_rank", "-updated_at")[:8]
        )
        if world_slug:
            worlds = worlds.none()
        profiles = UserProfile.objects.filter(
            is_public=True,
            user__world_memberships__world__is_public_read=True,
            user__world_memberships__world__deleted_at__isnull=True,
        ).filter(
            Q(display_name__icontains=query)
            | Q(headline__icontains=query)
            | Q(user__username__icontains=query)
        ).distinct().order_by("-updated_at")[:8]
        if world_slug:
            profiles = profiles.none()
        user_results = [
            {
                "username": profile.user.username,
                "display_name": profile.display_name or profile.user.username,
                "headline": profile.headline,
            }
            for profile in profiles
        ]
        world_results = [
            {
                "slug": world.slug,
                "name": world.name,
                "description": world.description,
                "kind": world.kind,
                "updated_at": world.updated_at,
            }
            for world in worlds
        ]
        results = [
            {
                "world_slug": card.world.slug,
                "world_name": card.world.name,
                "card_slug": card.slug,
                "title": card.title,
                "type_key": card.type_key,
                "snippet": _snippet(card.body_text, query),
                "updated_at": card.updated_at,
            }
            for card in cards
        ]
        response = Response(
            {
                "query": query,
                "worlds": world_results,
                "users": user_results,
                "results": results,
                "total": total,
                "has_more": offset + len(results) < total,
            }
        )
        response["Cache-Control"] = "public, max-age=30"
        return response


class CardImageUploadView(APIView):
    parser_classes = [MultiPartParser]

    MAX_BYTES = 4 * 1024 * 1024
    SIGNATURES = {
        "image/png": (b"\x89PNG\r\n\x1a\n",),
        "image/jpeg": (b"\xff\xd8\xff",),
        "image/webp": (b"RIFF",),
    }

    def _card(self, request, world_slug: str, pk: int):
        world = get_world_for_write(request, world_slug)
        return get_object_or_404(Card, pk=pk, world=world)

    def get(self, request, world_slug: str, pk: int):
        card = self._card(request, world_slug, pk)
        return Response(
            [
                {
                    "id": image.id,
                    "url": request.build_absolute_uri(image.file.url),
                    "name": image.file.name.rsplit("/", 1)[-1],
                    "created_at": image.created_at,
                }
                for image in card.images.all()
            ]
        )

    def post(self, request, world_slug: str, pk: int):
        card = self._card(request, world_slug, pk)
        upload = request.FILES.get("file")
        if upload is None:
            return Response({"detail": "请选择图片"}, status=status.HTTP_400_BAD_REQUEST)
        if upload.size > self.MAX_BYTES:
            return Response({"detail": "图片不能超过 4 MB"}, status=status.HTTP_400_BAD_REQUEST)
        prefixes = self.SIGNATURES.get(upload.content_type)
        head = upload.read(12)
        upload.seek(0)
        if prefixes is None or not any(head.startswith(prefix) for prefix in prefixes):
            return Response({"detail": "仅支持 PNG/JPEG/WebP 图片"}, status=status.HTTP_400_BAD_REQUEST)
        image = CardImage.objects.create(card=card, file=upload, created_by=request.user)
        return Response(
            {
                "id": image.id,
                "url": request.build_absolute_uri(image.file.url),
            },
            status=status.HTTP_201_CREATED,
        )

    def delete(self, request, world_slug: str, pk: int, image_id: int):
        card = self._card(request, world_slug, pk)
        image = get_object_or_404(CardImage, pk=image_id, card=card)
        image.file.delete(save=False)
        image.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)



class CardCommentListCreateView(generics.ListCreateAPIView):
    serializer_class = CardCommentSerializer

    def get_card(self):
        world = get_world_for_write(self.request, self.kwargs["world_slug"])
        return get_object_or_404(Card, pk=self.kwargs["pk"], world=world)

    def get_queryset(self):
        return self.get_card().comments.select_related("author", "parent")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["card"] = self.get_card()
        return context

    def perform_create(self, serializer):
        card = self.get_card()
        comment = serializer.save(card=card, author=self.request.user)
        world = get_world_for_write(self.request, self.kwargs["world_slug"])
        if comment.parent_id and comment.parent and comment.parent.author_id:
            recipients = [comment.parent.author]
        else:
            recipients = [
                membership.user
                for membership in world.memberships.filter(
                    role__in=[WorldMembership.Role.OWNER, WorldMembership.Role.EDITOR]
                ).select_related("user")
            ]
        seen = set()
        for recipient in recipients:
            if recipient.id == self.request.user.id or recipient.id in seen:
                continue
            seen.add(recipient.id)
            Notification.objects.create(
                recipient=recipient,
                actor=self.request.user,
                card=card,
                comment=comment,
                kind="reply" if comment.parent_id else "comment",
                message=f"{self.request.user.username} 在《{card.title}》发表了评论",
            )


class CardCommentDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = CardCommentSerializer
    lookup_url_kwarg = "comment_id"

    def get_card(self):
        world = get_world_for_write(self.request, self.kwargs["world_slug"])
        return get_object_or_404(Card, pk=self.kwargs["pk"], world=world)

    def get_queryset(self):
        return self.get_card().comments.select_related("author")

    def delete(self, request, *args, **kwargs):
        comment = self.get_object()
        world = get_world_for_write(request, self.kwargs["world_slug"])
        if comment.author_id != request.user.id and world.role_for(request.user) != WorldMembership.Role.OWNER:
            return Response({"detail": "只有作者或 owner 可以删除评论"}, status=status.HTTP_403_FORBIDDEN)
        return super().delete(request, *args, **kwargs)



class NotificationListView(generics.ListAPIView):
    serializer_class = NotificationSerializer

    def get_queryset(self):
        return Notification.objects.filter(recipient=self.request.user).select_related("actor", "card")


class NotificationReadView(APIView):
    def post(self, request, pk: int):
        notification = get_object_or_404(Notification, pk=pk, recipient=request.user)
        if notification.read_at is None:
            notification.read_at = timezone.now()
            notification.save(update_fields=["read_at", "updated_at"])
        return Response(NotificationSerializer(notification).data)


class NotificationReadAllView(APIView):
    def post(self, request):
        Notification.objects.filter(recipient=request.user, read_at__isnull=True).update(read_at=timezone.now())
        return Response({"ok": True})
