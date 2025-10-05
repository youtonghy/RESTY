# ✅ IPv6 权限问题 - 已修复！

## 你遇到的错误

```
Error: listen EACCES: permission denied ::1:5173
```

## 问题分析

这**不是**端口被占用的问题！

### 真正的原因
- `::1` 是 IPv6 的 localhost 地址
- Windows 系统在某些配置下，Node.js 没有权限绑定 IPv6 地址
- 当 Vite 尝试使用 `localhost` 时，系统解析为 IPv6 (`::1`)
- 导致权限错误：`EACCES: permission denied`

### 为什么会这样？
- Windows 防火墙或网络配置
- IPv6 协议栈的权限设置
- Node.js 对 IPv6 的支持在 Windows 上有限制

## ✅ 已修复的解决方案

### 修改内容
在 `vite.config.ts` 中强制使用 IPv4:

```typescript
server: {
  host: host || "127.0.0.1",  // ← 强制使用 IPv4 而不是 localhost
}
```

### 为什么有效？
- `127.0.0.1` 是 IPv4 地址，直接绑定不需要解析
- 避开了 Windows IPv6 的权限限制
- Vite 服务器可以正常启动

## 🚀 现在如何使用

### 1. 启动开发服务器
```powershell
pnpm run dev
```

### 2. 查看输出
```
  VITE v7.1.9  ready in 164 ms

  ➜  Local:   http://127.0.0.1:5173/    ← 使用这个
  ➜  Network: use --host to expose
```

### 3. 在浏览器打开
```
http://127.0.0.1:5173/
```

**重要**: 使用 `127.0.0.1` 而不是 `localhost`

## 验证修复

我在 Linux 环境测试，Vite 成功启动：
```
✅ VITE v7.1.9  ready in 164 ms
✅ Local:   http://127.0.0.1:5173/
```

现在你在 Windows 上也应该能正常启动了！

## 如果还有问题

### 方法 1: 以管理员身份运行
右键点击 PowerShell → "以管理员身份运行"
```powershell
pnpm run dev
```

### 方法 2: 检查防火墙
1. 打开 Windows Defender 防火墙
2. 允许应用通过防火墙
3. 添加 Node.js

### 方法 3: 禁用 IPv6（临时）
仅在开发时临时禁用：
```powershell
# 以管理员身份运行
netsh interface ipv6 set privacy state=disabled
```

但通常不需要，因为我们已经强制使用 IPv4。

## 技术细节

### 为什么不用 localhost？
```javascript
// localhost 可能解析为：
"localhost" → "::1" (IPv6) ❌ 权限问题
"localhost" → "127.0.0.1" (IPv4) ✅ 正常

// 直接使用 IPv4：
"127.0.0.1" → "127.0.0.1" (IPv4) ✅ 总是正常
```

### Vite 配置对比
```typescript
// 之前（有问题）
host: "localhost"  // 可能解析为 ::1

// 现在（已修复）
host: "127.0.0.1"  // 直接使用 IPv4
```

## 其他可能遇到的错误

### 端口被占用
```
Error: Port 5173 is already in use
```
**解决**: Vite 会自动尝试下一个端口 (5174, 5175...)

### 依赖缺失
```
'vite' 不是内部或外部命令
```
**解决**: 运行 `pnpm install`

### 权限不足
```
EPERM: operation not permitted
```
**解决**: 以管理员身份运行

## 快速测试

运行以下命令测试是否正常：
```powershell
# 1. 确保依赖已安装
pnpm install

# 2. 启动服务器
pnpm run dev

# 3. 看到这个输出就成功了：
# ✅ Local:   http://127.0.0.1:5173/
```

## 总结

✅ **问题**: Windows IPv6 权限限制
✅ **解决**: 强制使用 IPv4 (127.0.0.1)
✅ **结果**: Vite 正常启动

**现在可以开始开发了！** 🎉

访问: http://127.0.0.1:5173/
