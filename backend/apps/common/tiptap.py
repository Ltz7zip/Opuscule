"""Tiptap JSON helpers shared by cards and world concepts."""

MAX_BODY_DEPTH = 64


def plain_text(node: object) -> str:
    """Flatten a Tiptap JSON document into searchable text.

    Walks the tree iteratively so a deeply nested document cannot exhaust the
    Python call stack (the JSON body is user-controlled).
    """
    if not isinstance(node, dict):
        return ""
    parts: list[str] = []
    stack: list[object] = [node]
    while stack:
        current = stack.pop()
        if not isinstance(current, dict):
            continue
        text = current.get("text")
        if isinstance(text, str):
            parts.append(text)
        children = current.get("content")
        if isinstance(children, list):
            stack.extend(reversed(children))
    return " ".join(part for part in parts if part).strip()


def json_depth(node: object) -> int:
    """Iterative maximum container nesting depth of a JSON value."""
    deepest = 0
    stack: list[tuple[object, int]] = [(node, 1)]
    while stack:
        current, depth = stack.pop()
        if depth > deepest:
            deepest = depth
            if deepest > MAX_BODY_DEPTH:
                return deepest
        if isinstance(current, dict):
            stack.extend((value, depth + 1) for value in current.values())
        elif isinstance(current, list):
            stack.extend((value, depth + 1) for value in current)
    return deepest
