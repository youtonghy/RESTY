# 自动循环计时功能 - 实现文档

## ✅ 功能概述

RESTY 现在支持以下自动化功能：

1. **应用启动自动开始工作计时**
   - 打开软件后立即开始 25 分钟工作倒计时
   - 无需手动点击开始

2. **自动循环工作/休息**
   - 工作时间结束 → 自动开始休息计时
   - 休息时间结束 → 自动开始工作计时
   - 无限循环，无需干预

3. **休息提醒窗口**
   - 工作时间结束时，自动弹出休息提醒窗口
   - 窗口位置：屏幕右上角
   - 窗口特性：置顶显示，不可调整大小
   - 显示休息倒计时和护眼小贴士

## 🔧 实现细节

### 后端修改 (Rust)

#### 1. TimerService 自动循环 (`src-tauri/src/services/timer.rs`)

**添加字段**:
```rust
struct TimerServiceState {
    // ... 其他字段
    auto_cycle: bool,  // 默认 true
}
```

**tick() 方法增强**:
```rust
// 检测到计时结束时
if should_auto_cycle {
    match next_phase {
        TimerPhase::Work => {
            // 工作结束 → 开始休息 + 显示提醒窗口
            self.start_break()?;
            self.show_break_reminder()?;
        }
        TimerPhase::Break => {
            // 休息结束 → 开始工作
            self.start_work()?;
        }
        _ => {}
    }
}
```

**新增方法**:
```rust
fn show_break_reminder(&self) -> AppResult<()> {
    self.app.emit("show-break-reminder", ())
}
```

#### 2. 应用启动自动开始 (`src-tauri/src/lib.rs`)

```rust
let timer_service = tauri::async_runtime::block_on(async move {
    // ... 初始化代码

    // 启动 ticker
    timer.clone().start_ticker();

    // 自动开始工作会话
    let _ = timer.start_work();

    timer
});
```

#### 3. 休息提醒窗口管理 (`src-tauri/src/lib.rs`)

**监听事件**:
```rust
app.listen("show-break-reminder", move |_event| {
    let app = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = show_break_reminder_window(&app) {
            eprintln!("Failed to show break reminder: {}", e);
        }
    });
});
```

**创建窗口函数**:
```rust
fn show_break_reminder_window(app: &tauri::AppHandle) {
    let window = WebviewWindowBuilder::new(
        app,
        "break-reminder",
        WebviewUrl::App("break-reminder.html".into())
    )
    .title("Break Time - RESTY")
    .inner_size(400.0, 600.0)
    .resizable(false)
    .always_on_top(true)  // 置顶
    .center()
    .build()?;

    // 定位到右上角
    let x = screen.width - window.width - 20;
    let y = 20;
    window.set_position(PhysicalPosition { x, y })?;
}
```

### 休息提醒窗口 (`break-reminder.html`)

**特点**:
- 渐变紫色背景
- 大号倒计时显示
- 护眼小贴士列表
- 动画效果（图标脉动）
- 关闭按钮

**实时更新**:
```javascript
listen('timer-update', (event) => {
    const info = event.payload;
    if (info.phase === 'break') {
        remainingSeconds = info.remaining_seconds;
        updateTimer();
    }
});
```

## 📋 用户使用流程

### 启动后的自动流程

```
1. 打开 RESTY 应用
   ↓
2. 自动开始工作计时（25分钟）
   ↓ (倒计时到 0)
3. 弹出休息提醒窗口 (右上角，置顶)
   + 自动开始休息计时（5分钟）
   ↓ (倒计时到 0)
4. 休息窗口可关闭
   + 自动开始工作计时（25分钟）
   ↓
5. 重复步骤 2-4，无限循环
```

### 窗口状态

| 时间段 | 主窗口 | 休息提醒窗口 |
|-------|-------|------------|
| 工作中 | 显示工作倒计时 | - |
| 工作结束 | 自动切换到休息 | 自动弹出（右上角） |
| 休息中 | 显示休息倒计时 | 同步倒计时 |
| 休息结束 | 自动切换到工作 | 可关闭 |

## 🎯 默认设置

- **工作时长**: 25 分钟
- **休息时长**: 5 分钟
- **自动循环**: 启用
- **提醒窗口**: 自动显示

## 🔧 可配置选项

用户可以在设置页面修改：
- 工作时长（1-120 分钟）
- 休息时长（1-120 分钟）
- 提醒模式（全屏/浮窗）
- 提醒窗口透明度
- 是否播放声音

## 📁 相关文件

### 后端 (Rust)
- `src-tauri/src/services/timer.rs` - 计时器逻辑 + 自动循环
- `src-tauri/src/lib.rs` - 窗口管理 + 事件监听

### 前端
- `src/App.tsx` - 事件监听
- `break-reminder.html` - 休息提醒窗口 UI
- `src/store/index.ts` - 状态管理

## 🚀 启动应用

### Web 模式（浏览器）
```bash
pnpm run dev
# 访问 http://127.0.0.1:13000/
```

### 桌面模式（需要 Rust）
```bash
pnpm tauri dev
# 自动打开桌面窗口
```

## 💡 技术亮点

1. **无需用户干预** - 完全自动化的工作/休息循环
2. **智能窗口管理** - 休息提醒窗口自动定位、置顶
3. **实时同步** - 主窗口和提醒窗口倒计时同步
4. **优雅的视觉设计** - 渐变背景、动画效果
5. **健康提示** - 护眼小贴士引导用户

## 🎨 休息提醒窗口特性

- **位置**: 屏幕右上角（距边缘 20px）
- **大小**: 400x600 像素
- **样式**: 渐变紫色背景
- **功能**:
  - 实时倒计时
  - 护眼小贴士（20-20-20 原则等）
  - 关闭按钮
  - 始终置顶

## 🔮 未来改进方向

- [ ] 支持自定义提醒窗口位置
- [ ] 添加声音提醒
- [ ] 支持全屏提醒模式
- [ ] 统计数据记录（完成次数、跳过次数）
- [ ] DND（勿扰模式）检测
- [ ] 全屏应用检测（游戏、视频时延迟提醒）
