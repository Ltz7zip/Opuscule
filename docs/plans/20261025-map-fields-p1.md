# 地图字段接口 P1（2026-10-25）

## 目标

给 WebGL 着色器（P2）提供一份**不可变、可缓存**的仿真字段载荷；服务的 PNG
渲染器仍是唯一权威输出，字段只是同一批数据的二进制投影。

## 变更

- `apps/maps/terrain_web.py`
  - 新增 `TerrainFields` + `build_fields()`：把仿真网格构建从渲染中拆出，不再跑
    输出像素循环；`generate_terrain(fields=...)` 可复用已构建的字段。
  - `TerrainResult.fields`：渲染时顺带把字段交给调用方，避免二次构建。
  - `_detail_texture_cached()`：与 seed 无关的细节纹理改为进程内构建一次
    （单次 1024 渲染约省 0.9s）。
  - golden：4 组 `(seed, 尺寸, 风格)` 的 PNG sha256 在重构前后完全一致。
- `apps/maps/terrain_fields.py`（新）
  - `OTF1` 容器：`b"OTF1" | uint32 header_len | header JSON | blocks`。
  - 量化：`surface` u16（全范围），`to_land` u8（0–64 截断，量子 0.251），
    `shade/moisture/uplift/forest` u8（各自 min/scale），`detail` u8，
    `elev_lut`/`ocean_lut` RGB8。
  - `gzip.compress(..., mtime=0)`：同一输入字节级确定，ETag 稳定。
  - 磁盘缓存 `MEDIA_ROOT/terrain-fields/<slug>-<token>.otf.gz`，临时文件 +
    `os.replace` 原子落盘。
- `apps/maps/views.py`
  - `GET /api/worlds/<slug>/map/fields/`：读权限与地图一致；无 Terrain Web
    元数据返回 404；冷请求现场构建并写缓存。
  - owner 生成地形时顺带写缓存（`result.fields`），新世界无需再等第二次构建。
  - `GET .../map/` 新增 `fields_version`（= 缓存 token），客户端据此拼
    `?v=` 以获得 immutable 缓存。
- `frontend/src/types.ts` / `api.ts`：`fields_version` 与 `fetchMapFields()`
  契约（P2 使用，当前无调用点）。

## 契约

Token：`1-<seed>-<style>-<width>x<height>`，`FIELDS_VERSION` 变更时整体失效。

响应头：

- `Content-Type: application/octet-stream`
- `Content-Encoding: gzip`（客户端接受时；否则服务端解压）
- `ETag: "<sha256 前 32 位>"`，支持 `If-None-Match` → 304
- `X-Fields-Version: <token>`
- `?v=<token>` 命中 → `Cache-Control: public, max-age=31536000, immutable`；
  未带或不匹配 → `no-cache`
- 会话中间件会追加 `Vary: Cookie`，共享缓存命中率受限（见限制）

解码：`value = block.min + q / levels * (levels * block.scale)`，其中
`levels = 65535`（u16）/`255`（u8）。

## 实测（wuhai：seed 31415 / topographic / 2048×1280）

| 项目 | 数值 |
|---|---|
| 模拟网格 | 700 × 438（306,600 胞元） |
| 原始载荷 | 2.14 MiB |
| gzip 传输 | 1.27 MiB |
| 冷请求（构建+打包+压缩） | 9.94 s（每 token 加锁，不重复构建） |
| 热请求（磁盘缓存） | 9.5 ms |
| 量化误差 surface / shade / moisture / uplift / forest | 1.7e-5 / 0.0015 / 0.0011 / 0.0036 / 0.0019 |
| 量化误差 to_land | 0.125（截断 0–64） |

## 验证

- 后端 127 tests 通过（新增 `TerrainFieldsPackTests` 3 条、`MapFieldsApiTests` 9 条）。
- HTTP 冒烟：冷 9.94s / 热 9.5ms；容器块长度自洽；gzip、ETag、immutable 头正确。
- 前端 `tsc --noEmit` 通过。

## 已知限制 / 下一步

1. 2048 世界冷构建仍同步占 CPU 约 10s；2C2G 上会阻塞一个 worker。后续要么在
   owner 生成时预填（已做，仅覆盖新世界），要么把构建搬进队列。
2. 1.27 MiB gzip 偏大：`surface` 的 16-bit 量化本身高熵，Paeth 行滤波只从
   555 KiB 降到 436 KiB；真正的削减要靠 LOD（按 zoom 供 512/700 两档）或瓦片化。
3. `Vary: Cookie` 来自会话中间件，公开世界的字段无法被共享 CDN 复用；如需，
   可拆一个不触达 session 的公开分支。
4. 旧世界的第一次 `/map/fields` 会现场构建；可加管理命令或后台预填。已对同一
   `(world, token)` 加进程内锁，避免并发访客重复跑十秒仿真，但单个冷请求仍会占满
   一个 worker；如果要收紧，可限制为 owner/editor 触发。
5. 前端已在 P2 接入该接口（见 `20261025-map-shader-p2.md`）；PNG 仍作首屏与回退。
