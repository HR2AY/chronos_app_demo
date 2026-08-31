# Chronos Supabase 本地化计划：第一、第二阶段

> 这是一份给新窗口 Agent 的执行计划。目标是在不阻塞当前 React 网页迭代的前提下，先把用户身份、用户状态和自定义上下文建立在本地 Supabase 上。

## 1. 决策摘要

当前采用渐进式混合架构，不一次性迁移整个后端：

```text
React Web
  ├─ Supabase Local：Auth、用户状态、自定义上下文
  └─ FastAPI + SQLite：日历、闹钟、LiveKit token（暂保留）

LiveKit Agent
  └─ 暂不迁移，后续通过受保护接口读取 Supabase 上下文
```

第一阶段只建立 Supabase 本地开发基础和数据边界；第二阶段在此基础上完成用户状态与自定义上下文功能。

### 明确不做

- 不在本计划内迁移 `timeline_items`、`alarms`、`telemetry_logs`。
- 不删除 FastAPI，不改写 LiveKit Agent 的运行方式。
- 不把 OpenAI、LiveKit、Supabase secret key 放入 React 客户端。
- 不让页面组件到处直接拼接 Supabase 查询；必须经过数据访问层。

## 2. 当前项目背景

- Web/移动端代码位于 `mobile`，当前主要是 Expo + React Native Web。
- API 位于 `server`，当前为 FastAPI + SQLite。
- Agent 位于 `agent`，使用 LiveKit Agents 和 OpenAI Realtime。
- 当前缺少正式的用户认证、用户隔离和自定义上下文数据模型。
- 现有闹钟和日历接口继续使用 FastAPI，避免本阶段扩大范围。

相关文档：

- `README.md`
- `STARTUP.md`
- `docs/livechat-alarm-integration-analysis.md`
- `docs/livekit.md`

## 3. 前置安装：Windows 本地 Supabase

### 3.1 安装 Docker Desktop

Supabase Local 通过 Docker 容器运行。安装并启动 Docker Desktop，确认 Docker 引擎处于运行状态。

不要把本地 Supabase 端口暴露到公网。若处于不可信网络环境，应只绑定到 `127.0.0.1`。

### 3.2 确认 Node.js

通过 npm/npx 使用 Supabase CLI 时，需要 Node.js 20 或更高版本：

```powershell
node --version
```

### 3.3 安装 Supabase CLI

推荐将 CLI 固定为项目开发依赖，保证团队版本一致。在仓库根目录执行：

```powershell
npm install supabase --save-dev
npx supabase --help
```

也可以使用 Scoop 全局安装：

```powershell
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
supabase --help
```

本计划默认使用项目依赖方式，因此后续命令统一写成 `npx supabase ...`。

### 3.4 初始化并启动本地栈

在仓库根目录执行：

```powershell
npx supabase init
npx supabase start
```

首次启动会下载镜像，需要等待一段时间。常用地址：

```text
API Gateway      http://127.0.0.1:54321
Postgres         postgresql://postgres:postgres@127.0.0.1:54322/postgres
Studio           http://127.0.0.1:54323
Mailpit          http://127.0.0.1:54324
```

查看状态和停止服务：

```powershell
npx supabase status
npx supabase stop
```

### 3.5 本地开发环境变量

新增一个不提交 secret 的本地环境文件，例如 `mobile/.env.local`（具体文件名以现有 Expo 配置为准）：

```env
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<supabase start 输出的 publishable/anon key>
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
```

注意：

- React 端只能使用 publishable/anon key。
- service role key、数据库密码和 LiveKit secret 只能留在服务端或部署 Secret 中。
- 真实 iPhone 访问本地服务时，不能使用 `127.0.0.1`，应改成开发机局域网 IP，并配置防火墙。

## 4. 第一阶段：Supabase 基础层

### 阶段目标

让项目拥有可重复初始化的本地 Supabase 环境，并确定用户、状态和上下文的数据边界。完成后，React 能够登录、恢复会话，并读取当前用户自己的基础数据。

