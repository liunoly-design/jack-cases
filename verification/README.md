# 退回修改闭环验证

关联问题：https://github.com/tans/jack-cases/issues/13

## 接口约定

- `GET /api/requirements` 与 `GET /api/requirements/:id` 新增 `reviews`（最新在前，保留 reviewerId、decision、notes、createdAt）和 `submissions`（独立重新提交的 actorId 与时间）。原字段保持兼容。
- `PATCH /api/requirements/:id` 保存字段及可选 `tagIds` / `mediaIds`，**不改变审核状态**。省略关系字段时保留原关系，传空数组则清空。可保留已有停用标签，不允许添加新的停用标签。图片只能引用需求作者的私有图片。
- `POST /api/requirements/:id/resubmit` 是独立动作，仅允许 `rejected → submitted`，在同一事务记录 `resubmit` 审计动作。请求体不负责保存内容。
- `POST /api/requirements/:id/review` 仅允许 `submitted → rejected | published`。退回原因 `notes` 去除首尾空白后必填，最多 3000 字符。条件状态更新、审核记录与案例写入在同一事务，重复请求返回 409。
- 详情、保存和重提仅作者及现有 manager 角色（reviewer/admin/super_admin）可操作；审核仅 manager。其他学员返回 404，学员审核返回 403，学员修改/重提已发布需求返回 409。

## 自动回归

执行 `npm ci`、`npm run typecheck`、`npm run build`、`npm test`。

`tests/resubmission.test.mjs` 启动真实 HTTP 服务，使用随机空闲端口、临时 SQLite 和临时上传目录，退出清理。覆盖：具体原因及列表/详情可见、仅空白原因拒绝、作者 Markdown 和全部现有业务字段修改、清空 nullable 字段、图片/标签更换与省略保留、停用标签保留及禁止新增、非法/重复图片引用、越权、保存不提交、并发重提、同秒多轮退回原因排序、管理员代重提、并发审核、已发布学生禁止编辑/重提、仅创建一个案例、审核和重提历史保留、图片/标签复制到案例。

## 浏览器实测

通过 cua_repl，使用独立本地测试数据和上传目录 `/tmp/jack-resubmission-ui`，API 3015、Web 5185；未使用已有环境数据库。

桌面 1280×900 和窄屏 390×844：管理员填写具体退回原因；作者查看原因和审核记录；进入编辑表单确认原有图片/标签；窄屏修改 Markdown 后保存，仍为“已退回”；点击独立“重新提交审核”，变为“待审核”，重提按钮消失且历史保留；管理员查看修改后的内容、历史及图片并审核发布；发布后无再次审核按钮。截图为合成测试需求，无真实用户数据。

- [桌面退回原因和历史](desktop-returned.png)
- [窄屏退回原因和操作](mobile-returned.png)
- [窄屏编辑表单](mobile-edit.png)
- [窄屏独立重提后的状态与历史](mobile-resubmitted.png)
- [桌面重新审核](desktop-review.png)
- [窄屏重新审核](mobile-review.png)
- [桌面发布后记录](desktop-published.png)
- [窄屏发布后记录](mobile-published.png)

## 与 PR #10 的合并说明

本分支基于 upstream main `06acd89` 独立实现。制作时 #10 尚未合并，本 PR 不包含其整包医疗平台或文件系统功能，无依赖即可验证。

两者修改了 `apps/api/src/server.ts` 的需求接口，以及 `apps/web/src/pages.tsx` 的提交/需求页面，预计存在文本冲突。建议先合并 #10，再将本 PR 更新到新 main 并解决冲突；不自动合并。

冲突解决必须同时保留本 PR 的状态守卫、独立 resubmit 动作及历史返回，以及 #10 对 `content` 的 Markdown 原文处理、材料字段校验/关系写入/上传与作者编辑控件。PATCH 对未提供材料字段应保持原值，不得以主分支尚无材料的表单覆盖或清空 #10 的材料关系。本 PR 的 reqSchema.partial 与字段分离应以 #10 扩展后的 schema 为基础合并，不能用本分支旧 schema 覆盖材料字段。合并后需再回归材料保留路径。
