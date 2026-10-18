# Opuscule · 世界观共建工作台

> **文档版本：0.7.0-dev**
>
> 一个用来搭建虚构世界的工作台：把设定写成一张张卡片，把它们排进时间线，
> 连成关系树，标在地图上，然后一键发布成一个只读的、好看的维基站点。

Opuscule 是「伟大之作（magnum opus）」的反义词，带一点自谦：这不是终稿，
是一本还没写完的小册子。

本文档面向两类人：

- **想用它的人** —— 看「快速开始」和「功能地图」，照着点就能上手。
- **想改它的人** —— 看「项目结构」和 [TECHNO.md](TECHNO.md)、[PLAN.md](PLAN.md)。

---

## 1. 它能做什么

一句话：**为写小说、跑团、做游戏设定的人，提供一套「把脑内世界观变成结构化网站」的工具。**

它有两个面孔，跑在同一个 Django 进程里：

| 面孔 | 地址 | 谁能看 | 干什么 |
| --- | --- | --- | --- |
| **工作区** | `/world` | 作者（登录） | 建卡、写正文、排时间线、画关系树、标地图、发布 |
| **只读站点** | `/s/<短码>/` | 读者（公开 / 需密码） | 像读维基一样浏览已经发布的内容 |

设计目标只有两条：

1. **作者在工作区不觉得工具挡路** —— 随手记，随手连，结构自己长出来。
2. **读者在站点里感觉在翻一本世界档案** —— 干净、有氛围、能顺着链接跳进去。

---

## 2. 功能地图

按功能分成十一个模块。想深入了解实现，进 [PLAN.md](PLAN.md) 与
[TECHNO.md](TECHNO.md)。

| 模块 | 一句话说明 |
| --- | --- |
| **世界与工作区** | 一个账号可以有多个世界；世界=一部作品，切换世界就切换整套设定 |
| **文档树** | 左侧那棵可无限嵌套的树；文件夹、卡片、时间线、地图都是「文档」 |
| **卡片 · 类型 · 属性** | 世界的原子。卡片=标题+类型+属性+区块正文 |
| **时间线 · 日历 · 纪元** | 事件有「年/月/日/时」四级精度；世界可以有自定义历法与多个纪元 |
| **关系树** | 家谱 / 组织架构 / 军团编制，一套画布多种模板 |
| **地图** | 图钉 / 区域 / 文字标注；也能把地图上的国家城市反向变成卡片 |
| **世界图谱与自动识别** | 自动找出卡片之间的关系，正文里提到名字自动变成链接 |
| **发布与只读站点** | 把选定的文档发布成一个公开站点，含全文搜索、纪元页、RSS |
| **账号 · 协作 · 版本** | 邀请码注册、成员权限、谁在线、文档历史与回滚 |
| **导入导出与工具** | Markdown / JSON 导入导出，表格、媒体库、骰子、语音等小工具 |
| **接口与部署** | 完整的 `/api/world/*` 接口，以及怎么上线跑起来 |

> 另外还有一条跑在 `/legacy` 的**经典时间轴**：一个纯粹的横向时间轴编辑器，
> 被当成「独立工具」保留在工作区里内嵌使用。它由 `timeline` 应用提供。

---

## 3. 路线图

当前版本 **0.7.0**。各版本的既定方向：

| 版本 | 主题 | 说明 |
| --- | --- | --- |
| **0.5.1** | 体检后修复轮 | 前端体检的问题收口 |
| **0.5.2** | 布局与 UI 大改 | 重做工作区布局与整体视觉语言；正文编辑器引入 React 孤岛 |
| **0.6.0** | AI | 引入 AI 横切层（BYOK 代理转发），作用于所有模块之上 |
| **0.7.0** | 时间线 · 时代 · 存档 | 前面已拍板的改动：总时间线 / 时代=命名时间段 / 世界存档，见 [PLAN.md](PLAN.md)（当前版本） |
| **0.8.0** | 地图功能全面优化 | 地图模块的全面重构与能力升级 |

---

## 4. 快速开始

### 4.1 环境要求

- **Python 3.12 或更高**（开发与本机验证使用的是 3.14）
- 无需 Node / 无需构建步骤：前端是原生 HTML + CSS + JavaScript
- 数据库用 SQLite，零配置

### 4.2 跑起来

```bash
# 1. 建虚拟环境（若还没有）
python3 -m venv .venv

# 2. 装依赖（Django + gunicorn + django-otp）
.venv/bin/pip install -r requirements.txt

# 3. 建库（执行数据库迁移）
.venv/bin/python manage.py migrate

# 4. 启动开发服务器
.venv/bin/python manage.py runserver 8000
```

然后打开 <http://127.0.0.1:8000/> —— 会自动跳到 `/world` 工作区。

### 4.3 第一次使用

