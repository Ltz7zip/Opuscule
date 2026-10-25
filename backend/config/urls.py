from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path

from apps.cards.views import (
    CardBySlugView,
    CardCommentDetailView,
    CardCommentListCreateView,
    CardDetailView,
    CardImageUploadView,
    CardListCreateView,
    CardPurgeView,
    CardRestoreView,
    CardRevisionDetailView,
    CardRevisionListView,
    CardRevisionRestoreView,
    CardTrashListView,
    NotificationListView,
    NotificationReadAllView,
    NotificationReadView,
    SearchView,
)
from apps.common.seo import robots, sitemap
from apps.maps.views import (
    MapMarkerDetailView,
    MapMarkerListCreateView,
    TerrainUploadView,
    TerrainWebGenerateView,
    WorldMapBackgroundView,
    WorldMapFieldsView,
    WorldMapView,
)
from apps.timelines.views import EraDetailView, EraListCreateView, TimelineDetailView, TimelineEntryDetailView, TimelineEntryListCreateView, TimelineListCreateView, WorldTimelineView
from apps.common.feeds import site_feed, world_feed
from apps.common.share import card_share, profile_share, world_share
from apps.collections.views import CollectionListCreateView
from apps.identity.views import (
    CsrfView,
    ChangePasswordView,
    LoginView,
    LogoutView,
    MyProfileView,
    PublicProfileView,
    RegisterView,
    SessionView,
)
from apps.worlds.views import (
    WorldAuditExportView,
    WorldExportView,
    ExploreView,
    HealthView,
    WorldImportHistoryView,
    WorldImportUndoView,
    WorldImportView,
    InviteAcceptView,
    InviteInfoView,
    OwnershipTransferView,
    WorldDetailView,
    WorldInviteDetailView,
    WorldInviteListCreateView,
    WorldListView,
    WorldAuditView,
    WorldMemberDetailView,
    WorldMemberListCreateView,
    WorldRestoreView,
    WorldTrashView,
)

