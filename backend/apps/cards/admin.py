from django.contrib import admin

from .models import Card


@admin.register(Card)
class CardAdmin(admin.ModelAdmin):
    list_display = ("title", "world", "home_collection", "kind", "is_public", "revision")
    list_filter = ("world", "kind", "is_public", "is_auxiliary")
    search_fields = ("title", "slug", "body_text")
