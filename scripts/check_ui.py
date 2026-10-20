#!/usr/bin/env python3
"""Static UI contract checks for the Opuscule frontend.

These are the invariants the UI plan depends on, checked without a browser:

1. every `var(--token)` used in CSS resolves to a definition
2. no raw hex colors outside `tokens.css`
3. both themes define the required semantic tokens
4. key foreground/background pairs meet WCAG AA
5. no internal milestone markers in user-facing TSX
6. the UI components introduced by the plan still exist
7. SSR shells resolve the theme from the cookie instead of hardcoding dark
"""

from __future__ import annotations

from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
STYLES = ROOT / "frontend/src/styles"
COMPONENTS = ROOT / "frontend/src/components"
FRONTEND = ROOT / "frontend"

REQUIRED_TOKENS = (
    "background",
    "foreground",
    "card",
    "muted",
    "muted-foreground",
    "border",
    "border-strong",
    "primary",
    "primary-foreground",
    "ring",
    "success",
    "destructive",
    "overlay",
    "sidebar",
    "ink-link",
    "ink-marginal",
    "era-1",
    "selection-bg",
    "selection-fg",
)

REQUIRED_COMPONENTS = (
    "StatusPage.tsx",
    "ErrorBoundary.tsx",
    "WorldNav.tsx",
    "BrandMark.tsx",
    "ThemeToggle.tsx",
    "DialogHost.tsx",
    "SiteFooter.tsx",
    "EditionLine.tsx",
    "Seal.tsx",
    "SkipLink.tsx",
)

CONTRAST_PAIRS = (
    ("foreground", "background", 4.5, "body text"),
    ("muted-foreground", "background", 4.5, "secondary text"),
    ("muted-foreground", "card", 4.5, "secondary text on card"),
    ("primary-foreground", "primary", 4.5, "primary button label"),
    ("border", "card", 1.2, "card edge"),
)

DECLARATION = re.compile(r"(--[a-z0-9-]+)\s*:\s*([^;]+);")
VAR_USE = re.compile(r"var\((--[a-z0-9-]+)")
HEX = re.compile(r"#[0-9a-fA-F]{3,8}\b")
COPY = re.compile(r"P[0-5]\.[0-9]|演示数据|设计参考\s*Minimalist")
NATIVE_DIALOG = re.compile(r"window\.(?:confirm|prompt)\s*\(")


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def parse_blocks(css: str) -> dict[str, str]:
    """Return the last declaration for each token in a flat selector block."""
    return {name: value.strip() for name, value in DECLARATION.findall(css)}


def split_themes(css: str) -> tuple[str, str]:
    """Split tokens.css into the :root block and the light override block."""
    root = re.search(r":root\s*\{(.*?)\}", css, re.S)
    light = re.search(r'\[data-theme="light"\]\s*\{(.*?)\}', css, re.S)
    return (root.group(1) if root else ""), (light.group(1) if light else "")


def resolve(name: str, table: dict[str, str], seen: set[str] | None = None) -> str | None:
    """Resolve `--a: var(--b)` chains down to a literal value."""
    seen = seen or set()
    if name in seen:
        return None
    seen.add(name)
    value = table.get(name)
    if value is None:
        return None
    match = re.fullmatch(r"var\((--[a-z0-9-]+)\)", value.strip())
    if match:
        return resolve(match.group(1), table, seen)
    return value.strip()


