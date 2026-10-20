# ADR-0011: 许可证与依赖边界

- Status: **Accepted**（依赖策略已定；项目 LICENSE 的版权主体待 owner 确认）
- Date: 2026-10-20
- Deciders: 项目 owner、后端 / 前端 / 代码审查
- Related: 设计稿 §0.2、§4.4、§10.2；ADR-0010
- Supersedes: 无

## Context

目标是把 Opuscule 自有代码以 **MIT** 开源，同时使用成熟的编辑器与基础设施。实际依赖并不是清一色 MIT：

- Tiptap core 是 MIT；Pro UI / AI / Collaboration 平台是付费功能。
- BlockNote 核心是 **MPL-2.0**，不是 MIT；旧站内容使用 BlockNote JSON，迁移时会出现 MPL notice 义务。
- Redis 7.4+ 的许可证发生变化；7.2 仍是 BSD。
- MinIO 是 AGPL-3.0；把它作为生产默认存储会把 AGPL 边界带进部署。
- 字体、图标、截图、示例内容可能各自有许可证；代码许可证不覆盖这些资产。

因此“MIT 开源”需要区分：**自有代码的许可证**、**依赖的许可证**、**资产/内容的许可证**。三者不能混为一谈。

## Decision

### D1. 自有代码

- 项目自有代码的目标许可证是 **MIT**。
- `LICENSE` 文件在 P0 前由 owner 确认版权主体后添加；本 ADR 不代替法律意见。
- 不把 BlockNote/Tiptap 的源文件复制进自有代码目录；需要修改时，修改文件按其原许可证处理。

### D2. 编辑器依赖

- **Tiptap core 只用 MIT 包**；不购买/不依赖 Pro UI、AI Toolkit、Collaboration、Review、Compare 等付费功能。
- **BlockNote 只作为旧内容迁移的参照/依赖边界**：旧 `blocks_doc` 是数据，不要求新项目整体改 MPL；若复制/修改 BlockNote 源文件，该文件保持 MPL-2.0，并在 `NOTICE`/`LICENSES.md` 记录。
- 不把 BlockNote 内核改许可证为 MIT；也不把 Tiptap Pro 代码打包进 MIT 发行物。
- 旧 BlockNote 内容的 MPL notice 进迁移产物与第三方声明；不把旧编辑器产物当作“纯 MIT 资产”。

### D3. 基础设施

- Redis：优先 **7.2（BSD）** 或 **Valkey 8**；不使用 7.4+ 的 RSAL/SSPL 版本，除非有书面许可证评审。
- MinIO：只用于 dev/小规模；生产默认用 S3 兼容的对象存储，并对服务商条款做评审；不把 AGPL 当成“随便用”。
- Postgres / Django / DRF / React / Vite / Tiptap core 的 BSD/MIT 许可证进入 SBOM。
- 字体/图标/截图：只使用可再分发许可证的资产；来源与许可证进 `ASSETS.md`。

### D4. 供应链门禁

- CI 生成 SBOM（CycloneDX 或 SPDX），跑 license scan；对 copyleft/AGPL/未知许可证给出显式结论。
- 依赖升级 PR 必须更新 SBOM；新增依赖必须说明许可证与用途。
- `LICENSES.md` 记录直接依赖、传递依赖中的非 MIT/BSD 项、资产来源与义务。
- 发布物包含 `LICENSE`、`NOTICE`、`LICENSES.md`；不把未确认的资产打进公开包。

## Consequences

- 自有代码可以保持 MIT；MPL 依赖不会自动“传染”整个项目，但修改 BlockNote 文件会产生 MPL 义务。
- 不使用 Tiptap Pro UI 意味着 BlockNote 式 UI 要自建；这与 ADR-0007/0010 的“自建 UI”一致。
- Redis 7.2/Valkey 与生产对象存储的选择会影响部署成本；开发环境可以用 MinIO，但生产不能默认。
- 需要维护 SBOM 与第三方声明；这是一项持续成本，不是一次性文件。
- 项目 LICENSE 的版权主体未定前，不能宣称“已经 MIT 发布”。

## Validation / Acceptance

1. CI 产出 SBOM；license scan 无未处置的 copyleft/AGPL/未知许可证。
2. `LICENSES.md` 列出 BlockNote MPL、Tiptap core MIT、Redis 版本、MinIO 边界、字体/图标来源。
3. 发布包包含 `LICENSE`、`NOTICE`、`LICENSES.md`；`LICENSE` 的版权主体已由 owner 确认。
4. 仓库内没有把 Tiptap Pro / BlockNote 源文件复制进自有代码目录。
5. 旧 BlockNote 内容迁移产物带 MPL notice；不把旧编辑器产物标成 MIT。

## Alternatives considered

- **把 BlockNote 直接改 MIT**：违反 MPL；拒绝。
- **买 Tiptap Pro 以快速获得 UI**：能加速，但违背 MIT 约束与预算；拒绝，除非未来单独 ADR。
- **生产默认 MinIO**：部署简单，但 AGPL 边界未评审；拒绝作为默认。
- **不写 LICENSE，只在 README 说 MIT**：法律上不完整；拒绝。

## Open questions

- 项目 `LICENSE` 的版权主体（个人/组织）与年份。
- 字体、图标、示例世界内容的许可证清单。
- 生产对象存储的服务商条款。
- 是否需要为旧 BlockNote 内容单独生成 `NOTICE` 文件。

## References

- 设计稿 v0.2：`.design/current/index.html` §0.2、§4.4、§10.2
- ADR-0010（运行时）
