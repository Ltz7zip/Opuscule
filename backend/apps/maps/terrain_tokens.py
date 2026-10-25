"""Bearer tokens that let a local machine upload generated terrain."""

from __future__ import annotations

import hashlib
import hmac
import secrets

from django.utils import timezone

from .models import TerrainUploadToken

TOKEN_PREFIX = "wtk_"
PREFIX_LENGTH = 12


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def mint_token(world, *, label: str = "", expires_at=None) -> tuple[TerrainUploadToken, str]:
    """Create a token and return it with its one-time plaintext."""
    token = TOKEN_PREFIX + secrets.token_urlsafe(32)
    row = TerrainUploadToken.objects.create(
        world=world,
        prefix=token[:PREFIX_LENGTH],
        token_hash=hash_token(token),
        label=label,
        expires_at=expires_at,
    )
    return row, token


def token_from_request(request) -> str | None:
    header = (request.META.get("HTTP_AUTHORIZATION") or "").strip()
    if not header.lower().startswith("bearer "):
        return None
    return header[7:].strip() or None


def authenticate_token(request, world) -> TerrainUploadToken | None:
    """Return the matching active token for this world, or None.

    Lookup is by the plaintext prefix, then compared in constant time against
    the stored hash so a timing attacker learns nothing about the secret.
    """
    token = token_from_request(request)
    if token is None:
        return None
    digest = hash_token(token)
    candidates = TerrainUploadToken.objects.filter(
        world=world,
        prefix=token[:PREFIX_LENGTH],
        revoked_at__isnull=True,
    )
    for row in candidates:
        if not hmac.compare_digest(row.token_hash, digest):
            continue
        if not row.is_active:
            return None
        TerrainUploadToken.objects.filter(pk=row.pk).update(last_used_at=timezone.now())
        row.last_used_at = timezone.now()
        return row
    return None
