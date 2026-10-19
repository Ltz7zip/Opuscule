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
import os
import ssl
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

# 证书与代理的可配置项：
# - 有些机器上的 Python 没有可用的 CA bundle（macOS python.org 安装包常见），
#   可以用它指向任意 PEM；``SSL_CERT_FILE`` 是 OpenSSL 自己的变量，也一并尊重。
# - 有些全局代理（例如 SteamTools 的 127.0.0.1:26561）会替换 HTTPS 证书，
#   把 AI 请求直连掉更安全。``auto`` 是默认值：先走系统代理，证书校验失败再直连。
CA_BUNDLE_ENV = "WORLDBUILDING_AI_CA_BUNDLE"
PROXY_MODE_ENV = "WORLDBUILDING_AI_PROXY"

_SSL_CONTEXTS: dict = {}


def _ca_bundle() -> str | None:
    """挑一个真实存在的 CA 文件；找不到就返回 None。"""
    candidates = []
    for name in (CA_BUNDLE_ENV, "SSL_CERT_FILE"):
        value = (os.environ.get(name) or "").strip()
        if value:
            candidates.append(value)
    try:
        import certifi  # noqa: PLC0415 - 有就用，没有也不强求
        candidates.append(certifi.where())
    except Exception:  # noqa: BLE001 - certifi 是可选依赖
        pass
    paths = ssl.get_default_verify_paths()
    candidates.extend([paths.cafile, paths.openssl_cafile])
    candidates.extend([
        "/etc/ssl/cert.pem",  # macOS
        "/etc/pki/tls/certs/ca-bundle.crt",  # RHEL 系
        "/etc/ssl/certs/ca-certificates.crt",  # Debian 系
    ])
    for path in candidates:
        if path and os.path.isfile(path):
            return path
    return None


def _ssl_context() -> ssl.SSLContext:
    cafile = _ca_bundle()
    context = _SSL_CONTEXTS.get(cafile)
    if context is None:
        context = ssl.create_default_context(cafile=cafile) if cafile else ssl.create_default_context()
        _SSL_CONTEXTS[cafile] = context
    return context


def _proxy_mode() -> str:
    return (os.environ.get(PROXY_MODE_ENV) or "auto").strip()


def _proxy_attempts() -> list:
    """返回依次尝试的代理设置：``"system"`` 表示系统代理，None 表示直连。"""
    mode = _proxy_mode()
    lowered = mode.lower()
    if lowered in ("direct", "off", "none"):
        return [None]
    if lowered not in ("", "auto"):
        return [mode]
    proxies = urllib.request.getproxies()
    if proxies.get("https") or proxies.get("http"):
        return ["system", None]
    return [None]


def _opener(proxy):
    if proxy == "system":
        handler = urllib.request.ProxyHandler()
    elif proxy is None:
        handler = urllib.request.ProxyHandler({})
    else:
        handler = urllib.request.ProxyHandler({"http": proxy, "https": proxy})
    return urllib.request.build_opener(handler, urllib.request.HTTPSHandler(context=_ssl_context()))


def _is_cert_error(exc: Exception) -> bool:
    reason = getattr(exc, "reason", exc)
    if isinstance(reason, ssl.SSLCertVerificationError):
        return True
    text = str(reason)
    return "CERTIFICATE_VERIFY_FAILED" in text or "certificate verify failed" in text


def _should_fallback(exc: Exception) -> bool:
    """代理挂了或证书不可信时才值得再直连试一次。"""
    reason = getattr(exc, "reason", exc)
    return _is_cert_error(exc) or isinstance(reason, (ConnectionRefusedError, ConnectionResetError))


def _network_error_message(failures: list) -> str:
    _spec, last_exc = failures[-1]
    reason = getattr(last_exc, "reason", last_exc)
    message = f"无法连接供应商：{reason}"
    proxy_exc = next((exc for spec, exc in failures if spec is not None), None)
    if proxy_exc is not None and _is_cert_error(proxy_exc):
        proxies = urllib.request.getproxies()
        proxy = proxies.get("https") or proxies.get("http") or failures[0][0]
        message += (
            f"。系统代理 {proxy} 返回的 HTTPS 证书未通过校验（代理可能替换了证书）；"
            f"可设置环境变量 {PROXY_MODE_ENV}=direct 让 AI 请求直连，"
            f"或用 {CA_BUNDLE_ENV} 指定包含代理根证书的 PEM"
        )
    elif _is_cert_error(last_exc):
        if _ca_bundle() is None:
            message += (
                "。本机 Python 没有可用的 CA 证书文件，"
                f"可设置环境变量 {CA_BUNDLE_ENV} 指向 cacert.pem"
            )
        else:
            message += "。HTTPS 证书校验未通过，请检查网络环境或代理证书"
    return message


