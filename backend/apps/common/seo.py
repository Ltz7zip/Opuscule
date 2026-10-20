from urllib.parse import quote
from xml.sax.saxutils import escape

from django.http import HttpResponse

from apps.cards.models import Card
from apps.identity.models import UserProfile
from apps.worlds.models import World


def robots(request):
    sitemap = request.build_absolute_uri("/sitemap.xml")
    lines = [
        "User-agent: *",
        "Allow: /",
        "Disallow: /trash",
        "Disallow: /login",
        "Disallow: /register",
        "Disallow: /worlds/new",
        "Disallow: /invite/",
        "Disallow: /search",
        f"Sitemap: {sitemap}",
        "",
    ]
    response = HttpResponse("\n".join(lines), content_type="text/plain; charset=utf-8")
    response["Cache-Control"] = "public, max-age=300"
    return response


def _url(loc: str, lastmod=None, priority: str = "0.5") -> str:
    parts = [f"<loc>{escape(loc)}</loc>"]
    if lastmod is not None:
        parts.append(f"<lastmod>{lastmod.date().isoformat()}</lastmod>")
    parts.append(f"<priority>{priority}</priority>")
    return "<url>" + "".join(parts) + "</url>"


def sitemap(request):
    urls: list[str] = [
        _url(request.build_absolute_uri("/"), priority="1.0"),
        _url(request.build_absolute_uri("/explore"), priority="0.8"),
    ]

    worlds = World.objects.filter(is_public_read=True).order_by("-updated_at")[:500]
    for world in worlds:
        urls.append(
            _url(
                request.build_absolute_uri(f"/w/{quote(world.slug)}/wiki"),
                world.updated_at,
                "0.7",
            )
        )
        cards = (
            Card.objects.filter(
                world=world,
                is_public=True,
                is_auxiliary=False,
            )
            .order_by("-updated_at")[:200]
        )
        for card in cards:
            urls.append(
                _url(
                    request.build_absolute_uri(
                        f"/w/{quote(world.slug)}/wiki/{quote(card.slug)}"
                    ),
                    card.updated_at,
                    "0.6",
                )
            )

    profiles = (
        UserProfile.objects.filter(is_public=True, user__is_active=True)
        .select_related("user")
        .order_by("-updated_at")[:500]
    )
    for profile in profiles:
        urls.append(
            _url(
                request.build_absolute_uri(f"/u/{quote(profile.user.username)}"),
                profile.updated_at,
                "0.5",
            )
        )

    body = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(urls)
        + "\n</urlset>\n"
    )
    response = HttpResponse(body, content_type="application/xml; charset=utf-8")
    response["Cache-Control"] = "public, max-age=300"
    return response
