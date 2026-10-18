# -*- coding: utf-8 -*-
"""权限：谁能看、谁能改，以及"当前世界"是哪一个。

规则（分享权限模型，收敛到"多世界 + 协作"）：

1. **读**：要登录，并且**在那个世界里**有身份（成员 / 管理员）。发布站点是给读者
   看的，但读者读的是"只读嵌入"——游客只能带着 ``?embed=<已发布文档>`` 看那一篇，
   其余读接口一律拦下（见 ``allow_public_read`` / ``ReadPermissionMiddleware``）。
2. **写**：需要登录，并且**在那个世界里**是 owner / editor。
3. **一人一世界**：注册即得到一个属于自己的世界（方案 A），之后可以再建更多；
   受邀注册的则加入邀请码指向的那个世界。
4. **首次安装例外**：数据库里一个用户都没有时，允许任何人写，好让第一个注册者
   把世界建起来（这也是"第一个注册的人成为所有者"的落地方式）。
5. 超级管理员无视一切限制。工作人员（``is_staff``）**不再**自动穿透——收紧后只有
   超级管理员（``is_superuser``）能进"别人的世界"，staff 与普通用户一样只进自己
   拥有 / 受邀加入的世界（见 ``is_privileged``，S7）。
6. **平台身份**是另一条正交的轴（见下方「平台身份」一段与 docs/10 §2.2）：站长
   （``is_superuser``）/ 管理员（moderators 用户组）/ 工作人员（``is_staff``）/ 普通用户。
   它只决定"能不能治理整个站点"，不决定"能不能改某个世界的内容"——后者永远看世界角色。

"当前世界"由 ``resolve_active_world`` 按请求解析（会话里选定的那个 → 自己的第一个
世界 → 兜底），存进 ``contextvar``；全站 87 处 ``current_world()`` 调用因此不必改动。
"""

from __future__ import annotations

import contextvars
import re

from django.contrib.auth.models import Group, User
from django.db.models import Q

from .models import ROLE_EDITOR, ROLE_OWNER, ROLE_VIEWER, Membership, World
from apps.documents.models import Document

# 这些写接口不要求编辑权限（登录即可，甚至匿名也放行）：
# 登录/注册发生在"还没有身份"的时候；在线心跳连只读成员也要能发；
# 新建/切换世界要走"还没有属于自己世界"的用户，放行到视图里自己校验登录；
# account/*（销号）跟"某一个世界的编辑权"无关，视图里自己验密码；
# moderation/*（封禁 / 解封）是**平台级**动作：管理员并非被治理世界的成员，
# 会被"世界编辑权"拦下，所以放行到视图里用 ``can_moderate`` 自己守门。
OPEN_WRITE_PREFIXES = (
    "/api/world/auth/",
    "/api/world/account/",
    "/api/world/moderation",
    "/api/world/presence",
    "/api/world/worlds",
    # AI 横切层（0.6.0）：凭据挂在"我"身上、会话与变更集按世界归属，
    # 视图里用 can_read / can_edit 自己守门，不放行的话只读成员连聊天都发不出。
    "/api/world/ai/",
)

# 这些读接口跟"某一个世界的数据"无关，未登录也放行：
# · auth/*   ：登录/注册/注销本身；
# · account/*：销号前的数据导出——属性挂在"我"身上，不挂在某个世界上；
# · worlds   ："我有哪些世界"——视图里按登录态给空列表或给世界，不泄漏他人数据；
# · relationship/templates：全局静态模版目录，不含任何世界内容；
# · moderation：平台治理台——视图里用 ``can_moderate`` 守门（管理员非世界成员，
#   读接口不加白名单会在中间件就 403）。
PUBLIC_READ_PREFIXES = ("/api/world/auth/", "/api/world/account/")
PUBLIC_READ_PATHS = (
    "/api/world/worlds",
    "/api/world/relationship/templates",
    "/api/world/moderation",
    # 凭据不属于任何世界，视图里自己校验登录后再按 user 过滤。
    "/api/world/ai/credentials",
)

# 从"带文档 id 的读路径"里抠出 id（documents/12、cards/12、maps/12/data…）。
# 这类请求要逐个校验"这篇文档有没有公开"，免得游客拿 id 穷举未公开的草稿。
_DOC_ID_PATTERN = re.compile(
    r"^/api/world/(?:documents|cards|timelines|maps|tables|trees|relationship/trees)/(\d+)"
)

# 世界寻址（PLAN §2.2）：页面是 ``/w/<slug>``，接口是 ``/w/<slug>/api/world/…``。
# slug 用非捕获的 ``[^/]+`` 匹配，中文 / 短码都认；``/w/`` 本身不算，它留给世界选择页。
_WORLD_PATH_PATTERN = re.compile(r"^/w/(?P<slug>[^/]+)(?:/|$)")
_WORLD_API_PATTERN = re.compile(r"^/w/[^/]+(?P<rest>/api(?:/.*)?)$")

