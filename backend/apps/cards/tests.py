from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.collections.models import Collection
from apps.worlds.models import World, WorldMembership

from .models import Card, CardRevision


def body(text: str) -> dict:
    return {
        "type": "doc",
        "content": [
            {"type": "paragraph", "content": [{"type": "text", "text": text}]},
        ],
    }


class CardApiTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="owner", password="secret"
        )
        self.world = World.objects.create(slug="wuhai", name="雾海纪年")
        WorldMembership.objects.create(
            world=self.world,
            user=self.user,
            role=WorldMembership.Role.OWNER,
        )
        self.collection = Collection.objects.create(
            world=self.world, name="人物", slug="characters"
        )
        self.card = Card.objects.create(
            world=self.world,
            home_collection=self.collection,
            title="船长 · 莉薇娅",
            slug="livia",
            body_json=body("远洋船长"),
        )

    def test_health(self):
        response = self.client.get("/api/health/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "ok")
        self.assertEqual(response.data["database"], "ok")

    def test_health_reports_database_failure(self):
        from unittest.mock import patch

        from django.db import OperationalError

        with patch("apps.worlds.views.connection.ensure_connection", side_effect=OperationalError("down")):
            response = self.client.get("/api/health/")
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.data["status"], "degraded")

    def test_world_detail_has_collection_and_cards(self):
        response = self.client.get("/api/worlds/wuhai/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["slug"], "wuhai")
        self.assertEqual(len(response.data["collections"]), 1)
        self.assertEqual(len(response.data["cards"]), 1)
        self.assertEqual(response.data["cards"][0]["title"], "船长 · 莉薇娅")
        self.assertIn("远洋船长", response.data["cards"][0]["body_text"])
        self.assertFalse(response.data["can_edit"])

    def test_owner_sees_editor_role(self):
        self.client.force_authenticate(self.user)
        response = self.client.get("/api/worlds/wuhai/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["role"], "owner")
        self.assertTrue(response.data["can_edit"])

    def test_anonymous_write_is_forbidden(self):
        response = self.client.post(
            "/api/worlds/wuhai/cards/",
            {"title": "Anonymous"},
            format="json",
        )
        self.assertIn(response.status_code, {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN})

    def test_non_member_write_is_forbidden(self):
        outsider = get_user_model().objects.create_user(username="outsider", password="x")
        self.client.force_authenticate(outsider)
        response = self.client.post(
            "/api/worlds/wuhai/cards/",
            {"title": "Outsider"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_create_then_patch_card(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            "/api/worlds/wuhai/cards/",
            {
                "title": "航海士 · 柯尔",
                "home_collection": self.collection.pk,
                "body_json": body("潮汐测算"),
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        card_id = response.data["id"]
        self.assertEqual(response.data["revision"], 1)
        self.assertIn("潮汐测算", response.data["body_text"])

        response = self.client.patch(
            f"/api/worlds/wuhai/cards/{card_id}/",
            {"body_json": body("潮汐测算与旧图校正")},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["revision"], 2)
        self.assertIn("旧图校正", response.data["body_text"])

    def test_revision_snapshot_and_restore(self):
        self.client.force_authenticate(self.user)
        patched = self.client.patch(
            f"/api/worlds/wuhai/cards/{self.card.id}/",
            {"body_json": body("新的远洋记录")},
            format="json",
        )
        self.assertEqual(patched.status_code, 200, patched.data)
        self.assertEqual(patched.data["revision"], 2)
        self.assertEqual(CardRevision.objects.filter(card=self.card).count(), 1)

        versions = self.client.get(f"/api/worlds/wuhai/cards/{self.card.id}/revisions/")
        self.assertEqual(versions.status_code, 200, versions.data)
        self.assertEqual(versions.data["versions"][0]["index"], 1)
        self.assertIn("正文", versions.data["versions"][0]["summary"])

        restored = self.client.post(f"/api/worlds/wuhai/cards/{self.card.id}/revisions/1/restore/")
        self.assertEqual(restored.status_code, 200, restored.data)
        self.assertEqual(restored.data["revision"], 3)
        self.assertIn("远洋船长", restored.data["body_text"])
        self.assertTrue(CardRevision.objects.filter(card=self.card, index=2).exists())

    def test_trash_hides_card_and_restore_brings_it_back(self):
        self.client.force_authenticate(self.user)
        deleted = self.client.delete(f"/api/worlds/wuhai/cards/{self.card.id}/")
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)

        world = self.client.get("/api/worlds/wuhai/")
        self.assertEqual(world.data["cards"], [])
        missing = self.client.get(f"/api/worlds/wuhai/cards/{self.card.id}/")
        self.assertEqual(missing.status_code, status.HTTP_404_NOT_FOUND)

        trash = self.client.get("/api/worlds/wuhai/cards/trash/")
        self.assertEqual(trash.status_code, 200, trash.data)
        self.assertEqual(trash.data["count"], 1)
        self.assertEqual(trash.data["cards"][0]["title"], "船长 · 莉薇娅")

        restored = self.client.post(f"/api/worlds/wuhai/cards/{self.card.id}/restore/")
        self.assertEqual(restored.status_code, 200, restored.data)
        self.assertEqual(restored.data["title"], "船长 · 莉薇娅")
        self.assertEqual(self.client.get(f"/api/worlds/wuhai/cards/{self.card.id}/").status_code, 200)
        self.assertEqual(self.client.get("/api/worlds/wuhai/cards/trash/").data["count"], 0)

    def test_recycled_card_can_be_purged(self):
        self.client.force_authenticate(self.user)
        self.client.delete(f"/api/worlds/wuhai/cards/{self.card.id}/")
        purged = self.client.delete(f"/api/worlds/wuhai/cards/{self.card.id}/purge/")
        self.assertEqual(purged.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Card.all_objects.filter(id=self.card.id).exists())
        self.assertEqual(self.client.get("/api/worlds/wuhai/cards/trash/").data["count"], 0)

    def test_pinned_card_and_era_are_exposed(self):
        self.client.force_authenticate(self.user)
        response = self.client.patch(
            f"/api/worlds/wuhai/cards/{self.card.id}/",
            {"pinned": True, "era": "潮汐历"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["pinned"])
        self.assertEqual(response.data["era"], "潮汐历")
        world = self.client.get("/api/worlds/wuhai/")
        self.assertEqual(world.data["cards"][0]["id"], self.card.id)

    def test_cross_world_collection_is_rejected(self):
        self.client.force_authenticate(self.user)
        other = World.objects.create(slug="other", name="Other")
        foreign = Collection.objects.create(world=other, name="Foreign", slug="foreign")
        response = self.client.post(
            "/api/worlds/wuhai/cards/",
            {"title": "Bad", "home_collection": foreign.pk},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_slug_is_generated_for_untitled_chinese_card(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            "/api/worlds/wuhai/cards/",
            {"title": "未命名卡片", "home_collection": self.collection.pk},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertTrue(response.data["slug"])

    def test_explore_lists_only_public_worlds_with_counts(self):
        self.world.description = "公开简介"
        self.world.save(update_fields=["description"])
        World.objects.create(slug="hidden", name="Hidden", is_public_read=False)

        anonymous = self.client.get("/api/explore/")
        self.assertEqual(anonymous.status_code, status.HTTP_200_OK)
        self.assertEqual([world["slug"] for world in anonymous.data], ["wuhai"])
        self.assertEqual(anonymous.data[0]["description"], "公开简介")
        self.assertEqual(anonymous.data[0]["card_count"], 1)
        self.assertEqual(anonymous.data[0]["collection_count"], 1)

        self.client.force_authenticate(self.user)
        authenticated = self.client.get("/api/explore/")
        self.assertEqual([world["slug"] for world in authenticated.data], ["wuhai"])

    def test_card_by_slug_is_public_only(self):
        public_response = self.client.get("/api/worlds/wuhai/cards/by-slug/livia/")
        self.assertEqual(public_response.status_code, status.HTTP_200_OK)
        self.assertEqual(public_response.data["slug"], "livia")

        secret = Card.objects.create(
            world=self.world,
            title="Secret",
            slug="secret-by-slug",
            body_json=body("secret"),
            is_public=False,
        )
        self.assertEqual(
            self.client.get("/api/worlds/wuhai/cards/by-slug/secret-by-slug/").status_code,
            status.HTTP_404_NOT_FOUND,
        )
        self.client.force_authenticate(self.user)
        owner_response = self.client.get("/api/worlds/wuhai/cards/by-slug/secret-by-slug/")
        self.assertEqual(owner_response.status_code, status.HTTP_200_OK)
        self.assertEqual(owner_response.data["id"], secret.id)

    def test_private_content_is_hidden_from_anonymous(self):
        secret_collection = Collection.objects.create(
            world=self.world, name="密档", slug="secrets", is_public=False
        )
        Card.objects.create(
            world=self.world,
            home_collection=secret_collection,
            title="密档卡",
            slug="secret-card",
            body_json=body("secret"),
            is_public=False,
        )
        anonymous = self.client.get("/api/worlds/wuhai/")
        self.assertNotIn("secret-card", [card["slug"] for card in anonymous.data["cards"]])
        self.assertNotIn("secrets", [collection["slug"] for collection in anonymous.data["collections"]])

        self.client.force_authenticate(self.user)
        owner = self.client.get("/api/worlds/wuhai/")
        self.assertIn("secret-card", [card["slug"] for card in owner.data["cards"]])
        self.assertIn("secrets", [collection["slug"] for collection in owner.data["collections"]])

    def test_private_world_is_hidden_from_anonymous(self):
        private = World.objects.create(slug="private", name="Private", is_public_read=False)
        self.assertEqual(self.client.get("/api/worlds/private/").status_code, status.HTTP_404_NOT_FOUND)

        WorldMembership.objects.create(
            world=private,
            user=self.user,
            role=WorldMembership.Role.VIEWER,
        )
        self.client.force_authenticate(self.user)
        response = self.client.get("/api/worlds/private/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["can_edit"])

    def test_login_session_csrf_and_logout(self):
        client = APIClient(enforce_csrf_checks=True)
        csrf_response = client.get("/api/auth/csrf/")
        self.assertEqual(csrf_response.status_code, status.HTTP_200_OK)
        token = csrf_response.data["csrfToken"]

        login_response = client.post(
            "/api/auth/login/",
            {"username": "owner", "password": "secret"},
            format="json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(login_response.status_code, status.HTTP_200_OK, login_response.data)
        self.assertTrue(login_response.data["authenticated"])

        session_response = client.get("/api/auth/session/")
        self.assertTrue(session_response.data["authenticated"])
        self.assertEqual(session_response.data["user"]["username"], "owner")

        # login() rotates the CSRF token; fetch the fresh one before writes.
        token = client.get("/api/auth/csrf/").data["csrfToken"]
        no_csrf = client.post(
            "/api/worlds/wuhai/cards/",
            {"title": "No CSRF"},
            format="json",
        )
        self.assertEqual(no_csrf.status_code, status.HTTP_403_FORBIDDEN)

        created = client.post(
            "/api/worlds/wuhai/cards/",
            {"title": "With CSRF", "home_collection": self.collection.pk},
            format="json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)

        logout_response = client.post(
            "/api/auth/logout/",
            {},
            format="json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(logout_response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(client.get("/api/auth/session/").data["authenticated"])


class SearchApiTests(APITestCase):
    def setUp(self):
        self.world = World.objects.create(
            slug="search-world", name="搜索世界", is_public_read=True
        )
        self.collection = Collection.objects.create(
            world=self.world, name="人物", slug="people"
        )
        Card.objects.create(
            world=self.world,
            home_collection=self.collection,
            title="灯塔守夜人",
            slug="keeper",
            body_json=body("在雾港点亮灯塔，等待远航的船。"),
        )
        self.private_world = World.objects.create(
            slug="private-world", name="私有世界", is_public_read=False
        )
        Card.objects.create(
            world=self.private_world,
            title="秘密灯塔",
            slug="secret",
            body_json=body("不应被公开搜索到。"),
        )

    def test_public_search_matches_title_and_body(self):
        response = self.client.get("/api/search/?q=灯塔")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["results"][0]["card_slug"], "keeper")
        self.assertEqual(response.data["results"][0]["world_slug"], "search-world")
        self.assertEqual(
            response["Cache-Control"], "public, max-age=30"
        )

    def test_private_and_deleted_world_are_excluded(self):
        self.assertEqual(
            len(self.client.get("/api/search/?q=秘密").data["results"]), 0
        )
        self.world.deleted_at = "2026-10-20T00:00:00Z"
        self.world.save(update_fields=["deleted_at"])
        self.assertEqual(
            len(self.client.get("/api/search/?q=灯塔").data["results"]), 0
        )

    def test_empty_query_returns_empty_results(self):
        response = self.client.get("/api/search/?q=")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["results"], [])

    def test_world_filter_is_applied_before_limit(self):
        response = self.client.get("/api/search/?q=灯塔&world=search-world")
        self.assertEqual(len(response.data["results"]), 1)
        response = self.client.get("/api/search/?q=灯塔&world=private-world")
        self.assertEqual(len(response.data["results"]), 0)


class SearchWorldsTests(APITestCase):
    def setUp(self):
        self.world = World.objects.create(
            slug="search-world", name="搜索世界", description="在雾里。", is_public_read=True
        )
        self.private = World.objects.create(
            slug="search-private", name="搜索私有", description="雾里的私有世界。", is_public_read=False
        )

    def test_search_returns_public_worlds(self):
        response = self.client.get("/api/search/?q=搜索")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([world["slug"] for world in response.data["worlds"]], ["search-world"])
        self.assertIn("worlds", response.data)

    def test_world_scoped_search_has_no_world_results(self):
        response = self.client.get("/api/search/?q=搜索&world=search-world")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["worlds"], [])


class SearchUsersTests(APITestCase):
    def setUp(self):
        from django.contrib.auth import get_user_model

        user_model = get_user_model()
        self.creator = user_model.objects.create_user(username="searcher", password="secret")
        from apps.identity.models import UserProfile

        UserProfile.objects.create(user=self.creator, display_name="搜索旅人", headline="在雾里写世界")
        self.private_creator = user_model.objects.create_user(username="private_searcher", password="secret")
        UserProfile.objects.create(user=self.private_creator, display_name="搜索隐者", headline="不可见", is_public=False)
        self.world = World.objects.create(slug="search-user-world", name="创作者世界", is_public_read=True)
        from apps.worlds.models import WorldMembership

        WorldMembership.objects.create(world=self.world, user=self.creator, role=WorldMembership.Role.OWNER)
        private_world = World.objects.create(slug="search-user-private", name="私有", is_public_read=False)
        WorldMembership.objects.create(world=private_world, user=self.private_creator, role=WorldMembership.Role.OWNER)

    def test_search_returns_public_creators_with_public_worlds(self):
        response = self.client.get("/api/search/?q=搜索")
        self.assertEqual(response.status_code, 200)
        usernames = [user["username"] for user in response.data["users"]]
        self.assertEqual(usernames, ["searcher"])
        self.assertEqual(response.data["users"][0]["display_name"], "搜索旅人")

    def test_world_scoped_search_has_no_user_results(self):
        response = self.client.get("/api/search/?q=搜索&world=search-user-world")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["users"], [])


class SearchRankingTests(APITestCase):
    def setUp(self):
        self.world = World.objects.create(slug="rank-world", name="排序世界", is_public_read=True)
        Card.objects.create(
            world=self.world, title="无关标题", slug="body-match",
            body_text="雾在正文里", is_public=True,
        )
        Card.objects.create(
            world=self.world, title="雾港", slug="title-match",
            body_text="另一个地点", is_public=True,
        )

    def test_title_match_ranks_before_body_match(self):
        response = self.client.get("/api/search/?q=雾")
        self.assertEqual(response.status_code, 200)
        slugs = [result["card_slug"] for result in response.data["results"]]
        self.assertEqual(slugs[:2], ["title-match", "body-match"])


class SearchPaginationTests(APITestCase):
    def setUp(self):
        self.world = World.objects.create(slug="page-world", name="分页世界", is_public_read=True)
        for index in range(3):
            Card.objects.create(
                world=self.world, title=f"雾卡{index}", slug=f"page-card-{index}",
                body_text="雾", is_public=True,
            )

    def test_limit_offset_and_has_more(self):
        first = self.client.get("/api/search/?q=雾&limit=2")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(len(first.data["results"]), 2)
        self.assertTrue(first.data["has_more"])
        self.assertEqual(first.data["total"], 3)
        second = self.client.get("/api/search/?q=雾&limit=2&offset=2")
        self.assertEqual(len(second.data["results"]), 1)
        self.assertFalse(second.data["has_more"])

    def test_invalid_limit_is_rejected(self):
        self.assertEqual(self.client.get("/api/search/?q=雾&limit=x").status_code, 400)


class CardCommentApiTests(APITestCase):
    def setUp(self):
        from django.contrib.auth import get_user_model
        from apps.worlds.models import World, WorldMembership

        self.owner = get_user_model().objects.create_user(username="comment_owner", password="secret")
        self.editor = get_user_model().objects.create_user(username="comment_editor", password="secret")
        self.outsider = get_user_model().objects.create_user(username="comment_outsider", password="secret")
        self.world = World.objects.create(slug="comment-world", name="评论世界", is_public_read=True)
        WorldMembership.objects.create(world=self.world, user=self.owner, role=WorldMembership.Role.OWNER)
        WorldMembership.objects.create(world=self.world, user=self.editor, role=WorldMembership.Role.EDITOR)
        self.card = Card.objects.create(world=self.world, title="评论卡", slug="comment-card")

    def test_member_creates_lists_and_resolves_comment(self):
        self.client.force_authenticate(self.editor)
        created = self.client.post(
            f"/api/worlds/comment-world/cards/{self.card.id}/comments/",
            {"body": "这里需要补充年代", "quote": "白塔沉没"},
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data["author_name"], "comment_editor")
        listed = self.client.get(f"/api/worlds/comment-world/cards/{self.card.id}/comments/")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.data[0]["body"], "这里需要补充年代")
        resolved = self.client.patch(
            f"/api/worlds/comment-world/cards/{self.card.id}/comments/{created.data['id']}/",
            {"resolved": True},
            format="json",
        )
        self.assertEqual(resolved.status_code, 200)
        self.assertTrue(resolved.data["resolved"])

    def test_reply_once_and_reject_nested_reply(self):
        self.client.force_authenticate(self.editor)
        parent = self.client.post(
            f"/api/worlds/comment-world/cards/{self.card.id}/comments/",
            {"body": "主评论"}, format="json",
        ).data
        reply = self.client.post(
            f"/api/worlds/comment-world/cards/{self.card.id}/comments/",
            {"body": "回复", "parent": parent["id"]}, format="json",
        )
        self.assertEqual(reply.status_code, 201, reply.data)
        self.assertEqual(reply.data["parent"], parent["id"])
        nested = self.client.post(
            f"/api/worlds/comment-world/cards/{self.card.id}/comments/",
            {"body": "对回复的回复", "parent": reply.data["id"]}, format="json",
        )
        self.assertEqual(nested.status_code, 400)

    def test_outsider_cannot_comment(self):
        self.client.force_authenticate(self.outsider)
        denied = self.client.post(
            f"/api/worlds/comment-world/cards/{self.card.id}/comments/",
            {"body": "越权"},
            format="json",
        )
        self.assertEqual(denied.status_code, 403)

    def test_comment_anchor_id_roundtrip(self):
        self.client.force_authenticate(self.editor)
        created = self.client.post(
            f"/api/worlds/comment-world/cards/{self.card.id}/comments/",
            {"body": "锚定评论", "anchor_id": "anchor-123"},
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data["anchor_id"], "anchor-123")


class NotificationApiTests(APITestCase):
    def setUp(self):
        from django.contrib.auth import get_user_model
        from apps.worlds.models import World, WorldMembership

        self.owner = get_user_model().objects.create_user(username="notif_owner", password="secret")
        self.editor = get_user_model().objects.create_user(username="notif_editor", password="secret")
        self.world = World.objects.create(slug="notif-world", name="通知世界", is_public_read=True)
        WorldMembership.objects.create(world=self.world, user=self.owner, role=WorldMembership.Role.OWNER)
        WorldMembership.objects.create(world=self.world, user=self.editor, role=WorldMembership.Role.EDITOR)
        self.card = Card.objects.create(world=self.world, title="通知卡", slug="notif-card")

    def test_comment_notifies_owner_and_can_be_read(self):
        self.client.force_authenticate(self.editor)
        self.client.post(
            f"/api/worlds/notif-world/cards/{self.card.id}/comments/",
            {"body": "通知测试"}, format="json",
        )
        self.client.force_authenticate(self.owner)
        listed = self.client.get("/api/notifications/")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(len(listed.data), 1)
        self.assertIn("通知卡", listed.data[0]["message"])
        read = self.client.post(f"/api/notifications/{listed.data[0]['id']}/read/")
        self.assertEqual(read.status_code, 200)
        self.assertIsNotNone(read.data["read_at"])
        self.client.post("/api/notifications/read-all/")

    def test_anonymous_notification_access_is_forbidden(self):
        self.assertEqual(
            self.client.get("/api/notifications/").status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.post("/api/notifications/1/read/").status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.post("/api/notifications/read-all/").status_code,
            status.HTTP_403_FORBIDDEN,
        )


class CardBodyNestingTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="nesting_owner", password="secret")
        self.world = World.objects.create(slug="nesting-world", name="嵌套世界")
        WorldMembership.objects.create(world=self.world, user=self.user, role=WorldMembership.Role.OWNER)
        self.card = Card.objects.create(world=self.world, title="嵌套卡", slug="nesting-card")
        self.client.force_authenticate(self.user)

    @staticmethod
    def _nested_payload(depth: int) -> str:
        import json

        root: dict = {"type": "doc"}
        cursor = root
        for _ in range(depth):
            child: dict = {"type": "paragraph"}
            cursor["content"] = [child]
            cursor = child
        return json.dumps({"body_json": root}, ensure_ascii=False)

    def test_deeply_nested_body_json_is_rejected_not_500(self):
        response = self.client.patch(
            f"/api/worlds/nesting-world/cards/{self.card.id}/",
            data=self._nested_payload(2000),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_body_json_past_the_depth_limit_is_rejected(self):
        response = self.client.patch(
            f"/api/worlds/nesting-world/cards/{self.card.id}/",
            data=self._nested_payload(100),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_normal_nested_body_json_still_saves(self):
        response = self.client.patch(
            f"/api/worlds/nesting-world/cards/{self.card.id}/",
            data=self._nested_payload(10),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)


class CardAppearanceTests(APITestCase):
    def test_owner_updates_icon_and_cover(self):
        from django.contrib.auth import get_user_model
        from apps.worlds.models import World, WorldMembership

        owner = get_user_model().objects.create_user(username="appearance_owner", password="secret")
        world = World.objects.create(slug="appearance-world", name="外观世界")
        WorldMembership.objects.create(world=world, user=owner, role=WorldMembership.Role.OWNER)
        card = Card.objects.create(world=world, title="外观卡", slug="appearance-card")
        self.client.force_authenticate(owner)
        response = self.client.patch(
            f"/api/worlds/appearance-world/cards/{card.id}/",
            {"icon": "✦", "cover": "https://example.com/cover.jpg"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["icon"], "✦")
        self.assertEqual(response.data["cover"], "https://example.com/cover.jpg")


class CardSlugRouteTests(APITestCase):
    """Old worlds used non-ASCII card slugs; the by-slug route must accept them."""

    def setUp(self):
        self.user = get_user_model().objects.create_user("slug_user", password="pw12345678")
        self.world = World.objects.create(slug="slug-world", name="W", is_public_read=True)
        WorldMembership.objects.create(world=self.world, user=self.user, role=WorldMembership.Role.OWNER)
        self.card = Card.objects.create(
            world=self.world, title="烬海", slug="烬海", body_json={"type": "doc", "content": []}
        )

    def test_by_slug_accepts_chinese_slug(self):
        response = self.client.get(f"/api/worlds/{self.world.slug}/cards/by-slug/{self.card.slug}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["title"], "烬海")


class Api404ShapeTests(APITestCase):
    def test_unknown_api_path_is_json(self):
        response = self.client.get("/api/worlds/nope/definitely-not-a-route/")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response["Content-Type"].split(";")[0], "application/json")

    def test_unknown_page_path_is_still_html(self):
        response = self.client.get("/definitely-not-a-page")
        self.assertEqual(response.status_code, 404)
        self.assertIn(b"<html", response.content.lower())


class CardReservedSlugTests(APITestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(username="slug_owner", password="secret")
        self.world = World.objects.create(slug="slug-world", name="Slug World")
        WorldMembership.objects.create(world=self.world, user=self.owner, role=WorldMembership.Role.OWNER)
        self.client.force_authenticate(self.owner)

    def test_generated_slug_avoids_route_reserved_words(self):
        response = self.client.post(
            "/api/worlds/slug-world/cards/",
            {"title": "Cards"},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertNotIn(response.data["slug"], {"cards", "edit"})
        self.assertEqual(response.data["slug"], "cards-card")

    def test_user_supplied_reserved_slug_is_rejected(self):
        response = self.client.post(
            "/api/worlds/slug-world/cards/",
            {"title": "正常标题", "slug": "edit"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
