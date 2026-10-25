"""Request parsers that fail closed on hostile input."""

from rest_framework.exceptions import ParseError
from rest_framework.parsers import JSONParser


class SafeJSONParser(JSONParser):
    """Turn pathological JSON nesting into a 400 instead of a 500.

    ``json.loads`` raises ``RecursionError`` for documents deeper than the
    interpreter stack allows; DRF only converts ``ValueError``/``TypeError``
    into ``ParseError``, so without this wrapper a nested body escapes as a
    500 from the generic handler.
    """

    def parse(self, stream, media_type=None, parser_context=None):
        try:
            return super().parse(stream, media_type, parser_context)
        except RecursionError as exc:
            raise ParseError("JSON 嵌套层级过深") from exc
