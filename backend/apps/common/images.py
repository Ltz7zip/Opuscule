"""Shared image upload validation for card and world media."""

MAX_IMAGE_BYTES = 4 * 1024 * 1024

IMAGE_SIGNATURES = {
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/webp": (b"RIFF",),
}


def validate_image_upload(upload) -> str | None:
    """Return an actionable error, or None when the upload is accepted."""
    if upload is None:
        return "请选择图片"
    if upload.size > MAX_IMAGE_BYTES:
        return "图片不能超过 4 MB"
    prefixes = IMAGE_SIGNATURES.get(upload.content_type)
    head = upload.read(12)
    upload.seek(0)
    if prefixes is None or not any(head.startswith(prefix) for prefix in prefixes):
        return "仅支持 PNG/JPEG/WebP 图片"
    return None
