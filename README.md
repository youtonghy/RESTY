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
- **多模式提醒**：提供全屏强制休息与悬浮提醒两种模式，可调节窗口透明度和提示音。
- **个性化体验**：内置亮色、暗色、跟随系统三种主题，支持英文与简体中文的即时切换。
- **数据追踪**：使用 SQLite 记录会话历史、完成率与用眼行为统计，为健康习惯提供量化反馈。
- **系统集成**：桌面版本支持托盘控制、开机自启动、窗口生命周期管理等多项原生能力。

### 使用流程

1. 在设置页配置适合自己的工作/休息节奏与提醒样式。  
2. 启动计时后，RESTY 会自动在工作与休息模式间切换。  
3. 提醒出现时，可选择休息、延长、跳过或强制休息。  
4. 打开统计面板，查看日/周/月度的眼部健康数据趋势。  
5. 通过配置导入导出，在多台设备之间同步习惯设定。

### 主要配置项

- **计时**：工作时长、休息时长、强制休息开关、延迟策略。  
- **提醒**：显示模式、透明度、提示音、提醒文案。  
- **外观**：主题、语言、窗口布局、字体缩放。  
- **系统**：托盘行为、开机启动、关闭时最小化或退出。  
- **数据**：会话统计、导入/导出配置、清除历史记录。

### 运行方式

#### 浏览器调试（无需 Rust 环境）
```bash
pnpm install
pnpm run dev
```
默认开发地址为 `http://127.0.0.1:13000/`。Windows 用户请使用 IPv4 地址以避免 IPv6 权限问题。

#### 桌面应用（需要 Rust 与 Tauri）
```bash
pnpm install
pnpm tauri dev      # 桌面调试
pnpm tauri build    # 生产构建
```
Windows 用户可直接双击 `start-dev.bat` 一键启动。更多桌面端说明请参考 `DESKTOP_APP.md`、`快速开始.md` 与 `WINDOWS.md`。

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
│   └── main.rs         # Tauri 应用入口
└── public/locales/     # 语言资源包
```

### 开发提示

- 前端：Vite + React + TypeScript，Zustand 管理状态，React Router 负责路由，所有文案通过 i18next 管理。  
- 后端：Rust + Tauri + Tokio，实现计时器调度、SQLite 持久化与系统集成。  
- 新增语言：复制 `public/locales/en/translation.json`，翻译后在设置页语言列表中注册。

---

## English

### Product Overview

RESTY is a cross-platform eye-care companion that keeps you on a healthy work–break rhythm. Powered by React and Tauri, it can run as a lightweight web experience or as a native desktop application with deep operating-system integration.

### Key Capabilities

- **Adaptive Pomodoro Timer**: configure focus and break durations, automatic phase switching, pause/resume/skip/extend controls, and a precise low-overhead timing loop.
- **Flexible Reminder Surfaces**: choose between full-screen enforced breaks or floating overlays, tune window opacity, and manage notification sounds.
- **Personalised Experience**: light/dark/system themes, in-app language switching (English, Simplified Chinese), plus layout and accessibility tweaks.
- **Insightful Analytics**: SQLite-backed session history, completion-rate tracking, and work-versus-rest analytics that reinforce healthy habits.
- **Desktop Integration**: tray controls, launch-on-startup, window lifecycle management, and multi-surface support when running natively.

### Typical Workflow

1. Define your preferred focus/break cadence and reminder style in Settings.  
2. Start the timer and let RESTY automate the shift between focus and rest phases.  
3. Respond to prompts by resting, extending, or skipping when circumstances change.  
4. Review the analytics dashboard to understand daily, weekly, or monthly trends.  
5. Import or export configuration files to keep multiple devices in sync.

### Configuration Highlights

- **Timer**: focus length, break length, enforced breaks, deferral strategy.  
- **Reminder**: display mode, opacity, sound feedback, reminder copy.  
- **Appearance**: theme, language, window layout, font scaling.  
- **System**: tray behaviour, auto-launch, close-to-tray or exit.  
- **Data**: session analytics, import/export, history management.

### Run Modes

#### Web-first workflow (no Rust required)
```bash
pnpm install
pnpm run dev
```
Open the printed `http://127.0.0.1:13000/` URL in your browser. Stick to the IPv4 address on Windows to avoid IPv6 permission issues.

#### Native desktop workflow (Rust toolchain required)
```bash
pnpm install
pnpm tauri dev      # desktop development
pnpm tauri build    # production bundle
```
On Windows you may double-click `start-dev.bat` for a one-click start. Refer to `DESKTOP_APP.md`, `快速开始.md`, and `WINDOWS.md` for platform guidance.

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
│   └── main.rs         # Tauri entry
└── public/locales/     # Language packs
```

### Development Notes

- **Frontend**: Vite + React + TypeScript, Zustand for state, React Router for navigation, i18next for localisation.  
- **Backend**: Rust + Tauri + Tokio; commands and events expose timer control, analytics, and system hooks; SQLite ensures reliable storage.  
- **Localisation**: duplicate `public/locales/en/translation.json`, translate the strings, then register the new locale inside the Settings language selector.

---

保持节奏，关爱双眼 / Keep the flow, care for your eyes.
