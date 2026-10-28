from django.db.models import Case, IntegerField, Q, Value, When
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView

from apps.identity.models import UserProfile
from apps.worlds.access import get_world_for_read, get_world_for_write
from apps.worlds.models import World, WorldConcept, WorldMembership

from .models import Card, CardComment, CardRevision, Notification, plain_text
from .serializers import (
    CardCommentSerializer,
    CardDetailSerializer,
    CardListSerializer,
    CardRevisionDetailSerializer,
    CardRevisionSerializer,
    NotificationSerializer,
    SearchResultSerializer,
    TrashCardSerializer,
)


class CardListCreateView(generics.ListCreateAPIView):
    serializer_class = CardDetailSerializer
    permission_classes = [AllowAny]

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
        return qs.order_by("-pinned", "id")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["world"] = self.get_world()
        return context

    def perform_create(self, serializer):
        world = get_world_for_write(self.request, self.kwargs["world_slug"])
        serializer.save(world=world)


class CardDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = CardDetailSerializer
    lookup_field = "pk"
    permission_classes = [AllowAny]

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

    def destroy(self, request, *args, **kwargs):
        get_world_for_write(request, self.kwargs["world_slug"])
        card = self.get_object()
        card.deleted_at = timezone.now()
        card.deleted_by = request.user
        card.save(update_fields=["deleted_at", "deleted_by"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class CardTrashListView(APIView):
    def get(self, request, world_slug: str):
        world = get_world_for_write(request, world_slug)
        cards = (
            Card.all_objects.filter(world=world, deleted_at__isnull=False)
            .select_related("home_collection")
            .order_by("-deleted_at", "-id")
        )
        return Response({"count": cards.count(), "cards": TrashCardSerializer(cards, many=True).data})


class CardRestoreView(APIView):
    def post(self, request, world_slug: str, pk: int):
        world = get_world_for_write(request, world_slug)
        card = get_object_or_404(Card.all_objects, world=world, pk=pk, deleted_at__isnull=False)
        card.deleted_at = None
        card.deleted_by = None
        card.save(update_fields=["deleted_at", "deleted_by"])
        return Response(CardListSerializer(card).data)


class CardPurgeView(APIView):
    def delete(self, request, world_slug: str, pk: int):
        world = get_world_for_write(request, world_slug)
        card = get_object_or_404(Card.all_objects, world=world, pk=pk, deleted_at__isnull=False)
        card.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CardRevisionListView(APIView):
    def get(self, request, world_slug: str, pk: int):
        world = get_world_for_write(request, world_slug)
        card = get_object_or_404(Card.objects, world=world, pk=pk)
        revisions = card.revisions.select_related("author")
        return Response(
            {
                "card": {"id": card.id, "title": card.title, "revision": card.revision},
                "versions": CardRevisionSerializer(revisions, many=True).data,
            }
        )


class CardRevisionDetailView(APIView):
    def get(self, request, world_slug: str, pk: int, index: int):
        world = get_world_for_write(request, world_slug)
        card = get_object_or_404(Card.objects, world=world, pk=pk)
        revision = get_object_or_404(CardRevision.objects.select_related("author"), card=card, index=index)
        return Response(CardRevisionDetailSerializer(revision).data)


class CardRevisionRestoreView(APIView):
    def post(self, request, world_slug: str, pk: int, index: int):
        world = get_world_for_write(request, world_slug)
        card = get_object_or_404(Card.objects, world=world, pk=pk)
        revision = get_object_or_404(CardRevision, card=card, index=index)
        CardRevision.objects.update_or_create(
            card=card,
            index=card.revision,
            defaults={
                "snapshot": card.snapshot(),
                "summary": "回滚前自动保存",
                "author": request.user,
            },
        )
        for field in ("title", "body_json", "body_text", "icon", "cover", "type_key", "era"):
            if field in revision.snapshot:
                setattr(card, field, revision.snapshot[field])
        card.body_text = plain_text(card.body_json or {})
        card.revision += 1
        card.save()
        return Response(CardDetailSerializer(card, context={"request": request, "world": world}).data)


class CardBySlugView(generics.RetrieveAPIView):
    serializer_class = CardDetailSerializer
    lookup_field = "slug"
    lookup_url_kwarg = "card_slug"
    permission_classes = [AllowAny]

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
    permission_classes = [AllowAny]

    def get(self, request):
        query = (request.query_params.get("q") or "").strip()[:80]
        if not query:
            response = Response(
                {
                    "query": "",
                    "worlds": [],
                    "users": [],
                    "concepts": [],
                    "results": [],
                    "total": 0,
                    "has_more": False,
                }
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
        concepts = (
            WorldConcept.objects.filter(
                published_at__isnull=False,
                world__is_public_read=True,
                world__deleted_at__isnull=True,
            )
            .select_related("world")
            .filter(Q(body_text__icontains=query) | Q(world__name__icontains=query))
            .order_by("-published_at")[:8]
        )
        if world_slug:
            concepts = concepts.none()
        concept_results = [
            {
                "world_slug": concept.world.slug,
                "world_name": concept.world.name,
                "title": "世界概念",
                "snippet": _snippet(concept.body_text, query),
                "revision": concept.revision,
                "published_at": concept.published_at,
            }
            for concept in concepts
        ]
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
                "concepts": concept_results,
                "results": results,
                "total": total,
                "has_more": offset + len(results) < total,
            }
        )
        response["Cache-Control"] = "public, max-age=30"
        return response


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
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.filter(recipient=self.request.user).select_related("actor", "card")


class NotificationReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk: int):
        notification = get_object_or_404(Notification, pk=pk, recipient=request.user)
        if notification.read_at is None:
            notification.read_at = timezone.now()
            notification.save(update_fields=["read_at", "updated_at"])
        return Response(NotificationSerializer(notification).data)


class NotificationReadAllView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        Notification.objects.filter(recipient=request.user, read_at__isnull=True).update(read_at=timezone.now())
        return Response({"ok": True})
