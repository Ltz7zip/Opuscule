# -*- coding: utf-8 -*-
"""供应商适配层：把「一次带工具的对话请求」翻译成各家协议。

统一内部格式（与 OpenAI 的形态最接近）：

消息::

    {"role": "user", "content": "..."}
    {"role": "assistant", "content": "...", "tool_calls": [
        {"id": "call_1", "name": "list_documents", "arguments": {...}}
    ]}
    {"role": "tool", "tool_call_id": "call_1", "name": "list_documents", "content": "..."}

工具描述::

    [{"name": "...", "description": "...", "parameters": {JSON Schema}}]

返回统一为 ``ChatResult(text, tool_calls)``。

网络层只用标准库 ``urllib.request``，不新增依赖；测试里直接 patch
``request_json`` 即可，不必真的出网。
"""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request

from .models import (
    PROVIDER_ANTHROPIC,
    PROVIDER_CUSTOM,
    PROVIDER_GEMINI,
    PROVIDER_OPENAI,
    PROVIDERS,
)

logger = logging.getLogger(__name__)

DEFAULT_BASE_URLS = {
    PROVIDER_OPENAI: "https://api.openai.com/v1",
    PROVIDER_ANTHROPIC: "https://api.anthropic.com/v1",
    PROVIDER_GEMINI: "https://generativelanguage.googleapis.com/v1beta",
    PROVIDER_CUSTOM: "",
}

DEFAULT_MODELS = {
    PROVIDER_OPENAI: "gpt-4o-mini",
    PROVIDER_ANTHROPIC: "claude-sonnet-4-5",
    PROVIDER_GEMINI: "gemini-2.5-flash",
    PROVIDER_CUSTOM: "",
}

ANTHROPIC_VERSION = "2023-06-01"
REQUEST_TIMEOUT = 60


class ProviderError(Exception):
    """供应商返回错误、网络失败或响应无法解析。"""


class NoCredentialError(Exception):
    """当前用户还没配置任何可用的凭据。"""


class ChatResult:
    """一次模型调用的归一化结果。"""

    def __init__(self, text: str = "", tool_calls: list | None = None):
        self.text = text or ""
        self.tool_calls = tool_calls or []

    def to_dict(self) -> dict:
        return {"text": self.text, "tool_calls": self.tool_calls}


def provider_choices() -> list:
    """给前端设置面板用的供应商清单。"""
    return [
        {
            "value": value,
            "label": label,
            "default_base_url": DEFAULT_BASE_URLS.get(value, ""),
            "default_model": DEFAULT_MODELS.get(value, ""),
        }
        for value, label in PROVIDERS
    ]


def resolve_base_url(provider: str, base_url: str) -> str:
    """用户填了就用用户的，没填就用官方地址；尾部斜杠统一去掉。"""
    return (base_url or DEFAULT_BASE_URLS.get(provider, "")).rstrip("/")


def resolve_model(provider: str, model: str) -> str:
    resolved = (model or DEFAULT_MODELS.get(provider, "")).strip()
    if not resolved:
        raise ProviderError("还没有填写模型名")
    return resolved


def request_json(url: str, headers: dict, payload: dict, timeout: int = REQUEST_TIMEOUT) -> dict:
    """发一个 POST JSON 请求并解析 JSON 响应。"""
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(url, data=body, method="POST")
    request.add_header("Content-Type", "application/json")
    for name, value in (headers or {}).items():
        request.add_header(name, value)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        detail = ""
        try:
            detail = exc.read().decode("utf-8", errors="replace")[:500]
        except Exception:  # noqa: BLE001 - 读不到错误体就算了
            detail = ""
        raise ProviderError(f"供应商返回 HTTP {exc.code}{('：' + detail) if detail else ''}") from exc
    except urllib.error.URLError as exc:
        raise ProviderError(f"无法连接供应商：{exc.reason}") from exc
    except TimeoutError as exc:
        raise ProviderError("供应商请求超时") from exc
    try:
        data = json.loads(raw)
    except ValueError as exc:
        raise ProviderError("供应商返回的不是 JSON") from exc
    if not isinstance(data, dict):
        raise ProviderError("供应商返回格式异常")
    return data