class ProviderError(Exception):
    """供应商返回错误、网络失败或响应无法解析。"""


class NoCredentialError(Exception):
    """当前用户还没配置任何可用的凭据。"""


class ChatResult:
    """一次模型调用的归一化结果。

    ``usage`` 统一为
    ``{"prompt_tokens", "completion_tokens", "total_tokens", "reasoning_tokens"}``；
    供应商没给用量时保持空 dict。
    """

    def __init__(self, text: str = "", tool_calls: list | None = None,
                 reasoning: str = "", usage: dict | None = None):
        self.text = text or ""
        self.tool_calls = tool_calls or []
        self.reasoning = reasoning or ""
        self.usage = usage or {}

    def to_dict(self) -> dict:
        return {
            "text": self.text,
            "tool_calls": self.tool_calls,
            "reasoning": self.reasoning,
            "usage": self.usage,
        }


def _usage(prompt=0, completion=0, total=0, reasoning=0) -> dict:
    """把各家字段归一化；缺总数时用 prompt + completion 补齐。"""
    prompt = int(prompt or 0)
    completion = int(completion or 0)
    reasoning = int(reasoning or 0)
    total = int(total or 0) or (prompt + completion)
    return {
        "prompt_tokens": prompt,
        "completion_tokens": completion,
        "total_tokens": total,
        "reasoning_tokens": reasoning,
    }


def _merge_usage(target: dict, extra: dict) -> None:
    """按字段累加；``total`` 缺省时保持累加后的自然总和。"""
    if not isinstance(extra, dict):
        return
    for key in ("prompt_tokens", "completion_tokens", "total_tokens", "reasoning_tokens"):
        value = extra.get(key)
        if isinstance(value, (int, float)):
            target[key] = int(target.get(key, 0)) + int(value)
    if not target.get("total_tokens"):
        target["total_tokens"] = target.get("prompt_tokens", 0) + target.get("completion_tokens", 0)


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
    raw = None
    failures = []
    attempts = _proxy_attempts()
    for index, proxy in enumerate(attempts):
        request = urllib.request.Request(url, data=body, method="POST")
        request.add_header("Content-Type", "application/json")
        for name, value in (headers or {}).items():
            request.add_header(name, value)
        try:
            with _opener(proxy).open(request, timeout=timeout) as response:
                raw = response.read().decode("utf-8", errors="replace")
            break
        except urllib.error.HTTPError as exc:
            detail = ""
            try:
                detail = exc.read().decode("utf-8", errors="replace")[:500]
            except Exception:  # noqa: BLE001 - 读不到错误体就算了
                detail = ""
            raise ProviderError(f"供应商返回 HTTP {exc.code}{('：' + detail) if detail else ''}") from exc
        except urllib.error.URLError as exc:
            if isinstance(getattr(exc, "reason", exc), TimeoutError):
                raise ProviderError("供应商请求超时") from exc
            failures.append((proxy, exc))
            if index + 1 < len(attempts) and _should_fallback(exc):
                logger.info(
                    "经 %s 访问供应商失败（%s），改用直连重试",
                    "系统代理" if proxy == "system" else proxy,
                    getattr(exc, "reason", exc),
                )
                continue
            raise ProviderError(_network_error_message(failures)) from exc
        except TimeoutError as exc:
            raise ProviderError("供应商请求超时") from exc
    try:
        data = json.loads(raw)
    except ValueError as exc:
        raise ProviderError("供应商返回的不是 JSON") from exc
    if not isinstance(data, dict):
        raise ProviderError("供应商返回格式异常")
    return data


