# Running RESTY as Desktop Application

RESTY can run in two modes:
1. **Web Development Mode**: Frontend only (no Rust required)
2. **Desktop Application Mode**: Full Tauri app with Rust backend

## Quick Start

### Web Mode (Recommended for Development)
```bash
pnpm install
pnpm run dev
# Open http://127.0.0.1:13000/
```

### Desktop Mode (Full Application)
Requires Rust installation. See setup instructions below.

## Prerequisites for Desktop Mode

### 1. Install Rust

**Windows:**
```powershell
# Download and run rustup-init.exe from:
# https://rustup.rs/

# Or use winget:
winget install Rustlang.Rustup
```

**macOS:**
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

**Linux:**
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

After installation, restart your terminal and verify:
```bash
cargo --version
rustc --version
```

### 2. Platform-Specific Dependencies

**Windows:**
```powershell
# Install WebView2 (usually pre-installed on Windows 10/11)
# If needed, download from:
# https://developer.microsoft.com/en-us/microsoft-edge/webview2/
```

**macOS:**
```bash
xcode-select --install
```

**Linux (Debian/Ubuntu):**
```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

**Linux (Fedora):**
```bash
sudo dnf install webkit2gtk4.1-devel \
  openssl-devel \
  curl \
  wget \
  file \
  libappindicator-gtk3-devel \
  librsvg2-devel
```

## Running Desktop Application

### Development Mode
```bash
# Start the full Tauri application
pnpm tauri dev
```

This will:
1. Start Vite dev server on port 11420
2. Compile Rust backend
3. Launch desktop window
4. Enable hot-reload for both frontend and backend

### Production Build
```bash
# Build the application for production
pnpm tauri build
```

This creates platform-specific installers:
- **Windows**: `.exe` installer in `src-tauri/target/release/bundle/`
- **macOS**: `.dmg` and `.app` in `src-tauri/target/release/bundle/`
- **Linux**: `.deb`, `.AppImage` in `src-tauri/target/release/bundle/`

## Desktop Window Configuration

The main window is configured in `src-tauri/tauri.conf.json`:

```json
{
  "app": {
    "windows": [{
      "label": "main",
      "title": "RESTY - Eye Care Reminder",
      "width": 1200,
      "height": 800,
      "minWidth": 800,
      "minHeight": 600,
      "resizable": true,
      "center": true
    }]
  }
}
```

### Window Features

- ✅ Resizable with minimum size constraints
- ✅ Centered on screen
- ✅ Native window decorations (title bar, close button)
- ✅ Standard taskbar integration
- ✅ Multi-monitor support
- ✅ Fullscreen capability

## Available Window Commands

The desktop app has window management permissions:

```typescript
// Frontend (TypeScript)
import { getCurrent } from '@tauri-apps/api/window';

const mainWindow = getCurrent();

// Window operations
await mainWindow.center();
await mainWindow.setTitle('New Title');
await mainWindow.minimize();
await mainWindow.maximize();
await mainWindow.setFullscreen(true);
await mainWindow.setAlwaysOnTop(true);
await mainWindow.hide();
await mainWindow.show();
```

## Troubleshooting

### "cargo not found"
Install Rust using the instructions above.

### Build fails on first run
Rust compilation takes time on first build (5-10 minutes). Subsequent builds are faster.

### WebView2 missing (Windows)
Download and install from: https://developer.microsoft.com/en-us/microsoft-edge/webview2/

### Linux: webkit2gtk not found
Install the platform dependencies listed above.

### Port conflict
Desktop mode uses different ports:
- Tauri dev: `http://127.0.0.1:11420`
- HMR: `ws://127.0.0.1:11421`

If these ports are occupied, edit `vite.config.ts`.

## Development vs Production

| Feature | Web Mode | Desktop Mode |
|---------|----------|--------------|
| Hot reload | ✅ | ✅ |
| Native window | ❌ | ✅ |
| System tray | ❌ | ✅ (future) |
| File system access | ❌ | ✅ |
| Notifications | Browser only | Native |
| Startup time | Fast | Slower (Rust compilation) |
| Distribution | Web URL | Standalone installer |

## Recommended Workflow

1. **Initial Development**: Use web mode (`pnpm run dev`)
2. **Testing Native Features**: Use desktop mode (`pnpm tauri dev`)
3. **Release**: Build desktop app (`pnpm tauri build`)

## Next Steps

- [ ] Add system tray icon
- [ ] Implement global keyboard shortcuts
- [ ] Add auto-start on system boot
- [ ] Multi-window support (main + reminder)
- [ ] Native notifications

## Resources

- [Tauri Documentation](https://tauri.app/v1/guides/)
- [Tauri API Reference](https://tauri.app/v1/api/js/)
- [Rust Installation](https://www.rust-lang.org/tools/install)
