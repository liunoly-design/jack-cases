# 导航与键盘可访问性验收

关联 Issue：https://github.com/tans/jack-cases/issues/28

本项从 upstream/main 独立实现，最终适配 main a1d856e（已包含 #10、#14、#17、#16、#32、#23、#20、#35、#22、#27、#24、#38）。不修改 API、认证、MD/files 或权限行为。

## 浏览器验收

使用 cua_repl 操作本地应用，桌面默认 1280×788、窄屏 390×844；域名 navigation-accessibility.localhost，Web 5194 / API 3024。SQLite 和上传文件仅使用 /tmp/navigation-accessibility-qa，不使用其他 checkout 的服务和数据。

- 桌面四个常用导航直接可见；导航用普通链接和 aria-current，未伪装成 tabs。截图 desktop.png。
- 学员/管理手机菜单可 Enter/Space 打开；Escape 关闭并恢复 summary 焦点；Tab 到链接后 Enter 路由跳转关闭菜单。截图 mobile-menu.png、mobile-admin-menu.png。
- 提交方式支持 Left/Right 循环、Home/End；选中项是唯一 tabIndex=0 的 tab；aria-controls 对应 panel，panel 有 aria-labelledby。截图 keyboard-tabs.png；该图为最初提交方式验收，最新表单见 mobile-form.png。
- 上传材料和图片均有可访问名称，Tab 可聚焦，外层有清晰 outline。Enter 打开原生文件选择器并完成隔离测试文件上传。截图 keyboard-upload.png。
- 登录注册有可见 label，email / current-password / new-password 自动补全；认证错误 role=alert，两个字段通过 aria-describedby 引用。截图 mobile-login-error.png、mobile-register.png。
- 390px 目录、提交表单、认证页 documentElement.scrollWidth=390。截图 mobile-form.png。
- 适配 #16 后，退回需求编辑页保留原数据、保存修改和返回重提行为；该页没有提交方式 tab。截图 mobile-edit-regression.png。完整业务回归由原有 resubmission 集成测试覆盖。
- reduced-motion 下 CSS 禁用动画、过渡和平滑滚动。

截图由桌面浏览器视口模拟生成；未进行真实手机或屏幕阅读器朗读验收。未声称全面 WCAG 认证。

## 自动检查

npm ci、npm run typecheck、npm run build、npm test 通过。新增回归验证 tab/panel ID 关联、选中态、唯一顺序焦点入口和隐藏面板内容；其余 API、原生运行时、重提、数据库迁移回归沿用主分支测试。

Impeccable detector 的 tab 下划线命中是既有选中态样式；目录灰字命中来自既有配色，均不在本项重做品牌的范围。

## 关联 PR

#10 已合并，无额外合并顺序要求。#20 在等待 CI 时合并，已在本项解决 Catalog/Materials 冲突并保留 usePage、分页计数与材料库分页。#24/#27 已合并；本项保留 useCatalogState、useCatalogResults、returnTo 安全返回和 Agent 密钥权限判断，未恢复旧 Catalog/Auth/Submit。

适配 #23 后发现 native-dependencies 与 resubmission 测试仍使用少于 32 字符的固定 session secret，无法通过新配置的启动校验。本 PR 只延长这隔离夹具值，保留安全配置与全部业务/native 断言。

#20 的 pagination 夹具长度修复同样已进入 main，本 PR 保留主分支分页回归全部断言。

最终适配 #20 后：typecheck、build、64 项测试全部通过；cua_repl 再验桌面目录分页计数/pressed、手机菜单 Escape/Space/路由关闭、提交方式 End 与资料库独立分页，390px 无横溢。desktop.png、mobile-menu.png、mobile-form.png 已更新为该版本。

2026-10-21：再次同步 main 239c588，保留已集成的三处夹具修复及分页/审核历史改动；本 PR 对 main 的测试差异只剩新增的页签语义回归。

适配 #22：保留封面、图片排序、图文详情、私有编辑与原生候选提示词 details。详情章节保持链接，候选提示词为原生披露控件，无 tab 角色（mobile-case-disclosure.png）。上传焦点修复移至新的 ImageEditor（requirement-images.tsx）。desktop.png、keyboard-upload.png、mobile-form.png、mobile-case-disclosure.png 为该轮最新截图；其余截图记录此前相同导航/认证交互。新编辑器 Enter 实际上传后默认封面选中，390px 无溢出。typecheck/build/64 项测试通过。

再次同步 main a1d856e（含 #27/#24/#38）：URL 筛选、排序、每页条数经详情往返完整恢复，列表 pressed 与 URL 一致；390px 菜单 Escape 恢复 SUMMARY 焦点且无横溢，见 url-return-desktop.png / url-return-mobile.png。页码与安全返回边界沿用主分支 catalog-state 测试全部断言。

该轮最终 typecheck/build/77 项测试全部通过；测试环境隔离补丁来自 main #38，本项未重复修改它。
