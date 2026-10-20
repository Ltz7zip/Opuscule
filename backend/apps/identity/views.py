import re
from datetime import timedelta

from django.contrib.auth import authenticate, get_user_model, login, logout, update_session_auth_hash
from django.http import Http404
from django.utils import timezone
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import status
from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import AllowAny, IsAuthenticated
from apps.common.throttle import ClientIpScopedRateThrottle
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.worlds.models import WorldMembership

from .models import UserProfile

from .serializers import UserProfileSerializer
from .services import profile_for, profile_payload


def session_payload(user) -> dict:
    if not getattr(user, "is_authenticated", False):
        return {"authenticated": False, "user": None, "worlds": []}
    memberships = WorldMembership.objects.filter(user=user).select_related("world")
    return {
        "authenticated": True,
        "user": {"id": user.pk, "username": user.get_username()},
        "worlds": [
            {
                "slug": membership.world.slug,
                "name": membership.world.name,
                "role": membership.role,
            }
            for membership in memberships
        ],
    }


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"csrfToken": get_token(request)})


class SessionView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(session_payload(request.user))


@method_decorator(csrf_protect, name="dispatch")
class LoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ClientIpScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        username = str(request.data.get("username", "")).strip()
        password = str(request.data.get("password", ""))
        existing = get_user_model().objects.filter(username=username).first()
        profile = None
        if existing is not None:
            profile, _ = UserProfile.objects.get_or_create(user=existing)
            if profile.locked_until is not None and profile.locked_until > timezone.now():
                return Response(
                    {"detail": "尝试次数过多，请稍后再试"},
                    status=status.HTTP_429_TOO_MANY_REQUESTS,
                )
        user = authenticate(request, username=username, password=password)
        if user is None:
            if profile is not None:
                profile.failed_login_count += 1
                if profile.failed_login_count >= 5:
                    profile.locked_until = timezone.now() + timedelta(minutes=15)
                profile.save(update_fields=["failed_login_count", "locked_until", "updated_at"])
            return Response(
                {"detail": "用户名或密码错误"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if profile is not None and (profile.failed_login_count or profile.locked_until):
            profile.failed_login_count = 0
            profile.locked_until = None
            profile.save(update_fields=["failed_login_count", "locked_until", "updated_at"])
        login(request, user)
        return Response(session_payload(user))


@method_decorator(csrf_protect, name="dispatch")
class LogoutView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [AllowAny]

    def post(self, request):
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PublicProfileView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [AllowAny]

    def get(self, request, username: str):
        user_model = get_user_model()
        owner = user_model.objects.filter(username=username).first()
        if owner is None:
            raise Http404("Profile not found")
        profile = profile_for(owner)
        is_self = bool(
            getattr(request.user, "is_authenticated", False)
            and (request.user.pk == owner.pk or request.user.is_staff)
        )
        if not profile.is_public and not is_self:
            raise Http404("Profile not found")
        response = Response(profile_payload(profile, request.user))
        if not is_self:
            response["Cache-Control"] = "public, max-age=60, stale-while-revalidate=300"
        return response


class MyProfileView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(profile_payload(profile_for(request.user), request.user))

    def patch(self, request):
        profile = profile_for(request.user)
        serializer = UserProfileSerializer(
            profile,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(profile_payload(profile, request.user))


_USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{3,32}$")


@method_decorator(csrf_protect, name="dispatch")
class RegisterView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ClientIpScopedRateThrottle]
    throttle_scope = "register"

    def post(self, request):
        username = str(request.data.get("username", "")).strip()
        password = str(request.data.get("password", ""))
        display_name = str(request.data.get("display_name", "")).strip()[:80]

        if not _USERNAME_RE.match(username):
            return Response(
                {"detail": "用户名需为 3–32 位字母、数字或下划线"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(password) < 8:
            return Response(
                {"detail": "密码至少 8 位"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user_model = get_user_model()
        if user_model.objects.filter(username=username).exists():
            return Response(
                {"detail": "用户名已被占用"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = user_model.objects.create_user(username=username, password=password)
        UserProfile.objects.create(
            user=user,
            display_name=display_name or username,
        )
        login(request, user)
        return Response(session_payload(user), status=status.HTTP_201_CREATED)


class ChangePasswordView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        current = str(request.data.get("current_password", ""))
        new = str(request.data.get("new_password", ""))
        if not request.user.check_password(current):
            return Response(
                {"detail": "当前密码不正确"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(new) < 8:
            return Response(
                {"detail": "新密码至少 8 位"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if current == new:
            return Response(
                {"detail": "新密码不能与当前密码相同"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        request.user.set_password(new)
        request.user.save(update_fields=["password"])
        update_session_auth_hash(request, request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)