def _post_stream(url: str, headers: dict, payload: dict, timeout: int = REQUEST_TIMEOUT):
    """建立 SSE 连接，代理与直连的取舍和 ``request_json`` 保持一致。"""
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    failures = []
    attempts = _proxy_attempts()
    for index, proxy in enumerate(attempts):
        request = urllib.request.Request(url, data=body, method="POST")
        request.add_header("Content-Type", "application/json")
        request.add_header("Accept", "text/event-stream")
        for name, value in (headers or {}).items():
            request.add_header(name, value)
        try:
            return _opener(proxy).open(request, timeout=timeout)
        except urllib.error.HTTPError as exc:
            detail = ""
            try:
                detail = exc.read().decode("utf-8", errors="replace")[:500]
            except Exception:  # noqa: BLE001 - 读不到错误体就算了
                detail = ""
            raise ProviderError(f"供应商返回 HTTP {exc.code}{('：' + detail) if detail else ''}") from exc
        except urllib.error.URLError as exc:
            if isinstance(getattr(exc, "reason", exc), TimeoutError):
                raise ProviderError("供应商请求超时") from exc
            failures.append((proxy, exc))
            if index + 1 < len(attempts) and _should_fallback(exc):
                logger.info(
                    "经 %s 访问供应商失败（%s），改用直连重试",
                    "系统代理" if proxy == "system" else proxy,
                    getattr(exc, "reason", exc),
                )
                continue
            raise ProviderError(_network_error_message(failures)) from exc
        except TimeoutError as exc:
            raise ProviderError("供应商请求超时") from exc
    raise ProviderError("无法连接供应商")


def _sse_events(response):
    """逐事件解析 ``text/event-stream``：多行 ``data:`` 拼成一段 JSON。"""
    data_lines: list[str] = []
    for raw in response:
        line = raw.decode("utf-8", errors="replace").rstrip("\r\n")
        if line:
            if line.startswith(":"):
                continue
            if line.startswith("data:"):
                data_lines.append(line[5:].lstrip())
            continue
        if not data_lines:
            continue
        data = "\n".join(data_lines)
        data_lines.clear()
        if data == "[DONE]":
            return
        try:
            event = json.loads(data)
        except ValueError:
            continue
        if isinstance(event, dict):
            yield event
    if data_lines:
        data = "\n".join(data_lines)
        if data != "[DONE]":
            try:
                event = json.loads(data)
            except ValueError:
                return
            if isinstance(event, dict):
                yield event


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


def _openai_usage(data: dict) -> dict:
    raw = data.get("usage") if isinstance(data, dict) else None
    if not isinstance(raw, dict):
        return {}
    details = raw.get("completion_tokens_details") or {}
    return _usage(
        prompt=raw.get("prompt_tokens"),
        completion=raw.get("completion_tokens"),
        total=raw.get("total_tokens"),
        reasoning=details.get("reasoning_tokens") if isinstance(details, dict) else 0,
    )


def _openai_result(data: dict) -> ChatResult:
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        raise ProviderError("供应商没有返回候选结果")
    message = (choices[0] or {}).get("message") or {}
    text = message.get("content") or ""
    reasoning = message.get("reasoning_content") or message.get("reasoning") or ""
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
    return ChatResult(text=text, tool_calls=calls, reasoning=reasoning,
                      usage=_openai_usage(data))


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


def _anthropic_usage(data: dict) -> dict:
    raw = data.get("usage") if isinstance(data, dict) else None
    if not isinstance(raw, dict):
        return {}
    return _usage(
        prompt=raw.get("input_tokens"),
        completion=raw.get("output_tokens"),
    )


def _anthropic_result(data: dict) -> ChatResult:
    blocks = data.get("content")
    if not isinstance(blocks, list):
        raise ProviderError("供应商返回格式异常")
    texts = []
    thoughts = []
    calls = []
    for index, block in enumerate(blocks):
        if not isinstance(block, dict):
            continue
        if block.get("type") == "text":
            texts.append(block.get("text") or "")
        elif block.get("type") == "thinking":
            thoughts.append(block.get("thinking") or "")
        elif block.get("type") == "tool_use":
            calls.append({
                "id": block.get("id") or f"toolu_{index}",
                "name": block.get("name") or "",
                "arguments": block.get("input") if isinstance(block.get("input"), dict) else {},
            })
    return ChatResult(text="".join(texts), tool_calls=calls,
                      reasoning="".join(thoughts), usage=_anthropic_usage(data))


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


def _gemini_usage(data: dict) -> dict:
    raw = data.get("usageMetadata") if isinstance(data, dict) else None
    if not isinstance(raw, dict):
        return {}
    return _usage(
        prompt=raw.get("promptTokenCount"),
        completion=raw.get("candidatesTokenCount"),
        total=raw.get("totalTokenCount"),
        reasoning=raw.get("thoughtsTokenCount"),
    )


def _gemini_result(data: dict) -> ChatResult:
    candidates = data.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        raise ProviderError("供应商没有返回候选结果")
    parts = ((candidates[0] or {}).get("content") or {}).get("parts") or []
    texts = []
    thoughts = []
    calls = []
    for index, part in enumerate(parts):
        if not isinstance(part, dict):
            continue
        if part.get("text"):
            if part.get("thought") is True:
                thoughts.append(part["text"])
            else:
                texts.append(part["text"])
        function = part.get("functionCall")
        if isinstance(function, dict):
            calls.append({
                "id": f"call_{index}",
                "name": function.get("name") or "",
                "arguments": function.get("args") if isinstance(function.get("args"), dict) else {},
            })
    return ChatResult(text="".join(texts), tool_calls=calls,
                      reasoning="".join(thoughts), usage=_gemini_usage(data))


