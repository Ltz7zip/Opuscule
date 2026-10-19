"""
Opuscule 的全局配置：数据库、应用、中间件、模板、静态文件与各类环境变量。

Django 启动时按名字找到这个模块，读走里面所有大写常量。每一项背后都有「为什么这样设」
的理由，改之前先想清楚影响面。凡是能用环境变量覆盖的值（密钥、调试开关、域名、
维护开关等）都留了本地开发用的默认值——默认值偏宽松，上线前必须显式覆盖，
清单见 docs/13-部署与运维.md。

官方参考：
https://docs.djangoproject.com/en/6.1/topics/settings/
https://docs.djangoproject.com/en/6.1/ref/settings/
"""

import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent


# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/6.1/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
# 本地开发用的兜底密钥；要部署时通过环境变量 DJANGO_SECRET_KEY 覆盖。
SECRET_KEY = os.environ.get(
    'DJANGO_SECRET_KEY',
    'django-insecure-#_8ryxfiq3=7)(j2yluffa3-5b!xtkxuck@@ye9lhgh!z$6ajo',
)

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = os.environ.get('DJANGO_DEBUG', '1') == '1'

# 防呆：对外服务（DEBUG 关）却还在用代码里的兜底密钥，就直接拒绝启动。
# 兜底密钥写在公开的源码里，拿它签的会话 cookie 谁都能伪造——与其让它悄悄上线，
# 不如在启动那一刻就崩掉，逼着运维把 DJANGO_SECRET_KEY 配上（见 docs/13-部署与运维.md §3.1）。
if not DEBUG and SECRET_KEY.startswith('django-insecure-'):
    raise ImproperlyConfigured(
        '生产环境（DJANGO_DEBUG=0）必须设置 DJANGO_SECRET_KEY，不能用源码里的开发兜底密钥。'
        '生成方法见 docs/13-部署与运维.md §3.1。'
    )

# 允许访问的域名：部署时用 DJANGO_ALLOWED_HOSTS 覆盖（逗号分隔），例如
# DJANGO_ALLOWED_HOSTS=example.com,www.example.com
ALLOWED_HOSTS = [
    h.strip() for h in os.environ.get(
        'DJANGO_ALLOWED_HOSTS', '127.0.0.1,localhost,[::1]'
    ).split(',') if h.strip()
]

# 反代（Nginx）转发 HTTPS 请求时，靠这个头让 Django 认出请求是安全的
# （影响 request.is_secure()、CSRF 与安全 Cookie 的判断）。
# 前提：Gunicorn 只监听 127.0.0.1，外部请求一律经过代理，别把 8000 直接暴露到公网。
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# 后台路径（OPUSCULE_ADMIN_PATH）。默认 "admin" 只是方便本地开发与测试；
# 正式部署**应当**在 /etc/opuscule.env 里改成一串猜不到的路径（如 OPUSCULE_ADMIN_PATH=ops-7f3a9c），
# 这样扫描器按默认的 /admin/ 找不到后台入口（见 docs/13-部署与运维.md §3.6）。
# robots.txt 也会按这个值禁掉后台，别让搜索引擎替人发现它。
ADMIN_URL_PATH = os.environ.get('OPUSCULE_ADMIN_PATH', 'admin').strip('/') or 'admin'

# 后台两步验证（django-otp，见 docs/13-部署与运维.md §4.11）：登录后台除了口令，
# 还要输一个 TOTP 动态验证码；设备用 `manage.py otp_enroll` 一次性录入。
# OTP_TOTP_ISSUER 是认证器 App 里显示的组织名（otpauth:// 的 issuer 标签），
# 不设则只显示用户名，容易跟别的站混在一起——上线建议设成站点名。
OTP_TOTP_ISSUER = os.environ.get('OPUSCULE_OTP_ISSUER', 'Opuscule')

# CSRF 信任来源：走 HTTPS 域名时，登录/注册等浏览器原生表单需要它（逗号分隔），例如
# DJANGO_CSRF_TRUSTED_ORIGINS=https://example.com,https://www.example.com
CSRF_TRUSTED_ORIGINS = [
    o.strip() for o in os.environ.get(
        'DJANGO_CSRF_TRUSTED_ORIGINS', ''
    ).split(',') if o.strip()
]


# Application definition

