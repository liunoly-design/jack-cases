# 中文状态反馈与账号缓存隔离验收

关联问题：tans/jack-cases#30。最终基线：a1d856e（含医疗 MD/附件、角色保护、重提、依赖/配置迁移、分页、封面与图文详情）。

## 改动与回归

- HttpError 保留 HTTP status，错误正文仅允许预先定义的业务错误映射；未知 4xx、5xx、代理 HTML、JSON 解析失败与网络错误均转成安全中文。未知 Error 不直接回显；只有本地 FeedbackError 显示受控提示。
- `/me` 仅 401 返回未登录；500/网络错误显示“暂时无法确认登录状态”和重试，保留 URL。查询传递 AbortSignal。
- 每次账号会话拥有独立 QueryClient；退出、会话错误、账号或角色变化时卸载私有区域，取消并清空旧客户端，包括不活跃的需求详情、文件库和密钥。只有分类与 active 标签共享独立缓存，管理页面同步失效相关缓存。
- 列表、详情、分类、标签、资料库、角色保护统计等区域显示加载与可重试失败；成功后才显示空结果。统一用户可见审核/用户/资料状态的中文；复制入口统一捕获剪贴板失败。
- 4 个行为回归分别覆盖 HTTP/登录态分类与脱敏、真实 QueryClient 失败后重试至空数组、取消后迟到响应不可恢复私有缓存且下一账号缓存隔离、剪贴板权限拒绝。

验证：`npm run typecheck`、`npm run build`、`npm test` 均通过，80 项测试成功（无跳过）。测试均使用隔离的 SQLite/上传目录；未访问正在运行的原数据库。

## 浏览器验收

使用 cua_repl 操作 IAB，桌面 1216×720 与模拟视口 390×844，独立域名 `consistent-feedback.localhost:15393`。后端为临时数据库，两个仅用于验收的 A/B 账号；前端与 API 使用本项独立端口。故障代理只存在于 `/tmp`，不进入产品：按路径注入 12 秒延迟或 500；复制验收在文档加载时将 clipboard.writeText 注入 NotAllowedError。IAB 不可靠地强制 Permissions-Policy，故不将该响应头单独视为权限失败证据。正常复制也已观察到“已复制”。未使用 Playwright CLI，未修改用户系统剪贴板权限。

| 场景 | 结果与证据 |
| --- | --- |
| 需求延迟 | 显示正在载入与禁用翻页，没有空记录；desktop-loading.png / mobile-loading.png |
| 需求 500 | 中文失败、重试、分页状态“暂时无法读取列表”，无空记录；desktop-error.png / mobile-error.png |
| 故障解除后重试 | 键盘 Enter 激活重试，恢复 A 私有需求；desktop-private-a.png |
| A 退出→B 登录（同一 SPA 会话） | A 正文和附件不再可见，B 只有成功空记录；desktop-account-b-empty.png / mobile-account-b-empty.png |
| /me 500 与重试 | 显示会话确认失败而非登录/退出页，恢复后留在 /mine；desktop-me-error.png / mobile-me-error.png |
| 复制权限失败 | 不显示成功，提示允许剪贴板或手动复制；desktop-copy-denied.png / mobile-copy-denied.png |

未对所有浏览器引擎/真实移动设备做矩阵测试。取消/迟到回填和不活跃附件缓存清除由真实 TanStack QueryClient 行为测试补充验证。截图仅含合成业务资料，不含 API Key。

## 关联 PR 与临时集成

- #10、#16 已合并：保留 Markdown、附件权限、退回编辑/重提/审核历史。无需依赖未合并功能。
- #20 已合并并在最新 main 同步最终版本：usePage 共享安全错误/重试，传递 AbortSignal；空记录只在成功后展示。保留分页、完整数据筛选、用户角色保护统计和审核历史。
- #24 未合并时，在独立 `/tmp/consistent-feedback-integration` 临时集成 #20 head 297fc3a、#24 head 1e04bb2 与本项反馈/缓存边界。解决 API 路由注册/会话密钥夹具及前端列表与密钥入口交叉，保留 scoped key 的权限/期限/加密/撤销逻辑。typecheck、build、完整 73 项测试全部通过。临时注册列表 import 必须位于 runtime 签名密钥验证之后，避免无效配置先打开数据库。
- 最终分支仅含本项；未携带 #24 的后端/密钥模型实现或临时集成提交。#24 后续合并仍可能涉及 pages.tsx 的 Keys/Submit/AdminSkill，同步时保留其权限/期限逻辑，同时使用 copyText/errorMessage 和账号私有 QueryClient。参考上述已验证集成方式。

Impeccable detector 已运行：2 个提示均位于既有标签样式（标签页底边与彩色标签灰色文字），本项未做视觉重构。

- #22/#35 已合并：保留封面、图片排序、图文详情布局、私有详情路由与最新迁移夹具；统一详情审核状态及图片上传错误，重验详情复制失败。

## 同步 #27 / #24 后复验

2026-10-21：同步最新 main（#27 URL 状态与 #24 密钥安全均已合并），原临时集成记录仅描述先前验证，不再存在未合并依赖。保留 useCatalogState/useCatalogResults、受控 usePage、安全 catalogReturnPath 和详情 backTo，以及密钥的权限、期限、加密、撤销与只读限制。新增行业统计请求使用 AbortSignal、中文失败和可重试反馈。

在同一独立隔离环境用 25 条合成公开案例复验：文本/行业筛选、list 视图、oldest 排序、第2页进入详情再返回，桌面与390窄屏均恢复原URL和第2/2页；行业统计500后重试成功同样保留URL与页码，无错误空结果。截图 desktop-url-restored.png / mobile-url-restored.png。typecheck、build及完整79项测试通过，包括原URL状态和密钥安全回归。

已额外同步 #38 测试环境隔离夹具（a1d856e），保留其空 env 文件和迁移配置回归。最终完整检查针对该主分支基线重跑。

最终 a1d856e 基线：typecheck / build / npm test 全部通过，80 项测试成功、0 失败、0 跳过。
