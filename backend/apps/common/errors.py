"""Error handlers that keep the API JSON-shaped.

Django resolves a missing URL before any DRF view runs, so an unknown
``/api/...`` path used to answer with the HTML 404 page — which the frontend
then failed to parse ("Unexpected token '<'").  Anything under ``/api/`` now
gets a JSON body, everything else keeps the normal page.
"""

from django.http import JsonResponse
from django.views.defaults import page_not_found


def not_found(request, exception=None):
    if request.path.startswith("/api/"):
        return JsonResponse({"detail": "接口不存在（404）"}, status=404)
    return page_not_found(request, exception)
