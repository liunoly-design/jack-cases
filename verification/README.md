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

## 上游同步结果

已在同一分支合并 upstream main `4b3c0d8`（包含已合并的 #10、#14、#17），逐处解决 server.ts 和 pages.tsx 冲突。当前 PR diff 仅保留退回修改闭环的增量。

保留医疗文案、requirementCode/contentVersion、Markdown 预览/原文和 AI 文档下载、Materials/MaterialList/fileIds、逐文件审核、publicContent，以及 #17 的用户角色和最后超级管理员保护。作者完整编辑页替换了 #10 的正文/材料内联编辑，保留其全部功能并支持其他业务字段、图片和标签。编辑时不发送旧 contentVersion，让正文变更按主分支逻辑自动递增版本；保存及重提均不修改业务编号。

PATCH 保留未提供的 fileIds，显式提交时替换材料关联。作者可保留管理员已经合法关联到自己需求的材料，但不得关联其他用户尚未关联的文件。新增真实多文件上传回归，验证这一边界。

同步后重新运行 typecheck、build、test 和 diff 检查；共 41 项测试通过，包括 #10 的全部材料/旧数据兼容集成测试、#17 的角色层级与最后超级管理员测试。新增回归同时验证编号不变、正文自动递增版本、metadata/fileIds 保存与 resubmit 不递增版本、材料省略保留/显式补充、管理员资料保留、非法材料禁止关联、审批只公开选中文件、案例继承编号版本与 publicContent、AI 下载不泄漏私有正文，原始附件仍受权限保护。

截图已全部更新为合并后的医疗平台。浏览器使用独立主机 `http://resubmission.localhost:5185`（本机无法绑定未配置的 127.0.0.5，改用独立 .localhost 主机隔离 Cookie），API 3015，隔离 SQLite `/tmp/jack-resubmission-ui/updated.db` 和目录 `/tmp/jack-resubmission-ui/updated-uploads`。未清理其他 session Cookie，也未停止其他 session 服务。

桌面和 390px 窄屏验证：管理员退回 → 作者看到具体原因与 MED-REQ-0001/v1.0 → 编辑正文、预览 Markdown、选择新材料（保留原始资料和管理员资料）→ 保存仍已退回，版本为 v1.1 → 独立重提后仍 v1.1、三份资料均保留 → 管理员看到新版正文、材料和历史，逐文件只批准补充资料并填写脱敏公开正文 → 发布成功，历史、编号和版本保留且无重复审核按钮。
