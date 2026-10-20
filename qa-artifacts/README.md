# 案例 URL 状态验收

Issue：tans/jack-cases#26；PR：tans/jack-cases#27。

## 基线与组合

- 正式分支基于 upstream/main `b957480`，保留 #10、#14、#17、#16、#32；不包含 #20 的提交或后端实现。
- `catalog-results.tsx` 是前端协议桥接：每次发送完整筛选和显式 page/pageSize/sort。收到分页 envelope 后完全使用服务端 items/total，使用 `/cases/facets` 的全量行业与总量；不再本地过滤分页结果。旧 main 的 array 响应仅保留原有列表行为，不显示尚不可用的分页控件。
- 分页依赖 #20。临时 checkout：`../11-catalog-url-state-integration`，组合 #20 `5f156ecaadc36358184028758ce0f5665409d2e6` 与本项及 main `b957480`，本地验收快照 `fdfb79c9ad934455b422b570f578c1a0c5b48eba`。未推送该组合，也未合并任何上游 PR。
- 临时冲突已实际解决：Catalog/CaseDetail 使用本项 URL 驱动实现；Submit/重提保持 main；其余分页保持 #20。为同时保留 #16 的审核历史，在临时组合的分页需求列表中附带审核历史；这些后端集成调整不在 #27 中。
- 正式 PR 仍 target main，可独立编译和测试。完整分页使用时先集成 #20；双方都修改 Catalog，后续整合应保留本项 Catalog/CaseDetail、#20 的其他分页页面与后端。上述快照为已验证的具体组合依据。

## 隔离环境

`catalog-url-state.localhost:5191`，API 3021；SQLite、上传目录在 `/tmp/catalog-url-state-qa`。260 条合成案例，全部属于“医药流通”，含库存分类和测试标签；不使用生产数据。工具：cua_repl in-app browser，桌面默认视口及 390×844 窄屏。

## 实际浏览器验证

1. `/?q=医药流通&industry=医药流通&categoryId=qa-category&difficulty=easy&implementationStatus=completed&tagIds=qa-tag&view=list` 直达并刷新，控件与结果一致。关键词只匹配行业字段的记录也出现，服务端总量为 260（超过 200 条）。
2. 下一页 → 第二页案例详情 → “返回案例” → 刷新：保持全部条件及第 2 页，20 条/页时为 2/13 页。
3. 每页改成 50，重置第一页；排序改成 oldest，仍为第一页；下一页再打开详情返回并刷新，恢复 2/6 页、50、oldest。最新 main 组合再次验证此路径。
4. 浏览器后退到 1/6 页、前进到 2/6 页，URL 和分页控件一致；关键词输入/视图的前进后退也正常。旧输入草稿不会覆盖恢复的记录，输入后立即切视图仍保留关键词。
5. `page=999999&pageSize=50&sort=oldest` 自动规范到末页 6/6；非法 page/pageSize/sort/view、未知分类/行业/标签按默认清理，示例结果为 `/?q=医药流通&view=grid`。
6. 390px 窄屏清除筛选，回第一页、保留每页 50 和 oldest；切网格后 URL 为 `/?view=grid&pageSize=50&sort=oldest`。控件和分页可用，无横向溢出。
7. 详情外部 returnTo 被拒绝，默认“返回案例”指向 `/`；直接访问详情也有默认返回。

## 自动检查

- 正式分支：typecheck、build、npm test（50 项）通过。
- 临时集成：typecheck、build、npm test（58 项，含 #20 服务端分页、#16 重提和 #32 原生依赖回归）通过。
- 远端曾因既有管理员测试夹具的 better-sqlite3 在 Node 24 Linux 清理崩溃而失败；该夹具改用 node:sqlite，生产驱动不变。修复后远端 CI 已通过，最终以 PR 最新 head 的检查为准。

截图：[桌面分页恢复](desktop-pagination-restored.jpg)、[窄屏清除和分页](mobile-pagination-clear.jpg)、[早期桌面筛选恢复](desktop-url-restore.jpg)。验收服务结束后停止，仅保留本地证据。
