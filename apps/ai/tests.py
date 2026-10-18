# -*- coding: utf-8 -*-
"""0.6.0 AI 横切层的测试。

外部模型一律不出网：供应商适配层 patch ``request_json``，服务层 patch
``providers.chat``，所以这些用例只验证"我们自己的逻辑"。
"""

from __future__ import annotations

import json
from unittest.mock import patch

from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import SimpleTestCase, TestCase

from apps.documents.models import Card, Document, TimelineEvent, WorldTimeline
from apps.world.models import DOC_CARD, DOC_TIMELINE, EntityType, Membership, World

from . import providers, services
from .crypto import decrypt_secret, encrypt_secret, key_hint
from .models import (
    CHANGE_CREATE_DOCUMENT,
    CHANGE_CREATE_TIMELINE_EVENT,
    CHANGE_UPDATE_DOCUMENT,
    PROVIDER_ANTHROPIC,
    PROVIDER_CUSTOM,
    PROVIDER_GEMINI,
    PROVIDER_OPENAI,
    ROLE_ASSISTANT,
    STATUS_APPLIED,
    STATUS_FAILED,
    STATUS_PENDING,
    STATUS_REJECTED,
    AiChange,
    AiChangeSet,
    AiConversation,
    AiCredential,
    AiMessage,
)
from .tools import ToolRunner


class CryptoTests(SimpleTestCase):
    def test_roundtrip(self):
        token = encrypt_secret("sk-test-1234567890")
        self.assertNotIn("sk-test", token)
        self.assertEqual(decrypt_secret(token), "sk-test-1234567890")

    def test_ciphertext_is_randomized(self):
        self.assertNotEqual(encrypt_secret("same-key"), encrypt_secret("same-key"))

    def test_tampered_ciphertext_is_rejected(self):
        import base64

        token = encrypt_secret("sk-secret-value")
        raw = bytearray(base64.urlsafe_b64decode(token.encode("ascii")))
        raw[20] ^= 0x01
        broken = base64.urlsafe_b64encode(bytes(raw)).decode("ascii")
        with self.assertRaises(ValueError):
            decrypt_secret(broken)

    def test_garbage_is_rejected(self):
        for value in ("", "not-base64!!", "YWJj"):
            with self.assertRaises(ValueError):
                decrypt_secret(value)

    def test_empty_plaintext_rejected(self):
        with self.assertRaises(ValueError):
            encrypt_secret("   ")

    def test_key_hint_keeps_last_four(self):
        self.assertEqual(key_hint("sk-abcdef1234"), "1234")
        self.assertEqual(key_hint("ab"), "")