INSTALLED_APPS = [
    # 后台用自定义站点（只让超级管理员进，见 world/admin.py）：把默认 admin 换成
    # AdminConfig 子类，admin.site 即 OpusculeAdminSite，auth 的 User/Group 后台也随之注册。
    'apps.world.adminconfig.OpusculeAdminConfig',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # 后台两步验证（django-otp）：otp_totp 是 TOTP 设备（认证器 App），
    # otp_static 是静态备用码（认证器丢了用它救急，管理命令 addstatictoken 生成）。
    'django_otp',
    'django_otp.plugins.otp_totp',
    'django_otp.plugins.otp_static',
    # 本项目自己的应用（都收在 apps/ 包下，app label 仍取末段名）
    'apps.timeline',   # 次应用：一条经典横向时间轴（/legacy 页面与 /api 接口）
    'apps.world',      # 主应用：世界工作区（世界 / 类型 / 属性 / 成员 / 治理）+ 只读站点
    'apps.documents',  # 文档树：文档 / 卡片 / 纪元 / 日历 / 时间线事件 / 版本 / 在线状态
    'apps.graph',      # 关系树：TreeVariant / TreeNode / TreeEdge
    'apps.maps',       # 经典地图：MapLayer / MapMarker
    'apps.publishing', # 发布记录：PublishLog
    'apps.ai',         # AI 横切层：BYOK 凭据 / 会话 / 变更集（不直接写业务模型）
]

# 工作区把经典时间线编辑器用同源 iframe 嵌进来，所以这里允许同源框嵌
# （XFrameOptionsMiddleware 的默认值是 DENY，会连自家页面都拦掉）
X_FRAME_OPTIONS = 'SAMEORIGIN'

MIDDLEWARE = [
    # 压缩：地图数据这类 JSON 很大（实测一份地图 2.8 MB 未压缩），走一次 gzip 能砍掉
    # 九成以上。放最前面，好让它包住后面所有中间件产生的响应。项目里没有流式响应
    # （Django 的 GZipMiddleware 对流式响应会自动跳过），所以不存在"压了 SSE"的坑。
    'django.middleware.gzip.GZipMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    # 两步验证：必须装在 AuthenticationMiddleware **之后**——它照 session 里的设备
    # 记录，给 request.user 挂上 otp_device 与 is_verified()，后台（OTPAdminSite）
    # 就靠 is_verified() 判断第二步过没过。
    'django_otp.middleware.OTPMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    # 请求级世界作用域：先解析"当前世界"（会话选定 → 自己的第一个世界 → 兜底），
    # 后面的守门人与视图都读它。
    'apps.world.middleware.ActiveWorldMiddleware',
    # 读守门人：登录 + 世界成员才读得到工作区接口，只给"发布站点只读嵌入"开口子
    'apps.world.middleware.ReadPermissionMiddleware',
    # 写操作守门人：登录 + 编辑权限（白名单见 apps/world/permissions.py）
    'apps.world.middleware.EditPermissionMiddleware',
    # 维护模式：只在 OPUSCULE_MAINTENANCE=1 时拦请求，
    # 平时这一层等于不存在（放最后，别影响上面几层的正常判断）。
    'apps.world.maintenance.MaintenanceMiddleware',
]

ROOT_URLCONF = 'worldbuilding_timeline.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        # 页面模板放在项目根目录的 templates/ 里
        'DIRS': [BASE_DIR / 'templates'],
        # Django 6.x 的 Engine 会**无条件**把 loader 套进 cached.Loader
        # （django/template/engine.py 里没有 `if not debug` 判断）。后果是：改完
        # .html 模板不重启服务器就永远看不到效果 —— CSS/JS 是静态文件照常生效，
        # 只有模板被冻在进程里，"完全没改变"十有八九是这条。
        # 开发模式显式给出不带缓存的 loader 列表（此时 APP_DIRS 必须为 False）；
        # 部署（DEBUG=False）仍走默认那条带缓存的路径。
        'APP_DIRS': not DEBUG,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'apps.world.context.static_version',
                'apps.world.context.app_version',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
            **(
                {
                    'loaders': [
                        'django.template.loaders.filesystem.Loader',
                        'django.template.loaders.app_directories.Loader',
                    ],
                }
                if DEBUG
                else {}
            ),
        },
    },
]

WSGI_APPLICATION = 'worldbuilding_timeline.wsgi.application'


# Database
# https://docs.djangoproject.com/en/6.1/ref/settings/#databases

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}


# Cache
# 登录 / 注册限流等计数依赖缓存。默认的 LocMemCache 是「每进程一份」，
# 而生产是 gunicorn 多 worker（见 deploy/opuscule.service），各进程会各算各的，
# 等于把阈值放大到 worker 数倍。改用文件缓存让计数在同一台机器上共享。
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.filebased.FileBasedCache',
        'LOCATION': BASE_DIR / '.cache',
    }
}


# Password validation
# https://docs.djangoproject.com/en/6.1/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Internationalization
# https://docs.djangoproject.com/en/6.1/topics/i18n/

LANGUAGE_CODE = 'zh-hans'

TIME_ZONE = 'Asia/Shanghai'

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/6.1/howto/static-files/

# 前端的 style.css / script.js 放在项目根目录的 static/ 下，
# 对外统一从这个前缀取（STATIC_URL 保持 "/static/"）。
STATIC_URL = '/static/'

