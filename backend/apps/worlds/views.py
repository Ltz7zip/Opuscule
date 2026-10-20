import csv
import io
import json

from django.contrib.auth import get_user_model
from django.db import connection, transaction
from django.db.models import Count, Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.authentication import SessionAuthentication
from rest_framework.exceptions import NotAuthenticated, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .access import get_world_for_owner
from .audit import log_world_event
from .models import World, WorldAuditEvent, WorldInvite, WorldMembership
from .serializers import (
    WorldCreateSerializer,
    WorldAuditEventSerializer,
    WorldDetailSerializer,
    WorldMemberCreateSerializer,
    WorldInviteCreateSerializer,
    WorldInviteSerializer,
    WorldMemberSerializer,
    WorldMemberUpdateSerializer,
    WorldSerializer,
    WorldUpdateSerializer,
    OwnershipTransferSerializer,
)
from .export import build_world_export
from .importing import WorldImportError, import_world
from .services import create_world


class HealthView(APIView):
    def get(self, request):
        try:
            connection.ensure_connection()
        except Exception:
            return Response(
                {"status": "degraded", "service": "opuscule-api", "database": "error"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({"status": "ok", "service": "opuscule-api", "database": "ok"})


def with_public_counts(qs):
    return qs.annotate(
        public_card_count=Count(
            "cards",
            filter=Q(cards__is_public=True, cards__is_auxiliary=False),
            distinct=True,
        ),
        public_collection_count=Count(
            "collections",
            filter=Q(collections__is_public=True),
            distinct=True,
        ),
    )


class WorldListView(generics.ListCreateAPIView):
    serializer_class = WorldSerializer

    def get_serializer_class(self):
        if self.request.method == "POST":
            return WorldCreateSerializer
        return WorldSerializer

    def get_queryset(self):
        user = self.request.user
        qs = with_public_counts(World.objects.all())
        if getattr(user, "is_authenticated", False):
            return qs.filter(
                Q(is_public_read=True) | Q(memberships__user=user)
            ).distinct()
        return qs.filter(is_public_read=True)

    def create(self, request, *args, **kwargs):
        if not getattr(request.user, "is_authenticated", False):
            raise NotAuthenticated
        owned = WorldMembership.objects.filter(
            user=request.user,
            role=WorldMembership.Role.OWNER,
            world__deleted_at__isnull=True,
        ).count()
        if owned >= 7:
            raise ValidationError({"detail": "每个账号最多创建 7 个世界"})
        serializer = WorldCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        world = create_world(owner=request.user, **serializer.validated_data)
        log_world_event(world, request.user, WorldAuditEvent.Action.CREATED)
        return Response(
            WorldDetailSerializer(world, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class ExploreView(generics.ListAPIView):
    """Public directory: only public-read worlds, regardless of login."""

    serializer_class = WorldSerializer

    def get_queryset(self):
        return with_public_counts(
            World.objects.filter(is_public_read=True)
        ).order_by("-updated_at", "id")

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        response["Cache-Control"] = "public, max-age=60, stale-while-revalidate=300"
        return response


class WorldDetailView(generics.RetrieveUpdateDestroyAPIView):
    lookup_field = "slug"

    def get_serializer_class(self):
        if self.request.method in {"PUT", "PATCH"}:
            return WorldUpdateSerializer
        return WorldDetailSerializer

    def get_queryset(self):
        user = self.request.user
        qs = with_public_counts(
            World.objects.prefetch_related("collections", "cards")
        )
        if getattr(user, "is_authenticated", False):
            return qs.filter(
                Q(is_public_read=True) | Q(memberships__user=user)
            ).distinct()
        return qs.filter(is_public_read=True)

    def update(self, request, *args, **kwargs):
        world = self.get_object()
        if world.role_for(request.user) != WorldMembership.Role.OWNER:
            raise PermissionDenied("只有世界 owner 可以修改设置")
        was_public = world.is_public_read
        serializer = WorldUpdateSerializer(
            world,
            data=request.data,
            partial=kwargs.pop("partial", False),
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        if "is_public_read" in serializer.validated_data and serializer.validated_data["is_public_read"] != was_public:
            action = (
                WorldAuditEvent.Action.PUBLISHED
                if serializer.validated_data["is_public_read"]
                else WorldAuditEvent.Action.UNPUBLISHED
            )
        else:
            action = WorldAuditEvent.Action.SETTINGS_UPDATED
        log_world_event(world, request.user, action, metadata={"fields": list(serializer.validated_data)})
        return Response(
            WorldDetailSerializer(world, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )

    def destroy(self, request, *args, **kwargs):
        world = self.get_object()
        if world.role_for(request.user) != WorldMembership.Role.OWNER:
            raise PermissionDenied("只有世界 owner 可以删除世界")
        world.deleted_at = timezone.now()
        world.save(update_fields=["deleted_at", "updated_at"])
        WorldInvite.objects.filter(world=world, revoked_at__isnull=True).update(
            revoked_at=timezone.now()
        )
        log_world_event(world, request.user, WorldAuditEvent.Action.DELETED)
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorldMemberListCreateView(generics.ListCreateAPIView):
    def get_world(self):
        return get_world_for_owner(self.request, self.kwargs["world_slug"])

    def get_serializer_class(self):
        if self.request.method == "POST":
            return WorldMemberCreateSerializer
        return WorldMemberSerializer

    def get_queryset(self):
        return self.get_world().memberships.select_related("user", "user__profile")

    def create(self, request, *args, **kwargs):
        world = self.get_world()
        serializer = WorldMemberCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user_model = get_user_model()
        user = user_model.objects.filter(username=serializer.validated_data["username"]).first()
        if user is None:
            raise ValidationError({"detail": "该用户名不存在"})
        if WorldMembership.objects.filter(world=world, user=user).exists():
            raise ValidationError({"detail": "该用户已经是世界成员"})
        membership = WorldMembership.objects.create(
            world=world,
            user=user,
            role=serializer.validated_data["role"],
        )
        log_world_event(
            world,
            request.user,
            WorldAuditEvent.Action.MEMBER_ADDED,
            target_user=user,
            metadata={"role": membership.role},
        )
        return Response(
            WorldMemberSerializer(membership).data,
            status=status.HTTP_201_CREATED,
        )


class WorldMemberDetailView(generics.RetrieveUpdateDestroyAPIView):
    def get_world(self):
        return get_world_for_owner(self.request, self.kwargs["world_slug"])

    def get_queryset(self):
        return self.get_world().memberships.select_related("user", "user__profile")

    def update(self, request, *args, **kwargs):
        membership = self.get_object()
        if membership.role == WorldMembership.Role.OWNER:
            raise ValidationError({"detail": "不能修改 owner 角色"})
        serializer = WorldMemberUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        old_role = membership.role
        membership.role = serializer.validated_data["role"]
        membership.save(update_fields=["role", "updated_at"])
        log_world_event(
            membership.world,
            request.user,
            WorldAuditEvent.Action.MEMBER_ROLE_CHANGED,
            target_user=membership.user,
            metadata={"from": old_role, "to": membership.role},
        )
        return Response(WorldMemberSerializer(membership).data)

    def destroy(self, request, *args, **kwargs):
        membership = self.get_object()
        if membership.role == WorldMembership.Role.OWNER:
            raise ValidationError({"detail": "不能移除 owner"})
        log_world_event(
            membership.world,
            request.user,
            WorldAuditEvent.Action.MEMBER_REMOVED,
            target_user=membership.user,
            metadata={"role": membership.role},
        )
        membership.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorldInviteListCreateView(generics.ListCreateAPIView):
    def get_world(self):
        return get_world_for_owner(self.request, self.kwargs["world_slug"])

    def get_serializer_class(self):
        if self.request.method == "POST":
            return WorldInviteCreateSerializer
        return WorldInviteSerializer

    def get_queryset(self):
        return self.get_world().invites.select_related("created_by")

    def create(self, request, *args, **kwargs):
        world = self.get_world()
        serializer = WorldInviteCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        invite = WorldInvite.objects.create(
            world=world,
            role=serializer.validated_data["role"],
            created_by=request.user,
        )
        log_world_event(
            world,
            request.user,
            WorldAuditEvent.Action.INVITE_CREATED,
            metadata={"invite_id": invite.id, "role": invite.role},
        )
        return Response(
            WorldInviteSerializer(invite).data,
            status=status.HTTP_201_CREATED,
        )


class WorldInviteDetailView(generics.DestroyAPIView):
    def get_world(self):
        return get_world_for_owner(self.request, self.kwargs["world_slug"])

    def get_queryset(self):
        return self.get_world().invites.all()

    def destroy(self, request, *args, **kwargs):
        invite = self.get_object()
        if invite.revoked_at is None:
            invite.revoked_at = timezone.now()
            invite.save(update_fields=["revoked_at", "updated_at"])
            log_world_event(
                invite.world,
                request.user,
                WorldAuditEvent.Action.INVITE_REVOKED,
                metadata={"invite_id": invite.id},
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class InviteInfoView(APIView):
    def get(self, request, token: str):
        invite = get_object_or_404(WorldInvite, token=token)
        already_member = (
            getattr(request.user, "is_authenticated", False)
            and WorldMembership.objects.filter(
                world=invite.world, user=request.user
            ).exists()
        )
        valid = invite.is_valid and invite.world.deleted_at is None
        reason = "世界已删除" if invite.world.deleted_at else invite.invalid_reason()
        return Response(
            {
                "world": {"slug": invite.world.slug, "name": invite.world.name},
                "role": invite.role,
                "valid": valid,
                "reason": reason,
                "expires_at": invite.expires_at,
                "already_member": already_member,
            }
        )


class InviteAcceptView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, token: str):
        with transaction.atomic():
            invite = get_object_or_404(
                WorldInvite.objects.select_for_update().select_related("world"),
                token=token,
            )
            if not invite.is_valid or invite.world.deleted_at is not None:
                return Response(
                    {"detail": "世界已删除" if invite.world.deleted_at else invite.invalid_reason()},
                    status=status.HTTP_410_GONE,
                )
            existing = WorldMembership.objects.filter(
                world=invite.world, user=request.user
            ).first()
            if existing is not None:
                return Response(
                    {
                        "already_member": True,
                        "world": {"slug": invite.world.slug, "name": invite.world.name},
                        "role": existing.role,
                    }
                )
            membership = WorldMembership.objects.create(
                world=invite.world,
                user=request.user,
                role=invite.role,
            )
            invite.used_count += 1
            invite.save(update_fields=["used_count", "updated_at"])
            log_world_event(
                invite.world,
                request.user,
                WorldAuditEvent.Action.INVITE_ACCEPTED,
                target_user=request.user,
                metadata={"role": invite.role},
            )
        return Response(
            {
                "already_member": False,
                "world": {"slug": invite.world.slug, "name": invite.world.name},
                "role": membership.role,
            }
        )


class OwnershipTransferView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, world_slug: str):
        world = get_world_for_owner(request, world_slug)
        serializer = OwnershipTransferSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        username = serializer.validated_data["username"].strip()
        target = get_user_model().objects.filter(username=username).first()
        if target is None:
            raise ValidationError({"detail": "目标用户不存在"})
        if target.pk == request.user.pk:
            raise ValidationError({"detail": "不能把世界转移给自己"})
        with transaction.atomic():
            current = WorldMembership.objects.select_for_update().get(
                world=world, user=request.user
            )
            membership = (
                WorldMembership.objects.select_for_update()
                .filter(world=world, user=target)
                .first()
            )
            if membership is None:
                raise ValidationError({"detail": "目标用户还不是世界成员"})
            current.role = WorldMembership.Role.EDITOR
            membership.role = WorldMembership.Role.OWNER
            current.save(update_fields=["role", "updated_at"])
            membership.save(update_fields=["role", "updated_at"])
            log_world_event(
                world,
                request.user,
                WorldAuditEvent.Action.OWNERSHIP_TRANSFERRED,
                target_user=target,
            )
        return Response(
            WorldDetailSerializer(world, context={"request": request}).data
        )


class WorldTrashView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = (
            World.all_objects.filter(
                deleted_at__isnull=False,
                memberships__user=request.user,
                memberships__role=WorldMembership.Role.OWNER,
            )
            .distinct()
            .order_by("-deleted_at")
        )
        return Response(WorldSerializer(qs, many=True, context={"request": request}).data)


class WorldRestoreView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, world_slug: str):
        world = World.all_objects.filter(
            slug=world_slug, deleted_at__isnull=False
        ).first()
        if world is None:
            from django.http import Http404

            raise Http404("World not found")
        if world.role_for(request.user) != WorldMembership.Role.OWNER:
            raise PermissionDenied("只有世界 owner 可以恢复世界")
        if World.objects.filter(slug=world.slug).exists():
            raise ValidationError({"detail": "同名世界已存在，无法恢复"})
        world.deleted_at = None
        world.save(update_fields=["deleted_at", "updated_at"])
        log_world_event(world, request.user, WorldAuditEvent.Action.RESTORED)
        return Response(
            WorldDetailSerializer(world, context={"request": request}).data
        )


class WorldAuditView(generics.ListAPIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]
    serializer_class = WorldAuditEventSerializer

    def get_queryset(self):
        world = get_world_for_owner(self.request, self.kwargs["world_slug"])
        queryset = world.audit_events.select_related("actor", "target_user")
        action = self.request.query_params.get("action", "").strip()
        if action:
            if action not in WorldAuditEvent.Action.values:
                raise ValidationError({"detail": "未知的活动类型"})
            queryset = queryset.filter(action=action)
        try:
            limit = min(max(int(self.request.query_params.get("limit", 100)), 1), 500)
        except ValueError as exc:
            raise ValidationError({"detail": "limit 必须是整数"}) from exc
        return queryset[:limit]


class WorldExportView(APIView):
    def get(self, request, slug: str):
        world = get_world_for_owner(request, slug)
        response = HttpResponse(build_world_export(world), content_type="application/zip")
        response["Content-Disposition"] = f'attachment; filename="{world.slug}-export.zip"'
        response["Cache-Control"] = "no-store"
        return response


class WorldImportView(APIView):
    parser_classes = [MultiPartParser]

    def post(self, request):
        if not getattr(request.user, "is_authenticated", False):
            raise NotAuthenticated
        owned = WorldMembership.objects.filter(
            user=request.user,
            role=WorldMembership.Role.OWNER,
            world__deleted_at__isnull=True,
        ).count()
        if owned >= 7:
            raise ValidationError({"detail": "每个账号最多创建 7 个世界"})
        upload = request.FILES.get("file")
        if upload is None:
            raise ValidationError({"detail": "请选择 ZIP 文件"})
        try:
            world = import_world(owner=request.user, upload=upload)
        except WorldImportError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        log_world_event(
            world,
            request.user,
            WorldAuditEvent.Action.IMPORTED,
            metadata={"filename": upload.name[:200]},
        )
        return Response(
            WorldDetailSerializer(world, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


def _csv_safe(value: object) -> str:
    """Prevent spreadsheet formula injection for text cells."""
    text = str(value)
    if text.startswith(("=", "+", "-", "@", "\t", "\r")):
        return "'" + text
    return text


class WorldAuditExportView(APIView):
    def get(self, request, world_slug: str):
        world = get_world_for_owner(request, world_slug)
        queryset = world.audit_events.select_related("actor", "target_user")
        action = request.query_params.get("action", "").strip()
        if action:
            if action not in WorldAuditEvent.Action.values:
                raise ValidationError({"detail": "未知的活动类型"})
            queryset = queryset.filter(action=action)
        queryset = queryset[:5000]

        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow([_csv_safe(cell) for cell in ["时间", "动作", "操作者", "对象", "元数据"]])
        for event in queryset:
            writer.writerow(
                [
                    _csv_safe(event.created_at.isoformat()),
                    _csv_safe(event.get_action_display()),
                    _csv_safe(event.actor.username if event.actor else "system"),
                    _csv_safe(event.target_user.username if event.target_user else ""),
                    _csv_safe(json.dumps(event.metadata, ensure_ascii=False)),
                ]
            )
        response = HttpResponse(("﻿" + buffer.getvalue()).encode("utf-8"), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="{world.slug}-audit.csv"'
        response["Cache-Control"] = "no-store"
        return response


class WorldImportHistoryView(APIView):
    def get(self, request):
        if not getattr(request.user, "is_authenticated", False):
            raise NotAuthenticated
        events = (
            WorldAuditEvent.objects.filter(
                action=WorldAuditEvent.Action.IMPORTED,
                world__memberships__user=request.user,
                world__memberships__role=WorldMembership.Role.OWNER,
            )
            .select_related("world")
            .order_by("-created_at", "-id")[:100]
        )
        seen: set[int] = set()
        rows = []
        for event in events:
            world = World.all_objects.filter(pk=event.world_id).first()
            if world is None or world.id in seen:
                continue
            seen.add(world.id)
            filename = event.metadata.get("filename") if isinstance(event.metadata, dict) else None
            rows.append(
                {
                    "world": {
                        "slug": world.slug,
                        "name": world.name,
                        "deleted_at": _iso_datetime(world.deleted_at),
                    },
                    "imported_at": _iso_datetime(event.created_at),
                    "filename": filename if isinstance(filename, str) else None,
                    "can_undo": world.deleted_at is None,
                }
            )
        return Response(rows)


class WorldImportUndoView(APIView):
    def post(self, request, slug: str):
        world = get_world_for_owner(request, slug)
        imported = world.audit_events.filter(action=WorldAuditEvent.Action.IMPORTED).exists()
        if not imported:
            raise ValidationError({"detail": "这个世界不是通过导入创建的"})
        world.deleted_at = timezone.now()
        world.save(update_fields=["deleted_at", "updated_at"])
        WorldInvite.objects.filter(world=world, revoked_at__isnull=True).update(
            revoked_at=timezone.now()
        )
        log_world_event(
            world,
            request.user,
            WorldAuditEvent.Action.DELETED,
            metadata={"reason": "import_undo"},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


def _iso_datetime(value):
    return value.isoformat() if value else None
