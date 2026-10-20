#!/usr/bin/env python3
"""Read-only audit of the legacy Opuscule SQLite database.

This is an analysis helper, not product runtime code. It opens the database
with ``mode=ro`` and never writes. Output is JSON so the pre-P0 dry-run report
can be reproduced and compared across samples.

Usage:
    python scripts/legacy_audit.py --db /path/to/db.sqlite3 > audit.json
"""

from __future__ import annotations

import argparse
import collections
import json
import sqlite3
from pathlib import Path
from typing import Any

TOOL_TYPES = (
    "table",
    "board",
    "todo",
    "radar",
    "dictionary",
    "canvas",
    "soundscape",
    "media",
    "embed",
    "dice",
    "chapter",
)


def connect_readonly(path: Path) -> sqlite3.Connection:
    """Open a SQLite database without permitting writes."""
    con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    return con


def rows(con: sqlite3.Connection, sql: str, args: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    return [dict(r) for r in con.execute(sql, args)]


def classify_events(eras: list[dict[str, Any]], events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Classify each event against explicit era FK and interval membership."""
    def interval_eras(year: float) -> list[int]:
        return [e["id"] for e in eras if e["start_year"] <= year < e["end_year"]]

    out: list[dict[str, Any]] = []
    for event in events:
        explicit = event["era_id"]
        interval = interval_eras(event["year"])
        if explicit is None and not interval:
            kind = "unassigned"
        elif explicit is None:
            kind = "auto_assign"
        elif explicit in interval:
            kind = "match"
        elif not interval:
            kind = "conflict_out_of_range"
        else:
            kind = "conflict_other"
        out.append({**event, "interval_eras": interval, "kind": kind})
    return out


def audit(path: Path) -> dict[str, Any]:
    con = connect_readonly(path)
    try:
        eras = rows(
            con,
            "SELECT id, name, start_year, end_year, length_years, theme, icon, cover "
            "FROM world_era ORDER BY start_year, id",
        )
        events = rows(
            con,
            "SELECT id, title, year, month, day, hour, precision, era_id "
            "FROM world_timelineevent ORDER BY year, id",
        )
        event_diff = classify_events(eras, events)

        docs = rows(
            con,
            "SELECT id, document_type, name, slug, parent_id, is_published, hidden, "
            "deleted_at, era_id, era_ids, entity_type_id, "
            "length(settings) AS settings_len FROM world_document",
        )
        live_docs = [d for d in docs if d["deleted_at"] is None]
        live_by_id = {d["id"]: d for d in live_docs}

        live_cards = rows(
            con,
            """SELECT c.id, c.aliases, "values", c.blocks, c.blocks_doc,
                      c.era_mode, c.era_ids, c.entity_type_id, c.document_id,
                      d.name, d.slug, d.parent_id, d.is_published, d.hidden,
                      d.document_type, d.deleted_at
               FROM world_card c
               JOIN world_document d ON d.id = c.document_id
               WHERE d.deleted_at IS NULL
               ORDER BY d.id""",
        )
        all_cards = con.execute("SELECT COUNT(*) FROM world_card").fetchone()[0]

        card_rows_by_type: dict[str, int] = collections.Counter(
            c["document_type"] for c in live_cards
        )
        content_cards = [c for c in live_cards if c["document_type"] == "card"]
        root_content_cards = [c for c in content_cards if c["parent_id"] is None]
        cards_in_folders = [
            c
            for c in content_cards
            if c["parent_id"] is not None
            and live_by_id.get(c["parent_id"], {}).get("document_type") == "folder"
        ]
        cards_in_cards = [
            c
            for c in content_cards
            if c["parent_id"] is not None
            and live_by_id.get(c["parent_id"], {}).get("document_type") == "card"
        ]

        children: dict[int, list[dict[str, Any]]] = collections.defaultdict(list)
        for doc in live_docs:
            if doc["parent_id"] is not None:
                children[doc["parent_id"]].append(doc)

        containers_with_card_row_and_children = []
        for card in live_cards:
            if card["document_type"] == "card":
                continue
            child_docs = children.get(card["document_id"], [])
            if child_docs:
                containers_with_card_row_and_children.append(
                    {
                        "card_row_id": card["id"],
                        "document_id": card["document_id"],
                        "document_type": card["document_type"],
                        "name": card["name"],
                        "children": [
                            {"id": d["id"], "type": d["document_type"], "name": d["name"]}
                            for d in child_docs
                        ],
                    }
                )

        tools = [d for d in live_docs if d["document_type"] in TOOL_TYPES]
        tool_total = con.execute(
            "SELECT COUNT(*) FROM world_document WHERE document_type IN (%s)"
            % ",".join("?" * len(TOOL_TYPES)),
            TOOL_TYPES,
        ).fetchone()[0]
        tool_live = con.execute(
            "SELECT COUNT(*) FROM world_document "
            "WHERE deleted_at IS NULL AND document_type IN (%s)"
            % ",".join("?" * len(TOOL_TYPES)),
            TOOL_TYPES,
        ).fetchone()[0]

        slug_groups: dict[str, list[tuple[int, str, str]]] = collections.defaultdict(list)
        for doc in live_docs:
            slug_groups[doc["slug"]].append(
                (doc["id"], doc["document_type"], doc["name"])
            )
        slug_dups = {k: v for k, v in slug_groups.items() if len(v) > 1}

        version_count = con.execute("SELECT COUNT(*) FROM world_documentversion").fetchone()[0]
        blocks_doc_nonempty = sum(
            1 for c in content_cards if (c["blocks_doc"] or "").strip() not in ("", "[]")
        )
        blocks_nonempty = sum(
            1 for c in content_cards if (c["blocks"] or "").strip() not in ("", "[]")
        )

        return {
            "source": str(path),
            "eras": eras,
            "event_diff": event_diff,
            "event_diff_counts": dict(collections.Counter(e["kind"] for e in event_diff)),
            "era_members_interval": {
                str(e["id"]): sum(
                    1 for ev in events if e["start_year"] <= ev["year"] < e["end_year"]
                )
                for e in eras
            },
            "era_members_explicit": dict(
                collections.Counter(ev["era_id"] for ev in events if ev["era_id"] is not None)
            ),
            "documents_total": len(docs),
            "documents_live": len(live_docs),
            "live_type_counts": dict(collections.Counter(d["document_type"] for d in live_docs)),
            "cards_total": all_cards,
            "cards_live": len(live_cards),
            "cards_live_by_type": dict(card_rows_by_type),
            "content_cards": len(content_cards),
            "content_cards_root": len(root_content_cards),
            "content_cards_in_folders": len(cards_in_folders),
            "content_cards_in_cards": len(cards_in_cards),
            "containers_with_card_row_and_children": containers_with_card_row_and_children,
            "content_cards_with_blocks_doc": blocks_doc_nonempty,
            "content_cards_with_legacy_blocks": blocks_nonempty,
            "folders": [
                {"id": d["id"], "name": d["name"], "slug": d["slug"], "parent_id": d["parent_id"]}
                for d in live_docs
                if d["document_type"] == "folder"
            ],
            "tools_total": tool_total,
            "tools_live": tool_live,
            "tools_live_list": [
                {
                    "id": d["id"],
                    "type": d["document_type"],
                    "name": d["name"],
                    "slug": d["slug"],
                    "published": d["is_published"],
                    "settings_len": d["settings_len"],
                }
                for d in tools
            ],
            "slug_duplicates_live": slug_dups,
            "versions": version_count,
        }
    finally:
        con.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", required=True, type=Path, help="legacy SQLite database")
    args = parser.parse_args()
    print(json.dumps(audit(args.db), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