# 旧地址 ``/w/timeline/<doc_id>`` 里的 ``timeline`` 是固定段，不是世界 slug；
# 不排除掉的话中间件会把「timeline」当成世界名去查，直接 404。
_LEGACY_W_PATH = re.compile(r"^/w/timeline/\d+/?$")


def world_slug_from_path(path: str) -> str:
    """从请求路径里取世界 slug；``/w/``、``/w`` 或别的前缀返回空串。"""
    path = path or ""
    if _LEGACY_W_PATH.match(path):
        return ""
    match = _WORLD_PATH_PATTERN.match(path)
    return match.group("slug") if match else ""


def world_by_slug(slug: str) -> World | None:
    if not slug:
        return None
    return World.objects.filter(slug=slug).first()


def api_path(path: str) -> str:
    """把 ``/w/<slug>/api/…`` 归一化回 ``/api/…``；其余路径原样返回。

    守门人 / 公开读白名单只认全局前缀，路径化之后统一先过这一层，
    免得每个判断都要写两套。
    """
    match = _WORLD_API_PATTERN.match(path or "")
    return match.group("rest") if match else (path or "")


def workspace_path(world: World | None) -> str:
    """世界工作区的规范地址；没有世界时回到世界选择页。"""
    return f"/w/{world.slug}" if world is not None else "/w/"

# 请求内的"当前世界"。``_UNSET`` 表示没解析过（命令行 / 测试直调），退回"全场第一个"。
_UNSET = object()
_active_world: contextvars.ContextVar = contextvars.ContextVar("opus_active_world", default=_UNSET)


def users_exist() -> bool:
    return User.objects.exists()


def is_privileged(user) -> bool:
    """能不能穿透到"别人的世界"——只认超级管理员。

    ``is_staff`` 只是"Django admin 后台能登录"，不该等于"所有世界的内容都能读改"；
    一个 staff 账号被拿下就等于全站私有世界暴露。收紧后 staff 与普通用户同权，
    只能进自己拥有 / 受邀加入的世界（S7）。
    """
    return bool(user and getattr(user, "is_authenticated", False) and user.is_superuser)


# --------------------------------------------------------------------------- #
# 平台身份：站长 / 管理员 / 工作人员 / 普通用户（与世界内角色正交）
# --------------------------------------------------------------------------- #
#: 管理员（moderator）所在的用户组名。任命 = 把人加进这个组，撤销 = 移出；走 Django
#: 内置 ``Group``，不新增模型 / 迁移，后台手动加组即任命（阶段 2 决策 #8）。
MODERATOR_GROUP = "moderator"

#: 平台身份取值。与世界内角色（owner / editor / viewer）是两条正交的轴：平台身份回答
#: "你站在整个站点这层算什么人"，世界角色回答"你在某个世界里能改什么"（见 docs/10 §2.2）。
PLATFORM_SUPERUSER = "superuser"
PLATFORM_MODERATOR = "moderator"
PLATFORM_STAFF = "staff"
PLATFORM_USER = "user"

PLATFORM_ROLE_LABELS = {
    PLATFORM_SUPERUSER: "站长",
    PLATFORM_MODERATOR: "管理员",
    PLATFORM_STAFF: "工作人员",
    PLATFORM_USER: "普通用户",
}


def is_moderator(user) -> bool:
    """是不是管理员——严格看"在不在 moderators 用户组里"。

    站长**不算**这个组里的身份（平台身份分层：站长 > 管理员）；站长另有治理能力，
    那由 ``can_moderate`` 表达。这里只回答"身份"，不回答"能力"。
    """
    if not user or not getattr(user, "is_authenticated", False):
        return False
    return user.groups.filter(name=MODERATOR_GROUP).exists()


def platform_role_of(user) -> str:
    """平台身份：``superuser`` / ``moderator`` / ``staff`` / ``user``；未登录返回空串。

    优先级 站长 > 管理员 > 工作人员 > 普通用户——同一个人只落在最靠前的那一层。
    """
    if not user or not getattr(user, "is_authenticated", False):
        return ""
    if user.is_superuser:
        return PLATFORM_SUPERUSER
    if is_moderator(user):
        return PLATFORM_MODERATOR
    if user.is_staff:
        return PLATFORM_STAFF
    return PLATFORM_USER


