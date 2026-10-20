# 封面功能合入后的最终同步

2026-10-21：保留最新 main 239c588 的 #22 封面、图片排序、图文详情、真实附件夹具及 #35 配置值修复。本项未合并的密钥字段迁移由 0002 顺延为 0003_agent_key_security，使用 Drizzle 重新生成快照并接续上游 0002_requirement_covers；上游迁移及其 cover 预览库采用逻辑保持原样。

使用 upstream 的 schema、封面页面和医疗回归为基础合入密钥字段/界面及 cookie 管理权限。后续迁移测试按 journal 长度生成未来迁移，不覆盖 cover/key 迁移。保留 #16/#20/#23/#32/#35。

npm run typecheck、npm run build、npm test 全部通过，70/70。包含封面与排序图库、未审核图片隔离、真实附件、正式迁移/重复迁移/备份恢复、原生驱动、分页、重提及密钥/限流回归。

cua_repl 桌面 1440×1000、窄屏 390×844 重新验证登录及密钥复制，剪贴板包含 requirements:write；390px document.scrollWidth=390。截图在本目录。独立 .localhost 域名、5188/3088 端口和临时数据库；测试 Key 已撤销、预览服务已停止。未合并或部署。
