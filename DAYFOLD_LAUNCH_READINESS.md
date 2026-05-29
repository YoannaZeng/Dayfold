# Dayfold Launch Readiness

这份文档用于判断 Dayfold 在公开 beta 上线前还差哪些关键项，并按优先级拆成可直接执行的任务。

优先级定义：

- `P0`：上线前必须完成。不做就容易在性能、数据语义、回归风险、事故处理上出问题。
- `P1`：最好在上线前完成，最晚应在上线后 1-2 周内补齐。
- `P2`：不阻挡首发，但会显著影响后续扩张速度、维护成本和排错效率。

当前判断：

- 到“小范围外部 beta / 首批几十个测试用户”：约 `75%-80%`
- 到“很多不同的人长期稳定使用”：约 `55%-65%`

当前最重要的方向不是继续加新功能，而是补齐以下四类能力：

- 读写性能
- 数据语义一致性
- 自动化验证
- 上线后的可观测性

## P0

### P0-1 关闭当前这版全局 `Ctrl+Z` 撤回

目标：

- 去掉“每次保存前整账号导出”的高成本行为
- 保留“手动导出备份 / 手动恢复备份”
- 避免多人使用时每次保存都触发整账号全量读取

当前问题：

- 前端 `commit()` 默认在保存前执行 `captureUndoSnapshot()`
- `captureUndoSnapshot()` 会请求 `/api/export`
- `/api/export` 会把当前账号的多张表全部查出并返回整份 JSON
- 这意味着一个普通保存动作，背后可能是“先全量导出，再正常保存”

涉及文件：

- [components/dayfold-app.tsx](/Users/mvbj0674/Documents/Codex/2026-05-09/hi/app-v2/components/dayfold-app.tsx:1476)
- [components/dayfold-app.tsx](/Users/mvbj0674/Documents/Codex/2026-05-09/hi/app-v2/components/dayfold-app.tsx:1625)
- [components/dayfold-app.tsx](/Users/mvbj0674/Documents/Codex/2026-05-09/hi/app-v2/components/dayfold-app.tsx:1697)
- [components/dayfold-app.tsx](/Users/mvbj0674/Documents/Codex/2026-05-09/hi/app-v2/components/dayfold-app.tsx:1760)
- [app/api/export/route.ts](/Users/mvbj0674/Documents/Codex/2026-05-09/hi/app-v2/app/api/export/route.ts:7)

实施方案：

1. 删除前端全局撤回状态：
   - 删除 `undoStack`
   - 删除 `undoing`
2. 删除撤回快照函数：
   - 删除 `captureUndoSnapshot()`
3. 删除全局快捷键监听：
   - 删除 `handleUndoShortcut`
   - 删除对应的 `useEffect`
4. 简化 `commit()`：
   - 删除 `undoable?: boolean`
   - 删除 `undoSnapshot` 变量
   - 删除保存前的 `captureUndoSnapshot()` 调用
   - 删除保存成功后的 `setUndoStack(...)`
5. 清理所有 `undoable: false` 的调用点，避免遗留无效参数
6. 保留现有的：
   - 手动导出 `exportBackup()`
   - 手动导入 `importBackupFile()`
   - 回收站恢复

验收标准：

- 输入框内原生 `Ctrl+Z` 仍可用
- 页面级全局 `Ctrl+Z` 不再触发整账号恢复
- 普通保存操作不再额外请求 `/api/export`
- 用户仍然可以手动导出 JSON 备份

建议工期：

- `0.5 天`

风险提示：

- 这是一个低风险高收益改动，建议优先做

---

### P0-2 重构 `/api/state`，把“整周 7 次全量重建”改成“当前天全量 + 其余天轻量”

目标：

- 降低 Dayfold 主页面的读负载
- 改善首页加载、切日期、切周视图时的响应速度
- 避免用户数量增长后，数据库压力先卡死在 `/api/state`

当前问题：

- `getDayfoldSnapshot()` 会读取当前选中日期的完整 Dayfold 状态
- 同时还会把一周 7 天全部通过 `buildWeekDayBundle()` 重新构建
- `buildWeekDayBundle()` 内部又调用 `buildDayStateForDate()`
- `buildDayStateForDate()` 本身就会查询多张表并做多层拼装

涉及文件：

