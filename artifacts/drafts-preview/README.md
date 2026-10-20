# 长 Markdown 草稿与公开预览验收

最新主分支 #33 / #39 合入后的 **85 项检查与桌面/390 复验**见 [revalidate-5668098/README.md](revalidate-5668098/README.md)。下文保留首次实现过程中的验证记录。

关联问题：https://github.com/tans/jack-cases/issues/29

本项在独立 checkout 与 `codex/drafts-publish-preview` 分支实现。验收 API 使用 `/tmp/jack-drafts-12/test.db` 和 `/tmp/jack-drafts-12/files`，浏览器地址 `drafts-preview.localhost:5192` / API 3022；没有访问其他会话或生产数据库。

## 行为和边界

- 新建、独立学员编辑、管理表单使用当前用户 ID + 作用域 + 需求 ID 的草稿键。只持久化白名单字段和上传成功的图片/文件元数据；不保存密钥、会话或 File 对象。
- 先读取已有草稿，再允许自动写入；已有草稿须恢复或丢弃，初始空值不会覆盖它。支持手动保存，存储读取/配额错误有明确反馈。
- 成功提交/发布清理草稿；失败保留输入和已上传附件。管理员只保存私有原始需求时，尚未提交的公开编辑仍保留为草稿。
- Data Router + useBlocker 处理内部导航和真实后退；页面内确认框支持键盘、Escape 和焦点管理。beforeunload 处理刷新/关闭，是否展示警告由浏览器决定。
- 私有正文与拟公开标题、摘要、Markdown/需求提示词、搭建提示词分离；公开字段不从原文预填，不承诺自动脱敏。预览和发布复用 publicationPayload，仅展示批准文件/图片；未批准的原始封面不会成为预览封面。Markdown 继续 skipHtml。
- 本机草稿不请求 API，因此不改变业务编号或版本。真实修改沿用后端版本、关联与权限规则；学员不能编辑已发布需求。保留重提、分页、封面选择与排序。
- 草稿仅属于当前浏览器和设备，不跨设备同步。清除浏览器存储会移除草稿；尚未上传完成的文件需要重新选择。

## 自动检查

最终基线 `a1d856e`（含 #24 / #27 / #38）：`npm run typecheck`、`npm run build`、`npm test` 均通过，80 项测试通过、0 失败。新增 `tests/drafts.test.mjs` 覆盖跨账号/跨记录/跨作用域隔离、长 Markdown、白名单、损坏存储与配额错误、上传成功元数据、私有保存与公开发布 payload 差异、批准图片顺序。

现有集成测试继续覆盖 shareConsent、publicContent 快照、稳定编号/版本、关联权限、发布后禁止学员修改、退回/重新提交、分页、迁移、原生 SQLite/Sharp 和角色保护。构建保留 Vite 的大于 500 KB chunk 提示，未更改分包策略。

## 浏览器实测（cua_repl）

使用内嵌浏览器与原生 Chrome；桌面和 390 px 响应式视口，所有数据为隔离验收样例。原生 Chrome 截图只裁去工具栏/DevTools，未改变应用内容；原图留在本机 `/tmp/jack-drafts12-raw`。

| 路径/场景 | 结果 | 证据 |
| --- | --- | --- |
| 新建长文保存并离开、再次进入恢复 | 内容完整恢复，初始空表单不覆盖草稿 | mobile-restored.png |
| API 校验失败后修正并重试 | 输入和草稿保留；成功后重新进入没有旧草稿提示 | mobile-failed-preserved.png |
| Alice 草稿后退出、登录 Bob | Bob 表单为空且没有 Alice 的恢复入口 | mobile-other-user.png |
| 学员独立编辑、保存本机草稿、取消、恢复 | 原始服务端正文/版本不变；真正保存后 v1.0 → v1.1，编号 MED-REQ-0002 不变，草稿清理 | desktop-back-warning.png |
| 内部导航 / 表单关闭 / 浏览器后退 | 出现页面内确认；取消后仍在编辑页，确认后可恢复 | desktop-leave-dialog.png、mobile-leave-dialog.png |
| Chrome 刷新 / 关闭标签 | 分别出现 Reload site / Leave site 标准警告，取消后保留输入 | desktop-refresh-warning.png |
| 人工填写公开字段，批准 1/2 文件 | 预览只包含公开字段和 public-guide.md；HTML 未执行；发布后 API 快照逐字匹配 | desktop-public-preview.png、mobile-public-preview-final.png、desktop-public-result.png |
| 未授权公开 / 已发布学员修改 / 未批准附件 | 发布按钮禁用；后两项实际 API 分别 409 / 403 | mobile-approved-gallery.png |
| 封面与图片草稿兼容 | 两张成功上传图片、第二张封面恢复；本机保存仍 v1.1；批准首图时，公开预览只有首图，不显示未批准的原封面 | desktop-cover-draft-restored.png、desktop-approved-gallery.png、mobile-approved-gallery.png |
| 全部主要路由 | 官网页、登录/注册、案例库/详情、我的需求/详情/编辑、提交/Agent 技能、管理全部 8 页及 404 均可达；Data Router 无运行时错误 | routes.json；新图文表单与分页在主分支同步后复验 |

## 主分支同步与关联

已同步主分支的 #10、#14、#17、#16、#32、#23、#20、#35、#22 、#27、#24 与 #38；这些提交不作为本 PR 新增提交。没有未合并 PR 依赖。#10 已合并，因此本项直接基于其 MD/文件能力；#22 图集与 #16 重提已适配。本项不改密钥接口与会话授权逻辑；Submit 技能入口保留 cookie-only、普通有效非 legacy 密钥过滤、权限/期限提示和带 scope 的技能文本，不回退其他安全改动。

安全基线同步后复验：cookie 会话下已迁移 legacy 密钥不进入可复制技能文本，仍展示只读权限/有效期提示；手动表单可保存本机草稿并真实提交，成功清理后返回三条需求的分页图文列表（desktop-final-security-baseline.png）。后端 AES/密钥权限与 cookie-only 校验保持上游实现，新增 #38 隔离 fixture 全部保留。