def _chat_gemini(provider: str, api_key: str, base_url: str, model: str,
                 system: str, messages: list, tools: list) -> ChatResult:
    base = resolve_base_url(provider, base_url)
    url = f"{base}/models/{model}:generateContent?key={api_key}"
    payload = _gemini_payload(system, messages, tools)
    return _gemini_result(request_json(url, {}, payload))


# --------------------------------------------------------------------------- #
# 流式输出
# --------------------------------------------------------------------------- #
def _close_quietly(response) -> None:
    try:
        response.close()
    except Exception:  # noqa: BLE001 - 关闭失败不影响已经拿到的内容
        pass


def _is_parameter_rejection(exc: ProviderError) -> bool:
    """``stream_options`` 之类的可选参数被旧接口拒绝时返回 True。"""
    text = str(exc)
    return "HTTP 400" in text or "HTTP 422" in text


def _parse_arguments(raw) -> dict:
    if isinstance(raw, dict):
        return raw
    if not isinstance(raw, str) or not raw.strip():
        return {}
    try:
        value = json.loads(raw)
    except ValueError:
        return {}
    return value if isinstance(value, dict) else {}


def _stream_openai(provider: str, api_key: str, base_url: str, model: str,
                   system: str, messages: list, tools: list, result: ChatResult):
    url = f"{resolve_base_url(provider, base_url)}/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}"}
    payload = _openai_payload(model, system, messages, tools)
    payload["stream"] = True
    payload["stream_options"] = {"include_usage": True}
    try:
        response = _post_stream(url, headers, payload)
    except ProviderError as exc:
        if not _is_parameter_rejection(exc):
            raise
        payload.pop("stream_options", None)
        response = _post_stream(url, headers, payload)

    slots: dict = {}
    try:
        for event in _sse_events(response):
            if event.get("error"):
                detail = event["error"]
                if isinstance(detail, dict):
                    detail = detail.get("message") or detail
                raise ProviderError(f"供应商返回错误：{detail}")
            usage = _openai_usage(event)
            if usage:
                _merge_usage(result.usage, usage)
            for choice in event.get("choices") or []:
                delta = (choice or {}).get("delta") or {}
                thought = delta.get("reasoning_content") or delta.get("reasoning") or ""
                if thought:
                    result.reasoning += thought
                    yield {"type": "reasoning", "text": thought}
                content = delta.get("content")
                if content:
                    result.text += content
                    yield {"type": "content", "text": content}
                for call in delta.get("tool_calls") or []:
                    index = call.get("index", len(slots))
                    slot = slots.setdefault(index, {"id": "", "name": "", "arguments": ""})
                    if call.get("id"):
                        slot["id"] = call["id"]
                    function = call.get("function") or {}
                    if function.get("name"):
                        slot["name"] = function["name"]
                    if function.get("arguments"):
                        slot["arguments"] += function["arguments"]
    finally:
        _close_quietly(response)

    result.tool_calls = [
        {
            "id": slot["id"] or f"call_{index}",
            "name": slot["name"],
            "arguments": _parse_arguments(slot["arguments"]),
        }
        for index, slot in sorted(slots.items())
        if slot["name"]
    ]