- [lib/server/dayfold.ts](/Users/mvbj0674/Documents/Codex/2026-05-09/hi/app-v2/lib/server/dayfold.ts:1170)
- [lib/server/dayfold.ts](/Users/mvbj0674/Documents/Codex/2026-05-09/hi/app-v2/lib/server/dayfold.ts:1384)
- [lib/server/dayfold.ts](/Users/mvbj0674/Documents/Codex/2026-05-09/hi/app-v2/lib/server/dayfold.ts:1484)
- [app/api/state/route.ts](/Users/mvbj0674/Documents/Codex/2026-05-09/hi/app-v2/app/api/state/route.ts:6)

实施方案：

1. 保留 `buildDayStateForDate(user, date)`，继续只用于“当前选中日期”的完整状态
2. 新增轻量函数，例如：

```ts
async function buildWeekDaySummaryForDate(user: User, dateKey: string): Promise<WeekDaySnapshot>
```

3. 这个轻量函数只返回：
   - `dateKey`
   - `note`
   - `actualGroups`
4. 这个轻量函数不要再调用 `buildDayStateForDate()`
5. 为轻量函数单独查询当天最少数据集：
   - `progressEntries`
   - `progressEntryTags`
   - 关联 `planItem` 及标签
   - `manualActualGroups`
   - `manualActualItems`
   - `manualActualGroupTags`
   - `noteEntries` 或已保存的 `day.note`
6. 如果当前 `buildActualGroups()` 依赖完整 `DayState`，就抽一层更底部的纯函数，例如：

```ts
function buildActualGroupsFromRows(params: {
  progressEntries: ...;
  manualGroups: ...;
}): ActualGroup[]
```

7. `getDayfoldSnapshot()` 改成：
   - 当前选中日：走 `buildDayStateForDate()`
   - 周视图 7 天：走 `buildWeekDaySummaryForDate()`
8. 为 `/api/state` 增加简单耗时日志，先观测优化结果

建议代码拆分方式：

- `buildDayStateForDate()`：保留完整页面数据
- `buildWeekDaySummaryForDate()`：只服务周视图
- `buildActualGroupsFromRows()`：共享聚合逻辑

验收标准：

- `getDayfoldSnapshot()` 不再对一周 7 天全部调用 `buildDayStateForDate()`
- API 返回字段对前端保持兼容
- 周视图展示内容与现在一致
- 切日期、切周视图时体感更快
- 日志能看到 `/api/state` 的耗时下降

建议工期：

- `1.5-2.5 天`

风险提示：

- 这是上线前最重要的性能改造之一
- 改动后必须回归验证：
  - 计划区
  - 今日进展
  - 今日实际
  - 周视图按日期
  - 周视图按标签

---

### P0-3 修正“清空当前账号数据”的语义，清空就真的清空

目标：

- 保证 UI 文案与后端行为一致
- 防止用户误以为内容已经清空，但回收站仍可恢复

当前问题：

- 前端文案写的是“清空当前账号数据”
- 但后端清空接口目前没有删除 `trashEntry`
- 用户清空后，理论上还能从回收站恢复部分内容

涉及文件：

- [app/api/account-data/route.ts](/Users/mvbj0674/Documents/Codex/2026-05-09/hi/app-v2/app/api/account-data/route.ts:7)
- [components/dayfold-app.tsx](/Users/mvbj0674/Documents/Codex/2026-05-09/hi/app-v2/components/dayfold-app.tsx:1934)
- [components/dayfold-app.tsx](/Users/mvbj0674/Documents/Codex/2026-05-09/hi/app-v2/components/dayfold-app.tsx:3881)
- [app/api/trash/route.ts](/Users/mvbj0674/Documents/Codex/2026-05-09/hi/app-v2/app/api/trash/route.ts:6)

实施方案：

1. 在 `DELETE /api/account-data` 中加入：

```ts
await tx.progressEntryTag.deleteMany({ where: { userId: user.id } });
await tx.manualActualGroupTag.deleteMany({ where: { userId: user.id } });
await tx.trashEntry.deleteMany({ where: { userId: user.id } });
```

2. 保持“不删除账号、不退出登录”的行为不变
3. 更新前端文案：
   - “这会清空当前账号内容和回收站”
4. 清空成功后，前端同步清理本地状态：
   - 关闭 beta safety 弹窗
   - 清空错误提示
   - 清空成功 toast 保留
   - 重新打开回收站时应为空

验收标准：

- 清空后 `/api/state` 读到空账号
- 清空后 `/api/trash` 返回空
- 清空后导出备份不再含旧内容
- 清空后用户保持登录状态

建议工期：

- `0.5 天`

---

### P0-4 建立最小可用 CI，至少自动验证构建、Prisma、生产环境预检

目标：

