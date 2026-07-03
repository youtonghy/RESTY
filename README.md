# RESTY – Eye Care Reminder

选择语言 / Choose your language  
- [简体中文](#简体中文)  
- [English](#english)

---

## 简体中文

### 应用概览

RESTY 是一款跨平台的视力保护提醒工具，通过智能计时器帮助你在工作与休息之间保持节奏，降低长期用眼的疲劳。应用由 React + Tauri 构建，既可在浏览器中快速调试，也可打包为原生桌面程序。

### 核心功能

- **智能番茄计时**：自定义工作/休息时长、自动阶段切换、支持暂停、继续、跳过与延长等操作。
- **多模式提醒**：提供全屏强制休息与悬浮提醒两种模式，悬浮提醒支持透明度调节。
- **个性化体验**：内置亮色、暗色、跟随系统三种主题，支持 en-US、en-GB、zh-CN、zh-TW 即时切换。
- **数据追踪**：使用本地 JSON 文件记录会话历史、完成率与用眼行为统计，为健康习惯提供量化反馈。
- **系统集成**：桌面版本支持托盘控制、开机自启动、窗口生命周期管理等多项原生能力。

### 使用流程

1. 在设置页配置适合自己的工作/休息节奏与提醒样式。  
2. 启动计时后，RESTY 会自动在工作与休息模式间切换。  
3. 提醒出现时，可选择休息、延长、跳过或强制休息。  
4. 打开统计面板，查看日/周/月度的眼部健康数据趋势。  
5. 通过配置导入导出，在多台设备之间同步习惯设定。

### 主要配置项

- **计时**：固定或分段工作节奏、工作时长、休息时长、强制休息、心流模式、更多休息。
- **提醒**：显示模式、全屏画面、悬浮位置、悬浮透明度、休息前通知、休息音乐。
- **外观**：主题、语言。
- **系统**：开机启动、静默开机启动、macOS 菜单栏模式、自动静默更新、数据导入导出。
- **数据**：会话统计、导入/导出配置、清除历史记录。

### 运行方式

#### 浏览器调试（无需 Rust 环境）
```bash
bun install
bun run dev
```
默认开发地址为 `http://127.0.0.1:21421/`。Windows 用户请使用 IPv4 地址以避免 IPv6 权限问题。

#### 桌面应用（需要 Rust 与 Tauri）
```bash
bun install
bun run tauri dev      # 桌面调试
bun run tauri build    # 生产构建
```
开发时以 `bun run tauri dev` 为统一桌面入口。

### 代码结构

```
RESTY/
├── src/                # React 前端
│   ├── components/     # 设置面板、提醒窗口、统计组件等
│   ├── pages/          # 页面入口（如设置页）
│   ├── store/          # Zustand 状态管理
│   ├── i18n/           # 国际化配置
│   └── utils/          # 计时器、配置与 IPC 工具函数
├── src-tauri/          # Rust 后端
│   ├── commands/       # 前后端通信命令
│   ├── services/       # 计时调度、数据库、系统集成模块
│   ├── lib.rs          # Tauri 应用入口与窗口/托盘编排
│   └── main.rs         # 调用库入口
└── public/locales/     # 语言资源包
```

### 开发提示

- 前端：Vite + React + TypeScript，Zustand 管理状态，React Router 负责路由，所有文案通过 i18next 管理。  
- 后端：Rust + Tauri + Tokio，实现计时器调度、JSON 文件持久化与系统集成。
- 新增语言：复制 `public/locales/en-US/translation.json`，翻译后在设置页语言列表中注册。

---

## English

### Product Overview

RESTY is a cross-platform eye-care companion that keeps you on a healthy work–break rhythm. Powered by React and Tauri, it can run as a lightweight web experience or as a native desktop application with deep operating-system integration.

### Key Capabilities

- **Adaptive Pomodoro Timer**: configure focus and break durations, automatic phase switching, pause/resume/skip/extend controls, and a precise low-overhead timing loop.
- **Flexible Reminder Surfaces**: choose between full-screen enforced breaks or floating overlays, and tune floating-window opacity.
- **Personalised Experience**: light/dark/system themes and in-app language switching for en-US, en-GB, zh-CN, and zh-TW.
- **Insightful Analytics**: JSON-backed session history, completion-rate tracking, and work-versus-rest analytics that reinforce healthy habits.
- **Desktop Integration**: tray controls, launch-on-startup, window lifecycle management, and multi-surface support when running natively.

### Typical Workflow

1. Define your preferred focus/break cadence and reminder style in Settings.  
2. Start the timer and let RESTY automate the shift between focus and rest phases.  
3. Respond to prompts by resting, extending, or skipping when circumstances change.  
4. Review the analytics dashboard to understand daily, weekly, or monthly trends.  
5. Import or export configuration files to keep multiple devices in sync.

### Configuration Highlights

- **Timer**: fixed or segmented cadence, focus length, break length, enforced breaks, flow mode, and more-rest accounting.
- **Reminder**: display mode, fullscreen scene, floating position, floating opacity, pre-break notification, and rest music.
- **Appearance**: theme and language.
- **System**: auto-launch, silent auto-launch, macOS menu-bar mode, silent updates, and data transfer.
- **Data**: session analytics, import/export, history management.

### Run Modes

#### Web-first workflow (no Rust required)
```bash
bun install
bun run dev
```
Open the printed `http://127.0.0.1:21421/` URL in your browser. Stick to the IPv4 address on Windows to avoid IPv6 permission issues.

#### Native desktop workflow (Rust toolchain required)
```bash
bun install
bun run tauri dev      # desktop development
bun run tauri build    # production bundle
```
Use `bun run tauri dev` as the unified desktop development entry point.

### Code Map

```
RESTY/
├── src/                # React frontend
│   ├── components/     # Settings, reminder frames, analytics widgets
│   ├── pages/          # Route-level views (e.g. Settings)
│   ├── store/          # Zustand stores
│   ├── i18n/           # Internationalisation setup
│   └── utils/          # Timer helpers, configuration utilities, IPC client
├── src-tauri/          # Rust backend
│   ├── commands/       # Tauri command handlers (IPC entry points)
│   ├── services/       # Scheduler, persistence, platform integration
│   ├── lib.rs          # Tauri entry, windows, and tray orchestration
│   └── main.rs         # Calls the library entry
└── public/locales/     # Language packs
```

### Development Notes

- **Frontend**: Vite + React + TypeScript, Zustand for state, React Router for navigation, i18next for localisation.  
- **Backend**: Rust + Tauri + Tokio; commands and events expose timer control, analytics, and system hooks; local JSON files store settings and history.
- **Localisation**: duplicate `public/locales/en-US/translation.json`, translate the strings, then register the new locale inside the Settings language selector.

---

保持节奏，关爱双眼 / Keep the flow, care for your eyes.
