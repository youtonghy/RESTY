# Navigation Icon Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace RESTY's raster app icons with the approved source artwork and use a matching monochrome macOS tray template icon.

**Architecture:** The approved PNG is the single source for all branded application assets. Tauri's icon generator derives the platform-specific application sizes, while a dedicated transparent monochrome tray raster is embedded by `src-tauri/src/lib.rs`; this separates system-menu-bar rendering from colorful product branding.

**Tech Stack:** Tauri 2, Rust, Vite, Bun, macOS `sips`/`iconutil`, ImageMagick.

## Global Constraints

- Keep all existing tray events, menu handling, and theme-selection behavior unchanged.
- Keep application copy and public APIs unchanged; no i18n changes are required.
- The tray asset must be transparent outside its glyph and contain no rounded-square app tile.
- Run `bun run build` and `cargo check` before committing.

---

### Task 1: Regenerate Branded Application Icon Assets

**Files:**
- Modify: `public/app-icon.png`
- Modify: `public/favicon.png`
- Modify: `src-tauri/icons/32x32.png`
- Modify: `src-tauri/icons/64x64.png`
- Modify: `src-tauri/icons/128x128.png`
- Modify: `src-tauri/icons/128x128@2x.png`
- Modify: `src-tauri/icons/128x128Night.png`
- Modify: `src-tauri/icons/icon.png`
- Modify: `src-tauri/icons/icon.icns`
- Modify: `src-tauri/icons/icon.ico`
- Modify: `src-tauri/icons/Square*.png`
- Modify: `src-tauri/icons/StoreLogo.png`

**Interfaces:**
- Consumes: the approved source artwork at `/Users/youtonghy/Library/Application Support/Open Design/namespaces/release-stable/data/projects/48689e74-785d-4315-bed5-06c15a2cdfda/assets/resty-icon.png`.
- Produces: Tauri bundle icons and the assets referenced by `index.html` and `src/components/Common/Layout.tsx`.

- [x] **Step 1: Build application icon sizes from the approved source**

```bash
bunx tauri icon '/Users/youtonghy/Library/Application Support/Open Design/namespaces/release-stable/data/projects/48689e74-785d-4315-bed5-06c15a2cdfda/assets/resty-icon.png' --output src-tauri/icons
sips -z 128 128 src-tauri/icons/icon.png --out public/app-icon.png
sips -z 32 32 src-tauri/icons/icon.png --out public/favicon.png
```

- [x] **Step 2: Verify the generated raster dimensions and transparency**

```bash
sips -g pixelWidth -g pixelHeight public/app-icon.png public/favicon.png src-tauri/icons/32x32.png src-tauri/icons/128x128.png src-tauri/icons/icon.png
file src-tauri/icons/icon.icns src-tauri/icons/icon.ico
```

Expected: PNG sizes are `128x128`, `32x32`, `32x32`, `128x128`, and `512x512`; ICNS and ICO files are recognized as icon containers.

### Task 2: Create and Wire the macOS Tray Template Asset

**Files:**
- Create: `src-tauri/icons/tray-template.png`
- Modify: `src-tauri/src/lib.rs:16-17,159-164,629-630,696-697`

**Interfaces:**
- Consumes: the approved source artwork and `TrayIconBuilder` from Tauri.
- Produces: `TRAY_ICON` constants whose image has a transparent background and a single-color RESTY glyph.

- [x] **Step 1: Generate a transparent monochrome RESTY tray glyph from the approved artwork**

```bash
Use the built-in image generation tool with the approved artwork as a reference to create a monochrome eye-and-horizon glyph on a chroma-key background. Validate its alpha mask, then create the final asset with:

```bash
magick -size 44x44 xc:black \( <generated-tray-source.png> -alpha extract -threshold 45% -trim +repage -resize '44x44' -gravity center -background black -extent 44x44 \) -alpha off -compose CopyOpacity -composite src-tauri/icons/tray-template.png
```
```

- [x] **Step 2: Update tray image constants and the initial tray builder fallback**

```rust
const TRAY_ICON: &[u8] = include_bytes!("../icons/tray-template.png");
```

Use `TRAY_ICON` for both tray-theme branches and both `TrayIconBuilder` initial icons. Remove the obsolete light/dark tray constants so theme changes no longer switch between colorful rasters. Set `icon_as_template(cfg!(target_os = "macos"))` on the non-Windows tray builder.

- [x] **Step 3: Verify source references and quality gates**

```bash
rg -n 'TRAY_ICON_(LIGHT|DARK)|TRAY_ICON' src-tauri/src/lib.rs
file src-tauri/icons/tray-template.png
bun run build
cd src-tauri && cargo check
```

Expected: only `TRAY_ICON` remains; the tray PNG reports RGBA data, the frontend build succeeds, and Cargo reports no errors.

- [x] **Step 4: Commit the completed icon refresh**

```bash
git add public src-tauri/icons src-tauri/src/lib.rs docs/superpowers/plans/2026-07-26-navigation-icon-implementation.md
git commit -m '优化应用与菜单栏图标'
```