全新数据库没有任何用户，此时**任何人都可以编辑**（见「首次安装例外」）。

- 想试一下：直接在工作区里建卡片。也可以先灌一份演示数据：

  ```bash
  .venv/bin/python manage.py seed_demo
  ```

- 想正式用：创建一个管理员账号（第一个账号会成为世界的所有者）：

  ```bash
  .venv/bin/python manage.py createsuperuser
  ```

  之后注册就需要**邀请码**了，在工作区的「协作」面板里生成。

### 4.4 常用命令

| 命令 | 作用 |
| --- | --- |
| `.venv/bin/python manage.py runserver 8000` | 启动开发服务器 |
| `.venv/bin/python manage.py test` | 跑测试 |
| `.venv/bin/python manage.py migrate` | 应用数据库迁移 |
| `.venv/bin/python manage.py createsuperuser` | 建管理员 |
| `.venv/bin/python manage.py seed_demo` | 灌入一份演示世界 |
| `.venv/bin/python manage.py import_timeline` | 把 `timeline` 的经典时间轴数据迁进 `world` |
| `.venv/bin/python manage.py import_legacy_json <data.json>` | 导入旧格式时间轴 JSON（`{view, items}`） |
| `.venv/bin/python manage.py otp_enroll` | 为后台账号录入两步验证设备 |
| `.venv/bin/python manage.py collectstatic` | 收集静态资源（部署用） |

---

## 5. 项目结构

```
worldbuilding_timeline/
├── manage.py                     Django 命令行入口
├── requirements.txt              依赖（Django + gunicorn + django-otp）
├── worldbuilding_timeline/       项目配置
│   ├── settings.py               全局配置（环境变量驱动）
│   └── urls.py                   总路由表
├── apps/                         本项目自己的六个 Django 应用（app label 取末段名，如 apps.world → world）
│   ├── world/                    【主应用】世界 / 类型 / 属性 / 成员 / 治理 + 工作区与只读站点视图
│   │   ├── models/               数据模型（世界 / 类型 / 属性 / 成员 / 邀请 / 治理）
│   │   ├── views/                工作区的全部 JSON 接口 + 站点页
│   │   ├── services/             领域服务（发布 / 图谱 / 地图桥 / 导入导出 / 名字识别 / 净化）
│   │   ├── urls.py               /api/world/* 路由
│   │   ├── middleware.py         世界作用域、读/写守门人
│   │   ├── permissions.py        谁能编辑这个世界
│   │   ├── normalize.py          属性值清洗、公式求值、引用解析
│   │   ├── calendarview.py       月视图与月相
│   │   ├── relationship.py       关系树独立页
│   │   ├── mapdoc.py             /map 地图独立页
│   │   ├── classic.py            经典时间轴适配层
│   │   ├── site_views.py         只读站点（/s/<slug>/）
│   │   └── relations.py          关系树词表（纯数据）
│   ├── documents/                【应用】文档树：文档 / 卡片 / 纪元 / 日历 / 时间线事件 / 版本 / 在线状态
│   ├── graph/                    【应用】关系树：TreeVariant / TreeNode / TreeEdge
│   ├── maps/                     【应用】经典地图：MapLayer / MapMarker
│   ├── publishing/               【应用】发布记录：PublishLog
│   └── timeline/                 【次应用】经典横向时间轴
│       ├── models.py             TimelineItem / TimelineView
│       ├── views.py              /legacy 页面 + /api/* 接口
│       └── normalize.py          字段规范化
├── templates/                    服务端渲染的页面模板
├── static/                       前端资源（CSS / JS / SVG / 图标）
│   ├── terminal.css              当前权威的视觉语言（最后加载）
│   ├── minimal.css / apple.css   被 terminal.css 覆盖的底层皮肤
│   ├── experience.css / .js      全链路体验增强层
│   └── workspace.js              工作区的主脚本
├── docs/                         设计文档目录
├── deploy/                       部署样例（nginx / systemd / 环境变量）
└── media/                        上传的地图底图等（运行时生成）
```

---

## 6. 文档索引

| 文档 | 内容 |
| --- | --- |
| [README.md](README.md) | 你正在读的这份：简介、路线图、快速开始、功能地图 |
| [TECHNO.md](TECHNO.md) | **技术架构**：请求全流程、分层、数据模型、关键算法、部署 |
| [PLAN.md](PLAN.md) | **计划书**：仓库里有什么、下一步怎么走（路线图 0.5.2 → 0.8.0） |

---

## 7. 一句话记住它的设计

- **卡片是原子，文档是容器，世界是边界。**
- **结构靠三样东西长出来**：类型（是什么）、时间（什么时候）、关系（和谁）。
- **写永远公开，改需要权限**；数据用 SQLite 落在一个文件里，随时可备份。
