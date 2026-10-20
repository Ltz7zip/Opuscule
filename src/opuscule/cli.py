"""Command-line interface for Opuscule."""

from __future__ import annotations

import argparse


def print_hi(name: str) -> None:
    """Print a greeting for *name*."""
    print(f"Hi, {name}")


def main(argv: list[str] | None = None) -> int:
    """Run the Opuscule CLI."""
    parser = argparse.ArgumentParser(prog="opuscule")
    parser.add_argument("name", nargs="?", default="Opuscule")
    args = parser.parse_args(argv)
    print_hi(args.name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
