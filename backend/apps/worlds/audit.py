from .models import World, WorldAuditEvent


def log_world_event(
    world: World,
    actor,
    action: str,
    *,
    target_user=None,
    metadata: dict | None = None,
) -> WorldAuditEvent:
    return WorldAuditEvent.objects.create(
        world=world,
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        target_user=target_user,
        action=action,
        metadata=metadata or {},
    )
