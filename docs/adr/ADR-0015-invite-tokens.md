# ADR-0015：一次性邀请令牌

- Status: Accepted
- Date: 2026-10-20
- Related: ADR-0008（公开 IA）、P0.7 成员管理

## 背景

P0.7 只能把已注册用户名加为成员；邀请未注册的人需要可分享链接。邀请是权限边界：
链接泄漏、重复使用、过期时间和撤销都要明确，不能把 `WorldMembership` 的写接口直接公开。

## 决策

1. `WorldInvite` 是独立资源：world、role(editor/viewer)、token、expires_at、max_uses、used_count、revoked_at、created_by。
2. 默认 **一次性**（max_uses=1）、**7 天**过期；owner 可提前撤销。
3. token 是 `secrets.token_urlsafe(32)`，只在 owner 的邀请列表里返回；公开信息接口只返回世界/角色/有效性。
4. 接受必须登录；接受时在事务内 `select_for_update` 检查有效性、已存在成员、创建 membership、递增 used_count。
5. 已使用/过期/撤销返回 410；未知 token 404；未登录 401/403。
6. 登录/注册支持安全 `next`（只允许站内绝对路径），避免开放重定向。
7. 本切片不做邮件发送、多次邀请、审批、所有权转移；这些是后续功能，不假装已做。

## 后果

- owner 能分享链接给未注册用户；链接一次失效，降低泄漏风险。
- token 明文存库；只有 owner 能读列表。生产可进一步改为哈希存储/只显示前缀，需要迁移。
- 没有发送/提醒，需要手动复制链接；没有审计日志。
- 后续可扩展 max_uses/expiry/email，但不改变 accept 的事务边界。

## 验证

- 29 tests：创建/撤销、接受一次、复用 410、过期 410、未登录拒绝、editor 不能创建。
- 浏览器：匿名邀请页 → 登录回跳 → 接受 → 工作区；used_count=1/1。
