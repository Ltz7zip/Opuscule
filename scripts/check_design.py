"""Validate the single-file design document's basic HTML structure."""

from html.parser import HTMLParser
from pathlib import Path
import sys

VOID = {
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
}


class Checker(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.stack: list[str] = []
        self.errors: list[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag not in VOID:
            self.stack.append(tag)

    def handle_endtag(self, tag: str) -> None:
        if tag in VOID:
            return
        if not self.stack:
            self.errors.append(f"extra </{tag}>")
            return
        if self.stack[-1] == tag:
            self.stack.pop()
            return
        self.errors.append(f"mismatch </{tag}> expected </{self.stack[-1]}>")


def main() -> int:
    path = Path(__file__).resolve().parent.parent / ".design/current/index.html"
    checker = Checker()
    checker.feed(path.read_text(encoding="utf-8"))
    if checker.stack:
        checker.errors.append(f"unclosed: {', '.join(checker.stack[-5:])}")
    if checker.errors:
        for error in checker.errors:
            print(f"FAIL {error}")
        return 1
    print(f"PASS design HTML ({path.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