class ProviderTests(SimpleTestCase):
    def test_provider_choices(self):
        values = [item["value"] for item in providers.provider_choices()]
        self.assertEqual(values, [PROVIDER_OPENAI, PROVIDER_ANTHROPIC, PROVIDER_GEMINI, PROVIDER_CUSTOM])
        self.assertTrue(all(item["label"] for item in providers.provider_choices()))

    def test_openai_request_and_result(self):
        captured = {}

        def fake(url, headers, payload, timeout=60):
            captured.update({"url": url, "headers": headers, "payload": payload})
            return {"choices": [{"message": {
                "content": "好的",
                "tool_calls": [{
                    "id": "call_1",
                    "function": {"name": "list_documents", "arguments": "{\"limit\": 5}"},
                }],
            }}]}

        with patch.object(providers, "request_json", side_effect=fake):
            result = providers.chat(
                PROVIDER_OPENAI, "sk-1", "", "",
                "system", [{"role": "user", "content": "hi"}],
                [{"name": "list_documents", "description": "", "parameters": {"type": "object"}}],
            )

        self.assertEqual(captured["url"], "https://api.openai.com/v1/chat/completions")
        self.assertEqual(captured["headers"]["Authorization"], "Bearer sk-1")
        self.assertEqual(captured["payload"]["model"], "gpt-4o-mini")
        self.assertEqual(captured["payload"]["messages"][0]["role"], "system")
        self.assertEqual(captured["payload"]["tools"][0]["function"]["name"], "list_documents")
        self.assertEqual(result.text, "好的")
        self.assertEqual(result.tool_calls[0]["arguments"], {"limit": 5})

    def test_anthropic_request_and_result(self):
        captured = {}

        def fake(url, headers, payload, timeout=60):
            captured.update({"url": url, "headers": headers, "payload": payload})
            return {"content": [
                {"type": "text", "text": "查到了"},
                {"type": "tool_use", "id": "toolu_1", "name": "list_eras", "input": {}},
            ]}

        with patch.object(providers, "request_json", side_effect=fake):
            result = providers.chat(
                PROVIDER_ANTHROPIC, "sk-ant", "", "",
                "system", [
                    {"role": "user", "content": "hi"},
                    {"role": "assistant", "content": "", "tool_calls": [
                        {"id": "toolu_1", "name": "list_eras", "arguments": {}},
                    ]},
                    {"role": "tool", "tool_call_id": "toolu_1", "name": "list_eras", "content": "{}"},
                ],
                [{"name": "list_eras", "description": "", "parameters": {"type": "object"}}],
            )

        self.assertEqual(captured["url"], "https://api.anthropic.com/v1/messages")
        self.assertEqual(captured["headers"]["x-api-key"], "sk-ant")
        self.assertEqual(captured["payload"]["system"], "system")
        roles = [message["role"] for message in captured["payload"]["messages"]]
        self.assertEqual(roles, ["user", "assistant", "user"])
        self.assertEqual(captured["payload"]["messages"][2]["content"][0]["type"], "tool_result")
        self.assertEqual(result.text, "查到了")
        self.assertEqual(result.tool_calls[0]["name"], "list_eras")

    def test_gemini_request_and_result(self):
        captured = {}

        def fake(url, headers, payload, timeout=60):
            captured.update({"url": url, "payload": payload})
            return {"candidates": [{"content": {"parts": [
                {"text": "嗨"},
                {"functionCall": {"name": "list_eras", "args": {}}},
            ]}}]}

        with patch.object(providers, "request_json", side_effect=fake):
            result = providers.chat(
                PROVIDER_GEMINI, "gm-key", "", "",
                "system", [{"role": "user", "content": "hi"}],
                [{"name": "list_eras", "description": "", "parameters": {"type": "object"}}],
            )

        self.assertIn("/models/gemini-2.5-flash:generateContent", captured["url"])
        self.assertIn("key=gm-key", captured["url"])
        self.assertEqual(captured["payload"]["systemInstruction"]["parts"][0]["text"], "system")
        self.assertEqual(captured["payload"]["tools"][0]["functionDeclarations"][0]["name"], "list_eras")
        self.assertEqual(result.text, "嗨")
        self.assertEqual(result.tool_calls[0]["name"], "list_eras")

    def test_custom_requires_base_url(self):
        with self.assertRaises(providers.ProviderError):
            providers.chat(PROVIDER_CUSTOM, "key", "", "my-model", "", [], [])

    def test_custom_uses_given_base_url(self):
        captured = {}

        def fake(url, headers, payload, timeout=60):
            captured["url"] = url
            return {"choices": [{"message": {"content": "ok"}}]}

        with patch.object(providers, "request_json", side_effect=fake):
            providers.chat(PROVIDER_CUSTOM, "key", "https://example.test/v1/", "my-model", "", [], [])

        self.assertEqual(captured["url"], "https://example.test/v1/chat/completions")

    def test_missing_model(self):
        with self.assertRaises(providers.ProviderError):
            providers.chat(PROVIDER_CUSTOM, "key", "https://example.test/v1", "", "", [], [])


class AiBaseCase(TestCase):
    def setUp(self):
        cache.clear()
        self.world = World.objects.create(name="测试世界")
        self.user = User.objects.create_user("owner", password="very-secret-1")
        Membership.objects.create(world=self.world, user=self.user, role="owner")

    def post_json(self, path, payload):
        return self.client.post(path, data=json.dumps(payload), content_type="application/json")

    def login(self):
        self.client.force_login(self.user)

    def scoped(self, suffix):
        return f"/w/{self.world.slug}/api/world/ai/{suffix}"


