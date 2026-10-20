# 管理权限层级回归记录

关联 Issue： https://github.com/tans/jack-cases/issues/11
基线：upstream/main `06acd89`。独立分支 `codex/protect-admin-hierarchy`，不包含 PR #10 提交。

## 服务端

先在旧实现运行新增真实 HTTP 测试，复现 admin 禁用 super_admin、同级启用、未知目标成功，以及审计失败未回滚用户状态。

修复后 `npm run typecheck`、`npm test`（25/25）、`npm run build`、`git diff --check` 均通过。
测试使用操作系统临时目录、临时 SQLite、独立上传路径和动态端口；完成后清理，不打开应用数据库。

覆盖四种角色禁用矩阵、管理员同级与超管启停拒绝、禁止普通管理员修改角色、自身访问保护、超级管理员正常管理、最后 active 超管禁用/降级拒绝、并发互相禁用、未知用户 404、低角色正常启停及失败时用户/成功审计保持不变。审计插入触发器故障验证事务回滚。

SQLite immediate 事务在取得写锁后重新校验操作者，随后检查目标与最后超级管理员约束，原子写用户和审计。未新增授予 super_admin 的接口能力。

## 界面（cua_repl，真实 API）

独立 API 3012、Vite 5182、数据库 `/tmp/jack-admin-hierarchy-ui/qa.db`。测试数据均为 example.test 虚构账户。

- 1280×900：admin 自身、同级、super_admin 的按钮禁用且展示原因，普通管理员无角色下拉；学员禁用后显示 disabled / 启用。
- super_admin：其他管理员可降级为审核员，重载后保持；最后一名 active 超管角色和状态控件均禁用。
- 390×844：表格在卡片内横向滚动，角色保持可读；键盘聚焦操作按钮会滚动进入操作列。
- 截图：admin-hierarchy-desktop.png、admin-hierarchy-super-desktop.png、admin-hierarchy-narrow.png、admin-hierarchy-narrow-actions.png。
- localhost 多端口共用 Cookie 曾导致一次 Unauthorized，改用隔离主机地址重新登录后降级操作通过。未清除其他会话 Cookie。验证后恢复浏览器视口。

Impeccable 检测只报告 pages.tsx 原有第 31/35 行的颜色/边框警告，不属于用户管理改动，未做无关视觉调整。未做实体手机测试。

## 与 PR #10 的关系

两者独立基于 main，可单独验证。PR #10 的用户管理函数与 App 路由为未修改上下文；本 PR 改动 AdminUsers 与调用参数。PR #10 的 server.ts 改动不涉及 users PATCH。建议先审阅合并权限修复，再合并 #10；若 #10 先合并，则将本分支更新到 main 并重跑三项检查，保留本 PR 的 users PATCH、AdminUsers 及 user 参数传递。未经授权不执行合并或部署。Issue 留待合并关闭。
