# 迁移配置合并后的集成验证

基准：upstream main `38984c2`（已含 #16、#23、#32）。独立 checkout，不操作开发/生产数据。

## 实际复现

主分支的两个测试使用低于 32 字符的 SESSION_SECRET，而 #23 已增加稳定密钥长度校验。运行：

```sh
node --test --test-name-pattern='built API restarts|returned requirement' --test-timeout=20000 tests/native-dependencies.test.mjs tests/resubmission.test.mjs
```

修复前 0/2 通过，两个 API 子进程均因 `Set SESSION_SECRET to a stable random value of at least 32 characters` 退出。修复仅补足这两处测试密钥的长度，运行时代码、依赖版本、原生驱动和全部断言保留。

## 验证

- npm ci：通过，审计 0 vulnerabilities。
- npm run typecheck / npm run build / npm test：通过，54/54。
- 根目录与 API workspace 的 db:generate 均报告 No schema changes。
- 保留 #32 全部 4 项回归：真实 better-sqlite3 13 事务与退出、编译后 API 重启和 Sharp 图像解码、Drizzle CLI 真实建库/重复迁移、旧 TS loader 的 esbuild 同步/异步兼容。
- CUA 浏览器在隔离临时 SQLite/上传目录启动新版 API 与 Tailwind 4 前端，桌面 1440×1000、窄屏 390×844 实际操作：登录 → 查看退回原因 → 窄屏编辑正文并保存 → 状态仍为已退回 → 独立重新提交 → 待审核；桌面详情确认编号 MED-REQ-0004 不变、版本 v1.1、退回记录和重提记录均保留。
- 临时端口独立分配，未占用/停止其他会话服务；未合并、部署或运行生产脚本。

## 截图

- [桌面退回状态](desktop-returned.jpg)
- [窄屏编辑](mobile-edit.jpg)
- [保存后仍已退回](mobile-saved-returned.jpg)
- [窄屏重新提交成功](mobile-resubmitted.jpg)
- [桌面编号、版本及审核历史](desktop-resubmission-history.jpg)
