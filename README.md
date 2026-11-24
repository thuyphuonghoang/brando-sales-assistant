# BRANDO Sales Assistant

Web app nội bộ cho đội sales BRANDO: Research khách hàng → Nhận định (Gemini) → Ghi chú gặp → Chọn dịch vụ → Báo giá (Google Docs → PDF → Drive). Nhiều sales cùng thao tác trên một hồ sơ theo thời gian thực.

## Chạy thử trên máy (không cần tài khoản Google Cloud)

Yêu cầu: Node.js ≥ 20.9, Java ≥ 11 (cho Firebase Emulator).

```bash
npm install
cp .env.example .env.local      # mặc định: emulator + GOOGLE_MODE=mock
npm run emulators               # cửa sổ 1: Auth + Firestore emulator (UI: http://localhost:4000)
npm run dev                     # cửa sổ 2: http://localhost:3000
```

1. Mở `/login`, dùng khung **Đăng nhập thử** với `admin@brando.vn` (đặt `ADMIN_EMAILS=admin@brando.vn` trong `.env.local` trước lần đăng nhập đầu).
2. Bảng giá / quy tắc / ngành / số liệu tự được nạp ở lần đăng nhập đầu khi dữ liệu còn trống. Sau khi sửa Sheet, admin vào **Quản trị → Đồng bộ lại**.
3. Đăng nhập thêm `sales1@brando.vn`, `sales2@brando.vn`… ở cửa sổ ẩn danh để thử cộng tác.

Ở chế độ `GOOGLE_MODE=mock` (chỉ khi phát triển/test — bản build production luôn chạy live trừ khi đặt `ALLOW_MOCK_DATA=true`): dữ liệu Sheets lấy từ `src/server/fixtures/sheets.ts`, Places/Gemini trả dữ liệu giả lập, "PDF" chỉ được ghi vào `_mock/drive/files` (xem tại `/mock-drive/...`).

## Kiểm thử

| Lệnh | Nội dung |
|---|---|
| `npm test` | Unit test (Vitest): tính tiền, bộ lọc số liệu, gợi ý gói, lọc chế độ trình bày |
| `npm run test:rules` | Firestore Security Rules trên emulator |
| `npm run test:e2e` | 7 tiêu chí nghiệm thu (Playwright, tự bật emulator) |
| `npm run typecheck` / `npm run lint` | Kiểm tra kiểu / lint |

Chạy một test: `npx vitest run tests/unit -t "tính tiền"` hoặc `npm run test:e2e -- -g "present"`.

## Triển khai thật

1. **Firebase project**: bật Authentication (provider Google), Cloud Firestore. Deploy rules + index: `npx firebase deploy --only firestore --project <id>`.
2. **Tên miền**: `NEXT_PUBLIC_ALLOWED_DOMAIN` **và** regex trong `firestore.rules` (`@brando[.]vn`) — đổi thì đổi cả hai.
3. **Service account** (Google Cloud): bật Sheets API, Docs API, Drive API. Tạo key JSON → `GOOGLE_SERVICE_ACCOUNT_JSON` (có thể base64). Chia sẻ 4 Google Sheets cho email service account (quyền Xem).
4. **Drive**: tạo thư mục gốc trong một **Shared Drive** và thêm service account làm thành viên (service account không có dung lượng Drive riêng) → `ROOT_FOLDER_ID`. Hoặc dùng `GOOGLE_IMPERSONATE_USER` nếu đã cấu hình domain-wide delegation.
5. **Mẫu báo giá Google Docs** (`TEMPLATE_DOC_ID`), chia sẻ cho service account. Placeholder:
   - `{{client_name}} {{client_industry}} {{client_address}} {{client_phone}} {{quote_number}} {{issue_date}} {{valid_until}} {{validity_days}} {{owner_name}} {{owner_email}}`
   - `{{subtotal}} {{discount_percent}} {{discount_amount}} {{vat_percent}} {{vat_amount}} {{total}} {{benefits}} {{payment_terms}} {{timeline}}`
   - Một bảng có **một hàng** chứa `{{item_name}} {{item_desc}} {{item_qty}} {{item_unit_price}} {{item_amount}}` — hàng này được nhân bản theo số hạng mục.
6. **Places API (New)** → `PLACES_API_KEY`; **Gemini** → `GEMINI_API_KEY` (`GEMINI_MODEL` mặc định `gemini-2.5-flash`).
7. **Email** (@nhắc tên, mời hỗ trợ, chờ duyệt chiết khấu): cài Firebase Extension *Trigger Email from Firestore* trỏ vào collection `mail`.
8. **Hosting**: Firebase App Hosting (hoặc Cloud Run). Đặt các biến trong `.env.example` làm secrets/env; `GOOGLE_MODE=live`, `NEXT_PUBLIC_USE_EMULATORS=false`, bỏ `FIRESTORE_EMULATOR_HOST` / `FIREBASE_AUTH_EMULATOR_HOST`.

## Định dạng Google Sheets

| Sheet | Cột (hàng 1) |
|---|---|
| Bảng giá (`PRICE_SHEET_ID`, tab theo `PRICE_SHEET_GID`) | `code, name, group, description, unit, price, effective_from` |
| Quy tắc (`RULES_SHEET_ID`, tab đầu) | `industry, problem_code, service_codes` — `industry` = `*` cho mọi ngành; `service_codes` phân cách bằng dấu phẩy |
| Ngành (`INDUSTRY_SHEET_ID`, **mỗi tab một ngành**, tên tab = tên ngành) | `item_code, label, how_to_check, weight` |
| Số liệu (`STATS_SHEET_ID`, tab đầu) | `industry, stat_text, value, source_name, source_url, year` |
| Gói chuẩn (`STANDARD_SHEET_ID`, mặc định = `PRICE_SHEET_ID`, tab **Gói**) | Bảng tóm tắt có cột `Mã gói … Gửi báo giá` và bảng chi tiết `Mã gói, Case, Mức, Mã DV, Dịch vụ, Số lượng, …, Ghi chú`. Tổng tiền tính lại từ bảng giá; "Tự gửi được" lấy từ cột Gửi báo giá |
| Case (cùng sheet, tab **Case**) | `Mã case, Ngành tham chiếu, Điều kiện nhận diện, Nhóm dịch vụ, Mục tiêu tư vấn` |

Bảng giá: đơn giá `0` nghĩa là **giá linh hoạt** (báo giá riêng). Báo giá có dòng giá linh hoạt tự chuyển "Chờ duyệt" để trưởng nhóm chốt giá.
`RULES_SHEET_ID`, `INDUSTRY_SHEET_ID`, `STATS_SHEET_ID` chưa đặt thì lần đồng bộ bỏ qua phần đó và báo cảnh báo, các phần khác vẫn chạy.

## Giới hạn đã biết

- Places API trả tối đa 10 ảnh → "≥ 10" nghĩa là từ 10 ảnh trở lên.
- Fanpage, TikTok, Instagram, mã số thuế chỉ được **lưu làm tham chiếu**, không tự thu thập (không có API chính thức phù hợp; không scrape).
- Khoá mềm có thể bị chiếm sau khi xác nhận ("Vẫn sửa"); giá trị lưu sau cùng thắng ở cấp field.
- Kiểm thử PDF/Drive thật (tiêu chí 6) chỉ chạy được với `GOOGLE_MODE=live` và tài khoản thật; test tự động kiểm tra ở chế độ mock.
