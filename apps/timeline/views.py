# -*- coding: utf-8 -*-
"""HTTP 接口与页面。

本 app 对外提供一条经典横向时间轴：独立成页的入口在 ``/legacy``，被工作区
嵌入时走 ``/world/timeline/<doc_id>``。接口清单如下（路径结尾都不带斜杠）：

    GET    /legacy                    页面
    GET    /api/timeline              全量数据
    POST   /api/items                 新建条目
    PUT    /api/items/<id>            更新条目（PATCH 等价，都是「局部覆盖 + 其余沿用原值」）
    DELETE /api/items/<id>            删除条目
    PUT    /api/view                  记住视野

两点设计说明：

* 写接口加了 ``@csrf_exempt``：这是不依赖会话的 JSON 接口，前端不会带 CSRF token，
  所以保留 CsrfViewMiddleware、只豁免这几个接口。
* 新建条目的 id 交给数据库自增，不用「当前最大 id + 1」，删掉最后一条后
  id 也不会被回收，前端缓存的旧 id 不会指向别的记录。
"""

import json

from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods, require_safe

from .models import TimelineItem, TimelineView
from .normalize import apply_values, as_float, normalize

ITEM_NOT_FOUND = {"error": "未找到该事件"}
API_NOT_FOUND = {"error": "接口不存在"}

# 关于 @csrf_exempt：
# 本应用不使用 cookie / session，这些视图只服务同源的 fetch；而且跨站发
# Content-Type: application/json 的请求会先触发 CORS 预检，Django 不应答预检，
# 请求根本发不出去。所以这里按惯例豁免 CSRF（否则前端所有写操作会被拦成 403）。
# 豁免是按视图生效的，/admin/ 的会话型表单仍然受 CsrfViewMiddleware 保护。


def json_response(data, status=200):
    """让中文直接输出，不转义成 \\uXXXX（Django 默认会转义非 ASCII 字符）。"""
    return JsonResponse(data, status=status, json_dumps_params={"ensure_ascii": False})


def parse_json(request):
    """把请求体解析成 dict；解析不出来（空体 / 非法 JSON / 顶层不是对象）就当空对象。"""
    try:
        parsed = json.loads(request.body)
    except (ValueError, UnicodeDecodeError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


# --------------------------------------------------------------------------- #
# 页面
# --------------------------------------------------------------------------- #
@require_safe
def index(request):
    return render(request, "index.html")


@require_safe
def classic_embedded(request, doc_id):
    """把经典编辑器嵌进工作区用（``/w/timeline/<doc_id>``）。

    编辑器本身**一行都不用改**：模板在 script.js 之前注入一段 fetch 适配层，
    把它写死的 /api/timeline、/api/items*、/api/view 改写到 world 的时间线文档上
    （转换逻辑见 world/classic.py）。
    """
    readonly = request.GET.get("readonly") in ("1", "true", "yes")
    return render(request, "index.html", {
        "classic_api_base": f"/api/world/timelines/{doc_id}/classic",
        "embedded": True,
        "classic_readonly": readonly,
        # 外壳只有一套暗色形态；嵌进工作区的画布必须跟宿主同色，
        # 所以 paper（浅色纸面）恒为关。
        "classic_paper": False,
    })


# --------------------------------------------------------------------------- #
# 接口
# --------------------------------------------------------------------------- #
@require_safe
def timeline(request):
    """全量数据：视野 + 所有条目。"""
    return json_response({
        "view": TimelineView.load().to_payload(),
        "items": [item.to_payload() for item in TimelineItem.objects.all()],
    })


@csrf_exempt
@require_http_methods(["POST"])
def item_collection(request):
    """新建一条记录，返回带 id 的完整记录。"""
    item = apply_values(TimelineItem(), normalize(parse_json(request)))
    item.save()
    return json_response(item.to_payload(), status=201)


@csrf_exempt
@require_http_methods(["PUT", "PATCH", "DELETE"])
def item_detail(request, item_id):
    """按 id 更新或删除。"""
    try:
        item = TimelineItem.objects.get(pk=item_id)
    except TimelineItem.DoesNotExist:
        return json_response(ITEM_NOT_FOUND, status=404)

    if request.method == "DELETE":
        removed = item.to_payload()
        item.delete()
        return json_response({"success": True, "removed": removed})

    # 请求里出现的键覆盖原值，没出现的沿用原值（旧数据兜底）
    apply_values(item, normalize(parse_json(request), fallback=item.to_payload()))
    item.save()
    return json_response(item.to_payload())


@csrf_exempt
@require_http_methods(["PUT"])
def view_state(request):
    """记住用户最后一次浏览的时间范围；范围不合法就原样返回，不报错。"""
    payload = parse_json(request)
    start = as_float(payload.get("start"))
    end = as_float(payload.get("end"))

    state = TimelineView.load()
    if start is not None and end is not None and end > start:
        state.start = start
        state.end = end
        state.save(update_fields=["start", "end"])
    return json_response(state.to_payload())


# --------------------------------------------------------------------------- #
# 404
# --------------------------------------------------------------------------- #
@csrf_exempt
def api_fallback(request):
    """兜底：/api 与 /api/ 下没匹配到的路径一律回 JSON。

    DEBUG=True 时 Django 会用自己的调试页替换 handler404，
    所以这里显式返回，保证开发和部署下的接口行为一致。
    """
    return json_response(API_NOT_FOUND, status=404)


def page_not_found(request, exception=None):
    """非 /api/ 的 404：给一页"信号丢失"，而不是把用户丢回一个空壳页面。

    只在 DEBUG=False 时由 Django 调用（DEBUG=True 下显示调试页；测试里
    DEBUG 被强制为 False，所以这一条是被测试真正走过的）。
    页面是一处 glitch 效果的 404 + 两句人话 + 一条回去的路。
    """
    if request.path.startswith("/api/"):
        return json_response(API_NOT_FOUND, status=404)
    # 有已发布的站点就把搜索指向它——"找不到东西"时最有用的一步是搜一下
    site_slug = ""
    try:
        from apps.world.models import World

        world = World.objects.filter(is_published=True).exclude(published_slug="").first()
        site_slug = world.published_slug if world is not None else ""
    except Exception:                      # 数据库还没就绪（比如迁移前）
        site_slug = ""
    return render(request, "404.html", {"request_path": request.path, "site_slug": site_slug},
                  status=404)


def server_error(request):
    """500：不把裸错误丢给用户——说清楚发生了什么，再给一条重试的路。"""
    return render(request, "500.html", status=500)
