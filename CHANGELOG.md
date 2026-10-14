# 更新日志（CHANGELOG）

> **文档版本：Dev 1.0**
> **用途**：记录 Opuscule（世界观共建工作台）每个**程序版本**的显著变更。
> **格式**：参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)；**版本号规范**见 [`推进计划.md` §8](推进计划.md)。
> **单一来源**：程序和页脚显示的版本号来自 `settings.APP_VERSION` + `APP_CHANNEL` 一处，
> 派生的展示串由 `world/version.py::app_info()` 生成；本文件只**记录**、不**定义**版本号。
>
> **渠道写法**：`dev → X.Y.Z-dev`，`alpha → X.Y.Z-alpha.N`，`beta → X.Y.Z-beta.N`，`release → X.Y.Z`（无后缀）。
> **日期**：为避免臆造，发布前不预填具体日期；正式发版时再补 `YYYY-MM-DD`。

---

## [未发布] — 0.5.0-dev（进行中）

### 新增

- **体验优化（阶段 4）**：
  - 文件夹视图顶部路径面包屑 + 工具条内搜索 + 4 档排序（手动 / 名称 / 类型 / 更新时间）。
  - 精确名字补全：`autolink.complete_names`（NFKC + casefold 归一化）+ `GET /api/world/complete`，
    前端 `attachNameCompleter` 打字即时弹出、支持键盘选择、兼容中文输入法。
  - 文件夹多选批量操作（移动到 / 隐藏 / 删除）+ 列表 / 网格视图切换。
- **`/robots.txt`（阶段 5 · O1）**：根路径新增爬虫公约视图 `world/views.robots_txt`——
  禁 `/api/`、`/world`、`/media/`、账号表单页与后台，放行公开只读站点 `/s/`、`/explore`；
  后台路径按 `settings.ADMIN_URL_PATH` 动态禁。
- **后台路径可配（阶段 5 · O2a）**：新增 `settings.ADMIN_URL_PATH`（环境变量 `OPUSCULE_ADMIN_PATH`，
  默认仍为 `admin`），根路由后台前缀由它生成；维护模式白名单 `allowed_prefixes()` 同步跟随，
  改路径后维护期间仍可进后台。
- **`/healthz` 健康检查（阶段 5 · O3）**：根路径新增轻量探针 `world/views.healthz`
  （`@require_safe`）——进程存活 + 数据库连通返回 `200 {"status":"ok"}`，数据库不通返回 `503`；
  供外部 uptime 监控高频调用（只跑一句 `SELECT 1`，别当业务接口）。
- **应用日志与轮转（阶段 5 · O3）**：新增 `settings.LOGGING`——默认 console → journald
  （systemd 自带轮转，**无需 logrotate**）；设 `OPUSCULE_LOG_FILE` 可另挂按大小轮转的文件处理器
  （单文件 10 MB × 5 份，文件轮转自管）。
- **CI 与构建号（阶段 5 · O4）**：新增 GitHub Actions 工作流 `.github/workflows/ci.yml`
  （装 `requirements.txt` + 跑 `manage.py test`）；引入构建号 `OPUSCULE_BUILD`（CI 注入，
  如 `github.run_number`），接入 `settings.py` 与 `world/version.py`——`/meta` 与页脚展示
  `· build N`、完整串变为 `0.5.0-dev+build.N`（不设则不显示，本地开发不受影响）。
- **后台两步验证（阶段 5 · O2b）**：引入 `django-otp==1.7.4`（**目前唯一第三方依赖**），
  后台站点 `OpusculeAdminSite` 继承 `OTPAdminSite`——除口令外还要过 TOTP 第二步；
  `INSTALLED_APPS` 加 `django_otp` + `otp_totp` + `otp_static`，
  `MIDDLEWARE` 在 `AuthenticationMiddleware` 之后加 `OTPMiddleware`；
  新增 `settings.OTP_TOTP_ISSUER`（环境变量 `OPUSCULE_OTP_ISSUER`）。
