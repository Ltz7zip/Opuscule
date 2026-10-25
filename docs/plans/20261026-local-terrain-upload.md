# 本地生成地形 + 服务器只存成品

日期：2026-10-26
状态：实施中

## 背景

地形生成是单线程纯 Python：2048×1280 约 12.8 s、峰值 225 MB（本机实测）。
在 2 vCPU / 2 GB 的机器上同步生成会占满一个 worker 30–40 s。
目标：把生成放到操作者本机，服务器只负责「下发配方 + 保存成品」。

## 契约

### 令牌

`TerrainUploadToken`（`apps/maps/models.py`）：

| 字段 | 说明 |
|---|---|
| `world` | 外键，**一世界一卡**，不能跨世界使用 |
| `prefix` | 明文前 12 字符，用于索引查找 |
| `token_hash` | 完整令牌的 SHA-256，库里不存明文 |
| `label` | 人类可读备注（「我的 MacBook」） |
| `created_at` / `last_used_at` / `revoked_at` / `expires_at` | 生命周期 |

令牌格式：`wtk_` + `secrets.token_urlsafe(32)`，明文只在创建时返回一次。

### `GET /api/worlds/<slug>/map/terrain/`

需要 Bearer 令牌，或该世界 owner 的登录会话。

返回当前配方：

```json
{ "seed": 31415, "style": "topographic", "width": 2048, "height": 1280,
  "version": "<fields token>", "generated_at": "..." }
```

### `PUT /api/worlds/<slug>/map/terrain/`

`multipart/form-data`，Bearer 令牌（或 owner 会话）：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `seed` / `style` / `width` / `height` | 表单 | 是 | 与现有生成接口同样的取值约束 |
| `if_version` | 表单 | 否 | 客户端读到的 version；不一致返回 409 |
| `meta` | JSON 字符串 | 否 | 标签、海平面、尺寸等非二进制元数据 |
| `background` | 文件 | 是 | PNG，≤ 8 MB，IHDR 尺寸必须等于 width×height |
| `mesh` | 文件 | 否 | 3D 预览用的高度网格（二进制） |
| `texture` | 文件 | 否 | 3D 预览贴图（PNG） |
| `heightmap` | 文件 | 否 | 旧字段兼容 |

服务器只做：校验 → 写 `world.map_background` → 写 `world.terrain_web`
（二进制转 base64，与同步生成路径字段一致）→ 记审计事件 `terrain.uploaded`
→ 返回 `background_url` / `version`。

**不重算 fields**：`/map/fields/` 首次请求会照旧生成并缓存（实测 85 ms）。

### 本地命令

```bash
cd backend
python manage.py terrain_push \
  --server http://127.0.0.1:8000 \
  --token wtk_xxx --world wuhai \
  [--seed 31415] [--style topographic] [--resolution 2048x1280] [--force]
```

不传 `--seed/--style/--resolution` 时沿用服务器当前配方；`--force` 跳过 `if_version`。

## 安全与速度的取舍

| 决策 | 取值 | 理由 |
|---|---|---|
| 令牌范围 | 一世界一卡 | 泄露影响面最小，实现成本低 |
| 明文存储 | 否（只存 SHA-256） | 数据库泄露不等于令牌泄露 |
| 校验 | `hmac.compare_digest` | 防时序侧信道 |
| 覆盖保护 | `if_version` 乐观锁 | 避免并发覆盖别人的成品 |
| 文件校验 | PNG 头 + 尺寸 + 上限 | 不引入 Pillow 依赖 |
| 传输 | 单次 multipart（约 3 MB） | 比"建 job → 上传"少一次往返，本地脚本更快 |
| 上传内容 | PNG + mesh + texture | 服务器零生成 CPU；fields 留给服务器按需算 |

## 测试点

1. 无令牌 → 401
2. 别的世界的令牌 → 403
3. 正常上传 → 200，`terrain_web` 的 seed/style 更新、背景文件写入、审计事件存在
4. `if_version` 不匹配 → 409
5. PNG 头部损坏 / 尺寸不符 → 400
6. `GET` 返回当前配方，令牌与 owner 会话都可用

## 落地记录

已实现（2026-10-26）：

| 文件 | 内容 |
|---|---|
| `backend/apps/maps/models.py` | `TerrainUploadToken`（world/prefix/token_hash/label/last_used_at/revoked_at/expires_at） |
| `backend/apps/maps/terrain_tokens.py` | `mint_token` / `authenticate_token`（前缀索引 + `compare_digest`） |
| `backend/apps/maps/views.py` | `TerrainUploadView`（GET 配方 / PUT 上传 + 校验 + 审计） |
| `backend/config/urls.py` | `api/worlds/<slug>/map/terrain/` |
| `backend/apps/maps/management/commands/terrain_token.py` | 签发 / 列出 / 吊销 |
| `backend/apps/maps/management/commands/terrain_push.py` | 本地生成 + multipart 上传 |
| 迁移 | `maps/0004_terrainuploadtoken`、`worlds/0011_alter_...action` |

实测（本机 → 本机 dev server）：

```
$ manage.py terrain_token --world wuhai --label local-mac
wtk_omJwJl3P…（只显示一次）

$ manage.py terrain_push --server http://127.0.0.1:8000 --token wtk_… --world wuhai \
    --resolution 2048x1280
生成 topographic 2048x1280 seed=31415 …
本地生成完成：12.9s
上传完成：…/terrain-web-31415-topographic.png?v=d8a63f64
real 13.3s      # 其中服务器耗时 < 100ms
```

服务器侧只有：PNG 头校验、写 2.1 MB 文件、base64 两个附件（mesh 218 KB / texture 787 KB）、
一条 `terrain.uploaded` 审计。**不再跑 12.8 s 的生成**。

测试：`apps.maps.tests.TerrainUploadTokenTests` 7 条（401/403/200/409/400/GET/吊销），
后端 134 条全绿。

## 已知限制

1. `fields` 仍由服务器按需生成（缓存 key = seed/style/width/height）。若以后允许不同机器上传，
   建议把 key 换成 mesh 的哈希，避免"配方相同、网格不同"的缓存错配。
2. 令牌目前不绑定 IP、不限速；一世界一卡已经把影响面压到最小。
3. 上传走 multipart（约 3 MB），未来可换分片/断点续传。