def _stream_anthropic(provider: str, api_key: str, base_url: str, model: str,
                      system: str, messages: list, tools: list, result: ChatResult):
    url = f"{resolve_base_url(provider, base_url)}/messages"
    headers = {"x-api-key": api_key, "anthropic-version": ANTHROPIC_VERSION}
    payload = _anthropic_payload(model, system, messages, tools)
    payload["stream"] = True
    response = _post_stream(url, headers, payload)

    blocks: dict = {}
    prompt_tokens = 0
    completion_tokens = 0
    try:
        for event in _sse_events(response):
            kind = event.get("type")
            if kind == "error":
                detail = event.get("error") or "未知错误"
                if isinstance(detail, dict):
                    detail = detail.get("message") or detail
                raise ProviderError(f"供应商返回错误：{detail}")
            if kind == "message_start":
                usage = ((event.get("message") or {}).get("usage") or {})
                prompt_tokens = int(usage.get("input_tokens") or 0)
                completion_tokens = int(usage.get("output_tokens") or 0)
                continue
            if kind == "content_block_start":
                block = event.get("content_block") or {}
                blocks[event.get("index", len(blocks))] = {
                    "type": block.get("type") or "",
                    "id": block.get("id") or "",
                    "name": block.get("name") or "",
                    "json": "",
                }
                continue
            if kind == "content_block_delta":
                delta = event.get("delta") or {}
                delta_type = delta.get("type")
                if delta_type == "thinking_delta":
                    text = delta.get("thinking") or ""
                    if text:
                        result.reasoning += text
                        yield {"type": "reasoning", "text": text}
                elif delta_type == "text_delta":
                    text = delta.get("text") or ""
                    if text:
                        result.text += text
                        yield {"type": "content", "text": text}
                elif delta_type == "input_json_delta":
                    slot = blocks.setdefault(event.get("index", 0), {"json": ""})
                    slot["json"] = (slot.get("json") or "") + (delta.get("partial_json") or "")
                continue
            if kind == "message_delta":
                usage = event.get("usage") or {}
                if usage.get("input_tokens") is not None:
                    prompt_tokens = int(usage.get("input_tokens") or 0)
                if usage.get("output_tokens") is not None:
                    completion_tokens = int(usage.get("output_tokens") or 0)
    finally:
        _close_quietly(response)

    result.usage = _usage(prompt=prompt_tokens, completion=completion_tokens)
    calls = []
    for index, slot in sorted(blocks.items()):
        if slot.get("type") != "tool_use":
            continue
        calls.append({
            "id": slot.get("id") or f"toolu_{index}",
            "name": slot.get("name") or "",
            "arguments": _parse_arguments(slot.get("json")),
        })
    result.tool_calls = calls


def _stream_gemini(provider: str, api_key: str, base_url: str, model: str,
                   system: str, messages: list, tools: list, result: ChatResult):
    base = resolve_base_url(provider, base_url)
    url = f"{base}/models/{model}:streamGenerateContent?alt=sse&key={api_key}"
    payload = _gemini_payload(system, messages, tools)
    response = _post_stream(url, {}, payload)

    calls = []
    try:
        for event in _sse_events(response):
            if event.get("error"):
                detail = event["error"]
                if isinstance(detail, dict):
                    detail = detail.get("message") or detail
                raise ProviderError(f"供应商返回错误：{detail}")
            usage = _gemini_usage(event)
            if usage:
                # Gemini 每个分片都带累计用量，直接以最后一片为准。
                result.usage = usage
            candidates = event.get("candidates") or []
            if not candidates:
                continue
            parts = ((candidates[0] or {}).get("content") or {}).get("parts") or []
            for part in parts:
                if not isinstance(part, dict):
                    continue
                text = part.get("text")
                if text:
                    if part.get("thought") is True:
                        result.reasoning += text
                        yield {"type": "reasoning", "text": text}
                    else:
                        result.text += text
                        yield {"type": "content", "text": text}
                function = part.get("functionCall")
                if isinstance(function, dict):
                    calls.append({
                        "id": f"call_{len(calls)}",
                        "name": function.get("name") or "",
                        "arguments": function.get("args") if isinstance(function.get("args"), dict) else {},
                    })
    finally:
        _close_quietly(response)
    result.tool_calls = calls


def stream_chat(provider: str, api_key: str, base_url: str, model: str,
                system: str, messages: list, tools: list | None = None,
                result: ChatResult | None = None):
    """流式调用模型，逐段 ``yield {"type": "reasoning"|"content", "text": ...}``。

    完整结果会写进调用方传入的 ``result``；不传则内部新建一个，调用方拿不到
    累积内容，只适合不关心最终结果的场景。
    """
    tools = tools or []
    model = resolve_model(provider, model)
    if not api_key:
        raise ProviderError("缺少 API Key")
    result = result if result is not None else ChatResult()
    if provider == PROVIDER_ANTHROPIC:
        yield from _stream_anthropic(
            provider, api_key, base_url, model, system, messages, tools, result)
    elif provider == PROVIDER_GEMINI:
        yield from _stream_gemini(
            provider, api_key, base_url, model, system, messages, tools, result)
    elif provider == PROVIDER_OPENAI:
        yield from _stream_openai(
            provider, api_key, base_url, model, system, messages, tools, result)
    elif provider == PROVIDER_CUSTOM:
        if not (base_url or "").strip():
            raise ProviderError("自定义供应商需要填写接口地址")
        yield from _stream_openai(
            provider, api_key, base_url, model, system, messages, tools, result)
    else:
        raise ProviderError(f"未知供应商：{provider}")



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
