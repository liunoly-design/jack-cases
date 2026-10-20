# 案例 URL 状态验收

Issue：tans/jack-cases#26；PR：tans/jack-cases#27。

## 基线与范围

最终基于 upstream/main `239c588`，包含已合并的 #10、#14、#17、#16、#32、#23 、#20、#22 和 #35。已解决 Catalog 冲突并保留其他分页页面、重新提交流程、迁移配置和原生依赖测试。

本项只添加 URL 状态解析、组合、导航恢复及共享分页组件的可选受控模式。案例列表始终发送完整筛选和显式 page/pageSize/sort，使用服务端 items/total 和 `/cases/facets`；不对当前页再次过滤，不回退到前 200 条。不修改搜索后端。其他列表继续使用原有非受控分页。

#20 合并前，曾在独立临时 checkout 组合其 head 与本项验证，组合快照 `f3728f7eb633dafdbb3f71e413dec3706c67fddd`。#20 合并后已将验收服务切换到正式分支，并重新完成下列验收；不再依赖临时组合或等待其他 PR。

## 隔离环境

`catalog-url-state.localhost:5191`，API 3021；SQLite、上传目录在 `/tmp/catalog-url-state-qa`，使用至少 32 字符的独立测试会话密钥。260 条合成案例含库存分类和测试标签，不使用生产数据。工具：cua_repl in-app browser，桌面默认视口及 390×844 窄屏；包含鼠标选择和键盘激活分页控件。

## 实际浏览器验证

1. `/?q=医药流通&industry=医药流通&categoryId=qa-category&difficulty=easy&implementationStatus=completed&tagIds=qa-tag&view=list` 直达并刷新，控件与结果一致。只在行业字段命中关键词的记录也出现，服务端总量为 260（超过 200 条）。
2. 下一页 → 第二页案例详情 → “返回案例” → 刷新：保持条件及第 2 页，20 条/页时为 2/13 页。最终正式分支再验一次。
3. 每页改成 50，回第一页；排序改成 oldest，仍为第一页；下一页再打开详情返回并刷新，恢复 2/6 页、50、oldest。
4. 浏览器后退到 1/6 页、前进到 2/6 页，URL 和分页控件一致。搜索输入/视图的历史恢复正常；旧输入草稿不会重新覆盖恢复的记录，输入后立即切换视图仍保留关键词。
5. `page=999999&pageSize=50&sort=oldest` 自动规范到末页 6/6；非法 page/pageSize/sort/view、未知分类/行业/标签按默认清理，示例结果为 `/?q=医药流通&view=grid`。
6. 390px 窄屏清除筛选回第一页，保留每页 50 和 oldest；切网格后 URL 为 `/?view=grid&pageSize=50&sort=oldest`。控件和分页可用，无横向溢出。
7. 详情外部 returnTo 被拒绝，默认返回 `/`；直接访问详情也有默认返回。额外检查“我的需求”非受控分页正常（0 条、1/1 页）。

8. 与 #22 整合后，带两张图片的第二页案例：列表使用显式指定的第二张封面，画廊缩略图仍按第一张、第二张排序，点击第一张可正常切换。新详情面包屑安全返回第二页，刷新及前进后退仍保留 URL 条件；窄屏清除与网格切换再次通过。

## 自动检查

最终正式分支：typecheck、build、npm test（68 项）通过，覆盖 URL 解析组合、#20 分页、#16 重提、#23 迁移和 #32 原生依赖。

远端早期失败来自旧管理员夹具在 Node 24 Linux 清理 SQLite 原生对象，以及三个既有夹具不符合新 runtime 的测试密钥长度。管理员夹具改用 Node SQLite；三个密钥修复已采用后续上游合入的版本。未降低运行时校验，生产驱动不变。最终以 PR 最新 head 的 CI 为准。

截图：[封面详情与返回](detail-cover-return.jpg)、[桌面分页恢复](desktop-pagination-restored.jpg)、[窄屏清除和分页](mobile-pagination-clear.jpg)。验收服务结束后停止，保留本地证据。
