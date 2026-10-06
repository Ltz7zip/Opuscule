# -*- coding: utf-8 -*-
"""把自动探针留下的垃圾文档收进回收站（软删，随时能从「回收站」还原）。

`tools/*_probe.py` 会在**真实数据库**里建一批 "自动点测XXX" 文档来验证工具类文档，
跑完却不收拾，于是左侧文档树里全是这些一次性产物，看着像一堆没用的功能入口。

    .venv/bin/python tools/clean_probe_docs.py                 # 干跑：只列出会动谁
    .venv/bin/python tools/clean_probe_docs.py --apply         # 真的收进回收站
    .venv/bin/python tools/clean_probe_docs.py --apply --prefix x@ --prefix xIsarra
    .venv/bin/python tools/clean_probe_docs.py --apply --id 189

默认前缀是「自动点测」。软删（= 进回收站）而不是硬删：万一里面混了真东西，还能捞回来。
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from _auth import ensure_login, make_opener  # noqa: E402

BASE = os.environ.get("WS_BASE", "http://127.0.0.1:8000")


def flat(nodes, out=None):
    out = out if out is not None else []
    for node in nodes:
        out.append(node)
        flat(node.get("children") or [], out)
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="真的删除（默认只干跑）")
    parser.add_argument("--prefix", action="append", default=None,
                        help="要清理的文档名前缀，可重复；默认「自动点测」")
    parser.add_argument("--id", action="append", type=int, default=None,
                        help="按文档 id 点名清理，可重复（前缀抓不到的漏网之鱼）")
    parser.add_argument("--hard", action="store_true", help="彻底删除（不进回收站，慎用）")
    args = parser.parse_args()
    prefixes = args.prefix or ["自动点测"]
    wanted_ids = set(args.id or [])

    opener = make_opener()
    ensure_login(opener)
    with opener.open(f"{BASE}/api/world/state", timeout=20) as response:
        state = json.loads(response.read() or b"{}")

    targets = [d for d in flat(state["documents"])
               if d["id"] in wanted_ids
               or any((d.get("name") or "").startswith(p) for p in prefixes)]
    if not targets:
        print("没有需要清理的文档（前缀：" + "、".join(prefixes) + "）")
        return 0

    print(f"命中 {len(targets)} 篇：")
    for doc in targets:
        print(f"  · #{doc['id']:<4} {doc['type']:<10} {doc['name']}")

    if not args.apply:
        print("\n这是干跑。加 --apply 才会真的收进回收站。")
        return 0

    removed, failed = 0, []
    for doc in targets:
        query = "?hard=1" if args.hard else ""
        request = urllib.request.Request(
            f"{BASE}/api/world/documents/{doc['id']}{query}", method="DELETE")
        try:
            with opener.open(request, timeout=20) as response:
                response.read()
            removed += 1
        except urllib.error.HTTPError as exc:
            failed.append(f"#{doc['id']} {doc['name']} → {exc.code} {exc.read()[:120]}")

    where = "彻底删除" if args.hard else "已收进回收站"
    print(f"\n{where} {removed} 篇。")
    for item in failed:
        print("  失败：", item)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