- **设备录入命令（阶段 5 · O2b）**：新增 `manage.py otp_enroll <username>`——
  解开「要进后台才能建设备、要建设备才能进后台」的死结，打印 `otpauth://` 串与密钥，
  支持 `--reset`（换新密钥）、`--backup-codes N`（生成一次性备用码）。

### 变更

- **`world` 内部拆包（架构重构 · R1）**：把三个臃肿的单文件按领域切成包——
  `world/models.py`（~1000 行）→ `world/models/`（11 子模块 + `__init__` re-export）、
  `world/views.py`（~4650 行）→ `world/views/`（16 子模块 + `__init__` re-export）、
  6 个服务模块（`publish` / `exchange` / `autolink` / `graph` / `geo` / `sanitize`）→ `world/services/`。
  纯搬运、**对外 import 路径全部不变**（`from world.models import X` / `from world.views import X` /
  `world_views.X` 照常可用）：`__init__` 显式 re-export 原有公开名，子模块内相对导入整体加一层点。
  不产生新迁移（`makemigrations` 检测无变化），全量 394 测试通过。
- **按领域拆 app（架构重构 · R2）**：在 R1 拆包之上真正拆出四个新 app——
  `documents`（Era / Document / Card / Calendar / TimelineEvent / Presence / DocumentVersion）、
  `graph`（TreeVariant / TreeNode / TreeEdge）、`maps`（MapLayer / MapMarker）、`publishing`（PublishLog）；
  `world` 只留核心（World / EntityType / PropertyDef / Membership / MemberEvent / InviteCode /
  ModerationEvent / Report）。**与 R1 不同，本次对外 import 路径改变**：`from world.models import Document`
  等工作区内部调用点改为 `from documents.models import Document`（全项目 53 处）。
  关键点：(1) **零数据迁移**——新旧 app 迁移用 `migrations.SeparateDatabaseAndState(state_operations=[...], database_operations=[])`
  重排 state 而不动库，`world.0018_split_apps` 只做 `DeleteModel` 的 state 变更、四个新 app 的 `0001_initial`
  只做 `CreateModel` 的 state 变更；(2) **表名不变**——各模型 `Meta.db_table` 显式钉住原 `world_*` 名，
  避免迁 app 后默认表名变成 `documents_*`；(3) **依赖环解锁**——`Presence` 是唯一造成
  `world ↔ documents` 环的模型（它指向 `Document` 又属核心），并入 `documents` 后新 app 之间为干净 DAG。
  `manage.py check` 无问题、`makemigrations --check` 无变化、全量 394 测试通过、迁移前后逐表行数完全一致。

---

## [0.4.0-dev] — 版本管理 · 阶段 3

### 新增

- **版本单一来源**：`settings.APP_NAME` / `APP_VERSION` / `APP_CHANNEL` / `APP_CHANNEL_SEQ`，
  可由环境变量 `OPUSCULE_VERSION` / `OPUSCULE_CHANNEL` / `OPUSCULE_CHANNEL_SEQ` 覆盖。
- **`world/version.py`**：纯派生模块，`app_info()` 统一产出 `name / version / channel / channel_label / version_string / display`。
- **`/meta` 接口**：公开只读，返回程序元信息（版本 / 渠道），供运维与前端引用。
- **模板上下文处理器 `world.context.app_version`**：所有 `render()` 渲染自动带上 `app` 变量。
- **`CHANGELOG.md`**：即本文件，记录各程序版本的显著变更。

### 变更

- **页脚展示版本**：`/explore`、`/login`、站点基础模板页脚统一显示 `Opuscule 0.4.0 · Dev`
  （取自 `{{ app.display }}`，不再硬编码）。
- **文档头部**：16 处 Markdown 头部由焊死的 `版本：Dev 1.0` 统一改标为**「文档版本」**（不删内容），
  与程序版本解耦，避免「文档版本」被误认为「程序版本」。

### 说明

- 暂不引入**构建号**（无 CI）；`World.publish_version`（内容发布次数）**不是**程序版本。

---

## [0.3.0] — 用户分级 · 阶段 2

### 新增

