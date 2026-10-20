from django.contrib import admin

from .models import World, WorldMembership


@admin.register(World)
class WorldAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "kind", "is_public_read", "created_at")
    search_fields = ("name", "slug")


@admin.register(WorldMembership)
class WorldMembershipAdmin(admin.ModelAdmin):
    list_display = ("world", "user", "role")
    list_filter = ("role", "world")
    search_fields = ("world__name", "world__slug", "user__username")