def hex_to_rgb(value: str) -> tuple[int, int, int] | None:
    match = re.fullmatch(r"#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})", value)
    if not match:
        return None
    digits = match.group(1)
    if len(digits) == 3:
        digits = "".join(ch * 2 for ch in digits)
    return tuple(int(digits[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def luminance(rgb: tuple[int, int, int]) -> float:
    def channel(value: int) -> float:
        scaled = value / 255
        return scaled / 12.92 if scaled <= 0.03928 else ((scaled + 0.055) / 1.055) ** 2.4

    red, green, blue = (channel(item) for item in rgb)
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue


def contrast(foreground: tuple[int, int, int], background: tuple[int, int, int]) -> float:
    first, second = luminance(foreground), luminance(background)
    lighter, darker = max(first, second), min(first, second)
    return (lighter + 0.05) / (darker + 0.05)


def main() -> int:
    failures: list[str] = []
    passes: list[str] = []

    css_files = sorted(STYLES.glob("*.css"))
    if not css_files:
        print("FAIL styles: no CSS files found")
        return 1
    all_css = "\n".join(read(path) for path in css_files)

    # 1. Every custom property use resolves.
    defined = set(re.findall(r"(--[a-z0-9-]+)\s*:", all_css))
    used = set(VAR_USE.findall(all_css))
    unresolved = sorted(used - defined)
    if unresolved:
        failures.append(f"tokens: unresolved {', '.join(unresolved)}")
    else:
        passes.append(f"tokens: {len(defined)} defined, 0 unresolved")

    # 2. No raw colors outside tokens.css.
    offenders: list[str] = []
    for path in css_files:
        if path.name == "tokens.css":
            continue
        for number, line in enumerate(read(path).splitlines(), 1):
            if HEX.search(line):
                offenders.append(f"{path.name}:{number}")
    if offenders:
        failures.append(f"colors: raw hex outside tokens.css at {', '.join(offenders[:5])}")
    else:
        passes.append("colors: no raw hex outside tokens.css")

    # 3/4. Both themes define the semantic layer and keep AA contrast.
    tokens_css = read(STYLES / "tokens.css")
    root_block, light_block = split_themes(tokens_css)
    if not root_block or not light_block:
        failures.append("themes: tokens.css must define :root and [data-theme=light]")
    else:
        root = parse_blocks(root_block)
        light = {**root, **parse_blocks(light_block)}
        for theme_name, table in (("dark", root), ("light", light)):
            missing = [name for name in REQUIRED_TOKENS if f"--{name}" not in table]
            if missing:
                failures.append(f"themes: {theme_name} missing {', '.join(missing)}")
            for fg, bg, minimum, label in CONTRAST_PAIRS:
                fg_value = resolve(f"--{fg}", table)
                bg_value = resolve(f"--{bg}", table)
                fg_rgb = hex_to_rgb(fg_value) if fg_value else None
                bg_rgb = hex_to_rgb(bg_value) if bg_value else None
                if not fg_rgb or not bg_rgb:
                    failures.append(f"themes: {theme_name} cannot resolve {fg}/{bg}")
                    continue
                ratio = contrast(fg_rgb, bg_rgb)
                if ratio < minimum:
                    failures.append(
                        f"contrast: {theme_name} {label} {ratio:.2f} < {minimum}"
                    )
                else:
                    passes.append(f"contrast: {theme_name} {label} {ratio:.2f}")

    # 5. No internal milestone copy in user-facing TSX.
    copy_hits: list[str] = []
    for path in (ROOT / "frontend/src").rglob("*.tsx"):
        for number, line in enumerate(read(path).splitlines(), 1):
            stripped = line.strip()
            if stripped.startswith(("//", "*", "/*")):
                continue
            if COPY.search(line):
                copy_hits.append(f"{path.name}:{number}")
    if copy_hits:
        failures.append(f"copy: internal milestone markers at {', '.join(copy_hits[:5])}")
    else:
        passes.append("copy: no internal milestone markers")

    # 6a. No native confirm/prompt: the accessible DialogHost owns them.
    native_hits: list[str] = []
    for path in (ROOT / "frontend/src").rglob("*.tsx"):
        for number, line in enumerate(read(path).splitlines(), 1):
            stripped = line.strip()
            if stripped.startswith(("//", "*", "/*")):
                continue
            if NATIVE_DIALOG.search(line):
                native_hits.append(f"{path.name}:{number}")
    if native_hits:
        failures.append(f"dialogs: native confirm/prompt at {', '.join(native_hits[:5])}")
    else:
        passes.append("dialogs: no native confirm/prompt")

    # 6b. Every main landmark is reachable from the skip link.
    main_missing: list[str] = []
    for path in (ROOT / "frontend/src/components").glob("*.tsx"):
        text = read(path)
        if "<main" in text and 'id="main-content"' not in text:
            main_missing.append(path.name)
    if main_missing:
        failures.append(f"a11y: main without id=main-content in {', '.join(main_missing)}")
    else:
        passes.append("a11y: skip-link target on every main")

    # 6. Components introduced by the plan still exist.
    missing_components = [name for name in REQUIRED_COMPONENTS if not (COMPONENTS / name).is_file()]
    if missing_components:
        failures.append(f"components: missing {', '.join(missing_components)}")
    else:
        passes.append(f"components: {len(REQUIRED_COMPONENTS)} present")

    # 7. SSR shells resolve the theme from the cookie.
    bootstrap_ok = True
    for name in ("server.mjs", "server.prod.mjs"):
        source = read(FRONTEND / name)
        if 'data-theme="${theme}"' not in source or "readTheme(" not in source:
            bootstrap_ok = False
            failures.append(f"theme bootstrap: {name} does not resolve data-theme from a theme cookie")
    if bootstrap_ok:
        passes.append("theme bootstrap: dev and prod shells read the theme cookie")

    for line in passes:
        print(f"PASS {line}")
    for line in failures:
        print(f"FAIL {line}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
