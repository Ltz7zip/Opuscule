from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.cards.models import Card
from apps.worlds.models import World, WorldMembership

from .models import UserProfile


class ProfileApiTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="traveler", password="secret"
        )
        self.world = World.objects.create(slug="wuhai", name="雾海纪年")
        self.private_world = World.objects.create(
            slug="private", name="Private", is_public_read=False
        )
        for world in (self.world, self.private_world):
            WorldMembership.objects.create(
                world=world,
                user=self.user,
                role=WorldMembership.Role.OWNER,
            )
        Card.objects.create(
            world=self.world,
            title="公开卡片",
            slug="public-card",
            body_json={"type": "doc", "content": []},
            is_public=True,
        )
        Card.objects.create(
            world=self.world,
            title="私密卡片",
            slug="private-card",
            body_json={"type": "doc", "content": []},
            is_public=False,
        )
        self.profile = UserProfile.objects.create(
            user=self.user,
            display_name="旅人",
            headline="在雾里写世界的人",
            links=[{"label": "公开世界", "url": "/"}],
            pinned=[self.world.id, self.private_world.id],
        )

    def test_register_creates_user_profile_and_session(self):
        from rest_framework.test import APIClient
        from django.contrib.auth import get_user_model

        client = APIClient(enforce_csrf_checks=True)
        token = client.get("/api/auth/csrf/").data["csrfToken"]
        response = client.post(
            "/api/auth/register/",
            {"username": "newcomer", "password": "longenough", "display_name": "新旅人"},
            format="json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertTrue(response.data["authenticated"])
        user = get_user_model().objects.get(username="newcomer")
        self.assertTrue(user.check_password("longenough"))
        self.assertTrue(UserProfile.objects.filter(user=user, display_name="新旅人").exists())
        self.assertTrue(client.get("/api/auth/session/").data["authenticated"])

    def test_register_rejects_weak_or_duplicate_username(self):
        from rest_framework.test import APIClient

        client = APIClient(enforce_csrf_checks=True)
        token = client.get("/api/auth/csrf/").data["csrfToken"]
        weak = client.post(
            "/api/auth/register/",
            {"username": "ab", "password": "longenough"},
            format="json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(weak.status_code, status.HTTP_400_BAD_REQUEST)
        duplicate = client.post(
            "/api/auth/register/",
            {"username": "traveler", "password": "longenough"},
            format="json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)

    def test_public_profile_hides_private_world_and_cards(self):
        response = self.client.get("/api/u/traveler/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["name"], "旅人")
        self.assertFalse(response.data["is_owner"])
        self.assertEqual([world["slug"] for world in response.data["worlds"]], ["wuhai"])
        self.assertEqual([world["id"] for world in response.data["pinned_worlds"]], [self.world.id])
        self.assertEqual([card["slug"] for card in response.data["recent_cards"]], ["public-card"])
        self.assertNotIn("private-card", [card["slug"] for card in response.data["recent_cards"]])

    def test_private_profile_is_hidden_from_anonymous(self):
        self.profile.is_public = False
        self.profile.save(update_fields=["is_public"])
        self.assertEqual(
            self.client.get("/api/u/traveler/").status_code,
            status.HTTP_404_NOT_FOUND,
        )
        self.client.force_authenticate(self.user)
        response = self.client.get("/api/u/traveler/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["is_owner"])

    def test_my_profile_requires_auth(self):
        self.assertEqual(
            self.client.get("/api/profile/").status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.client.force_authenticate(self.user)
        response = self.client.get("/api/profile/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["is_owner"])

    def test_owner_can_update_profile_and_sanitize_links(self):
        self.client.force_authenticate(self.user)
        response = self.client.patch(
            "/api/profile/",
            {
                "headline": "新简介",
                "website": "example.com",
                "links": [{"label": "外部", "url": "javascript:alert(1)"}],
                "pinned": [self.private_world.id],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["headline"], "新简介")
        self.assertEqual(response.data["website"], "https://example.com")
        self.assertEqual(response.data["links"], [])
        self.assertEqual(response.data["pinned"], [self.private_world.id])


class AuthThrottleTests(APITestCase):
    def setUp(self):
        cache.clear()

    def tearDown(self):
        cache.clear()

    def test_login_is_rate_limited(self):
        for _ in range(10):
            response = self.client.post(
                "/api/auth/login/",
                {"username": "nobody", "password": "wrong-password"},
                format="json",
            )
            self.assertEqual(response.status_code, 400)
        limited = self.client.post(
            "/api/auth/login/",
            {"username": "nobody", "password": "wrong-password"},
            format="json",
        )
        self.assertEqual(limited.status_code, 429)


class AccountLockoutTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = get_user_model().objects.create_user(username="lockme", password="correct-password")
        self.profile = UserProfile.objects.create(user=self.user)

    def tearDown(self):
        cache.clear()

    def test_five_failures_lock_account(self):
        for _ in range(5):
            response = self.client.post(
                "/api/auth/login/",
                {"username": "lockme", "password": "wrong-password"},
                format="json",
            )
            self.assertEqual(response.status_code, 400)
        self.profile.refresh_from_db()
        self.assertIsNotNone(self.profile.locked_until)
        locked = self.client.post(
            "/api/auth/login/",
            {"username": "lockme", "password": "correct-password"},
            format="json",
        )
        self.assertEqual(locked.status_code, 429)
        self.assertIn("尝试次数过多", locked.data["detail"])

    def test_success_resets_failure_count(self):
        for _ in range(3):
            self.client.post(
                "/api/auth/login/",
                {"username": "lockme", "password": "wrong-password"},
                format="json",
            )
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.failed_login_count, 3)
        success = self.client.post(
            "/api/auth/login/",
            {"username": "lockme", "password": "correct-password"},
            format="json",
        )
        self.assertEqual(success.status_code, 200, success.data)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.failed_login_count, 0)
        self.assertIsNone(self.profile.locked_until)


class ProxyThrottleTests(APITestCase):
    def setUp(self):
        cache.clear()

    def tearDown(self):
        cache.clear()

    def _attempt(self, forwarded: str):
        return self.client.post(
            "/api/auth/login/",
            {"username": "nobody", "password": "wrong-password"},
            format="json",
            HTTP_X_FORWARDED_FOR=forwarded,
        )

    def test_forwarded_for_is_ignored_by_default(self):
        for _ in range(10):
            self.assertEqual(self._attempt(f"10.0.0.{_ % 5}").status_code, 400)
        self.assertEqual(self._attempt("10.0.0.99").status_code, 429)

    def test_forwarded_for_is_used_when_trusted(self):
        with override_settings(TRUST_PROXY_HEADERS=True):
            for _ in range(10):
                self.assertEqual(self._attempt("203.0.113.10").status_code, 400)
            self.assertEqual(self._attempt("203.0.113.10").status_code, 429)
            self.assertEqual(self._attempt("203.0.113.11").status_code, 400)


class ChangePasswordTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="password_user", password="old-password")
        UserProfile.objects.create(user=self.user)

    def test_owner_can_change_password_and_keep_session(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            "/api/auth/password/",
            {"current_password": "old-password", "new_password": "new-password-123"},
            format="json",
        )
        self.assertEqual(response.status_code, 204)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("new-password-123"))
        self.assertEqual(self.client.get("/api/auth/session/").data["authenticated"], True)

    def test_wrong_current_and_weak_password_are_rejected(self):
        self.client.force_authenticate(self.user)
        wrong = self.client.post(
            "/api/auth/password/",
            {"current_password": "wrong", "new_password": "new-password-123"},
            format="json",
        )
        self.assertEqual(wrong.status_code, 400)
        weak = self.client.post(
            "/api/auth/password/",
            {"current_password": "old-password", "new_password": "short"},
            format="json",
        )
        self.assertEqual(weak.status_code, 400)
        self.assertTrue(self.user.check_password("old-password"))