- 把“我本地跑过了”升级成“每次提交都自动验过了”
- 阻止构建失败、schema 错误、部署前环境变量错误进入主分支

当前问题：

- 现在有不错的本地脚本，但还缺少自动执行的 CI 护栏

涉及文件：

- [package.json](/Users/mvbj0674/Documents/Codex/2026-05-09/hi/app-v2/package.json:5)
- [scripts/verify-deploy-env.mjs](/Users/mvbj0674/Documents/Codex/2026-05-09/hi/app-v2/scripts/verify-deploy-env.mjs:1)

建议新建文件：

- `.github/workflows/dayfold.yml`

实施方案：

1. 使用 GitHub Actions
2. 触发条件：
   - `push`
   - `pull_request`
3. workflow 基础步骤：
   - checkout
   - setup-node
   - `npm ci`
   - `npm run prisma:generate`
   - `npx prisma validate --schema prisma/schema.prisma`
   - `npm run build`
4. 加生产风格 env，执行：

```bash
NODE_ENV=production npm run verify:deploy-env
```

5. 如果 CI 可接 Postgres service，再补一层：
   - `prisma migrate deploy`
6. 推荐使用矩阵只保留一个 Node 版本，先求稳定，不急着扩版本矩阵

建议 workflow 内容骨架：

```yaml
name: Dayfold CI

on:
  push:
  pull_request:

jobs:
  build:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: /Users/mvbj0674/Documents/Codex/2026-05-09/hi/app-v2
```

如果仓库根不在 `app-v2`，实际工作目录需要按真实仓库结构改成相对路径。

验收标准：

- 每次提交都自动跑构建
- schema 错误直接让 CI 失败
- 生产环境变量格式错误能被自动挡住

建议工期：

- `0.5-1 天`

---

### P0-5 增加最小可用的请求日志和错误日志

目标：

- 上线后出现 500、慢请求、用户报错时，能快速定位
- 先有“能查”的能力，再谈更复杂的监控平台

当前问题：

- 现在异常会返回给前端，但缺少统一结构化日志

涉及文件：

- [app/api/mutate/route.ts](/Users/mvbj0674/Documents/Codex/2026-05-09/hi/app-v2/app/api/mutate/route.ts:226)
- [app/api/state/route.ts](/Users/mvbj0674/Documents/Codex/2026-05-09/hi/app-v2/app/api/state/route.ts:6)
- [app/api/import/route.ts](/Users/mvbj0674/Documents/Codex/2026-05-09/hi/app-v2/app/api/import/route.ts:217)
- [app/api/export/route.ts](/Users/mvbj0674/Documents/Codex/2026-05-09/hi/app-v2/app/api/export/route.ts:7)
- [app/api/account-data/route.ts](/Users/mvbj0674/Documents/Codex/2026-05-09/hi/app-v2/app/api/account-data/route.ts:7)

建议新建文件：

- `lib/server/logger.ts`

实施方案：

1. 新建最小 logger：

```ts
export function logInfo(event: Record<string, unknown>) {
  console.log(JSON.stringify({ level: "info", ...event }));
}

export function logError(event: Record<string, unknown>) {
  console.error(JSON.stringify({ level: "error", ...event }));
}
```

2. 每个 route 开头记录：
   - `route`
   - `method`
   - `startAt`
3. 成功时记录：
   - `durationMs`
   - `userId`
   - `action`
   - `selectedDateKey`
4. 失败时记录：
   - `durationMs`
   - `errorMessage`
   - `stack`
   - `status`
5. `mutate` 路由额外记录 `action`
6. `state` 路由额外记录 `date`
7. `import/export` 额外记录：
   - 导出记录数
   - 导入版本号
   - 导入记录数

日志字段建议：

- `route`
- `method`
- `userId`
- `action`
- `selectedDateKey`
- `durationMs`
- `status`
- `errorMessage`

验收标准：

- 任意一次 500 都能在日志里定位到 route 和动作
- 能看到 `/api/state` 的慢请求
- 日志不包含密码、session token、完整备份 JSON

建议工期：

- `0.5-1 天`

## P1

### P1-1 增加“忘记密码 / 重设密码”

目标：

- 解决公开注册后最常见的账号支持问题
- 避免忘记密码完全依赖人工处理

当前问题：

- 目前只有注册、登录、退出
- 没有找回密码、重置密码、失效旧会话的能力

涉及文件：