class ToolRunnerTests(AiBaseCase):
    def test_list_documents_stays_inside_world(self):
        mine = Document.objects.create(world=self.world, document_type=DOC_CARD, name="本地")
        other_world = World.objects.create(name="别人的世界")
        Document.objects.create(world=other_world, document_type=DOC_CARD, name="别人")

        result = ToolRunner(self.world).run("list_documents", {})
        self.assertEqual([row["name"] for row in result["documents"]], [mine.name])

    def test_get_document_missing(self):
        self.assertIn("error", ToolRunner(self.world).run("get_document", {"document_id": 9999}))

    def test_unknown_tool(self):
        self.assertIn("error", ToolRunner(self.world).run("no_such_tool", {}))

    def test_proposals_require_edit_permission(self):
        runner = ToolRunner(self.world, self.user, can_edit=False)
        result = runner.run("propose_create_document", {"name": "新卡片"})
        self.assertIn("error", result)
        self.assertEqual(runner.changes, [])

    def test_propose_collects_change(self):
        runner = ToolRunner(self.world, self.user, can_edit=True)
        result = runner.run("propose_create_document", {"name": "新卡片", "document_type": DOC_CARD})
        self.assertTrue(result["proposed"])
        self.assertEqual(len(runner.changes), 1)
        self.assertEqual(runner.changes[0]["kind"], CHANGE_CREATE_DOCUMENT)
        self.assertEqual(runner.changes[0]["payload"]["name"], "新卡片")

    def test_propose_rejects_unknown_type(self):
        runner = ToolRunner(self.world, self.user, can_edit=True)
        result = runner.run("propose_create_document", {"name": "x", "document_type": "nope"})
        self.assertIn("error", result)
        self.assertEqual(runner.changes, [])

    def test_timeline_event_precision_inference(self):
        document = Document.objects.create(world=self.world, document_type=DOC_TIMELINE, name="年表")
        runner = ToolRunner(self.world, self.user, can_edit=True)
        runner.run("propose_create_timeline_event", {"document_id": document.id, "title": "元年", "year": 1})
        runner.run("propose_create_timeline_event",
                   {"document_id": document.id, "title": "元月", "year": 1, "month": 3})
        runner.run("propose_create_timeline_event",
                   {"document_id": document.id, "title": "元日", "year": 1, "month": 3, "day": 8})
        self.assertEqual([c["payload"]["precision"] for c in runner.changes], ["year", "month", "day"])

    def test_timeline_event_defaults_to_the_world_timeline(self):
        runner = ToolRunner(self.world, self.user, can_edit=True)
        result = runner.run("propose_create_timeline_event", {"title": "开国", "year": 1})
        self.assertTrue(result["proposed"])
        payload = runner.changes[0]["payload"]
        self.assertIsNone(payload["document_id"])
        self.assertEqual(payload["document_name"], "世界时间线")
        self.assertIn("世界时间线", runner.changes[0]["summary"])

    def test_list_timeline_events_reads_the_world_timeline(self):
        timeline = WorldTimeline.for_world(self.world)
        TimelineEvent.objects.create(timeline=timeline, title="总时间线上的事", year=3)
        result = ToolRunner(self.world).run("list_timeline_events", {})
        self.assertEqual([row["title"] for row in result["events"]], ["总时间线上的事"])


class CredentialApiTests(AiBaseCase):
    def test_create_and_list_never_leaks_key(self):
        self.login()
        response = self.post_json(self.scoped("credentials"), {
            "provider": PROVIDER_OPENAI, "api_key": "sk-very-secret-9999", "model": "gpt-4o-mini",
        })
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertNotIn("api_key", body)
        self.assertNotIn("encrypted_key", body)
        self.assertEqual(body["key_hint"], "9999")

        credential = AiCredential.objects.get(pk=body["id"])
        self.assertNotIn("very-secret", credential.encrypted_key)
        self.assertEqual(decrypt_secret(credential.encrypted_key), "sk-very-secret-9999")

        listing = self.client.get(self.scoped("credentials")).json()
        self.assertEqual(len(listing["credentials"]), 1)
        self.assertEqual(len(listing["providers"]), 4)
        self.assertNotIn("encrypted_key", json.dumps(listing))

    def test_first_credential_becomes_default(self):
        self.login()
        first = self.post_json(self.scoped("credentials"), {"provider": PROVIDER_OPENAI, "api_key": "a" * 8})
        second = self.post_json(self.scoped("credentials"), {"provider": PROVIDER_GEMINI, "api_key": "b" * 8})
        self.assertTrue(first.json()["is_default"])
        self.assertFalse(second.json()["is_default"])

    def test_deleting_default_promotes_another(self):
        self.login()
        first = self.post_json(self.scoped("credentials"), {"provider": PROVIDER_OPENAI, "api_key": "a" * 8}).json()
        second = self.post_json(self.scoped("credentials"), {"provider": PROVIDER_GEMINI, "api_key": "b" * 8}).json()

        response = self.client.delete(self.scoped(f"credentials/{first['id']}"))
        self.assertEqual(response.status_code, 200)
        self.assertTrue(AiCredential.objects.get(pk=second["id"]).is_default)

    def test_cannot_touch_others_credential(self):
        other = User.objects.create_user("other", password="very-secret-2")
        credential = AiCredential.objects.create(
            user=other, provider=PROVIDER_OPENAI, encrypted_key=encrypt_secret("zzz"),
        )
        self.login()
        self.assertEqual(self.client.delete(self.scoped(f"credentials/{credential.id}")).status_code, 404)

    def test_login_required(self):
        self.assertEqual(self.client.get(self.scoped("credentials")).status_code, 401)


