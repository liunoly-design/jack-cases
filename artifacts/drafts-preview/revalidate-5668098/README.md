# 合入 #33 / #39 后的 PR #40 复验

主分支基线：`5668098f98d8c1fbb2e1a083b443b173fef473f4`。仅在原分支解决冲突，未合并或部署。

## 保留的上游能力

- `Shell` 继续使用 `MobileNavigation`，表单继续使用 `Tabs` 的关联面板和方向键/Home/End。
- 文件和图片上传保留可聚焦的透明 input、`upload-control` 焦点样式及键盘激活；上传期间用 fieldset 锁定会覆盖附件集合的编辑操作。
- 所有原有查询反馈、重试和 `errorMessage` 中文处理保留，`/me` 仍仅将 401 视为未登录。
- `AccountQueries` 继续按用户 ID + 角色创建私有 QueryClient，卸载时取消/清理，公共分类缓存继续分离。DraftUser.Provider 嵌在该账号隔离层内，不替换或绕过它。

## 验证结果

`npm run typecheck`、`npm run build`、`npm test` 全通过：**85 项通过、0 失败**。包含上游无障碍与反馈/取消/缓存隔离测试，以及本项草稿和发布 payload 测试。构建仍仅有既有的大 chunk 提示。

cua_repl 使用新 SQLite `/tmp/jack-drafts12-feedback/test.db`、上传目录 `/tmp/jack-drafts12-feedback/files`，独立 `drafts-preview.localhost:5192` / API 3022，未访问其他会话数据。桌面与 390×844 视口：

1. End / ArrowRight 切到手动表单；Enter 激活上传，成功上传 `public-guide.md`。
2. Alpha 保存长 Markdown 和附件草稿；内部导航出现离开确认；再次进入可恢复标题、正文和附件元数据。
3. 退出 Alpha 登录 Beta，查询完成后需求列表、草稿和资料库为空；切回 Alpha 仍可恢复本人草稿。私有 QueryClient 取消与迟到响应不能回填的回归测试同步通过。
4. 390 窄屏 MobileNavigation 可 Enter 打开、Escape 收起；表单 API 校验失败显示“填写内容有误，请检查后重试。”并保留草稿，修正后真实提交成功，重新进入不再提示恢复旧草稿。
5. 管理员原始需求与公开字段分离；只批准 `approved.md`，预览不出现 `private.txt` 或私有原文，Markdown 中 script 不执行。私有保存、离开、恢复管理草稿后批准选择保持。
6. 实际发布后普通账号读取的标题、摘要、publicContent 与预览逐字匹配；只含 approved.md；未批准文件 403、跨用户原文 404、学员改已发布正文 409；编号/版本保持 MED-REQ-0001 / v1.0。详见 `api-result.json`。

截图：`desktop-draft-leave.png`、`desktop-draft-restored.png`、`mobile-alpha-restored.png`、`mobile-beta-private-empty.png`、`mobile-beta-library-empty.png`、`mobile-error-draft-preserved.png`；公开内容请优先查看实际视口截图 `desktop-published-body-viewport.png`、`mobile-published-body-viewport.png` 和 `mobile-approved-material-viewport.png`。全页截图同时保留用于表单结构审阅。