- [prisma/schema.prisma](/Users/mvbj0674/Documents/Codex/2026-05-09/hi/app-v2/prisma/schema.prisma:11)
- [lib/server/auth.ts](/Users/mvbj0674/Documents/Codex/2026-05-09/hi/app-v2/lib/server/auth.ts:166)
- [components/auth-screen.tsx](/Users/mvbj0674/Documents/Codex/2026-05-09/hi/app-v2/components/auth-screen.tsx:43)

建议新增：

- `PasswordResetToken` Prisma 模型
- `app/api/auth/password/request/route.ts`
- `app/api/auth/password/reset/route.ts`

Prisma 设计建议：

```prisma
model PasswordResetToken {
  id         String   @id @default(cuid())
  userId     String
  tokenHash  String   @unique
  expiresAt  DateTime
  usedAt     DateTime?
  createdAt  DateTime @default(now())
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, expiresAt])
}
```

实施方案：

1. 新增 token 表并生成 migration
2. 新增“申请重置密码”接口
   - 传入邮箱
   - 永远返回统一文案，如“如果该邮箱存在，我们已发送重置方式”
   - 防止别人探测邮箱是否存在
3. 如果用户存在：
   - 生成一次性 raw token
   - 存储 `tokenHash`
   - 设置短期过期时间，例如 30 分钟
4. 新增“重置密码”接口
   - 校验 token 是否存在
   - 校验未过期
   - 校验未使用
   - 校验新密码强度
   - 更新 `passwordHash`
   - 将当前用户所有 session 失效
   - 将 token 标记为 `usedAt`
5. 登录页增加“忘记密码”入口
6. 如果暂时还没接邮件服务：
   - 内测阶段可以先通过后台脚本打印 reset link
   - 但正式公开测试前最好接通至少一种邮件通道

验收标准：

- 用户可成功申请重设
- 过期或已使用 token 不能再次使用
- 重设后旧会话全部失效

建议工期：

- `1.5-2.5 天`

---

### P1-2 增加定时清理任务

目标：

- 避免过期 session、回收站、限流记录长期堆积
- 降低数据库膨胀风险

建议新增：

- `scripts/cleanup-expired-data.mjs`

实施方案：

1. 清理过期 session：

```ts
await db.session.deleteMany({
  where: { expiresAt: { lt: new Date() } }
});
```

2. 清理过期 trash：

```ts
await db.trashEntry.deleteMany({
  where: { expiresAt: { lt: new Date() } }
});
```

3. 清理陈旧 rate-limit 记录：
   - 已过窗口很久
   - 已不再阻塞
4. 每次执行输出删除数量
5. 在宿主平台配置 cron：
   - 每天 1 次即可
6. 如果宿主平台不方便跑脚本，也可以做一个受保护的内部 maintenance route

验收标准：

- 过期 session 会自动消失
- 回收站不会无限涨
- rate limit 表不会越积越多

建议工期：

- `0.5-1 天`

---

### P1-3 提升导入 / 导出安全性和可解释性

目标：

- 继续保留备份能力
- 降低错误文件、超大文件、误恢复的风险

涉及文件：

- [app/api/export/route.ts](/Users/mvbj0674/Documents/Codex/2026-05-09/hi/app-v2/app/api/export/route.ts:7)
- [app/api/import/route.ts](/Users/mvbj0674/Documents/Codex/2026-05-09/hi/app-v2/app/api/import/route.ts:217)
- [components/dayfold-app.tsx](/Users/mvbj0674/Documents/Codex/2026-05-09/hi/app-v2/components/dayfold-app.tsx:1837)

实施方案：

1. 对导入 JSON 增加大小上限
2. 在导入前增加 dry-run 校验函数，只做校验不落库
3. 导入成功后返回统计：
   - days
   - weeks
   - planItems
   - progressEntries
   - noteEntries
4. 前端导入成功后展示恢复摘要
5. 将 `verify-export-import-roundtrip` 纳入固定发版流程

验收标准：

- 错误 JSON 会被明确拒绝
- 超大文件不会悄悄打爆接口
- 用户知道本次恢复影响了什么

建议工期：

- `1-1.5 天`

---

### P1-4 增加浏览器级回归测试

目标：

- 防止未来改动打坏登录、保存、恢复、隔离等关键路径

建议新增：

- `e2e/`
- 浏览器测试配置

建议最小测试集：

1. 注册并登录
2. 创建今日计划
3. 记录今日进展
4. 导出备份并恢复
5. 用户 A 与用户 B 数据隔离
6. 退出后接口返回 401

实施方案：