- **治理审计基座**：`ModerationEvent` 模型 + `_log_moderation_event` 助手 + 后台只读（批次 A）。
- **四层平台身份**：`superuser / staff / moderator / user`；管理员走 Django 内置 `Group`（组名 `moderator`，零迁移）。
  见 `world/permissions.py` 的 `is_moderator` / `platform_role_of` / `can_moderate` / `moderators()` / `set_moderator`。
- **站长专属任命 / 撤销接口** `/api/world/moderators`（仅 `is_privileged`），每次实质变更写 `ModerationEvent`。
- **封禁能力**：`World.banned_until` / `ban_reason` + `is_banned` 惰性属性；**到期自动解封，零定时任务**。
  被封印站点首页 / 搜索 / 纪元 / 文档页 / feed / og 统一 404。
- **平台治理台** `/api/world/moderation`（`ban` / `unban`，时长夹在 3–7 日，守门 `can_moderate`）。
- **举报**：`Report` 模型 + 读者匿名举报入口 `POST /s/<slug>/report` + 站长专属举报箱 `GET/POST /api/world/reports`（仅 `is_privileged`）。
- `viewer_payload` 暴露平台身份，供前端按角色渲染。

### 安全

- **收紧 `is_staff` 穿透**（S7）：`is_staff` 不再获得平台权限，只留 `is_superuser` 救火。
- **Django admin 加固**（批次 A）：`OpusculeAdminSite.has_permission` 收紧到**仅 `is_superuser`**。

---

## [0.2.0] — 账号生命周期 · 阶段 1

### 新增

- **密码重置 / 改密**（A3）：配真实邮件后端。
- **销号 / 数据导出**（A4）：用户可自助注销并导出自己的数据。
- **成员变更审计日志**（A5）：成员增删改可追溯。
- **公开世界展示页 `/explore`**（A7）：游客可浏览已发布的公开世界。

### 变更

- **上传内容类型校验**（A8）：上传按内容类型白名单放行。

### 安全

- **复核全部 `@csrf_exempt`**（A6）：逐条复核 87 处，登录 / 注册 / 退出 / 续期接口按现状保留（轻微「登录 CSRF」面，已知取舍）。
- **邀请码强制**（A1）：注册必须有有效邀请码，唯一例外为首个用户。
- **`publish_password` 改哈希**（A2）：发布密码不再明文存储。
- **媒体走鉴权视图**（S3）：按「所属文档是否公开」放行，`/media/` 无法直链未公开图。
- **登录 / 注册限流**（S4）。
- **生产配置收紧**（S5）：`DEBUG` / `SECRET_KEY` / HSTS / SSL 重定向 / Secure Cookie。
- **备份加密 + 异地**（S6）。
- **锁读**（S1 + S2）：`/world` 与 `/api/world/*` 读需为世界成员；`?embed=` 例外**只放行已发布文档**。

---

## [0.1.0] — 上线前安全底线 · 阶段 0

> 首个可发布版本：**先把门锁上**。

### 安全

- **锁读**（S1）：`/world` + `/api/world/*` 读需登录且为世界成员。
- **embed 收窄**（S2）：`?embed=` 例外只放行已发布文档。
- **媒体鉴权**（S3）：媒体走鉴权视图。
- **限流**（S4）：登录 / 注册频率限制。
- **生产配置收紧**（S5）。
- **备份加密 + 异地**（S6）。
- **`is_staff` 穿透收紧**（S7）。
- **邀请码强制**（A1）、**`publish_password` 改哈希**（A2）。

### 修复

- 清理既有瑕疵：`World.save()` 重复定义、`Membership.to_payload` 重复键、
  `_register_user` 未向 `validate_password` 传 `user`（「密码像不像用户名」被跳过）。

---

## 备注

- **程序版本 vs 内容版本**：页脚 `Powered by Opuscule X.Y.Z · 渠道` 是**程序版本**；
  站点页脚的 `发布版本 vN` 是**内容发布次数**（`World.publish_version`），两者互不相干。
- **发版流程**：改 `settings.APP_VERSION` / `APP_CHANNEL`（或对应环境变量）→ 在本文件新建一个版本小节 →
  打标签发布。届时为每个版本补上发布日期。
