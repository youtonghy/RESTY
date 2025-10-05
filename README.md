# RESTY - Eye Care Reminder Application

A cross-platform desktop application built with Tauri and React for periodic eye rest reminders.

## Features

✅ **Completed Core Features:**

1. **Timer & Scheduler**
   - Configurable work and break durations
   - Automatic phase transitions (work ↔ break)
   - Pause, resume, skip, and extend functionality
   - High-precision timer with low CPU usage

2. **Settings Management**
   - Timer settings (work/break duration, force break mode)
   - Reminder settings (display mode, opacity, sound)
   - Appearance settings (theme: light/dark/auto)
   - System settings (autostart, minimize/close to tray)
   - Language settings (English, Simplified Chinese)
   - Import/export configuration

3. **Internationalization (i18n)**
   - Default: English (en-US)
   - Supported: Simplified Chinese (zh-CN)
   - No hardcoded text in source code
   - Language files in `/public/locales/`

4. **Theme System**
   - Light and dark themes
   - Auto mode (follows system preference)
   - CSS variables for easy customization
   - Smooth transitions

5. **Data Persistence**
   - SQLite database for settings and sessions
   - Analytics data (work/break time, completion rate)
   - Session history tracking

6. **Architecture**
   - **Backend:** Rust with Tauri
   - **Frontend:** React + TypeScript
   - **State Management:** Zustand
   - **Routing:** React Router
   - **IPC:** Tauri commands and events

## Project Structure

```
RESTY/
├── src/                      # Frontend source code
│   ├── components/           # React components
│   │   ├── Common/          # Shared components (ThemeProvider)
│   │   ├── Settings/        # Settings-related components
│   │   ├── Reminder/        # Reminder window components
│   │   └── Analytics/       # Analytics components
│   ├── pages/               # Page components
│   │   └── Settings.tsx     # Settings page
│   ├── store/               # Zustand store
│   ├── i18n/                # Internationalization setup
│   ├── types/               # TypeScript type definitions
│   ├── utils/               # Utility functions and API layer
│   ├── App.tsx              # Main App component
│   └── main.tsx             # Entry point
├── src-tauri/               # Backend source code
│   ├── src/
│   │   ├── commands/        # Tauri commands (IPC handlers)
│   │   ├── models/          # Data models
│   │   ├── services/        # Business logic services
│   │   │   ├── database.rs  # Database service
│   │   │   └── timer.rs     # Timer service
│   │   ├── utils/           # Utility functions
│   │   ├── lib.rs           # Library entry point
│   │   └── main.rs          # Application entry point
│   └── Cargo.toml           # Rust dependencies
├── public/
│   └── locales/             # Language files
│       ├── en/              # English
│       └── zh-CN/           # Simplified Chinese
├── package.json
├── tsconfig.json
└── requirements.md          # Product requirements
```

## Getting Started

### Prerequisites

- Node.js (v16+)
- pnpm
- Rust and Cargo
- Tauri CLI

### Installation

```bash
# Install dependencies
pnpm install

# Development mode
pnpm tauri dev

# Build for production
pnpm tauri build
```

## Development

### Frontend Development

```bash
# Start Vite dev server
pnpm dev

# Type checking
pnpm build  # runs tsc
```

### Backend Development

The Rust backend is located in `src-tauri/`. Key modules:

- **commands/**: IPC command handlers
- **services/timer**: Timer and scheduler logic
- **services/database**: SQLite data persistence
- **models/**: Data structures and enums

### Adding a New Language

1. Create a new folder in `public/locales/` (e.g., `fr` for French)
2. Copy `en/translation.json` to the new folder
3. Translate all strings
4. Update the language selector in Settings

## Architecture

### Frontend

- **React**: UI framework
- **TypeScript**: Type safety
- **Zustand**: Lightweight state management
- **React Router**: Client-side routing
- **i18next**: Internationalization

### Backend

- **Rust**: High-performance, memory-safe backend
- **Tauri**: Cross-platform framework
- **Tokio**: Async runtime
- **SQLite**: Embedded database
- **Serde**: Serialization/deserialization

### IPC Communication

Commands (Frontend → Backend):
- `load_settings`: Load user settings
- `save_settings`: Save user settings
- `start_work`: Start work session
- `start_break`: Start break session
- `pause_timer`, `resume_timer`: Timer controls
- `skip_phase`: Skip current phase
- `extend_phase`: Extend time by 5 minutes
- `get_analytics`: Get statistics for date range
- `import_config`, `export_config`: Config management

Events (Backend → Frontend):
- `timer-update`: Timer state updates (every second)
- `phase-change`: Work/break phase changes
- `timer-finished`: Timer completion

## Configuration

Settings are stored in SQLite and include:

- Work duration (default: 25 minutes)
- Break duration (default: 5 minutes)
- Force break mode
- Display mode (fullscreen/floating)
- Theme (light/dark/auto)
- Language (en/zh-CN)
- System integration (autostart, tray behavior)

## Roadmap

### Planned Features

- [ ] Reminder window (fullscreen & floating modes)
- [ ] Analytics page with charts and timeline
- [ ] System tray integration
- [ ] Global keyboard shortcuts
- [ ] Smart deferral (detect fullscreen apps, DND mode)
- [ ] Multi-monitor support
- [ ] Autostart functionality
- [ ] Notification sounds
- [ ] Custom themes
- [ ] Testing suite
- [ ] CI/CD pipeline

## Contributing

Contributions are welcome! Please ensure:

1. All user-facing text uses i18n (no hardcoded strings)
2. Code comments and logs are in English
3. Follow existing code style
4. Add tests for new features

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

---

**Note:** This is a work-in-progress. Core functionality is complete, but some advanced features are still under development.