# --------------------------------------------------------------------------- #
# OpenAI 兼容（OpenAI / 自定义）
# --------------------------------------------------------------------------- #
def _openai_payload(model: str, system: str, messages: list, tools: list) -> dict:
    wire = []
    if system:
        wire.append({"role": "system", "content": system})
    for message in messages:
        role = message.get("role")
        if role == "assistant":
            item = {"role": "assistant", "content": message.get("content") or ""}
            calls = message.get("tool_calls") or []
            if calls:
                item["tool_calls"] = [
                    {
                        "id": call.get("id") or f"call_{index}",
                        "type": "function",
                        "function": {
                            "name": call.get("name") or "",
                            "arguments": json.dumps(call.get("arguments") or {}, ensure_ascii=False),
                        },
                    }
                    for index, call in enumerate(calls)
                ]
                item["content"] = item["content"] or None
            wire.append(item)
        elif role == "tool":
            wire.append({
                "role": "tool",
                "tool_call_id": message.get("tool_call_id") or "",
                "content": message.get("content") or "",
            })
        else:
            wire.append({"role": "user", "content": message.get("content") or ""})
    payload = {"model": model, "messages": wire}
    if tools:
        payload["tools"] = [
            {
                "type": "function",
                "function": {
                    "name": tool["name"],
                    "description": tool.get("description") or "",
                    "parameters": tool.get("parameters") or {"type": "object", "properties": {}},
                },
            }
            for tool in tools
        ]
        payload["tool_choice"] = "auto"
    return payload


def _openai_result(data: dict) -> ChatResult:
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        raise ProviderError("供应商没有返回候选结果")
    message = (choices[0] or {}).get("message") or {}
    text = message.get("content") or ""
    calls = []
    for index, call in enumerate(message.get("tool_calls") or []):
        function = call.get("function") or {}
        raw_args = function.get("arguments") or "{}"
        try:
            arguments = json.loads(raw_args) if isinstance(raw_args, str) else (raw_args or {})
        except ValueError:
            arguments = {}
        calls.append({
            "id": call.get("id") or f"call_{index}",
            "name": function.get("name") or "",
            "arguments": arguments if isinstance(arguments, dict) else {},
        })
    return ChatResult(text=text, tool_calls=calls)


def _chat_openai(provider: str, api_key: str, base_url: str, model: str,
                 system: str, messages: list, tools: list) -> ChatResult:
    url = f"{resolve_base_url(provider, base_url)}/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}"}
    payload = _openai_payload(model, system, messages, tools)
    return _openai_result(request_json(url, headers, payload))


# --------------------------------------------------------------------------- #
# Anthropic
# --------------------------------------------------------------------------- #
def _anthropic_payload(model: str, system: str, messages: list, tools: list) -> dict:
    wire = []
    pending_results = []

    def flush_results():
        if pending_results:
            wire.append({"role": "user", "content": list(pending_results)})
            pending_results.clear()

    for message in messages:
        role = message.get("role")
        if role == "tool":
            pending_results.append({
                "type": "tool_result",
                "tool_use_id": message.get("tool_call_id") or "",
                "content": message.get("content") or "",
            })
            continue
        flush_results()
        if role == "assistant":
            blocks = []
            if message.get("content"):
                blocks.append({"type": "text", "text": message["content"]})
            for index, call in enumerate(message.get("tool_calls") or []):
                blocks.append({
                    "type": "tool_use",
                    "id": call.get("id") or f"toolu_{index}",
                    "name": call.get("name") or "",
                    "input": call.get("arguments") or {},
                })
            if blocks:
                wire.append({"role": "assistant", "content": blocks})
        else:
            wire.append({"role": "user", "content": message.get("content") or ""})
    flush_results()

    payload = {
        "model": model,
        "max_tokens": 2048,
        "messages": wire,
    }
    if system:
        payload["system"] = system
    if tools:
        payload["tools"] = [
            {
                "name": tool["name"],
                "description": tool.get("description") or "",
                "input_schema": tool.get("parameters") or {"type": "object", "properties": {}},
            }
            for tool in tools
        ]
    return payload


