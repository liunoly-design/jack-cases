# 列表分页

适用于当前 main 的 `GET /api/cases`、`/requirements`、`/media`、`/users`。

- 不传 `page`、`pageSize`：保持 Agent 的数组响应，最多返回 200 条；需要读取完整数据的 Agent 应切换显式分页。
- 传任一参数：返回 `{items,total,page,pageSize}`，默认第 1 页、每页 20 条。`page` 为 1–1,000,000 的十进制正整数，`pageSize` 为 1–100；重复、空值、小数、指数形式或超限值均返回 400。
- `sort=newest|oldest`（默认 newest）：按 `createdAt`、`id` 同向排序，时间相同时顺序稳定。超出最后页返回空 items 和真实 total。
- total、items 在同一读事务内产生；并发新增/删除后，后续请求可能改变 offset 分页的页边界，客户端可刷新列表。
- 非法筛选、重复标量参数、未知参数返回 400。值通过 SQL 参数绑定，搜索按字面包含匹配（`%`、`_` 不作为通配符）。

## 案例筛选

`scope=published|all`，默认 published；all 需管理权限。`q` 搜索标题、简介、行业。`categoryId` 包含所有层级子分类；`industry` 匹配行业中的一个分隔项（支持 `、,，/`）；`difficulty=easy|medium|hard`、`implementationStatus=pending|building|completed|verified`、`status=published|draft|archived`。

`tagIds=id1,id2` 最多 12 个不同 ID，保持 UI 多标签“任一命中”语义，与其他条件按 AND 组合。`GET /api/cases/facets?scope=published` 返回权限内全量行业选项、总数；管理端可传 scope=all。

## 需求筛选与权限

`scope=mine|all`，默认 mine；all 必须通过管理权限校验，count、分页、筛选和 facets 共用该权限范围。支持 `q`（标题、内容、预期效果、行业、部门和分类）、`categoryId`（含子分类）、`category`（列表中显示的分类名，兼容正文中的“业务分类：…”）、`industry`、`difficulty`、`implementationStatus`、`tagIds`、`status=submitted|published|rejected|draft`、`consent=authorized|private`。

`GET /api/requirements/facets?scope=mine|all` 返回权限范围内全量行业/分类选项及 SQL 聚合概况，供需求管理页保留原有分类快捷筛选与概况交互。正文历史分类和多行业通过确定性 SQLite 标量函数匹配，记录仍由 SQL 筛选/聚合，不把全表读入应用层。

## UI 与验证

案例商城、我的需求、需求管理、案例管理、媒体资源、用户管理均使用显式分页，提供首页/上页/下页/末页、每页条数与排序。筛选、排序或页大小改变时回到第一页；记录减少时自动回退到可用的最后页。需求图片和需求/案例标签只按本页 ID 批量读取。

`npm test` 使用临时目录、临时 SQLite 和动态端口验证 205 条案例/媒体/同一用户需求、208 用户、200 条之外筛选、稳定排序、总数、权限隔离和非法参数，不依赖正在运行的服务。

## 与 #10 的集成

本 PR 基于 `06acd89` 的 main，未包含 #10 的医疗平台或 files 功能。#10 修改相同的 `server.ts`、`pages.tsx`，存在文本冲突。建议先合并 #10，再将本 PR 的分页模式适配到医疗界面；保留医疗字段、文案、权限和附件交互。若先合并本 PR，则 #10 合并时应保留 `registerLists`、分页 hook 和服务端筛选，并复验。

#10 新增 `/files` 当前未覆盖；合并后应使用 `paginationShape`、`pagination`、`pageResponse`，在既有权限过滤后 SQL count / limit / offset，并接通对应 UI。两个合并顺序均需重新运行 typecheck/build/test，补 files 大于 200 条、权限和筛选验证，以及医疗端桌面/窄屏关键路径验收。此文档不代表 #10 已通过集成验证。
