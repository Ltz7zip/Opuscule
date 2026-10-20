from django.contrib import admin

from .models import Collection


@admin.register(Collection)
class CollectionAdmin(admin.ModelAdmin):
    list_display = ("name", "world", "parent", "slug", "position_key", "is_public")
    list_filter = ("world", "is_public")
    search_fields = ("name", "slug")
