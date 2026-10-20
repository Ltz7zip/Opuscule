from django.conf import settings
from rest_framework.throttling import ScopedRateThrottle


class ClientIpScopedRateThrottle(ScopedRateThrottle):
    """Scoped throttle keyed by the trusted client IP.

    X-Forwarded-For is only honored when TRUST_PROXY_HEADERS is enabled; the
    default remains REMOTE_ADDR so a direct client cannot spoof the key.
    """

    def get_ident(self, request):
        if getattr(settings, "TRUST_PROXY_HEADERS", False):
            forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
            if forwarded:
                return forwarded.split(",")[0].strip()
        return request.META.get("REMOTE_ADDR") or "unknown"