STATICFILES_DIRS = [BASE_DIR / 'static']

# collectstatic 的收集目录（只有正式部署才用得到）
STATIC_ROOT = BASE_DIR / 'staticfiles'

# 上传的地图底图（/media/maps/<doc_id>/...）
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'
# 上传上限：单文件 25 MB（前端上传处有同样的提示文案）
FILE_UPLOAD_MAX_MEMORY_SIZE = 25 * 1024 * 1024
DATA_UPLOAD_MAX_MEMORY_SIZE = 26 * 1024 * 1024


# Email
# https://docs.djangoproject.com/en/6.1/topics/email/#topic-email-configuration
#
# 正式环境用环境变量指向真实 SMTP（忘记密码的重置邮件靠它寄出去）；没配就退回
# 控制台后端——重置邮件会打进进程日志，本地开发/排查看得见，只是不会真的发出去。
# 变量清单见 docs/13-部署与运维.md。
_EMAIL_HOST = os.environ.get('DJANGO_EMAIL_HOST', '').strip()
if _EMAIL_HOST:
    MAILERS = {
        'default': {
            'BACKEND': 'django.core.mail.backends.smtp.EmailBackend',
            'OPTIONS': {
                'host': _EMAIL_HOST,
                'port': int(os.environ.get('DJANGO_EMAIL_PORT', '587')),
                'username': os.environ.get('DJANGO_EMAIL_USERNAME', ''),
                'password': os.environ.get('DJANGO_EMAIL_PASSWORD', ''),
                'use_tls': os.environ.get('DJANGO_EMAIL_USE_TLS', '1') == '1',
            },
        },
    }
else:
    MAILERS = {
        'default': {
            'BACKEND': 'django.core.mail.backends.console.EmailBackend',
        },
    }

# 重置邮件、通知邮件的默认发件人；正式环境建议换成自己的域名邮箱。
DEFAULT_FROM_EMAIL = os.environ.get('DJANGO_DEFAULT_FROM_EMAIL', 'Opuscule <no-reply@localhost>')

# 会话超时：两周。前端会在到期前提醒"续期"（/api/world/auth/renew）。
SESSION_COOKIE_AGE = 60 * 60 * 24 * 14
SESSION_SAVE_EVERY_REQUEST = False

# 跨站 Cookie 策略：JSON 写接口普遍标了 @csrf_exempt、前端也不带 CSRF token，
# 挡 CSRF 的其实就是这里的 SameSite——只有同站请求才携带会话 Cookie，
# 跨站伪造的写请求拿不到会话，于权限中间件那里就被挡在 401。
# Django 的默认值本就是 Lax，这里显式写出来，免得将来默认值变动悄悄削弱防线。
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"

# 正式环境走 HTTPS，Session / CSRF Cookie 只允许加密传输。
# 用 not DEBUG 门控，本地 http 开发不受影响。
#
# 过渡例外（OPUSCULE_INSECURE_HTTP=1）：域名与证书还没就绪、只能拿公网 IP 明文
# HTTP 对外时的临时出口，用来跳过下面全部 HTTPS 硬性要求。**仅限证书就绪前的
# 窗口期**——这期间口令与会话 Cookie 在公网是明文传输的，证书签好后必须删掉这个
# 变量；把它当成"生产配置"长期留着，等于自愿放弃 HTTPS 的全部保护。
_INSECURE_HTTP = os.environ.get('OPUSCULE_INSECURE_HTTP', '') == '1'

if not DEBUG and not _INSECURE_HTTP:
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True

    # 强制 HTTPS：任何 http 请求一律 301 跳到 https。
    # 依赖上面的 SECURE_PROXY_SSL_HEADER 从 nginx 的 X-Forwarded-Proto 判出原始协议，
    # 否则在反代后面 Django 只看得到 http，会陷入「跳到自己」的死循环。
    SECURE_SSL_REDIRECT = True

    # HSTS：让浏览器记住「以后只用 https 访问这个站」，有效期一年。
    # 一旦浏览器记下，到期前用 http 访问会被它自己拦下——所以确认全站可上 https 后再开。
    # PRELOAD 只是往响应头里加个 preload 指令、声明「本域名有资格进预加载列表」；
    # 真正提交进浏览器厂商的内置列表是另一步手动操作，这里不做，需要时再单独申请。
    SECURE_HSTS_SECONDS = 31536000          # 1 年
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True

# Service Worker：部署环境默认开，开发（DEBUG）默认关——
# 开着它探针看到的可能不是刚改的代码，护栏会变得不可信。
SW_ENABLED = not DEBUG