### 4.1 建立项目结构

确认仓库根目录存在并提交以下目录：

```text
supabase/
  config.toml
  migrations/
  functions/          # 暂时可为空，仅为后续 Edge Function 预留
  seed.sql
```

`supabase/` 应纳入版本控制；本地密钥、运行日志和 Docker 数据不要提交。

### 4.2 设计 PostgreSQL schema

第一阶段至少建立以下表：

```text
profiles
user_preferences
context_modules
context_items
context_revisions
```

建议字段：

- 所有业务表都有 `id`、`user_id`、`created_at`、`updated_at`。
- `profiles`：显示名、头像、时区、语言等账户资料。
- `user_preferences`：提醒偏好、默认激活活动难度、语音设置等键值或 JSONB 配置。
- `context_modules`：模块名称、描述、启用状态、优先级、版本号。
- `context_items`：模块下的具体内容，支持类型、内容、启用状态和排序。
- `context_revisions`：上下文变更记录，用于审计、撤销和后续 Agent 读取稳定版本。

不要把自定义上下文直接塞进 `profiles` 或一个无限增长的文本字段。

### 4.3 身份与权限

使用 Supabase Auth 作为用户身份来源：

- `auth.users.id` 是业务表的 `user_id` 外键。
- 为每张业务表启用 Row Level Security。
- 普通用户只能读写自己的记录。
- 需要跨用户或管理权限的逻辑不由客户端直接执行。

至少验证以下策略：

```text
未登录：无法读取或写入业务表
用户 A：只能看到用户 A 的 profiles、preferences、contexts
用户 B：无法通过修改 id 或请求参数读取用户 A 的数据
```

### 4.4 Migration 与 seed

所有 schema、索引、RLS policy、触发器和必要的默认数据都必须写入 migration/seed 文件，不要只在 Studio 手工点击创建。

本地重置时应能通过 migration + seed 重建测试环境。测试用户不得使用真实个人信息或生产密钥。

### 4.5 React 数据访问边界

建立最小的数据访问层，页面只依赖业务接口：

```text
AuthRepository
UserStateRepository
ContextRepository
CalendarRepository      -> 现阶段仍调用 FastAPI
AlarmRepository         -> 现阶段仍调用 FastAPI
```

建议把 Supabase client 初始化集中在一个模块，并统一处理：

- 会话恢复
- token 过期
- 网络错误
- 登出后清理缓存
- 本地开发与未来云端环境切换

### 4.6 第一阶段验收标准

- Docker、Supabase CLI 和本地 Supabase 栈可启动。
- `supabase/` 配置和 migration 可提交到仓库。
- Studio 可以看到目标表、索引和 RLS policy。
- React 可以注册/登录、恢复会话、登出。
- 未登录请求无法读取业务数据。
- 两个测试用户之间的数据完全隔离。
- 原有 FastAPI 日历、闹钟和 LiveKit token 流程仍可运行。

## 5. 第二阶段：用户状态与自定义上下文

### 阶段目标

在第一阶段的 Auth、RLS 和 repository 基础上完成可用功能，并让后续 Agent 能以稳定、可审计的方式读取用户上下文。

### 5.1 用户状态管理

实现以下能力：

1. 应用启动时恢复 Supabase session。
2. 统一暴露 `currentUser`、`isLoading`、`isAuthenticated` 和 `authError`。
3. 登录、注册、登出和会话失效处理。
4. 读取和更新 `profiles`。
5. 读取和更新 `user_preferences`。
6. 切换用户后清理上一个用户的内存状态和本地缓存。
7. 网络失败时显示可恢复状态，不把失败误当成“没有数据”。

React 状态方案应沿用项目已有依赖和风格；若没有现成全局状态库，先使用清晰的 Auth/Context Provider 或等价轻量方案，不为本阶段引入过重框架。

### 5.2 自定义上下文 CRUD

实现以下用户流程：

