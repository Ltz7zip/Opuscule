from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import NotAuthenticated, PermissionDenied

from .models import World, WorldMembership


def get_world_for_read(request, slug: str) -> World:
    world = get_object_or_404(World, slug=slug)
    if not world.can_read(request.user):
        # Hide private worlds instead of confirming that the slug exists.
        raise Http404("World not found")
    return world


def get_world_for_write(request, slug: str) -> World:
    world = get_object_or_404(World, slug=slug)
    if not getattr(request.user, "is_authenticated", False):
        raise NotAuthenticated("请先登录")
    if not world.can_edit(request.user):
        raise PermissionDenied("没有编辑该世界的权限")
    return world


def get_world_for_owner(request, slug: str) -> World:
    world = get_world_for_read(request, slug)
    if not getattr(request.user, "is_authenticated", False):
        raise NotAuthenticated("请先登录")
    if world.role_for(request.user) != WorldMembership.Role.OWNER:
        raise PermissionDenied("只有世界 owner 可以管理成员")
    return world
