# 案例 URL 状态验收

基线：upstream/main `4b3c0d8`（已含 #10、#14、#17）。Issue：tans/jack-cases#26。

隔离环境：`catalog-url-state.localhost:5191`，API 3021；SQLite、上传目录位于 `/tmp/catalog-url-state-qa`。55 条合成案例，不使用生产数据。工具：cua_repl 的 in-app browser，桌面默认视口及 390×844 窄屏。

已实际验证：
- `/?q=临期&industry=医药流通&categoryId=qa-category&difficulty=easy&implementationStatus=completed&view=list` 直达和刷新恢复对应控件。
- 列表打开案例，详情“返回案例”恢复以上条件；外部 returnTo 返回 `/`。
- 视图前进后退，搜索后前进后退；确认延迟输入不会重新覆盖恢复的记录。输入后立即切换视图仍保留输入。
- 不存在的分类/行业/标签，以及非法难度、实现状态、页码、页大小、排序和视图值按默认状态规范化。
- 窄屏“清除筛选”同步 URL，随后切换网格视图，URL 为 `/?view=grid`。
- typecheck、build、npm test（44 项）通过。

截图：[桌面](desktop-url-restore.jpg)、[窄屏](mobile-clear-view.jpg)。

未完成的依赖：#20 仍开放，当前 main 没有服务端分页、全量搜索和 facets。此时 page/pageSize/sort 只完成解析和组合，尚未接入分页控件；“筛选→翻页→详情→返回”的端到端验收必须在 #20 合并后完成。本 PR 保持草稿，不能视为全部验收完成。不得把 #20 的后端实现复制进本 PR。