def can_moderate(user) -> bool:
    """有没有平台治理能力（封禁 / 解封公开 wiki）：站长或管理员。

    批次 C 的封禁功能用它守门；批次 B 先把这条判据定下来。注意这**不是**"能改别人世界
    里的内容"——那是 ``is_privileged``（只认站长），管理员治的是"公开 wiki 的可见性"。
    """
    return bool(is_privileged(user) or is_moderator(user))


def moderators():
    """当前所有管理员（moderators 组成员），按 id 排序。"""
    return User.objects.filter(groups__name=MODERATOR_GROUP).order_by("id")


def set_moderator(user, on: bool) -> bool:
    """任命 / 撤销管理员：把 ``user`` 加进 / 移出 moderators 组。返回身份是否真的变了。

    幂等：本来就是目标状态就返回 ``False``（调用方据此决定要不要记一笔审计）。
    """
    group, _ = Group.objects.get_or_create(name=MODERATOR_GROUP)
    already = group.user_set.filter(pk=user.pk).exists()
    if on and not already:
        group.user_set.add(user)
        return True
    if not on and already:
        group.user_set.remove(user)
        return True
    return False


def set_active_world(world):
    """把当前世界写进上下文，返回 token 供 ``reset_active_world`` 复位。"""
    return _active_world.set(world)


def reset_active_world(token) -> None:
    try:
        _active_world.reset(token)
    except (ValueError, LookupError):      # token 不属于当前上下文就忽略
        pass


def current_world_or_none() -> World | None:
    world = _active_world.get()
    if world is not _UNSET:
        return world
    return World.objects.order_by("id").first()


def worlds_for(user):
    """这个用户能进的世界：自己拥有的 + 有成员身份的。超级管理员看全部。"""
    if not user or not getattr(user, "is_authenticated", False):
        return World.objects.none()
    if is_privileged(user):
        return World.objects.order_by("id")
    return (
        World.objects.filter(Q(owner=user) | Q(memberships__user=user))
        .distinct()
        .order_by("id")
    )


def default_world_for(user):
    return worlds_for(user).first()


def can_access(user, world: World | None) -> bool:
    """能不能进这个世界的工作区：要登录，且是这个世界的成员 / 管理员。

    游客（未登录）一律不行——发布站点是"只读嵌入"，不是"开放工作区"；
    他真正能看的是某一篇已发布文档，那由 ``allow_public_read`` 单独放行。
    """
    if world is None:
        return False
    if user and getattr(user, "is_authenticated", False):
        if is_privileged(user):
            return True
        return worlds_for(user).filter(pk=world.pk).exists()
    return False


def can_read(user, world: World | None) -> bool:
    """能不能读这个世界的接口：要登录，且在这个世界里（成员 / 管理员）。

    与 ``can_edit`` 同口径地保留"首次安装例外"：库里边一个用户都没有时放行，
    否则自举流程（第一个注册者）连自己的世界都读不出来。
    """
    if not users_exist():
        return True
    if world is None:
        return False
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if is_privileged(user):
        return True
    return worlds_for(user).filter(pk=world.pk).exists()


def resolve_active_world(request) -> World | None:
    """按请求解析"当前世界"。

    优先级：**路径里的 slug** → 会话里选定的（且还能进）→ 用户自己的第一个世界
    → 全场第一个世界。路径优先是 PLAN §2.2 的核心：``/w/<slug>/…`` 说哪个世界
    就是哪个世界，不再靠会话猜；顺手把 slug 写回会话，切页后保持选中。

    路径里的 slug 查不到世界时返回 ``None``（而不是回退到全场第一个）——否则
    ``/w/不存在的/`` 会渲染出别人的世界，``current_world()`` 甚至会误建"新世界"。
    """
    session = getattr(request, "session", None)
    selected = None
    if session is not None:
        try:
            selected = session.get("world_id")
        except Exception:                  # 会话不可用
            selected = None

    slug = world_slug_from_path(getattr(request, "path", ""))
    if slug:
        world = world_by_slug(slug)
        if world is None:
            return None
        if session is not None:
            try:
                if session.get("world_id") != world.id:
                    session["world_id"] = world.id
            except Exception:              # 会话不可用
                pass
        return world

    user = getattr(request, "user", None)
    if user is not None and getattr(user, "is_authenticated", False):
        accessible = list(worlds_for(user))
        if selected:
            for item in accessible:
                if item.id == selected:
                    return item
        if accessible:
            return accessible[0]
        return World.objects.order_by("id").first()

    # 游客 / 未登录：只看得到兜底世界
    if selected:
        match = World.objects.filter(pk=selected).first()
        if match is not None:
            return match
    return World.objects.order_by("id").first()