- 创建上下文模块。
- 编辑模块名称、说明、优先级和启用状态。
- 在模块内新增、编辑、删除上下文条目。
- 调整条目顺序。
- 启用/禁用模块或单条内容。
- 查看最近修改记录或当前版本。
- 删除时有明确确认，并处理级联数据。

建议的业务接口：

```text
listContextModules()
createContextModule(input)
updateContextModule(id, patch)
deleteContextModule(id)
listContextItems(moduleId)
createContextItem(moduleId, input)
updateContextItem(id, patch)
deleteContextItem(id)
reorderContextItems(moduleId, orderedIds)
```

### 5.3 上下文编译边界

为 Agent 预留一个稳定的“有效上下文”读取接口，不让 Agent 直接依赖页面字段：

```text
getEffectiveUserContext(userId, purpose, timeWindow)
```

它应：

- 只返回启用内容。
- 按优先级和排序合并模块。
- 限制最大长度。
- 标注来源模块和版本。
- 不返回不必要的隐私字段。

第一版可以由 FastAPI 读取 Supabase，或使用受保护的 RPC/Edge Function；不要在客户端把完整隐私上下文直接发给 Agent。

### 5.4 Realtime 与本地体验

如果确实需要多标签页或多设备即时同步，再为 `context_modules` 和 `context_items` 开启 Realtime 订阅。

客户端应处理：

- 初次加载
- 插入/更新/删除事件
- 乐观更新失败回滚
- 重连后重新拉取
- 本地缓存与服务器时间戳冲突

Realtime 不是离线数据库；必要时保留现有本地缓存策略，并以服务器版本为最终依据。

### 5.5 第二阶段验收标准

- 用户登录后只看到自己的状态和上下文。
- 刷新页面或重新打开应用后会话和数据可恢复。
- 上下文模块和条目 CRUD 完整可用。
- 排序、启用/禁用、版本或审计信息可验证。
- 并发修改或网络失败不会静默覆盖数据。
- Agent 侧能通过受保护接口读取“有效上下文”，且无法越权。
- 日历、闹钟、LiveKit 现有功能无回归。

## 6. 本地验证清单

建议每个阶段完成后执行：

```powershell
npx supabase status
npx supabase db reset
```

然后验证：

1. Auth 注册/登录/登出。
2. 两个用户的数据隔离。
3. 页面刷新后的 session 恢复。
4. 上下文新增、编辑、删除和排序。
5. 断网、接口 401/403、重复提交和删除不存在记录。
6. 原 FastAPI 健康检查和日历/闹钟接口。

## 7. 后续上云路径

本地稳定后，使用同一套 migration 推送到 Supabase Cloud：

```powershell
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```

如有 Edge Functions，再单独部署函数并配置云端 secrets。上线前重新检查：

- 生产 Auth redirect URL
- RLS policy
- CORS 和客户端环境变量
- 数据库备份与恢复
- 日志和隐私字段
- LiveKit/OpenAI/Supabase secrets

上云不是把本地 Docker 数据卷直接上传，而是执行经过版本控制的 migration，并按需导入脱敏 seed/业务数据。

## 8. 给新窗口 Agent 的执行约束

请按以下顺序工作：

1. 先阅读本计划、`README.md`、`STARTUP.md` 和现有服务代码。
2. 先完成第一阶段的本地栈、schema、Auth、RLS 和 repository 边界。
3. 第一阶段验收通过后，再实现第二阶段用户状态和自定义上下文。
4. 每一步都保留可重复执行的 migration，不用 Studio 手工操作代替代码。
5. 不要在本阶段迁移日历、闹钟或 LiveKit Agent。
6. 不要把 secret 写入仓库、日志或客户端 bundle。
7. 完成后报告：改动文件、启动方式、验收结果、已知风险和后续上云步骤。

## 9. 参考官方文档

- [Supabase Local Development & CLI](https://supabase.com/docs/guides/local-development)
- [Supabase CLI Getting Started](https://supabase.com/docs/guides/local-development/cli/getting-started)
- [Supabase Database Migrations](https://supabase.com/docs/guides/local-development/database-migrations)
