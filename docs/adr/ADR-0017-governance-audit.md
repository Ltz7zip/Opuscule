# ADR-0017：世界治理审计事件

- Status: Accepted
- Date: 2026-10-20
- Related: ADR-0016（软删除/所有权转移）

## 背景

世界治理动作（转移、删除、成员/邀请变更）会改变权限和可见性。没有记录时无法回答“谁在何时把世界给了谁/删了什么”。
CardRevision 只覆盖卡片内容，不覆盖世界治理。

## 决策

1. `WorldAuditEvent`：world、actor(SET_NULL)、target_user(SET_NULL)、action、metadata、created_at。
2. 只记录治理动作：world created/settings/publish/unpublish/delete/restore、member added/role/removed、ownership transferred、invite created/revoked/accepted。
3. 事件通过服务端 `log_world_event()` 写；不接受客户端直接创建/修改。
4. `GET /api/worlds/<slug>/audit/` 仅 owner 可读，最近 100 条；editor/viewer 403。
5. metadata 不写 invite token/密码等秘密；只写 role/id/from/to 等最小字段。
6. 软删除保留事件；hard delete 的未来流程可以级联清除，需单独合规决策。

## 后果

- owner 能追溯治理动作；成员/邀请/删除/转移不再“无记录”。
- 事件是可改的数据库行，不是不可篡改审计；没有 IP/UA、签名、导出、保留期限。
- 审计查询只有 owner，editor 不能自查；后续可开放只读给 editor。
- 新增治理路径必须调用 log helper，否则会产生审计缺口。

## 验证

- 33 tests：创建/成员/删除/恢复事件；owner 200、editor 403。
- 浏览器：真实所有权转移 + 活动记录 dialog。