def published_document(doc_id):
    """取一篇"对外公开、可被游客读"的文档；不满足任一条件就返回 None。

    口径与发布站点一致（``publish.site_documents``）：文档没被软删、没被隐藏、
    自己标了 ``is_published``，且所属世界也处于发布状态，类型属于站点可展示的那几种。
    """
    if not doc_id:
        return None
    from .services.publish import SITE_DOC_TYPES

    return (
        Document.objects
        .filter(
            pk=doc_id,
            deleted_at__isnull=True,
            hidden=False,
            is_published=True,
            document_type__in=SITE_DOC_TYPES,
            world__is_published=True,
        )
        .select_related("world")
        .first()
    )


def _embed_id(request) -> int:
    """从 ``?embed=<id>`` 里取出文档 id（取不到就当 0）。"""
    try:
        return int(request.GET.get("embed") or 0)
    except (TypeError, ValueError):
        return 0


def allow_public_read(request) -> bool:
    """游客能不能读这条 GET/HEAD 请求——发布站点只读嵌入的唯一入口。

    放行分四种：
    1. 跟世界数据无关的接口（登录/注册、我的世界列表、模版目录）。
    2. ``/api/world/state?embed=<id>``：id 对应的文档已公开（视图再裁剪成"只有那一篇"）。
    3. 路径里带文档 id 的读接口：那篇文档已公开（挡住拿 id 穷举未公开草稿）。
    4. ``/api/world/graph``：当前世界本身已发布（视图内只吐已发布部分）。

    放行"某一篇文档"时顺手把当前世界切成它所属的世界——游客默认落在"全场第一个
    世界"，嵌入非首个世界的文档时若不纠正，视图会拿错世界查不到数据。
    """
    path = api_path(request.path)
    if any(path.startswith(prefix) for prefix in PUBLIC_READ_PREFIXES):
        return True
    if path in PUBLIC_READ_PATHS:
        return True

    if path == "/api/world/state":
        document = published_document(_embed_id(request))
    elif path == "/api/world/graph":
        world = current_world_or_none()
        return bool(world is not None and world.is_published)
    else:
        match = _DOC_ID_PATTERN.match(path)
        document = published_document(int(match.group(1))) if match else None

    if document is None:
        return False
    set_active_world(document.world)
    return True


def membership_for(user, world: World | None):
    if not user or not getattr(user, "is_authenticated", False) or world is None:
        return None
    return Membership.objects.filter(world=world, user=user).first()


def role_of(user, world: World | None) -> str:
    """返回 owner / editor / viewer / guest（未登录）／admin（超级管理员）。"""
    if user and getattr(user, "is_authenticated", False):
        if is_privileged(user):
            return ROLE_OWNER
        membership = membership_for(user, world)
        if membership:
            return membership.role
        return ROLE_VIEWER if world is not None else ROLE_VIEWER
    return "guest"


def can_edit(user, world: World | None) -> bool:
    if not users_exist():
        return True                     # 首次安装：先让人把世界建起来
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if is_privileged(user):
        return True
    membership = membership_for(user, world)
    return bool(membership and membership.can_edit())


def can_admin(user, world: World | None) -> bool:
    """能管成员与邀请码：所有者或超级管理员。"""
    if not users_exist():
        return True
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if is_privileged(user):
        return True
    membership = membership_for(user, world)
    return bool(membership and membership.role == ROLE_OWNER)


def ensure_membership(user, world: World, role: str = ROLE_EDITOR, invited_by=None) -> Membership:
    membership, created = Membership.objects.get_or_create(
        world=world, user=user, defaults={"role": role, "invited_by": invited_by},
    )
    if created and world.owner_id is None and role == ROLE_OWNER:
        world.owner = user
        world.save(update_fields=["owner"])
    return membership


def viewer_payload(user, world: World | None) -> dict:
    """给前端的"我是谁、我能干什么"。"""
    authenticated = bool(user and getattr(user, "is_authenticated", False))
    role = role_of(user, world)
    membership = membership_for(user, world)
    platform_role = platform_role_of(user)
    return {
        "authenticated": authenticated,
        "needs_setup": not users_exist(),
        "username": (user.get_full_name() or user.username) if authenticated else "",
        "handle": user.username if authenticated else "",
        "email": user.email if authenticated else "",
        "initial": ((user.get_full_name() or user.username)[:1].upper() if authenticated else ""),
        "role": role,
        "role_label": dict(Membership._meta.get_field("role").choices).get(role, "游客"),
        "can_edit": can_edit(user, world),
        "can_admin": can_admin(user, world),
        "joined": bool(membership),
        # 平台身份（与世界角色正交）：站长 / 管理员 / 工作人员 / 普通用户。
        "platform_role": platform_role,
        "platform_role_label": PLATFORM_ROLE_LABELS.get(platform_role, ""),
        "is_moderator": is_moderator(user),
        "can_moderate": can_moderate(user),
    }
