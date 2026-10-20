# ADR-0016：世界软删除与所有权转移

- Status: Accepted
- Date: 2026-10-20
- Related: ADR-0008（公开 IA）、P0.7/P0.8（成员/邀请）

## 背景

世界是长期内容容器。直接 DELETE 世界会级联删掉 Card/Collection/邀请，误删不可逆；
owner 也需要能把维护责任交给别人，而不是永久绑定创建者。

## 决策

1. `World.deleted_at` 软删除；默认 manager 过滤 `deleted_at`，`World.all_objects` 用于回收站/恢复。
2. owner `DELETE /api/worlds/<slug>/` 写 `deleted_at`，撤销未用邀请；不物理删除内容。
3. `GET /api/worlds/trash/` 返回 owner 的已删除世界；`POST /restore/` 恢复；同名活动世界冲突 400。
4. 所有公开/工作区/成员/邀请入口使用默认 manager，所以删除后 404/不出现；访问已删除世界的邀请返回 410。
5. 所有权转移：owner 选择现有成员；事务内原 owner → editor，目标 → owner；不允许多 owner/自助转移给非成员。
6. 删除/转移都 owner-only；editor/viewer 403。

## 后果

- 误删可恢复；但需要保留期限/清理策略，当前没有。
- 主查询自动过滤 deleted，降低遗漏；但 `all_objects` 是逃生舱，任何新查询必须明确是否需要删除数据。
- 内容/邀请不物理清理，隐私/合规删除仍需后续硬删流程。
- 没有审计日志；转移/删除不可追溯（后续补）。
- slug 唯一约束包含软删记录，恢复/重建需要 all_objects 检查。

## 验证

- 32 tests：transfer、delete 隐藏、trash、restore、owner-only。
- 浏览器：软删测试世界 → 回收站 → 恢复 → 回到工作区。
