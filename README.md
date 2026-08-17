# 🌐 i18n Translation Studio (Web Dashboard)

Ứng dụng web độc lập dùng để quét, bóc tách và dịch thuật chuỗi tĩnh/động cho các dự án Vue / Laravel.

## 🚀 Cách khởi chạy

### Cách 1: Chạy bằng file `start.bat` (Dành cho Windows)
Chỉ cần nhấp đúp chuột vào file:
```
tools/i18n-studio/start.bat
```
Script sẽ tự động cài đặt các thư viện cần thiết, khởi động Server (port 4000) và Client React (port 3000), sau đó mở trình duyệt web.

---

### Cách 2: Khởi chạy bằng lệnh dòng lệnh

1. **Cài đặt dependencies:**
   ```bash
   cd tools/i18n-studio/server
   npm install

   cd ../client
   npm install
   ```

2. **Chạy Server:**
   ```bash
   cd tools/i18n-studio/server
   node server.js
   ```

3. **Chạy Client Dashboard:**
   ```bash
   cd tools/i18n-studio/client
   npm run dev
   ```

4. Truy cập Dashboard tại: [http://localhost:3000](http://localhost:3000)

---

## ✨ Tính năng nổi bật
* **Quét mã nguồn tĩnh (Vue/JS):** Tự động phát hiện chuỗi tiếng Việt hardcode trong SFC template và script bằng AST parser.
* **Cấu hình đa ngôn ngữ không giới hạn:** Hỗ trợ thêm/bớt bất kỳ ngôn ngữ nào (`vi`, `en`, `zh`, `ja`, `ko`, `th`, `fr`, ...).
* **Terminal Stream realtime:** Hiển thị tiến trình dịch từng cụm từ theo thời gian thực qua Server-Sent Events (SSE).
* **Tải file kết quả:** Nút download trực tiếp các file `messages.php` hoặc `.json` sau khi hoàn thành quét dịch.
* **Quét động API & Bảng Database:** Phát hiện các trường dữ liệu tiếng Việt có dấu từ response API thực tế.