class ConversationApiTests(AiBaseCase):
    def test_conversations_are_per_user(self):
        self.login()
        created = self.post_json(self.scoped("conversations"), {"title": "聊设定"})
        self.assertEqual(created.status_code, 201)

        other = User.objects.create_user("other", password="very-secret-2")
        Membership.objects.create(world=self.world, user=other, role="editor")
        AiConversation.objects.create(world=self.world, user=other, title="别人的")

        listing = self.client.get(self.scoped("conversations")).json()
        self.assertEqual([item["title"] for item in listing["conversations"]], ["聊设定"])

    def test_detail_and_delete(self):
        self.login()
        conversation = AiConversation.objects.create(world=self.world, user=self.user, title="临时")
        AiMessage.objects.create(conversation=conversation, role=ROLE_ASSISTANT, content="好的")

        detail = self.client.get(self.scoped(f"conversations/{conversation.id}")).json()
        self.assertEqual(len(detail["messages"]), 1)

        self.assertEqual(self.client.delete(self.scoped(f"conversations/{conversation.id}")).status_code, 200)
        self.assertFalse(AiConversation.objects.filter(pk=conversation.id).exists())


class ChatApiTests(AiBaseCase):
    def test_requires_credential(self):
        self.login()
        response = self.post_json(self.scoped("chat"), {"message": "你好"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "no_credential")

    def test_world_ai_switch_blocks_chat(self):
        self.login()
        self.world.ai_enabled = False
        self.world.save(update_fields=["ai_enabled"])
        response = self.post_json(self.scoped("chat"), {"message": "你好"})
        self.assertEqual(response.status_code, 403)

    def test_non_member_is_forbidden(self):
        stranger = User.objects.create_user("stranger", password="very-secret-3")
        self.client.force_login(stranger)
        self.assertEqual(self.post_json(self.scoped("chat"), {"message": "你好"}).status_code, 403)

    def test_chat_roundtrip_with_stubbed_model(self):
        self.login()
        AiCredential.objects.create(
            user=self.user, provider=PROVIDER_OPENAI, encrypted_key=encrypt_secret("sk-1"),
        )
        fake = providers.ChatResult(text="这是回答")
        with patch.object(providers, "chat", return_value=fake):
            response = self.post_json(self.scoped("chat"), {"message": "介绍一下这个世界"})

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["message"]["content"], "这是回答")
        self.assertIsNone(body["changeset"])
        conversation = AiConversation.objects.get(pk=body["conversation"]["id"])
        self.assertEqual(conversation.title, "介绍一下这个世界")
        self.assertEqual(conversation.messages.count(), 2)

    def test_system_prompt_includes_open_document(self):
        self.login()
        AiCredential.objects.create(
            user=self.user, provider=PROVIDER_OPENAI, encrypted_key=encrypt_secret("sk-1"),
        )
        document = Document.objects.create(world=self.world, document_type=DOC_CARD, name="白塔")
        captured = {}

        def fake_chat(provider, api_key, base_url, model, system, messages, tools=None):
            captured["system"] = system
            return providers.ChatResult(text="好的")

        with patch.object(providers, "chat", side_effect=fake_chat):
            response = self.post_json(
                self.scoped("chat"),
                {"message": "这张卡写了什么", "document_id": document.id},
            )

        self.assertEqual(response.status_code, 200)
        self.assertIn("《白塔》", captured["system"])
        self.assertIn(f"id={document.id}", captured["system"])

    def test_chat_with_tool_call_collects_changeset(self):
        self.login()
        AiCredential.objects.create(
            user=self.user, provider=PROVIDER_OPENAI, encrypted_key=encrypt_secret("sk-1"),
        )
        document = Document.objects.create(world=self.world, document_type=DOC_TIMELINE, name="年表")
        first = providers.ChatResult(text="", tool_calls=[{
            "id": "call_1",
            "name": "propose_create_timeline_event",
            "arguments": {"document_id": document.id, "title": "开国", "year": 1, "month": 2},
        }])
        second = providers.ChatResult(text="已经为你准备好改动")

        with patch.object(providers, "chat", side_effect=[first, second]):
            response = self.post_json(self.scoped("chat"), {"message": "加一个开国事件"})

        body = response.json()
        self.assertEqual(body["message"]["content"], "已经为你准备好改动")
        self.assertIsNotNone(body["changeset"])
        self.assertEqual(body["changeset"]["status"], STATUS_PENDING)
        self.assertEqual(body["changeset"]["changes"][0]["kind"], CHANGE_CREATE_TIMELINE_EVENT)
        # 提议不落库
        self.assertFalse(TimelineEvent.objects.filter(document=document).exists())

    def test_rate_limit(self):
        self.login()
        AiCredential.objects.create(
            user=self.user, provider=PROVIDER_OPENAI, encrypted_key=encrypt_secret("sk-1"),
        )
        with patch.object(providers, "chat", return_value=providers.ChatResult(text="ok")):
            for _index in range(20):
                self.assertEqual(self.post_json(self.scoped("chat"), {"message": "hi"}).status_code, 200)
            self.assertEqual(self.post_json(self.scoped("chat"), {"message": "hi"}).status_code, 429)

    def test_provider_error_is_502(self):
        self.login()
        AiCredential.objects.create(
            user=self.user, provider=PROVIDER_OPENAI, encrypted_key=encrypt_secret("sk-1"),
        )
        with patch.object(providers, "chat", side_effect=providers.ProviderError("炸了")):
            response = self.post_json(self.scoped("chat"), {"message": "hi"})
        self.assertEqual(response.status_code, 502)
        self.assertIn("炸了", response.json()["error"])


