# -*- coding: utf-8 -*-
"""BYOK 密钥的落库加密（只依赖标准库）。

运行环境里没有 ``cryptography``，所以这里用标准库自己拼一套最小的
**Encrypt-then-MAC**：

1. 用 ``SECRET_KEY`` 做 HKDF-SHA256，派生 64 字节；
2. 前 32 字节当加密钥，后 32 字节当 MAC 钥；
3. 每次加密随机 16 字节 nonce，keystream = ``HMAC(enc_key, nonce || counter)``，
   与明文 XOR 得到密文（CTR 式流加密，只在"密钥不重复使用"的前提下安全，
   随机 nonce 已满足）；
4. MAC = ``HMAC(mac_key, version || nonce || ciphertext)``。

密文格式（base64url）::

    version(1) || nonce(16) || ciphertext(n) || mac(32)

这样即使数据库被读走，没有 ``SECRET_KEY`` 也拿不到用户的 API Key；
同时 MAC 能发现任何一位被篡改的密文。
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

VERSION = b"\x01"
_SALT = b"opuscule:ai:credential:salt:v1"
_INFO = b"opuscule:ai:credential:keys:v1"
_NONCE_LEN = 16
_MAC_LEN = 32


def _root_key() -> bytes:
    """取 ``SECRET_KEY`` 作为根密钥；空值直接拒绝，别拿空串加密。"""
    secret = getattr(settings, "SECRET_KEY", "") or ""
    if not secret:
        raise ImproperlyConfigured("SECRET_KEY 为空，无法加密 AI 密钥")
    return secret.encode("utf-8")


def _hkdf_expand(prk: bytes, length: int) -> bytes:
    """RFC 5869 的 expand 步骤（info 固定为模块常量）。"""
    output = b""
    block = b""
    counter = 1
    while len(output) < length:
        block = hmac.new(prk, block + _INFO + bytes([counter]), hashlib.sha256).digest()
        output += block
        counter += 1
    return output[:length]


def _keys() -> tuple[bytes, bytes]:
    """派生 (加密钥, MAC 钥)。"""
    prk = hmac.new(_SALT, _root_key(), hashlib.sha256).digest()
    okm = _hkdf_expand(prk, 64)
    return okm[:32], okm[32:]


def _keystream(key: bytes, nonce: bytes, length: int) -> bytes:
    """按 4 字节大端计数器生成与明文等长的密钥流。"""
    output = b""
    counter = 0
    while len(output) < length:
        output += hmac.new(key, nonce + counter.to_bytes(4, "big"), hashlib.sha256).digest()
        counter += 1
    return output[:length]


def _xor(data: bytes, stream: bytes) -> bytes:
    return bytes(a ^ b for a, b in zip(data, stream))


def encrypt_secret(plaintext: str) -> str:
    """把明文 API Key 加密成可落库的字符串。"""
    text = (plaintext or "").strip()
    if not text:
        raise ValueError("密钥不能为空")
    enc_key, mac_key = _keys()
    nonce = os.urandom(_NONCE_LEN)
    data = text.encode("utf-8")
    cipher = _xor(data, _keystream(enc_key, nonce, len(data)))
    mac = hmac.new(mac_key, VERSION + nonce + cipher, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(VERSION + nonce + cipher + mac).decode("ascii")


def decrypt_secret(token: str) -> str:
    """解出明文 API Key；格式错误或被篡改一律抛 ``ValueError``。"""
    try:
        raw = base64.urlsafe_b64decode((token or "").encode("ascii"))
    except Exception as exc:  # noqa: BLE001 - 统一收敛成 ValueError
        raise ValueError("密钥密文格式错误") from exc
    if len(raw) < 1 + _NONCE_LEN + _MAC_LEN or raw[:1] != VERSION:
        raise ValueError("密钥密文格式错误")
    nonce = raw[1:1 + _NONCE_LEN]
    cipher = raw[1 + _NONCE_LEN:-_MAC_LEN]
    mac = raw[-_MAC_LEN:]
    enc_key, mac_key = _keys()
    expected = hmac.new(mac_key, VERSION + nonce + cipher, hashlib.sha256).digest()
    if not hmac.compare_digest(mac, expected):
        raise ValueError("密钥密文校验失败")
    return _xor(cipher, _keystream(enc_key, nonce, len(cipher))).decode("utf-8")


def key_hint(plaintext: str) -> str:
    """给前端看的尾号提示（只留最后 4 位）。"""
    text = (plaintext or "").strip()
    return text[-4:] if len(text) >= 4 else ""
