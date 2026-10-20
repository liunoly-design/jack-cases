# 数据库配置、迁移与备份恢复

本文件是操作指引；本 PR 未连接生产、未配置生产备份计划，也未执行生产脚本。

## 一个配置基准

`apps/api/src/config.ts` 从自身模块位置定位 checkout 根目录（src 与编译后的 dist 均适用），显式读取根 `.env`，已有进程环境变量优先。可用绝对路径 `JACK_CASE_ENV_FILE=/path/to/private.env` 选定其他配置文件；指定文件不存在会报错。

`DATABASE_URL` 是文件系统路径（不接受 `file:` URI），默认 `./storage/jack-case.db`；`STORAGE_DIR` 默认 `./storage/uploads`。相对路径始终相对 checkout 根目录。`npm run dev`、`npm start`、root/workspace 的 `db:generate` 和 `db:migrate` 共用此逻辑。生产应继续使用 systemd 中的绝对共享目录，避免 release 切换后改变位置。不要将运行时路径写进 Drizzle snapshot。

旧版本可能将数据写到 `apps/api/storage`。若相对配置在旧 workspace 基准存在对应数据库或上传目录，新版本会拒绝启动/生成/迁移，即使根目录也已有库。必须先判断哪个数据集正确，再显式设置两个绝对路径：

```sh
DATABASE_URL=/absolute/old-checkout/apps/api/storage/jack-case.db
STORAGE_DIR=/absolute/old-checkout/apps/api/storage/uploads
```

这会原地使用旧库；不会自动搬运或覆盖。若要移至根目录或共享目录：停 API 和全部写入者，用下文 backup 保存旧路径，再以新绝对路径配置执行 restore。保留旧数据集直到验收完成。若新旧两处都有数据，先分别备份和人工对账，不能用 restore 合并两库。检测只检查配置对应的旧位置；曾使用自定义工作目录或其他绝对路径时，运维需主动盘点。

`SESSION_SECRET` 有值时须为至少 32 字符的稳定随机字符串，示例占位值会拒绝；生产缺失会在打开数据库之前报错。可用 `openssl rand -hex 32` 生成后放入私有环境文件。开发环境未配置时在数据库同目录持久化 `.session-secret`（创建权限 0600），重启复用。不要删除或在发布间随机轮换，否则已有 cookie 失效。

## 迁移基线与后续变更

`apps/api/drizzle/0000_clear_micromax.sql` 及 `meta/0000_snapshot.json` 是由当前 main 的真实 schema 生成的不可变基线，journal/hash 使用 Drizzle 标准格式。

- 新库：执行完整基线，记入 `__drizzle_migrations`。
- 旧自举库：事务内校验字段类型、主键、必需非空和外键；只允许补齐原自举历史已知的扩展字段（api_keys.secret_value、需求/案例的行业与医疗编号、版本、公开正文等）。缺少其他字段或外键不兼容会回滚报错。补齐缺少的表/索引后做外键检查，再登记基线，保留已有用户、需求、审核、媒体及未知表列。不会清表、重建表或重写正文。
- `0001_backfill_requirement_codes.sql` 使用 runner 注册的事务内预检编号函数，对无编号历史需求回填；正文中明确且唯一的“需求ID/需求编号/业务编号：MED-REQ-…”优先保留，先预留所有已知编号再分配自动编号。重复或冲突会报告编号与记录 UUID，需人工核对备份后显式处理再重试；已有非空列编号与正文不改写。不能脱离 runner 直接执行此 SQL。
- 重复运行只按迁移账本执行尚未执行的后续迁移；不接受未知/修改过或不连续的账本，需使用对应发布版本处理。
- API 启动与 `npm run db:migrate` 调用同一 runner，首次启动仍可零命令建库。正式升级前必须备份并在副本演练；只有一个实例执行迁移。

后续流程：修改 schema → `npm run db:generate` → 审阅 SQL/snapshot → 在 fresh 和存量副本运行 `npm run db:migrate` → 提交 SQL/meta/schema。**不要修改已发布基线或 journal 时间戳**。此 runner 拒绝 DROP TABLE/COLUMN、DELETE FROM、RENAME TO、TRUNCATE；Drizzle 为 SQLite 生成的表复制迁移也会被拒绝，需改为经审查的增量 SQL，保留未知/未来字段。需要清理或约束重建时单独设计运维迁移，不绕过 runner 直接使用 drizzle-kit migrate（它不负责旧库接纳）。