urlpatterns = [
    path("robots.txt", robots, name="robots"),
    path("sitemap.xml", sitemap, name="sitemap"),
    path("feed.xml", site_feed, name="site-feed"),
    path("w/<slug:world_slug>/feed.xml", world_feed, name="world-feed"),
    path("share/w/<slug:world_slug>/", world_share, name="share-world"),
    path("share/w/<slug:world_slug>/<slug:card_slug>/", card_share, name="share-card"),
    path("share/u/<str:username>/", profile_share, name="share-profile"),
    path("admin/", admin.site.urls),
    path("api/health/", HealthView.as_view(), name="health"),
    path("api/auth/csrf/", CsrfView.as_view(), name="auth-csrf"),
    path("api/auth/session/", SessionView.as_view(), name="auth-session"),
    path("api/auth/login/", LoginView.as_view(), name="auth-login"),
    path("api/auth/register/", RegisterView.as_view(), name="auth-register"),
    path("api/auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path("api/auth/password/", ChangePasswordView.as_view(), name="auth-password"),
    path("api/profile/", MyProfileView.as_view(), name="my-profile"),
    path("api/u/<str:username>/", PublicProfileView.as_view(), name="public-profile"),
    path("api/explore/", ExploreView.as_view(), name="explore"),
    path("api/search/", SearchView.as_view(), name="search"),
    path("api/invites/<str:token>/", InviteInfoView.as_view(), name="invite-info"),
    path("api/invites/<str:token>/accept/", InviteAcceptView.as_view(), name="invite-accept"),
    path("api/worlds/", WorldListView.as_view(), name="world-list"),
    path("api/worlds/import/", WorldImportView.as_view(), name="world-import"),
    path("api/worlds/imports/", WorldImportHistoryView.as_view(), name="world-import-history"),
    path(
        "api/worlds/<slug:slug>/undo-import/",
        WorldImportUndoView.as_view(),
        name="world-import-undo",
    ),
    path("api/worlds/trash/", WorldTrashView.as_view(), name="world-trash"),
    path(
        "api/worlds/<slug:world_slug>/restore/",
        WorldRestoreView.as_view(),
        name="world-restore",
    ),
    path(
        "api/worlds/<slug:world_slug>/transfer-ownership/",
        OwnershipTransferView.as_view(),
        name="world-transfer-ownership",
    ),
    path("api/worlds/<slug:slug>/", WorldDetailView.as_view(), name="world-detail"),
    path(
        "api/worlds/<slug:slug>/export/",
        WorldExportView.as_view(),
        name="world-export",
    ),
    path(
        "api/worlds/<slug:world_slug>/invites/",
        WorldInviteListCreateView.as_view(),
        name="world-invite-list",
    ),
    path(
        "api/worlds/<slug:world_slug>/invites/<int:pk>/",
        WorldInviteDetailView.as_view(),
        name="world-invite-detail",
    ),
    path(
        "api/worlds/<slug:world_slug>/audit/",
        WorldAuditView.as_view(),
        name="world-audit",
    ),
    path(
        "api/worlds/<slug:world_slug>/audit/export/",
        WorldAuditExportView.as_view(),
        name="world-audit-export",
    ),
    path(
        "api/worlds/<slug:world_slug>/members/",
        WorldMemberListCreateView.as_view(),
        name="world-member-list",
    ),
    path(
        "api/worlds/<slug:world_slug>/members/<int:pk>/",
        WorldMemberDetailView.as_view(),
        name="world-member-detail",
    ),
    path(
        "api/worlds/<slug:world_slug>/timeline/",
        WorldTimelineView.as_view(),
        name="world-timeline",
    ),
    path(
        "api/worlds/<slug:world_slug>/timelines/",
        TimelineListCreateView.as_view(),
        name="timeline-list",
    ),
    path(
        "api/worlds/<slug:world_slug>/timelines/<int:pk>/",
        TimelineDetailView.as_view(),
        name="timeline-detail",
    ),
    path(
        "api/worlds/<slug:world_slug>/eras/",
        EraListCreateView.as_view(),
        name="era-list",
    ),
    path(
        "api/worlds/<slug:world_slug>/eras/<int:pk>/",
        EraDetailView.as_view(),
        name="era-detail",
    ),
    path(
        "api/worlds/<slug:world_slug>/timeline/entries/",
        TimelineEntryListCreateView.as_view(),
        name="timeline-entry-list",
    ),
    path(
        "api/worlds/<slug:world_slug>/timeline/entries/<int:pk>/",
        TimelineEntryDetailView.as_view(),
        name="timeline-entry-detail",
    ),
    path(
        "api/worlds/<slug:world_slug>/map/background/",
        WorldMapBackgroundView.as_view(),
        name="world-map-background",
    ),
    path(
        "api/worlds/<slug:world_slug>/map/terrain-web/",
        TerrainWebGenerateView.as_view(),
        name="world-map-terrain-web",
    ),
    path(
        "api/worlds/<slug:world_slug>/map/terrain/",
        TerrainUploadView.as_view(),
        name="world-map-terrain-upload",
    ),
    path(
        "api/worlds/<slug:world_slug>/map/fields/",
        WorldMapFieldsView.as_view(),
        name="world-map-fields",
    ),
    path(
        "api/worlds/<slug:world_slug>/map/",
        WorldMapView.as_view(),
        name="world-map",
    ),
    path(
        "api/worlds/<slug:world_slug>/map/markers/",
        MapMarkerListCreateView.as_view(),
        name="map-marker-list",
    ),
    path(
        "api/worlds/<slug:world_slug>/map/markers/<int:pk>/",
        MapMarkerDetailView.as_view(),
        name="map-marker-detail",
    ),
    path(
        "api/worlds/<slug:world_slug>/collections/",
        CollectionListCreateView.as_view(),
        name="collection-list",
    ),
    path(
        "api/worlds/<slug:world_slug>/cards/",
        CardListCreateView.as_view(),
        name="card-list",
    ),
    path(
        "api/worlds/<slug:world_slug>/cards/trash/",
        CardTrashListView.as_view(),
        name="card-trash",
    ),
    path(
        "api/worlds/<slug:world_slug>/cards/<int:pk>/restore/",
        CardRestoreView.as_view(),
        name="card-restore",
    ),
    path(
        "api/worlds/<slug:world_slug>/cards/<int:pk>/purge/",
        CardPurgeView.as_view(),
        name="card-purge",
    ),
    path(
        "api/worlds/<slug:world_slug>/cards/<int:pk>/revisions/",
        CardRevisionListView.as_view(),
        name="card-revision-list",
    ),
    path(
        "api/worlds/<slug:world_slug>/cards/<int:pk>/revisions/<int:index>/",
        CardRevisionDetailView.as_view(),
        name="card-revision-detail",
    ),
    path(
        "api/worlds/<slug:world_slug>/cards/<int:pk>/revisions/<int:index>/restore/",
        CardRevisionRestoreView.as_view(),
        name="card-revision-restore",
    ),
    path(
        "api/worlds/<slug:world_slug>/cards/by-slug/<path:card_slug>/",
        CardBySlugView.as_view(),
        name="card-by-slug",
    ),
    path("api/notifications/", NotificationListView.as_view(), name="notifications"),
    path("api/notifications/read-all/", NotificationReadAllView.as_view(), name="notifications-read-all"),
    path("api/notifications/<int:pk>/read/", NotificationReadView.as_view(), name="notification-read"),
    path(
        "api/worlds/<slug:world_slug>/cards/<int:pk>/comments/",
        CardCommentListCreateView.as_view(),
        name="card-comment-list",
    ),
    path(
        "api/worlds/<slug:world_slug>/cards/<int:pk>/comments/<int:comment_id>/",
        CardCommentDetailView.as_view(),
        name="card-comment-detail",
    ),
    path(
        "api/worlds/<slug:world_slug>/cards/<int:pk>/images/",
        CardImageUploadView.as_view(),
        name="card-image-upload",
    ),
    path(
        "api/worlds/<slug:world_slug>/cards/<int:pk>/images/<int:image_id>/",
        CardImageUploadView.as_view(),
        name="card-image-detail",
    ),
    path(
        "api/worlds/<slug:world_slug>/cards/<int:pk>/",
        CardDetailView.as_view(),
        name="card-detail",
    ),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

# Keep API 404s JSON-shaped (see apps/common/errors.py).
handler404 = "apps.common.errors.not_found"
