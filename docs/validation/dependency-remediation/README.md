# 依赖安全治理验证记录

关联 [Issue #25](https://github.com/tans/jack-cases/issues/25)。基于 upstream main `4b3c0d8`（已含 #10、#14、#17），验证日期：2026-10-21。本项没有合并、部署或修改生产数据。

## 审计与版本

完整证据：[修改前](audit-before.json)、[修改后](audit-after.json)、[仅生产依赖](audit-production.json)。修改前 13 项（7 high、6 moderate）；修改后完整依赖及生产依赖均为 0 项。没有 audit ignore、排除依赖或禁用审计。`npm ci` 可重建锁定版本。

| 依赖 | 原锁定版本 | 新锁定版本 | 修复依据 |
| --- | --- | --- | --- |
| sharp | 0.33.5 | 0.35.5 | [libvips](https://github.com/advisories/GHSA-f88m-g3jw-g9cj)、[libheif](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c)、[librsvg](https://github.com/advisories/GHSA-wq5f-xc86-pv6w)；最后一项修复下限为 0.35.5 |
| drizzle-orm | 0.39.3 | 0.45.4 | [SQL 标识符转义公告](https://github.com/drizzle-team/drizzle-orm/security/advisories/GHSA-gpj5-g38j-94v9)，修复下限 0.45.2 |
| better-sqlite3 | 11.10.0 | 13.0.3 | [12.0.0 开始将 Node 24 纳入构建矩阵](https://github.com/WiseLibs/better-sqlite3/releases/tag/v12.0.0)；[13.0.0 改用 N-API 并随包提供预编译](https://github.com/WiseLibs/better-sqlite3/releases/tag/v13.0.0)，采用稳定补丁 [13.0.3](https://github.com/WiseLibs/better-sqlite3/releases/tag/v13.0.3)，其 engines 为 Node >=22 |
| tailwindcss | 3.4.19 | 4.3.3 | 3 系列的 [braces 栈耗尽](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) 当时无补丁；迁移 4 系列移除该路径及旧 [selector-parser](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) |
| @tailwindcss/postcss | 无 | 4.3.3 | 按[官方迁移指南](https://tailwindcss.com/docs/upgrade-guide)更换 PostCSS 插件并去掉不再需要的 autoprefixer |
| drizzle-kit | 0.31.11 | 0.31.11 | 提高声明下限，保留当前稳定系列；没有采用 audit 推荐的 0.18.1 降级 |
| @esbuild-kit/core-utils → esbuild | 0.18.20 | 0.25.12 | 定向 override 至修复 [开发服务器跨站读取](https://github.com/advisories/GHSA-67mh-4wv8-2f99) 的版本；保留加载器本身，验证同步/异步转换和 CLI |

Vite 仍为 6.4.4、PostCSS 仍为 8.5.30，没有顺带升级其他业务库。Sharp 实际加载的原生库为 libvips 8.18.7、libheif 1.23.5、librsvg 2.63.2。原 11.10.0 包没有声明 engines，不能据此推定 Node 24 受支持；本项采用正式支持新运行时的发布线，并通过真实 native 回归验证。

## 回归命令与边界

本地 macOS / Node v24.18.0 / npm 11.16.0：

```sh
npm ci
npm run typecheck
npm run build
npm test
npm audit --json
npm audit --omit=dev --json
```

全部通过；44 项测试、0 失败、0 跳过。`npm ls esbuild` 确认无 invalid 依赖，Drizzle Kit 与其旧加载器使用 0.25.12，tsx 使用原有 0.28.2。定向 override 经 fresh install 及实际加载器验证，并非仅修改告警数字。

新增 `tests/native-dependencies.test.mjs` 使用有时限的隔离子进程/临时目录，覆盖：

- 原生 better-sqlite3：WAL、100 行事务写入、回滚、checkpoint、显式 close、自然退出；另一进程重开检查数据与 integrity_check。必须退出码 0 且 signal 为 null，SIGSEGV 会使测试失败。
- 编译后的真实 API：空库启动、注册、持久化需求和文件、停止后重启、旧 API Key 读取原数据。两个服务进程仅在测试主动停止时允许 SIGTERM，提前崩溃及 SIGSEGV 均失败。
- 真实 multipart 图片上传：3000×1500 PNG 经 `/media` 转为 2400×1200 WebP；`/files` 保持 PNG 尺寸。重启后下载并完全解码为像素；未认证访问被拒绝。
- 使用实际 schema、含 TypeScript 注解的隔离配置运行 Drizzle CLI generate / migrate / migrate，检查 `requirement_files` 及唯一迁移记录；不生成或写入仓库/生产迁移目录。
- Drizzle Kit 传递加载器的同步和异步 TypeScript 转换、执行结果及 source map。

既有医疗集成测试仍保留 better-sqlite3 夹具，覆盖历史表结构迁移、旧正文/图片关联保留、资料授权、版本、审核与上传拒绝。不复制 #20 的夹具替换；不把替换测试数据库当作运行时兼容修复。

## 页面兼容

按 Tailwind 官方指南保留原 palette、shadow-sm、默认边框、placeholder、outline 语义与现有配置。原来无效的 `h-18` 在 v4 会变为 72px，移除它以保持原头部自动高度；显式补充 `md:leading-none` 保留 v3 响应式字号覆盖后的首页标题行高。没有业务/视觉重构。

通过 CUA 验证 1440×1000 和 390×844：医疗首页、管理员需求编辑、Markdown 预览、保存后刷新、案例材料列表与真实文件下载。窄屏 document scrollWidth 为 390，没有新增横向溢出。使用合成测试账号/资料与隔离 SQLite/上传目录。

基线为当前 main 的同一组件源码，使用原锁定 Tailwind 3.4.19 生成 CSS 并以独立静态预览渲染；升级后使用本分支 Vite。基线仅重建 CSS，不混入其他 PR 的源码。对照文件如下（案例使用视口截图，首页与编辑使用全页截图）：

| 页面 | 桌面 | 窄屏 |
| --- | --- | --- |
| 医疗首页 | [前](before-home-desktop.png) / [后](after-home-desktop.png) | [前](before-home-mobile.png) / [后](after-home-mobile.png) |
| 需求编辑 | [前](before-edit-desktop.png) / [后](after-edit-desktop.png) | [前](before-edit-mobile.png) / [后](after-edit-mobile.png) |
| 案例资料 | [前](before-case-desktop.png) / [后](after-case-desktop.png) | [前](before-case-mobile.png) / [后](after-case-mobile.png) |

[像素差异记录](visual-comparison.json)：首页两种尺寸完全一致；编辑页几乎一致；案例页有低于 0.08% 色彩通道变化（差值 >10/255），布局与内容完整。另存[窄屏保存结果](saved-edit-mobile.png)。机械设计扫描仅提示原页面已有的两处视觉规则，不在依赖治理中重构。

## 限制与协作

- 0 项是本次 npm 公告数据库及当前锁文件的结果，不代表未来没有漏洞，也不覆盖系统全局 libvips 或系统镜像。
- Tailwind 4 的官方浏览器基线为 Safari 16.4+、Chrome 111+、Firefox 128+；本项只实测当前 CUA 浏览器，没有声称覆盖旧浏览器。
- 根目录声明 Node >=22（better-sqlite3 13 的要求），现有生产与 PR CI 使用 Node 24。macOS 本地通过不能替代 Linux CI，本 PR 的既有 Ubuntu/Node 24 工作流继续运行同一组真实测试。
- @esbuild-kit 加载器已被上游标记 deprecated，稳定 Drizzle Kit 仍传递依赖它；待其移除后可删除本项 scoped override。当前没有剩余 npm audit 告警。
- #10 已在 main，无须额外合并顺序；本项只在其已有首页行处理两个 Tailwind 兼容类，不重带 #10 提交。#20/#23 未合并时各自独立；本项不改其分页/迁移配置与既有医疗夹具。
- 临时 API 3020、Vite 5190、基线预览 5192 均已停止；其他会话与生产服务未停止。
