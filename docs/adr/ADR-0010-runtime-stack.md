# ADR-0010: 运行时与依赖

- Status: **Accepted**（Django 6.1 + React + Tiptap 已定；DRF/6.2 细节以第 1 周 spike 为准）
- Date: 2026-10-20
- Deciders: 项目 owner、后端 / 前端 / 工程效率 / 代码审查
- Related: 设计稿 §4.4、§10.2；ADR-0011（许可证）
- Supersedes: v0.1 的 Django 5.2 LTS + DRF 3.16 组合

## Context

用户已定：**React + Tiptap + Django 6.1**。旧站实际是 Django 6.1.1 + SQLite；新站要上 Postgres、DRF、OpenAPI、SSR 公开面与 React 工作区。

需要解决四个冲突：

1. 设计稿 v0.1 写的是 Django 5.2 LTS + DRF 3.16；DRF 3.16 不支持 Django 6.1。
2. Django 6.1 不是 LTS；主流支持窗口到 2027-04 左右，P3 上线窗口很紧。
3. Tiptap core 是 MIT，但 Pro UI / AI / 协作平台是付费；不能把“MIT 编辑器”误解成“所有 Tiptap 功能都 MIT”。
4. Redis 7.4+ 的许可变化、MinIO 的 AGPL、BlockNote 旧内容的 MPL notice，都需要在依赖清单里显式处理。

## Decision

### D1. 后端版本

- **Django 6.1.x**；Python 3.14.6（当前宿主；3.13 可用时优先；新建独立 venv，不复用根 `.venv`）。
- **DRF 3.18.x**（第 1 周以实际 PyPI/兼容矩阵验证；若 3.18 不可用，选当前支持 Django 6.1 的最新 3.x，绝不使用 3.16）。
- `drf-spectacular` 生成 OpenAPI；CI 做 breaking-change diff。
- Postgres 17；`psycopg` 使用当前支持 6.1 的 3.x。
- 队列：P0 先沿用 Celery + outbox；`django.tasks` 只做 spike，不在 P0 同时维护两套队列。若 spike 证明可替代轻任务，再开 ADR。
- 缓存在 P0 不做多级；Redis 7.2（BSD）或 Valkey 8；不使用 7.4+ 的 RSAL/SSPL 版本，除非许可证评审通过。

### D2. 前端版本

- React 19 + TypeScript + Vite；Node/pnpm 版本在 `.nvmrc` / `packageManager` 锁定。
- Tiptap 3 core + 自建 UI；**只白名单 MIT 包**，不依赖 Pro UI / AI / Collaboration 平台。
- `packages/editor` 只放 Tiptap 扩展与菜单；`packages/tools` 放 11 工具的五类宿主；`packages/ui` 放设计系统。
- 公开站 SSR 不加载工作区工具包；工具只读页单独分包。

### D3. Django 6.2 LTS 升级

- 第 1 周记录 6.1 的支持窗口与 6.2 的预计发布日期。
- **P3 切换前**完成 6.2 LTS 升级；如果 6.2 延迟，P3 不得晚于 6.1 的安全支持边界，并在发布说明中写明。
- 升级任务进 P3 关键路径，不当作“上线后再做”。

### D4. 依赖与许可证

- 生成 SBOM；CI 跑 license scan；阻断与项目许可证不兼容的依赖。
- Tiptap core MIT；Pro 功能默认不买。若未来需要，单独 ADR。
- BlockNote 旧内容迁移保留 MPL-2.0 notice；不把 BlockNote 源文件改许可证。
- Redis 7.2/Valkey 8；MinIO 仅 dev/小规模，生产 S3 兼容存储需复核 AGPL。
- 所有版本 pin 在 lockfile；CI 使用 `--frozen-lockfile`。

### D5. 验证顺序

1. 第 1 周：Django 6.1.x + DRF 3.18.x + drf-spectacular + psycopg 的最小项目；OpenAPI 生成；迁移空跑。
2. 第 1 周：React 19 + Tiptap 3 + Vite 构建；一个自定义节点 + 一个工具页壳。
3. 第 2 周：Postgres 17 + Redis 7.2/Valkey + S3 兼容存储的 compose；CI 绿。
4. P0 结束前：6.2 LTS 升级评估；许可证清单签字。

## Consequences

- 6.1 的支持窗口是项目风险，不是版本洁癖；6.2 升级必须进排期。
- DRF 3.18 的可用性必须在第 1 周证实；如果不可用，整个 API 层要换版本，不能拖到 P1。
- 不使用 Tiptap Pro UI 意味着 BlockNote 式 UI 要自建；这与设计稿的“Tiptap + 自建 UI”一致。
- Redis/MinIO 的许可证选择会影响部署成本；开发环境可以用 MinIO，生产必须复核。
- `django.tasks` 不进入 P0；避免队列双写。

## Validation / Acceptance

1. CI 在 Django 6.1.x + DRF 3.18.x 下绿；OpenAPI 生成成功；`makemigrations --check` 通过。
2. 一个 Tiptap 自定义节点 + 一个工具页 + 一个公开只读页端到端跑通。
3. `pip-audit` / `npm audit` / license scan 无未处置高危；SBOM 产出。
4. 6.2 升级评估有结论（日期、阻塞项、回滚）。
5. 生产 compose 不含 MinIO 作为默认存储；Redis 版本不是 7.4+，除非有书面许可评审。

## Alternatives considered

- **Django 5.2 LTS + DRF 3.16**：更稳，但用户已定 6.1；且旧站已是 6.1，回退收益小。拒绝。
- **Django 6.1 + DRF 3.16**：不受支持；拒绝。
- **Tiptap Pro UI**：能更快接近 BlockNote，但违背 MIT 约束与预算；拒绝。
- **Redis 7.4+ / MinIO 生产默认**：许可证风险；暂不作为默认。

## Open questions

- 已验证（2026-10-20）：DRF 3.18.3 + Django 6.1.2 可用；后续按兼容矩阵升级。
- 6.2 LTS 的发布日期与升级窗口。
- `django.tasks` 是否在 P1 替代 Celery 的轻任务；默认不替代。
- 生产对象存储选型（R2/B2/自建）与 MinIO 许可边界。

## References

- 设计稿 v0.2：`.design/current/index.html` §4.4、§10.2
- ADR-0011（许可证与依赖）
- Django 6.1 / DRF 兼容矩阵（第 1 周记录到 `docs/spikes/`）