### 已合并 PR #10 的集成

本分支已同步至包含 #10、#14、#17 的 main（4b3c0d8）。0000 包含完整编号/版本/public_content、files/requirement_files/case_files 和 requirements_code_unique 唯一索引；schema 同步补上该索引定义。0001 使用确定顺序对历史缺失编号做增量回填，保留已有编号、正文与附件关联。旧自举中医疗 ALTER/CREATE/backfill 已由 runner 取代。测试覆盖医疗前旧库和已应用 #10 的填充旧库，保留未知未来列/表。与 #10 无需额外合并顺序或复制业务提交。

## SQLite 一致性备份

命令使用 better-sqlite3 online backup API，通过 SQLite 读取一致快照，包含已提交 WAL 数据。**不要只复制 .db 忽略 WAL，也不要手工删 -wal/-shm。** 为使数据库与上传文件属于同一业务状态，备份前暂停 API、上传与所有其他写入者；`--maintenance` 是操作者对独占访问的声明，脚本不会停止服务、发现全部外部写入者或获得跨进程业务锁。

以下仅为模板，实际执行时用同一私有配置文件：

```sh
JACK_CASE_ENV_FILE=/absolute/private.env npm run db:backup -- --to /absolute/backups/2026-10-20-001 --maintenance
```

`--to` 必须是不存在的绝对目录，父目录预先存在；拒绝覆盖旧备份、路径重叠及源/目标本身的符号链接。备份目录权限 0700，SQLite 和 manifest 0600；上传树置于该私有父目录内。备份包括 `database.sqlite`、完整上传目录 `uploads/`、路径/时间 manifest，校验 quick_check、foreign_key_check 和所有 media/files 引用文件。上传目录不存在、附件缺失或软链接会失败。未来业务若增加其他存储目录，需同步扩展脚本边界。

密钥和私有配置**不在该备份中**：单独加密备份 `.env` / 外部 EnvironmentFile / 开发 `.session-secret`，并保留匹配的应用代码版本和迁移目录。数据库自身含账号、会话、API key 等敏感信息，备份目录应仅受信任运维访问，再采用加密异地存储、保留策略和定期恢复演练。仅 SQLite 快照不能恢复上传附件，也不能替代密钥备份。

## 显式恢复及恢复前目标备份

先停 API 及所有写入者，检查配置中的数据库/上传目录确为目标。目标可以是全新的一对路径；已有目标必须同时具有数据库和上传目录。

```sh
JACK_CASE_ENV_FILE=/absolute/target-private.env npm run db:restore -- --from /absolute/backups/2026-10-20-001 --confirm-target /absolute/target/jack-case.db --maintenance
```

缺失或不匹配的 `--confirm-target` 拒绝，且不改目标；不接受相对路径。先校验备份和附件，再将已有目标完整备份到 `<target.db>.before-restore-<timestamp>/`，打印该位置，然后暂存上传目录并通过 SQLite backup API 恢复数据库；操作报错尝试回滚并保留目标备份。不要在仍运行的服务上恢复。跨数据库/文件系统无法提供掉电原子性；进程或机器突然中断时保持停机，从打印的目标备份重新恢复并验收，不可盲目重启。恢复脚本不自动迁移，先用匹配代码验收，再按发布计划迁移。

恢复完成后检查用户、需求、审核、媒体关联、上传下载与登录；必要时恢复匹配的密钥，确认配置文件权限，再启动服务。回滚应用代码不会自动回滚数据库；本基线及后续变更必须兼容原有数据。

## 本地回归

`npm test` 的 migration-config 测试仅使用系统临时目录，涵盖 fresh、填充旧库、扩展列/表保留、重复执行、后续增量迁移、拒绝不兼容结构、root/workspace 配置和环境文件、稳定密钥、WAL 备份、恢复关联/文件、覆盖前目标备份、未授权目标拒绝。不会打开仓库 storage 或生产数据库。