# --------------------------------------------------------------------------- #
# 日志（见 docs/13-部署与运维.md §8.6）
# --------------------------------------------------------------------------- #
# 默认只往 stdout/stderr 打，交给 systemd → journald：journald 自己按大小/时间
# 轮转（上限见 journald.conf），不用额外写 logrotate。
# 若要另外落一份到文件，设 OPUSCULE_LOG_FILE=/var/log/opuscule/app.log，
# 这里会挂一个按大小轮转的文件处理器（10 MB × 5 份），文件轮转由它自己管。
_LOG_FILE = os.environ.get('OPUSCULE_LOG_FILE', '').strip()


def _log_handlers() -> dict:
    handlers = {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    }
    if _LOG_FILE:
        handlers['file'] = {
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': _LOG_FILE,
            'maxBytes': 10 * 1024 * 1024,   # 单文件 10 MB
            'backupCount': 5,               # 最多留 5 份历史
            'encoding': 'utf-8',
            'formatter': 'verbose',
        }
    return handlers


# 同时挂到所有 logger 上的处理器名（文件处理器只在配了 OPUSCULE_LOG_FILE 时才存在）
_LOG_ACTIVE = ['console'] + (['file'] if _LOG_FILE else [])

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {'format': '{levelname} {asctime} {name} {message}', 'style': '{'},
    },
    'handlers': _log_handlers(),
    'loggers': {
        'django': {'handlers': _LOG_ACTIVE, 'level': 'INFO'},
        # 请求出错（4xx/5xx）单独收在这里：500 会带堆栈，是排查的第一现场
        'django.request': {'handlers': _LOG_ACTIVE, 'level': 'WARNING', 'propagate': False},
        # 本项目各应用的业务日志（logger 名 = 模块 __name__，随 apps/ 包前缀）
        'apps.world': {'handlers': _LOG_ACTIVE, 'level': 'INFO'},
        'apps.documents': {'handlers': _LOG_ACTIVE, 'level': 'INFO'},
        'apps.graph': {'handlers': _LOG_ACTIVE, 'level': 'INFO'},
        'apps.maps': {'handlers': _LOG_ACTIVE, 'level': 'INFO'},
        'apps.publishing': {'handlers': _LOG_ACTIVE, 'level': 'INFO'},
        'apps.timeline': {'handlers': _LOG_ACTIVE, 'level': 'INFO'},
        'apps.ai': {'handlers': _LOG_ACTIVE, 'level': 'INFO'},
    },
    # 兜底：没在上面点名的 logger 只记 WARNING 及以上，别让第三方库刷屏
    'root': {'handlers': _LOG_ACTIVE, 'level': 'WARNING'},
}


# --------------------------------------------------------------------------- #
# 程序版本（单一来源）
# --------------------------------------------------------------------------- #
# 页脚、`/meta` 接口、CHANGELOG 都从这里取，别在别处再写死版本号。
# 约定见「推进计划.md §8」：**环境渠道 + 三段式 X.Y.Z**，组合写法——
#   Dev     -> 0.7.0-dev
#   Alpha   -> 0.7.0-alpha.N
#   Beta    -> 0.7.0-beta.N
#   Release -> 0.7.0（无后缀）
# 构建号（OPUSCULE_BUILD）由 CI 注入，同一个 X.Y.Z 下每次构建递增：
# 例如 GitHub Actions 用 `OPUSCULE_BUILD=${{ github.run_number }}`（见 .github/workflows/ci.yml）。
# 不设则不显示——本地开发与测试不受影响。派生展示串见 world/version.py 的 app_info()。
# 注意：``World.publish_version`` 是"内容发布次数"，是数据，**不是**程序版本。
APP_NAME = "Opuscule"
APP_VERSION = os.environ.get("OPUSCULE_VERSION", "0.8.1")        # 三段式基础号
APP_CHANNEL = os.environ.get("OPUSCULE_CHANNEL", "dev")          # dev/alpha/beta/release
APP_CHANNEL_SEQ = os.environ.get("OPUSCULE_CHANNEL_SEQ", "")     # alpha/beta 的轮次 N（默认 1）
APP_BUILD = os.environ.get("OPUSCULE_BUILD", "").strip()         # CI 构建号（不设则不显示）


# `manage.py check --deploy` 的静音项。只关「故意如此」的，别顺手多关：
# - security.W019：我们故意让 X_FRAME_OPTIONS=SAMEORIGIN，好让工作区能同源 iframe
#   内嵌经典时间轴（见上面的注释），不改回 DENY。
SILENCED_SYSTEM_CHECKS = ['security.W019']
# mail.E001：本地 DEBUG 下故意用控制台邮件后端（见上面的 MAILERS 注释）。
# 生产（DEBUG=0）**不**静音这条——逼运维用 DJANGO_EMAIL_HOST 配好真实 SMTP，
# 否则密码重置邮件发不出去，功能等于失效。
if DEBUG:
    SILENCED_SYSTEM_CHECKS.append('mail.E001')
