# 认证与 API Key 运维

## 稳定配置与首次升级

`API_KEY_ENCRYPTION_KEY` 是独立的 32 字节 AES-256-GCM 主密钥，必须是 64 个十六进制字符。通过 Node `crypto.randomBytes(32).toString('hex')` 生成一次，保存在部署环境的 secret manager / 权限受限的环境文件。不要使用示例值、不要写 Git、日志或聊天，不能在每次启动时重新生成。它与 `SESSION_SECRET` 无关；后者也应稳定保存，以保留重启后的浏览器会话。实现使用 [Node 标准 crypto](https://nodejs.org/api/crypto.html)，每条记录随机 12 字节 IV、16 字节认证标签，AAD 绑定版本和记录 ID；认证仍通过 SHA-256 哈希查询。

升级前停止旧版本写入、做 SQLite 一致性备份（SQLite backup API 或停机复制数据库及所需 WAL），将旧备份作为含明文敏感数据保护。配置主密钥后启动新版本：添加 nullable `secret_encrypted/scopes/expires_at` 列，事务校验所有已有密文与哈希，把旧 `secret_value` 加密并置空。开启 `secure_delete`，迁移提交后执行 WAL TRUNCATE checkpoint；请单实例维护窗口迁移，避免旧进程继续写回明文或其他连接阻止 checkpoint。启动后确认 `secret_value` 非空计数为 0，安全处理历史 WAL、快照与含明文备份；文件系统快照、SSD 历史块无法靠应用保证物理擦除。清理或重建受控备份后再恢复服务。

仅有哈希的历史 Key 无法还原，仍能用于原业务 API，需登录后轮换才能复制。迁移不改变旧 Key 哈希、权限或期限，旧 Key `scopes=NULL/expires_at=NULL` 表示继承账号原业务权限且无自动期限。界面标记待轮换并不再建议将其复制给 Agent。旧 Key 同样不能读取/创建/轮换/撤销其他密钥，密钥管理统一要求 cookie 会话。不要声称加密迁移自动消除了旧 Key 的过宽授权风险。

升级后不能直接回退到本次权限检查之前的旧二进制：旧代码会忽略新 Key 的 scope 和到期列。需要回滚时使用保留本次认证边界的修复版本，或在维护窗口先撤销所有 scoped Key、验证数据库与原主密钥备份，再恢复匹配版本，避免把受限 Key 解释成全账号权限。

## 配置缺失、错误与恢复

- 未配置主密钥：服务仍启动，已有 Key 通过哈希认证、cookie 登录继续工作；列表不返回明文，生成/轮换返回 503，不撤销旧 Key。注册仍成功，但 `apiKey=null`。旧明文保留原样等待配置后的迁移，**此降级状态不提供落库加密保护**，应尽快补配置；不会从随机 SESSION_SECRET 派生密钥。
- 配置格式错误：启动失败。已有密文遇到错误主密钥、认证标签损坏或明文/哈希不一致：迁移事务回滚、启动失败，错误只说明配置/完整性问题。不要通过删除密文列绕过校验。
- 备份：数据库和主密钥分别备份、分别限权；文件附件另备份。恢复时还原一致性数据库、原 `API_KEY_ENCRYPTION_KEY` 和稳定 `SESSION_SECRET`，启动后用 cookie 读取 Key 并验证业务访问。主密钥丢失时哈希认证仍可在缺配置模式保留，但无法解密，应重新生成稳定主密钥前先规划登录后轮换；不要直接换值启动覆盖已有密文。
- 本次不实现在线主密钥轮换。需要更换主密钥时，安排维护窗口，用原主密钥解密再重新加密所有记录并验证哈希、备份恢复；不要简单覆盖环境值。可直接在原主密钥下轮换 Agent Key，再撤销不再使用的 Key。

## 新 Key 授权语义

新 Key `scopes` 是显式非空数组，`expiresAt` 为 UTC 秒，1–90 天（默认 30 天）。路由 deny by default，scope 之外返回 403；过期、撤销或未知 Key 返回 401。账号禁用也失去访问权。即使账号是管理员，新普通 Agent Key 的需求仅限本人，案例仅限已发布，附件继续按所有权/公开审核状态校验。

| scope | 用途 |
|---|---|
| requirements:read | 列表/读取本人需求 |
| requirements:write | 提交/修改本人需求，仍受原状态规则限制 |
| cases:read | 读取公开案例及记录复制事件 |
| taxonomy:read | 读取分类和启用的标签 |
| taxonomy:write | 维护分类标签、读取全部标签；同时要求账号是 admin/super_admin |
| media:read | 读取本人或已获访问权的附件内容 |
| media:write | 上传附件 |

普通配置包含除 `taxonomy:write` 外的上述权限；只读配置去掉 `requirements:write/media:write`。`POST /api/keys/rotate` 可选择更小权限集合，必须浏览器登录；会撤销全部现有 Key，包括分类标签 Key。`POST /api/keys/taxonomy` 固定只有 `taxonomy:read/write`，要求管理员 cookie，会替换既有同类管理 Key，不影响普通 Key。两者都可选择期限。所有 scoped Key 都不能管理用户、审核需求、发布案例、读审计/统计、管理密钥。不会提供 `users:*` scope。Key 不替代角色和资源归属校验；账号撤去管理员角色后 taxonomy 写 Key 也不可用。

已对接上游医疗平台的 `/api/files`：本人文件列表和下载使用 `media:read`，上传使用 `media:write`；`scope=all` 与案例附件审核不允许 scoped Key。需求 Markdown/AI 下载使用 `requirements:read`，案例 AI 下载使用 `cases:read`，所有下载继续执行归属/发布审批检查。新增任何路由默认拒绝 scoped Key，需显式评估权限映射。详情见 `apps/api/src/key-security.ts`。

## 登录注册与反向代理

bcrypt 使用异步 API，固定 cost-12 dummy hash 使未知邮箱也经过密码比对。错误密码、未知邮箱、禁用账号统一返回 401 `Invalid credentials`；注册重复邮箱仍返回既有 409 语义，但先执行同成本哈希，避免无哈希快速返回。密码限制 72 UTF-8 字节以避免 bcrypt 截断。

每 15 分钟登录：每 IP 200 次、每标准化邮箱 10 次；注册：每 IP 50 次、每邮箱 5 次。通过 `AUTH_LOGIN_IP_LIMIT` / `AUTH_REGISTER_IP_LIMIT` 可调整每 IP 的 15 分钟额度（1–100000），空值采用默认；账号额度保持登录 10、注册 5，成功与失败都计数，成功不会重置。默认 IP 额度为多人共享出口留出余量，需按实际并发和入口容量调整，不能视为无限制抗攻击承诺。超出返回中文 429 与秒数 `Retry-After`。无状态解析错误也消耗 IP 次数。桶内邮箱只存哈希、最多 10,000 个活动桶，容量不足也返回 429，过期桶会清除。进程重启会清空限流，当前单实例适用；多实例和有意反复重启需在可信入口提供共享限制，应用内不宣称分布式防护。

应用层 `TRUSTED_PROXY_IPS` 默认空，完全忽略外部 X-Forwarded-For/Proto/Host。仓库的生产 systemd 单元显式设为 `127.0.0.1`，对应 OpenResty `proxy_pass http://127.0.0.1:3001/api/` 的实际 socket peer，且 API 仅监听 loopback。`EnvironmentFile` 可按实际拓扑覆写。现有机器升级前必须同步安装新单元并 `systemctl daemon-reload`，或在受保护的运行时 `.env` 显式设置此值；否则 production HTTP loopback 不识别 HTTPS 转发，认证明确返回 400 而不是尝试签发不安全 cookie。不要把 `.env.example` 的空值直接覆盖生产配置。仅配置精确代理 IP（IPv4/IPv6，支持 IPv4 mapped 地址归一化），不支持宽泛子网或 `*`。socket peer 在清单内时从 X-Forwarded-For **右侧**逐跳剥离可信代理，遇到第一个非可信 IP 即停止；无效或超过 20 跳退回 socket IP。清单内代理必须覆盖或正确追加实际客户端地址和协议，网络层阻止非代理直达 API。不要把客户端共享出口 IP 加为可信代理。可信 HTTPS 转发允许 secure cookie；Host 始终不受转发头覆盖。参照 [Koa 代理说明](https://koajs.com/#settings)。

## 隔离验证

`npm test` 的 `key-security.test.mjs` 使用临时目录、随机端口、测试主密钥和独立 SQLite；覆盖 scope、角色与归属边界、期限/撤销、轮换、密文落库、重启解密、旧明文/哈希迁移、缺失/错误主密钥、备份恢复、成功失败限流与代理信任链。不会打开生产 DB 或上传目录。
