# RESTY 软件架构概览

本文档梳理 RESTY 项目的整体架构，便于快速理解前后端职责划分、模块间协作方式以及关键技术栈。

## 总体结构

- **前端**：使用 Vite + React + TypeScript 构建的多页面应用，负责呈现番茄时钟 UI、配置界面与统计分析。
- **桌面容器**：基于 Tauri，将 Web 应用包装为跨平台桌面程序，并提供与操作系统交互的能力。
- **后端（Tauri Rust 层）**：实现计时核心逻辑、数据持久化与系统能力调用，通过 Tauri Command 与前端通信。

整体调用链为：React 组件触发 `src/utils/api.ts` 中的封装函数 → 调用 Tauri Command → Rust 层调度 `services` 中的业务服务 → 返回数据或通过事件推送状态更新。

## 前端（`src/`）

- **入口文件**
  - `main.tsx`：挂载 React 应用并注入全局样式。
  - `App.tsx`：注册路由、注入主题与布局组件，同时监听 Tauri 事件以同步计时状态。
- **页面（`pages/`）**
  - `Dashboard.tsx`：展示当前番茄钟状态、剩余时间与快速操作。
  - `Settings.tsx`：加载与保存全局设置，支持导入/导出配置。
  - `Analytics.tsx`：根据时间范围查询统计数据并可视化展示。
- **状态管理（`store/`）**：基于 Zustand，统一维护 `settings` 与 `timerInfo`，供全局组件共享。
- **通用组件（`components/Common/`）**
  - `Layout`、`Navigation`：页面框架与导航。
  - `ThemeProvider`：根据设置或系统偏好切换明暗主题。
- **功能组件（`components/Settings`、`components/Analytics` 等）**：拆分设置面板、统计图表等复用模块。
- **工具（`utils/api.ts`）**：封装所有与 Tauri 后端交互的 `invoke`/`listen` 调用，前端只需调用这些函数即可与 Rust 服务通讯。
- **国际化（`i18n/`）**：整合 `react-i18next`，提供中英文多语言支持。

## 后端（`src-tauri/`）

- **入口**
  - `main.rs`：启动 `resty_lib::run()`。
  - `lib.rs`：构建 Tauri App，初始化服务、注册 Command，并监听事件。
- **命令层（`commands/`）**
  - 定义与前端交互的 Tauri Command（如 `load_settings`、`start_work`、`get_analytics`）。
  - `AppState` 持有 `TimerService` 与 `DatabaseService`，让 Command 能访问共享状态。
- **服务层（`services/`）**
  - `TimerService`：管理番茄钟状态机、自动轮换、事件广播（`timer-update`、`phase-change` 等）。
  - `DatabaseService`：以 JSON 文件形式持久化设置与历史会话数据，提供统计查询能力。
- **模型层（`models/`）**
  - 定义设置、会话、统计等结构体，并负责序列化/反序列化。
- **工具层（`utils/`）**
  - `error.rs`：集中定义应用错误类型，简化错误处理与透传。

## 前后端通信

- **命令调用**：前端通过 `invoke('command_name')` 方式触发 Rust Command，适用于加载/保存设置、启动/暂停计时等操作。
- **事件推送**：Rust 通过 `app.emit` 推送 `timer-update`、`phase-change`、`timer-finished`、`show-break-reminder` 等事件；前端在 `App.tsx` 中注册监听器以实时更新 UI 或弹出提醒窗口。
- **配置同步**：设置保存后，前端调用 `saveSettings` 并更新 Zustand 状态；Rust 层也会在需要时再次广播设置变更。

## 数据流与持久化

1. 用户在设置页修改参数 → `api.saveSettings` → Tauri Command `save_settings` → `DatabaseService` 序列化写入 `settings.json`。
2. 计时状态调整（开始、暂停、自动轮换）由 `TimerService` 控制，并在每次变更时广播事件供前端刷新。
3. 每次番茄钟结束或跳过后，`TimerService` 生成 `Session` 记录 → `DatabaseService` 追加到 `sessions.json` → 前端的统计页面按需查询并展示。

## 关键设计要点

- **前后端共享类型**：前端的 `src/types` 与后端的 `src-tauri/src/models` 均定义了对应模型，确保通信数据结构一致。
- **自动轮换机制**：`TimerService` 默认开启 `auto_cycle`，自动在工作/休息状态间切换，并通过事件触发提醒窗口。
- **主题与国际化**：`ThemeProvider` 统一设置 `data-theme` 属性；`react-i18next` 根据设置实时切换语言。
- **可扩展性**：Command/Service/Model 分层设计，方便在不影响 UI 的情况下扩展新的系统能力或数据类型。