def _anthropic_result(data: dict) -> ChatResult:
    blocks = data.get("content")
    if not isinstance(blocks, list):
        raise ProviderError("供应商返回格式异常")
    texts = []
    calls = []
    for index, block in enumerate(blocks):
        if not isinstance(block, dict):
            continue
        if block.get("type") == "text":
            texts.append(block.get("text") or "")
        elif block.get("type") == "tool_use":
            calls.append({
                "id": block.get("id") or f"toolu_{index}",
                "name": block.get("name") or "",
                "arguments": block.get("input") if isinstance(block.get("input"), dict) else {},
            })
    return ChatResult(text="".join(texts), tool_calls=calls)


def _chat_anthropic(provider: str, api_key: str, base_url: str, model: str,
                    system: str, messages: list, tools: list) -> ChatResult:
    url = f"{resolve_base_url(provider, base_url)}/messages"
    headers = {"x-api-key": api_key, "anthropic-version": ANTHROPIC_VERSION}
    payload = _anthropic_payload(model, system, messages, tools)
    return _anthropic_result(request_json(url, headers, payload))


# --------------------------------------------------------------------------- #
# Gemini
# --------------------------------------------------------------------------- #
def _gemini_payload(system: str, messages: list, tools: list) -> dict:
    contents = []
    pending_results = []

    def flush_results():
        if pending_results:
            contents.append({"role": "user", "parts": list(pending_results)})
            pending_results.clear()

    for message in messages:
        role = message.get("role")
        if role == "tool":
            pending_results.append({
                "functionResponse": {
                    "name": message.get("name") or "",
                    "response": {"result": message.get("content") or ""},
                }
            })
            continue
        flush_results()
        if role == "assistant":
            parts = []
            if message.get("content"):
                parts.append({"text": message["content"]})
            for call in message.get("tool_calls") or []:
                parts.append({
                    "functionCall": {
                        "name": call.get("name") or "",
                        "args": call.get("arguments") or {},
                    }
                })
            if parts:
                contents.append({"role": "model", "parts": parts})
        else:
            contents.append({"role": "user", "parts": [{"text": message.get("content") or ""}]})
    flush_results()

    payload = {"contents": contents}
    if system:
        payload["systemInstruction"] = {"parts": [{"text": system}]}
    if tools:
        payload["tools"] = [{
            "functionDeclarations": [
                {
                    "name": tool["name"],
                    "description": tool.get("description") or "",
                    "parameters": tool.get("parameters") or {"type": "object", "properties": {}},
                }
                for tool in tools
            ]
        }]
    return payload


def _gemini_result(data: dict) -> ChatResult:
    candidates = data.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        raise ProviderError("供应商没有返回候选结果")
    parts = ((candidates[0] or {}).get("content") or {}).get("parts") or []
    texts = []
    calls = []
    for index, part in enumerate(parts):
        if not isinstance(part, dict):
            continue
        if part.get("text"):
            texts.append(part["text"])
        function = part.get("functionCall")
        if isinstance(function, dict):
            calls.append({
                "id": f"call_{index}",
                "name": function.get("name") or "",
                "arguments": function.get("args") if isinstance(function.get("args"), dict) else {},
            })
    return ChatResult(text="".join(texts), tool_calls=calls)


def _chat_gemini(provider: str, api_key: str, base_url: str, model: str,
                 system: str, messages: list, tools: list) -> ChatResult:
    base = resolve_base_url(provider, base_url)
    url = f"{base}/models/{model}:generateContent?key={api_key}"
    payload = _gemini_payload(system, messages, tools)
    return _gemini_result(request_json(url, {}, payload))


def chat(provider: str, api_key: str, base_url: str, model: str,
         system: str, messages: list, tools: list | None = None) -> ChatResult:
    """按供应商分发一次对话请求。"""
    tools = tools or []
    model = resolve_model(provider, model)
    if not api_key:
        raise ProviderError("缺少 API Key")
    if provider == PROVIDER_ANTHROPIC:
        return _chat_anthropic(provider, api_key, base_url, model, system, messages, tools)
    if provider == PROVIDER_GEMINI:
        return _chat_gemini(provider, api_key, base_url, model, system, messages, tools)
    if provider == PROVIDER_OPENAI:
        return _chat_openai(provider, api_key, base_url, model, system, messages, tools)
    if provider == PROVIDER_CUSTOM:
        if not (base_url or "").strip():
            raise ProviderError("自定义供应商需要填写接口地址")
        return _chat_openai(provider, api_key, base_url, model, system, messages, tools)
    raise ProviderError(f"未知供应商：{provider}")