1. 准备测试数据库
2. 启动独立测试服务
3. 为每条用例生成唯一邮箱，避免污染
4. 把核心成功路径和失败路径都覆盖进去
5. 挂进 CI 的慢速任务中

验收标准：

- 至少有一套浏览器测试覆盖核心用户路径
- 多用户隔离有自动化保障
- 发版前能一键跑完

建议工期：

- `2-3 天`

## P2

### P2-1 拆分前端主组件

目标：

- 降低 [components/dayfold-app.tsx](/Users/mvbj0674/Documents/Codex/2026-05-09/hi/app-v2/components/dayfold-app.tsx:1) 的维护成本

当前情况：

- 主组件约 4800 行
- 状态管理、页面结构、快捷键、备份、onboarding、optimistic update 都耦合在一起

实施方案：

1. 先按职责拆文件，不先改行为
2. 推荐拆分：
   - `dayfold-app-shell.tsx`
   - `dayfold-day-view.tsx`
   - `dayfold-week-view.tsx`
   - `dayfold-backup-controls.tsx`
   - `dayfold-onboarding.tsx`
   - `dayfold-optimistic-updaters.ts`
3. 先做搬运与导出整理
4. 每拆完一块就跑一次 build

验收标准：

- 主组件明显缩小
- 改单个功能时不必进入超大文件

建议工期：

- `2-4 天`

---

### P2-2 拆分后端 `dayfold.ts`

目标：

- 降低 [lib/server/dayfold.ts](/Users/mvbj0674/Documents/Codex/2026-05-09/hi/app-v2/lib/server/dayfold.ts:1) 的复杂度
- 让读取、写入、回收站、导入导出边界更清楚

推荐拆分：

- `lib/server/dayfold/read.ts`
- `lib/server/dayfold/mutations.ts`
- `lib/server/dayfold/trash.ts`
- `lib/server/dayfold/summary.ts`

实施方案：

1. 先复制函数到新文件
2. 保持现有函数签名不变
3. route 层逐步改 import
4. 最后再删旧汇总文件中的重复实现

验收标准：

- 读取逻辑和写入逻辑不再混在一个大文件中
- 性能优化时更容易定位查询路径

建议工期：

- `2-3 天`

---

### P2-3 增加最小后台支持能力

目标：

- 真实用户多起来后，支持问题不能完全靠直接查数据库硬猜

建议范围：

- 按邮箱查询用户
- 查看最近 session
- 查看最近导入 / 导出 / 清空账号操作
- 查看最近错误日志

实施方案：

1. 先做内部只读脚本，不急着做完整后台 UI
2. 如果后续支持需求明显增加，再做内部管理页
3. 所有内部工具默认只读，降低误操作风险

验收标准：

- 用户反馈问题时，可以快速确认账号状态和最近系统行为

建议工期：

- `1-2 天`

## 推荐执行顺序

### 第一阶段：上线前必须做

1. `P0-1` 关闭当前全局撤回
2. `P0-3` 修正清空账号语义
3. `P0-2` 优化 `/api/state`
4. `P0-4` 建立最小 CI
5. `P0-5` 增加日志

### 第二阶段：上线前最好做，最晚上线后一周补齐

1. `P1-1` 重置密码
2. `P1-2` 定时清理
3. `P1-3` 导入导出加固
4. `P1-4` 浏览器回归测试

### 第三阶段：上线后持续治理

1. `P2-1` 拆前端大组件
2. `P2-2` 拆后端大文件
3. `P2-3` 补支持工具

## 建议排期

如果以“尽快公开 beta”为目标，建议按下面排：

- 第 1 天：`P0-1` + `P0-3`
- 第 2-3 天：`P0-2`
- 第 3-4 天：`P0-4` + `P0-5`
- 第 5-7 天：`P1-1` + `P1-2`
- 第 2 周：`P1-3` + `P1-4`

## 发版前最终检查清单

- `Ctrl+Z` 全局撤回已下线
- `/api/state` 已完成轻量化
- 清空账号后回收站为空
- build 稳定通过
- Prisma schema 与 migration 稳定通过
- 生产环境变量检查通过
- 日志可看到 route、action、duration、error
- 至少一套核心回归测试可运行
- 已完成一次真实导出 -> 清空 -> 导入 -> 验证回环测试

## 结论

Dayfold 现在已经具备公开 beta 的雏形，最需要补的是“性能护栏、验证护栏、运维护栏”，而不是再往里塞新功能。

如果只做一件事，优先做 `P0-1`。

如果只做三件事，优先做：

1. `P0-1`
2. `P0-2`
3. `P0-4`