class ChangeSetApiTests(AiBaseCase):
    def _changeset(self, *changes, status=STATUS_PENDING):
        changeset = AiChangeSet.objects.create(
            world=self.world, user=self.user, status=status, summary="AI 提议",
        )
        for position, (kind, payload) in enumerate(changes):
            AiChange.objects.create(changeset=changeset, kind=kind, payload=payload, position=position)
        return changeset

    def test_apply_create_document(self):
        self.login()
        changeset = self._changeset((CHANGE_CREATE_DOCUMENT, {
            "name": "银月城", "document_type": DOC_CARD,
        }))
        response = self.post_json(self.scoped(f"changesets/{changeset.id}/apply"), {})
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["applied"], 1)
        self.assertEqual(body["failed"], 0)
        self.assertEqual(body["changeset"]["status"], STATUS_APPLIED)

        document = Document.objects.get(world=self.world, name="银月城")
        self.assertTrue(Card.objects.filter(document=document).exists())

    def test_apply_create_timeline_event(self):
        self.login()
        document = Document.objects.create(world=self.world, document_type=DOC_TIMELINE, name="年表")
        changeset = self._changeset((CHANGE_CREATE_TIMELINE_EVENT, {
            "document_id": document.id, "title": "银月之战",
            "precision": "month", "year": 12, "month": 5,
        }))
        body = self.post_json(self.scoped(f"changesets/{changeset.id}/apply"), {}).json()
        self.assertEqual(body["applied"], 1)
        event = TimelineEvent.objects.get(document=document)
        self.assertEqual(event.title, "银月之战")
        self.assertEqual(event.precision, "month")
        self.assertEqual(event.year, 12)

    def test_apply_create_timeline_event_without_document(self):
        """0.7.0：不带 document_id 的改动落到世界总时间线。"""
        self.login()
        changeset = self._changeset((CHANGE_CREATE_TIMELINE_EVENT, {
            "document_id": None, "title": "总时间线事件", "precision": "year", "year": 5,
        }))
        body = self.post_json(self.scoped(f"changesets/{changeset.id}/apply"), {}).json()
        self.assertEqual(body["applied"], 1)
        event = TimelineEvent.objects.get(title="总时间线事件")
        self.assertIsNone(event.document)
        self.assertEqual(event.timeline.world, self.world)

    def test_apply_update_appends_to_blocks_doc(self):
        self.login()
        document = Document.objects.create(world=self.world, document_type=DOC_CARD, name="旧名")
        Card.objects.create(document=document, blocks_doc=[{
            "id": "b1", "type": "paragraph",
            "content": [{"type": "text", "text": "原有正文", "styles": {}}],
            "children": [],
        }])
        changeset = self._changeset((CHANGE_UPDATE_DOCUMENT, {
            "document_id": document.id, "name": "新名", "append_text": "追加一行",
        }))
        body = self.post_json(self.scoped(f"changesets/{changeset.id}/apply"), {}).json()
        self.assertEqual(body["applied"], 1)

        document.refresh_from_db()
        self.assertEqual(document.name, "新名")
        card = Card.objects.get(document=document)
        self.assertEqual(len(card.blocks_doc), 2)
        self.assertIn("追加一行", card.body)

    def test_apply_partial_failure_marks_changeset_failed(self):
        self.login()
        changeset = self._changeset(
            (CHANGE_CREATE_DOCUMENT, {"name": "能建"}),
            (CHANGE_CREATE_DOCUMENT, {"name": "建不了", "document_type": "nope"}),
        )
        body = self.post_json(self.scoped(f"changesets/{changeset.id}/apply"), {}).json()
        self.assertEqual(body["applied"], 1)
        self.assertEqual(body["failed"], 1)
        self.assertEqual(body["changeset"]["status"], STATUS_FAILED)
        failed = [c for c in body["changeset"]["changes"] if c["status"] == STATUS_FAILED]
        self.assertTrue(failed[0]["error"])

    def test_reject_keeps_data_untouched(self):
        self.login()
        changeset = self._changeset((CHANGE_CREATE_DOCUMENT, {"name": "不建了"}))
        body = self.post_json(self.scoped(f"changesets/{changeset.id}/reject"), {}).json()
        self.assertEqual(body["status"], STATUS_REJECTED)
        self.assertEqual(body["changes"][0]["status"], STATUS_REJECTED)
        self.assertFalse(Document.objects.filter(world=self.world, name="不建了").exists())

    def test_reviewed_changeset_cannot_be_processed_twice(self):
        self.login()
        changeset = self._changeset((CHANGE_CREATE_DOCUMENT, {"name": "只一次"}), status=STATUS_APPLIED)
        self.assertEqual(
            self.post_json(self.scoped(f"changesets/{changeset.id}/apply"), {}).status_code, 409,
        )
        self.assertEqual(
            self.post_json(self.scoped(f"changesets/{changeset.id}/reject"), {}).status_code, 409,
        )

    def test_viewer_cannot_apply(self):
        viewer = User.objects.create_user("viewer", password="very-secret-4")
        Membership.objects.create(world=self.world, user=viewer, role="viewer")
        changeset = self._changeset((CHANGE_CREATE_DOCUMENT, {"name": "只读不能建"}))
        self.client.force_login(viewer)
        self.assertEqual(self.post_json(self.scoped(f"changesets/{changeset.id}/apply"), {}).status_code, 403)

    def test_listing_filters_by_status(self):
        self.login()
        self._changeset((CHANGE_CREATE_DOCUMENT, {"name": "待审"}), status=STATUS_PENDING)
        self._changeset((CHANGE_CREATE_DOCUMENT, {"name": "已拒"}), status=STATUS_REJECTED)

        listing = self.client.get(self.scoped("changesets"), {"status": STATUS_PENDING}).json()
        self.assertEqual(len(listing["changesets"]), 1)
        self.assertEqual(listing["changesets"][0]["summary"], "AI 提议")


class ServiceTests(AiBaseCase):
    def test_system_prompt_mentions_world(self):
        EntityType.objects.create(world=self.world, name="角色")
        Document.objects.create(world=self.world, document_type=DOC_CARD, name="甲")
        prompt = services.build_system_prompt(self.world)
        self.assertIn(self.world.name, prompt)
        self.assertIn("角色", prompt)
        self.assertIn("卡片 1", prompt)

    def test_credential_prefers_default(self):
        first = AiCredential.objects.create(
            user=self.user, provider=PROVIDER_OPENAI, encrypted_key=encrypt_secret("a"), is_default=False,
        )
        second = AiCredential.objects.create(
            user=self.user, provider=PROVIDER_GEMINI, encrypted_key=encrypt_secret("b"), is_default=True,
        )
        self.assertEqual(services.get_credential(self.user), second)
        second.delete()
        self.assertEqual(services.get_credential(self.user), first)
