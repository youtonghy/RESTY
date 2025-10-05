# Windows 环境运行指南

## 问题解决

### 端口冲突问题 ✅ 已解决

如果遇到端口权限错误（`EACCES: permission denied ::1:1420`），不用担心！

**解决方案**: Vite 已配置为自动使用可用端口。当 1420 端口被占用或无权限时，会自动切换到其他端口（如 5173）。

**使用时**: 查看控制台输出的 `Local:` 地址，在浏览器打开即可。

### 依赖缺失问题

如果遇到 `'vite' 不是内部或外部命令` 错误，说明需要先安装依赖。

## 快速启动

### 1. 安装依赖（首次运行或更新依赖后）

```powershell
pnpm install
```

### 2. 启动开发服务器

有两种方式运行项目：

#### 方式 A: 仅运行前端（推荐用于 UI 开发）

```powershell
pnpm run dev
```

启动后访问控制台显示的地址（通常是 http://localhost:5173/）

**注意**: Vite 会自动选择可用端口。如果默认端口被占用，会使用其他端口。

注意：此模式下后端功能不可用（因为需要 Rust/Cargo）

#### 方式 B: 运行完整应用（需要 Rust 环境）

```powershell
pnpm tauri dev
```

此模式会同时启动前端和 Tauri 后端，所有功能都可用。

**前提条件：**
- 安装 Rust: https://www.rust-lang.org/tools/install
- 安装 Tauri 依赖: https://tauri.app/start/prerequisites/

### 3. 构建生产版本

```powershell
# 仅构建前端
pnpm build

# 构建完整应用（需要 Rust）
pnpm tauri build
```

## 环境要求

### 必需
- Node.js 16+
- pnpm (推荐) 或 npm

### 可选（用于完整功能）
- Rust 和 Cargo
- Tauri CLI

## 安装 Rust（Windows）

如需运行完整 Tauri 应用：

1. 访问 https://www.rust-lang.org/tools/install
2. 下载并运行 `rustup-init.exe`
3. 按照提示完成安装
4. 重启终端

验证安装：
```powershell
rustc --version
cargo --version
```

## 常见问题

### Q: 依赖安装失败
**A:** 尝试清除缓存：
```powershell
pnpm store prune
pnpm install
```

### Q: 端口被占用
**A:** Vite 已配置为自动使用可用端口。启动后查看控制台显示的实际地址。

如果需要指定端口，可以修改 `vite.config.ts` 中的 `port` 配置。

### Q: 无法运行 Tauri
**A:** 确保已安装：
1. Rust 和 Cargo
2. Visual Studio C++ Build Tools (Windows)
3. WebView2 (Windows 10/11 通常已预装)

### Q: 构建慢
**A:** Rust 首次编译较慢（5-10分钟），后续增量编译会快很多。

## 开发工作流

### 前端开发（无需 Rust）

1. 启动前端开发服务器:
```powershell
pnpm run dev
```

2. 在浏览器中打开 http://localhost:1420/

3. 修改 `src/` 下的文件，保存后自动刷新

4. 查看控制台错误信息

注意：后端功能（定时器、数据库等）需要模拟数据

### 全栈开发（需要 Rust）

1. 启动 Tauri 开发模式:
```powershell
pnpm tauri dev
```

2. 应用会在独立窗口中打开

3. 前端修改自动热更新

4. 后端修改需要重启应用

## 项目结构

```
RESTY/
├── src/                    # 前端代码
│   ├── components/         # React 组件
│   ├── pages/             # 页面
│   ├── store/             # 状态管理
│   ├── i18n/              # 国际化
│   └── utils/             # 工具函数
│
├── src-tauri/             # 后端代码 (Rust)
│   └── src/               # Rust 源码
│
├── public/
│   └── locales/           # 语言文件
│
├── package.json           # Node 依赖
└── pnpm-lock.yaml        # 锁定文件
```

## 推荐开发工具

- **VSCode** + 扩展:
  - Tauri
  - rust-analyzer
  - ESLint
  - Prettier

- **WebStorm** 或 **Visual Studio**

## 下一步

1. ✅ 依赖已安装
2. ✅ 开发服务器可启动
3. 📝 开始开发或测试功能
4. 🚀 准备好后运行 `pnpm tauri dev` 体验完整应用

## 技术支持

- Tauri 文档: https://tauri.app/
- React 文档: https://react.dev/
- 项目问题: 查看 `DEVELOPMENT.md`
