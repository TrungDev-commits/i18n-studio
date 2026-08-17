# 🌐 i18n Translation Studio (Desktop & Web)

Ứng dụng quét, bóc tách và dịch thuật chuỗi tĩnh/động cho các dự án Vue / Laravel. Đóng gói thành **ứng dụng desktop (Electron)** — server Express chạy ngay trong app, không cần cài thêm gì. Ngoài ra vẫn dùng được dưới dạng web dashboard.

## 🚀 Cách khởi chạy

### Cách 1: Ứng dụng Desktop (khuyến nghị) — double-click `start.bat`
```
tools/i18n-studio/start.bat
```
Script cài dependencies, build client rồi mở cửa sổ **Electron desktop app** (menu File/View/Help, sidebar, terminal panel) — hoàn toàn tự cung cấp server, không cần mở trình duyệt.

### Cách 2: Chạy Desktop bằng lệnh (Monorepo - 1 lệnh)
Dự án tổ chức theo npm workspaces: `server` + `client` + `desktop`.

1. **Cài đặt toàn bộ dependencies (1 lệnh):**
   ```bash
   npm install
   ```

2. **Chạy bản desktop production (build + Electron):**
   ```bash
   npm run desktop
   ```

3. **Chạy bản desktop dev (hot-reload, Electron + Vite):**
   ```bash
   npm run desktop:dev
   ```

### Cách 3: Web Dashboard (chạy trong trình duyệt)

1. **Chạy cả Server & Client đồng thời (hot-reload):**
   ```bash
   npm run dev
   ```
   - Dashboard: [http://localhost:3000](http://localhost:3000) · API: [http://localhost:4000](http://localhost:4000)

2. **Chạy bản production (server duy nhất phục vụ cả dashboard & API):**
   ```bash
   npm start
   ```
   - Truy cập: [http://localhost:4000](http://localhost:4000)

---

## 🏗️ Cấu trúc Monorepo

| Workspace | Vai trò |
|-----------|---------|
| `server/` | Express API (quét, dịch, SSE log) — export `startServer()` |
| `client/` | React + Vite dashboard (layout desktop: sidebar, topbar, terminal panel, responsive) |
| `desktop/` | Electron shell — nhúng server chạy trong main process, tự build & đóng gói |

## ✨ Tính năng nổi bật
* **Quét mã nguồn tĩnh (Vue/JS):** Tự động phát hiện chuỗi tiếng Việt hardcode trong SFC template và script bằng AST parser.
* **Cấu hình đa ngôn ngữ không giới hạn:** Hỗ trợ thêm/bớt bất kỳ ngôn ngữ nào (`vi`, `en`, `zh`, `ja`, `ko`, `th`, `fr`, ...).
* **Terminal Stream realtime:** Hiển thị tiến trình dịch từng cụm từ theo thời gian thực qua Server-Sent Events (SSE).
* **Tải file kết quả:** Nút download trực tiếp các file `messages.php` hoặc `.json` sau khi hoàn thành quét dịch.
* **Quét động API & Bảng Database:** Phát hiện các trường dữ liệu tiếng Việt có dấu từ response API thực tế.
