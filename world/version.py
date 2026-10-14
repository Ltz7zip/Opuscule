# -*- coding: utf-8 -*-
"""程序版本：页面页脚 / ``/meta`` 接口 / CHANGELOG 共用的唯一来源。

来源常量在 ``settings.APP_VERSION``（三段式基础号）+ ``settings.APP_CHANNEL``
（环境渠道）+ ``settings.APP_BUILD``（CI 构建号，可空），这里只做派生，不另存副本。
约定见「推进计划.md §8」——

    Dev     -> 0.4.0-dev
    Alpha   -> 0.4.0-alpha.N
    Beta    -> 0.4.0-beta.N
    Release -> 0.4.0（无后缀）

构建号（若设了 ``OPUSCULE_BUILD``）作为 semver 构建元数据附在末尾，
如 ``0.5.0-dev+build.42``，展示串尾部追加 ``· build 42``。注意
``World.publish_version`` 是"内容发布次数"，是数据，**不是**程序版本，两者别混。
"""

from __future__ import annotations

from django.conf import settings

# 渠道键 -> 展示标签。只列已知渠道；未知的原样 Title 化，方便加新渠道时
# 不至于显示空白（加渠道时顺手补进来即可）。
_CHANNEL_LABELS = {
    "dev": "Dev",
    "alpha": "Alpha",
    "beta": "Beta",
    "release": "Release",
}


def channel_label(channel: str) -> str:
    """渠道键 -> 展示标签（未知渠道原样 Title 化）。"""
    return _CHANNEL_LABELS.get(channel, (channel or "").title())


def version_string(version: str, channel: str, seq: str = "", build: str = "") -> str:
    """三段式基础号 + 渠道 -> 完整版本串。

    Alpha / Beta 带轮次 N（``seq`` 为空时取 1）；Release 不加后缀；Dev 固定 ``-dev``。
    ``build`` 非空时按 semver 构建元数据附上，如 ``0.5.0-dev+build.42``。
    """
    if channel == "dev":
        base = f"{version}-dev"
    elif channel in ("alpha", "beta"):
        base = f"{version}-{channel}.{seq or '1'}"
    else:
        base = version
    return f"{base}+build.{build}" if build else base


def app_info() -> dict:
    """当前程序的版本信息（页脚 / ``/meta`` / CHANGELOG 共用）。

    ``display`` 是给人看的一行字，如 ``Opuscule 0.4.0 · Dev``（设了构建号则
    追加 ``· build 42``）；``version_string`` 是给机器读的完整串，如 ``0.4.0-dev``。
    """
    name = getattr(settings, "APP_NAME", "Opuscule")
    version = getattr(settings, "APP_VERSION", "0.0.0")
    channel = getattr(settings, "APP_CHANNEL", "dev")
    seq = getattr(settings, "APP_CHANNEL_SEQ", "")
    build = getattr(settings, "APP_BUILD", "")
    label = channel_label(channel)
    display = f"{name} {version} · {label}"
    if build:
        display = f"{display} · build {build}"
    return {
        "name": name,
        "version": version,
        "channel": channel,
        "channel_label": label,
        "build": build,
        "version_string": version_string(version, channel, seq, build),
        "display": display,
    }
