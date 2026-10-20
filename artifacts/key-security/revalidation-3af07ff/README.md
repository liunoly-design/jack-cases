# 最终上游同步与复验

2026-10-21：基线 main `3af07ff`，保留 #16 重提、#32 依赖升级及原生驱动测试、#23 统一配置/迁移/备份、#20 服务端分页。

密钥 3 个字段通过正式 Drizzle `0002_fair_orphan.sql` 加法迁移与快照接入，保留原迁移和历史采用检查；db.ts 在正式迁移后事务迁移/校验密文，不恢复旧 bootstrap。加密配置先经过统一 config 加载，SESSION_SECRET 遵循至少 32 字符的统一规则。升级了相关隔离测试的 session fixture 值；迁移回归通过动态 journal 长度验证后续迁移一次性执行。没有降低生产配置检查、删除原生测试或恢复旧依赖。

npm run typecheck、npm run build、npm test 全部通过，69/69；包含正式迁移/旧库保护/备份恢复、better-sqlite3 13 真实关闭/重启、Sharp 实际解码、Drizzle CLI、分页/全量过滤/授权范围、重提及全部密钥/限流测试。

cua_repl 最终使用独立临时 DB、agent-key-security.localhost:5188 与 API 3088 验证登录、普通 Key 复制（剪贴板包含 requirements:write）、1440×1000 与 390×844 密钥页。390px document.scrollWidth=390。窄屏本人需求列表显示一条记录，列表分页控件和授权范围正常。只读轮换、taxonomy 管理和显式重提行为的上一轮截图保留在 revalidation-b957480/；其业务代码仍保留。新截图均在本目录。

临时账号仅用于验收，截图中的 Key 已撤销，预览服务已停止。无物理手机验收；未合并、未部署。
