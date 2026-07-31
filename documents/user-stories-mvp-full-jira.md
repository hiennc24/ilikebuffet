# BỘ USER STORIES MVP — BẢN ĐẦY ĐỦ ĐỂ IMPORT JIRA
## Hệ thống quản lý chuỗi nhà hàng buffet hải sản (bán vé, đa chi nhánh)
*Phiên bản 1.0 — mọi story có Acceptance Criteria chi tiết, sẵn sàng triển khai*

---

# PHẦN A — HƯỚNG DẪN SETUP JIRA

**Cấu trúc:** Project `BUF` → 8 Epics (E0–E7) → Stories (mã bên dưới) → team tự tách Sub-task kỹ thuật (BE/FE/API) trong sprint planning.

**Workflow đề xuất:** `Backlog → Ready (đã có AC được PM duyệt) → In Progress → Code Review → QA/Staging → PM Accept → Done`

**Components:** `platform` `sales` `finance` `purchasing` `inventory` `reporting` `audit`
**Labels:** `must` `should` `offline` `security` `needs-client-confirm`

**Definition of Done toàn dự án (dán vào Jira project settings):**
```
□ Code review bởi ≥ 1 dev khác; unit test cho mọi logic tính toán (tiền, tồn kho, giá)
□ Test phân quyền chéo chi nhánh trên mọi API mới (user CN1 gọi dữ liệu CN2 → 403)
□ Thao tác nhạy cảm ghi audit log theo chuẩn GA-01
□ Pass trên staging với dữ liệu thật của khách (không nghiệm thu bằng data giả)
□ PM accept + demo khách ở weekly (với story có giao diện)
□ Cập nhật tài liệu HDSD nếu ảnh hưởng thao tác người dùng cuối
```

**Quy ước viết AC trong tài liệu này:** AC dạng danh sách đánh số = quy tắc bắt buộc kiểm thử được; các kịch bản hành vi viết Given/When/Then. "Cấu hình được" nghĩa là giá trị đặt trong màn hình cài đặt HQ, không hard-code.

**Tuyên bố scope khóa (dán vào description của Project):** Doanh thu đến DUY NHẤT từ bán vé buffet tại quầy. Không có thu tiền riêng nào khác. Mọi phát sinh ngoài phạm vi này → Change Request.

---

# EPIC E0 — NỀN TẢNG & PHÂN QUYỀN ĐA CHI NHÁNH
*Sprint 1–2 · Component: platform*

---

### NT-01 (Must · Sprint 1) — Quản lý chi nhánh
**Là** quản trị HQ, **tôi muốn** tạo và quản lý chi nhánh với đầy đủ thông tin cấu hình, **để** việc mở chi nhánh mới chỉ là thao tác cấu hình, không cần dev can thiệp.

**Acceptance Criteria**
1. Tạo CN với các trường bắt buộc: mã CN (2–5 ký tự, viết hoa, duy nhất toàn hệ thống, không đổi được sau khi đã phát sinh giao dịch), tên, địa chỉ, SĐT, giờ hoạt động theo thứ trong tuần.
2. Trường tùy chọn: tài khoản ngân hàng nhận CK (số TK, ngân hàng, chủ TK — dùng sinh VietQR ở BH-03), logo/thông tin in bill riêng (mặc định kế thừa chuỗi).
3. Khi tạo CN mới, cho phép chọn "sao chép cấu hình từ CN mẫu": bảng giá vé, danh mục nguyên liệu áp dụng, sơ đồ khoản thu-chi, định mức hao hụt, danh sách NCC. Dữ liệu giao dịch KHÔNG sao chép.
4. Trạng thái CN: `Đang hoạt động` / `Tạm dừng` / `Đóng cửa`.
   - Given CN ở trạng thái Tạm dừng, When user CN đó đăng nhập, Then chỉ xem được dữ liệu lịch sử, mọi nút tạo giao dịch (bill, phiếu, PO) bị ẩn/khóa.
   - CN có giao dịch lịch sử không xóa cứng được — chỉ chuyển `Đóng cửa`; dữ liệu vẫn tính vào báo cáo hợp nhất các kỳ cũ.
5. Danh sách CN hiển thị: mã, tên, trạng thái, số user active, ngày tạo; tìm kiếm & lọc theo trạng thái.
6. Mọi thao tác tạo/sửa/đổi trạng thái CN ghi audit log.

**Phụ thuộc:** không. **Ghi chú:** mã CN là tiền tố số bill (BH-04) — chốt quy tắc đặt mã với khách ngay Sprint 1.

---

### NT-02 (Must · Sprint 1) — Tài khoản, vai trò & phân quyền theo chi nhánh
**Là** quản trị HQ, **tôi muốn** quản lý người dùng theo vai trò và phạm vi chi nhánh, **để** mỗi người chỉ thấy và làm đúng phần việc của mình.

**Acceptance Criteria**
1. 6 vai trò hệ thống (MVP không cho tạo vai trò tùy biến): `Quản trị HQ`, `Chủ chuỗi`, `Kế toán chuỗi`, `Quản lý CN`, `Thu ngân`, `Thủ kho`.
2. Ma trận quyền mặc định (rút gọn — bảng đầy đủ là phụ lục PRD, khách ký):

| Chức năng | HQ | Chủ | Kế toán | QL CN | Thu ngân | Thủ kho |
|---|---|---|---|---|---|---|
| Cấu hình chuỗi, giá vé, user | ✔ | xem | — | — | — | — |
| Dashboard & báo cáo toàn chuỗi | ✔ | ✔ | ✔ | CN mình | — | — |
| Bán hàng, mở/chốt ca | — | — | — | ✔ (hỗ trợ) | ✔ | — |
| Duyệt giảm giá vượt ngưỡng, hủy bill | — | — | — | ✔ (PIN) | — | — |
| Thu-chi, đối soát, khóa sổ | — | xem | ✔ | tạo phiếu | tạo phiếu | — |
| PO, nhận hàng, kho, kiểm kê | — | xem | xem | duyệt PO | — | ✔ |

3. User thuộc 1 hoặc nhiều CN (QL vùng); `Chủ chuỗi`, `Kế toán chuỗi`, `Quản trị HQ` mặc định phạm vi toàn chuỗi.
4. **Bắt buộc ở tầng API:** mọi endpoint dữ liệu lọc theo danh sách CN của user từ server-side.
   - Given user Thu ngân CN01, When gọi API bill của CN02 (kể cả sửa request thủ công), Then trả 403 và ghi log security.
5. Khóa tài khoản có hiệu lực ≤ 30 giây (hủy phiên đang đăng nhập). Đổi vai trò/CN có hiệu lực ở lần đăng nhập kế hoặc refresh token.
6. Mật khẩu: tối thiểu 8 ký tự; bắt đổi ở lần đăng nhập đầu; khóa 15 phút sau 5 lần sai.
7. Mỗi user vai trò QL CN có mã PIN duyệt 6 số (dùng cho VG-03, BH-06) — đặt/đổi trong hồ sơ cá nhân, lưu băm, không hiển thị lại.

**Phụ thuộc:** NT-01.

---

### NT-03 (Must · Sprint 1–2) — Master data: nguyên liệu, đơn vị, khoản thu-chi, NCC
**Là** quản trị HQ, **tôi muốn** quản lý danh mục dùng chung toàn chuỗi và import từ Excel, **để** toàn chuỗi dùng một ngôn ngữ dữ liệu và khởi tạo đầu kỳ nhanh, sạch.

**Acceptance Criteria**
1. **Nguyên liệu:** mã (tự sinh, sửa được trước khi có giao dịch), tên, nhóm (`Hải sản tươi` `Hải sản đông` `Thịt` `Rau củ` `Gia vị-khô` `Vật tư-tiêu hao` — HQ thêm nhóm được), đơn vị gốc (kg/lít/cái/chai...), đơn vị mua kèm hệ số quy đổi (VD: thùng = 10 kg; 1 nguyên liệu tối đa 3 đơn vị mua), định mức hao hụt % (kế thừa theo nhóm, override theo nguyên liệu), mức tồn tối thiểu mặc định (override theo CN ở KH-04), trạng thái.
2. Nguyên liệu đã phát sinh giao dịch: không xóa, chỉ `Ngừng sử dụng` (ẩn khỏi PO/nhập kho mới, vẫn hiện trong lịch sử & kiểm kê khi còn tồn).
3. **Import Excel:** tải template chuẩn; màn hình preview bắt lỗi TRƯỚC khi ghi: trùng tên (chuẩn hóa không dấu, thường/hoa để bắt "Tôm sú"/"tom su"), thiếu trường bắt buộc, đơn vị lạ, hệ số quy đổi ≤ 0. Hiển thị số dòng hợp lệ/lỗi; chỉ ghi dòng hợp lệ, xuất file lỗi để sửa nộp lại.
4. **Sơ đồ khoản thu-chi:** cây 2 cấp (nhóm → khoản); mỗi khoản đánh dấu Thu/Chi, ngưỡng cần duyệt (dùng ở TC-01); có bộ mặc định gợi ý ngành FnB, HQ sửa được.
5. **NCC:** tên, MST, liên hệ, mặt hàng cung cấp (link nguyên liệu), điều khoản công nợ (số ngày), phạm vi (toàn chuỗi / CN cụ thể).
   - Given QL CN tạo NCC mới phạm vi CN mình, Then NCC ở trạng thái `Chờ HQ duyệt`, dùng tạm được cho PO của CN đó, và HQ nhận thông báo duyệt.
6. Mọi danh mục có tìm kiếm, lọc theo nhóm/trạng thái, phân trang.

**Phụ thuộc:** NT-01. **Ghi chú:** milestone "Dữ liệu đầu kỳ" của khách phụ thuộc story này — ưu tiên xong sớm Sprint 2, PM tổ chức 1 buổi làm cùng khách tại CN.

---

### NT-04 (Should · Sprint 2) — Đăng nhập nhanh cho máy quầy
**Là** thu ngân, **tôi muốn** đổi ca trên máy quầy bằng mã PIN cá nhân thay vì gõ lại toàn bộ tài khoản, **để** đổi ca trong vài giây.

**Acceptance Criteria**
1. Máy quầy được HQ/QL CN đăng ký là "thiết bị quầy" của 1 CN (định danh thiết bị lưu cục bộ).
2. Trên thiết bị quầy: màn hình khóa hiển thị danh sách thu ngân của CN → chọn tên → nhập PIN 6 số → vào ca. Sai PIN 5 lần → khóa PIN 15 phút, phải đăng nhập đầy đủ.
3. PIN đăng nhập là PIN riêng của thu ngân (khác PIN duyệt của QL ở NT-02.7).
4. Chỉ hoạt động trên thiết bị đã đăng ký; trình duyệt lạ luôn yêu cầu đăng nhập đầy đủ.
5. Tự khóa màn hình sau N phút không thao tác (cấu hình, mặc định 5 phút) — không đóng ca, chỉ khóa.

**Phụ thuộc:** NT-02, BH-01.

---

# EPIC E1 — VÉ & MA TRẬN GIÁ
*Sprint 2 · Component: sales*

---

### VG-01 (Must · Sprint 2) — Danh mục loại vé
**Là** quản trị HQ, **tôi muốn** định nghĩa các loại vé buffet thống nhất toàn chuỗi, **để** mọi CN bán cùng chuẩn và báo cáo hợp nhất so sánh được.

**Acceptance Criteria**
1. Loại vé gồm: tên (VD: Người lớn; Trẻ em 1m–1m3; Trẻ dưới 1m — miễn phí), mô tả điều kiện áp dụng (in trên bill để tránh cãi tại bàn), thứ tự hiển thị trên màn hình bán, màu nút (phân biệt nhanh cho thu ngân), trạng thái, cờ `miễn phí` (giá luôn = 0, vẫn đếm số khách).
2. Vé miễn phí xuất hiện trên bill với giá 0đ và ĐƯỢC đếm vào tổng số khách (phục vụ cost/khách BC-01 chính xác).
3. Loại vé đã phát sinh bill: không xóa, chỉ ngừng; bill lịch sử giữ nguyên tên & giá tại thời điểm bán (snapshot — ràng buộc với BH-02.4).
4. Given HQ đổi tên/điều kiện loại vé, Then bill cũ không đổi, bill mới dùng thông tin mới; log ghi giá trị trước/sau.

**Phụ thuộc:** NT-01.

---

### VG-02 (Must · Sprint 2) — Ma trận giá: loại vé × khung giờ × loại ngày × chi nhánh, hiệu lực theo thời gian
**Là** quản trị HQ, **tôi muốn** thiết lập bảng giá đa chiều tự áp dụng tại quầy, **để** giá luôn đúng mà thu ngân không phải nhớ và không thể tự sửa.

**Acceptance Criteria**
1. **Khung giờ:** HQ định nghĩa (tên, giờ bắt đầu–kết thúc, VD Trưa 10:30–14:00, Tối 17:00–22:00). Các khung không chồng lấn — hệ thống chặn khi lưu nếu chồng. Thời điểm ngoài mọi khung (VD 15:00): quầy không tạo được bill, hiện thông báo "ngoài giờ bán vé" (xác nhận nghiệp vụ này với khách; nếu họ bán xuyên trưa → thêm khung).
2. **Loại ngày:** `Ngày thường` / `Cuối tuần` (chọn thứ áp dụng, VD T7–CN) / `Ngày lễ` (lịch lễ khai báo theo năm dương + các ngày tùy chọn như 30 Tết). Ưu tiên áp: Lễ > Cuối tuần > Thường.
3. **Bảng giá:** một phiên bản bảng giá gồm toàn bộ ô (loại vé × khung giờ × loại ngày), có `ngày hiệu lực`. Không sửa đè bảng đang hiệu lực — muốn đổi giá phải tạo phiên bản mới (sao chép từ bản cũ rồi sửa). Xem được lịch sử các phiên bản.
4. **Giá theo CN:** mặc định mọi CN dùng bảng giá chuỗi. HQ bật cờ "cho phép giá riêng" cho CN cụ thể → CN đó có bảng giá riêng (cùng cơ chế phiên bản); ô nào không định nghĩa thì rơi về giá chuỗi.
5. **Tại quầy:** thời điểm tạo bill quyết định (khung giờ, loại ngày) → hệ thống tự chọn đúng đơn giá; thu ngân KHÔNG có bất kỳ ô nào sửa đơn giá.
   - Given hôm nay trong lịch Ngày lễ và giờ tạo bill 18:05, When thu ngân chọn 2 Người lớn, Then đơn giá = ô (Người lớn × Tối × Lễ) của bảng giá đang hiệu lực tại CN đó.
   - Given bill được tạo lúc 13:58 nhưng thanh toán lúc 14:05, Then giá tính theo THỜI ĐIỂM TẠO BILL (chốt quy tắc này với khách, ghi vào PRD).
6. Bảng giá tương lai (hiệu lực từ ngày mai) không ảnh hưởng bán hôm nay; đúng 0h ngày hiệu lực tự chuyển, kể cả máy quầy đang offline (bảng giá được cache kèm ngày hiệu lực — ràng buộc BH-05).
7. Màn hình xem giá dạng lưới trực quan (hàng = loại vé, cột = khung giờ × loại ngày) cho từng CN; xuất Excel để khách rà soát ký duyệt trước golive.

**Phụ thuộc:** VG-01, NT-01.

---

### VG-03 (Must · Sprint 2) — Giảm giá & voucher có kiểm soát
**Là** quản trị HQ, **tôi muốn** tạo chương trình giảm giá/voucher theo phạm vi và thời gian, với ngưỡng phải duyệt tại quầy, **để** khuyến mãi được kiểm soát tập trung và không thành lỗ hổng gian lận.

**Acceptance Criteria**
1. Loại giảm: (a) giảm % trên tổng bill, (b) giảm số tiền cố định, (c) mã voucher (nhập mã tại quầy). Mỗi chương trình có: tên, phạm vi CN, khoảng thời gian hiệu lực, giới hạn (số lần dùng tổng/ngày với voucher), trạng thái.
2. Mỗi bill áp tối đa 1 chương trình giảm (MVP không cộng dồn — ghi rõ với khách).
3. **Giảm thủ công tại quầy** (không thuộc chương trình): cho phép nhưng (a) bắt buộc chọn lý do từ danh mục HQ định nghĩa (khách phàn nàn, người quen chủ, sự cố...), (b) nếu vượt ngưỡng cấu hình (mặc định 10% hoặc 100.000đ — lấy theo mức chạm trước) thì yêu cầu QL CN nhập PIN duyệt ngay trên màn hình quầy.
   - Given giảm thủ công 15% và ngưỡng 10%, When thu ngân xác nhận, Then popup yêu cầu PIN QL; PIN đúng → bill ghi "duyệt bởi [tên QL]"; PIN sai 3 lần → hủy thao tác giảm, ghi log.
4. Voucher: mã không phân biệt hoa thường; hết hạn/đã hết lượt → báo lỗi rõ ràng tại quầy; mỗi lần dùng trừ quỹ lượt theo thời gian thực (2 quầy không dùng vượt tổng lượt).
5. Bill lưu: chương trình/lý do giảm, giá trị giảm, người duyệt (nếu có). Tổng giảm giá theo ca/ngày/CN đổ vào GA-02.
6. Chỉ HQ tạo/sửa chương trình; QL CN xem chương trình áp cho CN mình.

**Phụ thuộc:** VG-02, NT-02.7.

---

# EPIC E2 — BÁN HÀNG TẠI QUẦY ★
*Sprint 3–4 · Component: sales · Label: offline cho BH-05*

---

### BH-01 (Must · Sprint 3) — Mở ca bán hàng
**Là** thu ngân, **tôi muốn** mở ca với tiền mặt đầu ca, **để** mọi giao dịch gắn với ca của tôi và làm cơ sở chốt két.

**Acceptance Criteria**
1. Điều kiện tạo bill: thiết bị quầy phải có 1 ca `Đang mở`. Mỗi thiết bị chỉ 1 ca mở tại một thời điểm; một thu ngân không mở 2 ca đồng thời trên 2 thiết bị (cảnh báo & chặn).
2. Mở ca nhập: tiền mặt đầu ca (bắt buộc, ≥ 0, có màn hình đếm theo mệnh giá — tùy chọn dùng), ghi chú. Hệ thống ghi: thu ngân, thiết bị, CN, thời điểm.
3. Gợi ý tiền đầu ca = tiền cuối ca liền trước trên thiết bị đó (nếu quy trình khách là để tiền lẻ lại két); lệch với gợi ý > ngưỡng cấu hình → cảnh báo vàng (không chặn).
4. Given ca trước trên thiết bị chưa đóng (thu ngân quên chốt), When thu ngân mới mở ca, Then hệ thống yêu cầu QL CN nhập PIN để "đóng treo" ca cũ (số liệu ca cũ đóng băng chờ kế toán xử lý theo TC-03), rồi mới mở ca mới. Ca đóng treo được đánh dấu đỏ trong danh sách ca.
5. QL CN xem danh sách ca của CN: trạng thái, thu ngân, doanh thu lũy kế thời gian thực.

**Phụ thuộc:** NT-02, NT-04.

---

### BH-02 (Must · Sprint 3) — Tạo bill bán vé (màn hình quầy)
**Là** thu ngân, **tôi muốn** tạo bill bằng nút chọn loại vé + số lượng với giá tự áp, **để** hoàn tất một bill trong ≤ 30 giây kể cả giờ cao điểm.

**Acceptance Criteria**
1. Màn hình bán: lưới nút loại vé (màu & thứ tự theo VG-01), mỗi nút hiển thị tên + đơn giá hiện hành. Chạm nút = +1 vé; nút +/− và nhập số trực tiếp cho số lượng lớn; vùng chạm ≥ 48×48px, dùng tốt trên màn cảm ứng 15" và tablet.
2. Panel bill bên phải cập nhật realtime: dòng vé (tên, SL, đơn giá, thành tiền), giảm giá (nếu có), TỔNG cỡ chữ lớn.
3. Đơn giá do server/bộ quy tắc giá quyết định theo VG-02; client không gửi giá lên — server tự tính lại và là số cuối cùng (chống can thiệp phía client).
4. Bill lưu **snapshot**: tên loại vé, đơn giá, SL, giảm giá, tổng, khung giờ & loại ngày đã áp — độc lập hoàn toàn với thay đổi cấu hình tương lai.
5. Bill tối thiểu 1 vé có giá > 0 hoặc tổng > 0 sau giảm... **ngoại lệ:** bill toàn vé miễn phí không tồn tại độc lập (vé miễn phí phải đi kèm ≥ 1 vé có phí trên cùng bill) — xác nhận quy tắc với khách, nếu khác thì chỉnh AC này.
6. Hiệu năng: mọi thao tác chạm phản hồi < 300ms; tạo & lưu bill < 1s ở tải 2 quầy × 4 bill/phút (kịch bản load test bắt buộc trước pilot: 5× tải này trong 30 phút liên tục).
7. Bill đang tạo dở không mất khi: refresh trang, khóa màn hình NT-04, rớt mạng (giữ ở local cho tới khi thanh toán hoặc chủ động hủy nháp).

**Phụ thuộc:** BH-01, VG-01, VG-02.

---

### BH-03 (Must · Sprint 3) — Thanh toán đa phương thức
**Là** thu ngân, **tôi muốn** thanh toán bằng tiền mặt, chuyển khoản QR, thẻ hoặc kết hợp, **để** phục vụ mọi khách và dữ liệu đối soát chuẩn ngay từ nguồn.

**Acceptance Criteria**
1. Phương thức: `Tiền mặt` / `Chuyển khoản` / `Thẻ (quẹt qua POS ngân hàng ngoài)` — bật/tắt theo CN.
2. **Tiền mặt:** nhập tiền khách đưa (phím nhanh mệnh giá 100k/200k/500k) → hiện TIỀN THỐI cỡ lớn; tiền khách đưa < tổng → chặn.
3. **Chuyển khoản:** hiển thị VietQR động theo tài khoản CN (NT-01.2) với số tiền = tổng bill, nội dung = số bill; nút "Khách đã CK" để thu ngân xác nhận sau khi thấy tiền về app ngân hàng (MVP xác nhận thủ công; đối khớp tự động ở TC-02.2). CN chưa cấu hình TK → phương thức CK bị ẩn.
4. **Thẻ:** ghi nhận số tiền + 4 số cuối mã giao dịch máy POS ngân hàng (tùy chọn) — hệ thống KHÔNG tích hợp cổng thẻ trong MVP (ghi rõ out-of-scope).
5. **Kết hợp:** thêm nhiều dòng thanh toán, mỗi dòng (phương thức, số tiền); tổng các dòng phải = tổng bill mới cho hoàn tất; tiền thối chỉ tính trên phần tiền mặt.
6. Thanh toán xong: bill chuyển `Hoàn tất`, khóa mọi chỉnh sửa (chỉ còn hủy theo BH-06), tự động in (BH-04), quay về màn hình bán mới trong < 1s.
7. Bill lưu chi tiết thanh toán theo dòng — nguồn dữ liệu cho chốt ca BH-07 và đối soát TC-02.

**Phụ thuộc:** BH-02, NT-01.

---

### BH-04 (Must · Sprint 3) — In bill nhiệt & quy tắc đánh số
**Là** thu ngân, **tôi muốn** bill in ra ngay khi thanh toán với số bill liên tục, **để** khách có chứng từ và chủ có công cụ chống bỏ bill.

**Acceptance Criteria**
1. In tự động khi hoàn tất thanh toán, khổ 80mm, thời gian in < 3s. Nội dung: logo + tên/địa chỉ/SĐT CN, số bill, thời điểm, thu ngân, bảng vé (tên — SL — đơn giá — thành tiền, gồm cả vé miễn phí 0đ), giảm giá & người duyệt (nếu có), TỔNG, chi tiết thanh toán & tiền thối, dòng cảm ơn (cấu hình), điều kiện vé trẻ em (từ VG-01).
2. **Số bill:** định dạng `[MÃ CN]-[YYMMDD]-[NNNN]`, NNNN tăng dần từ 0001 theo NGÀY theo CN (gộp mọi thiết bị), cấp bởi server, **liên tục không nhảy số** — bill hủy giữ nguyên số (BH-06.1). Lỗ hổng dải số = tín hiệu đỏ trong GA-02.
3. In lại: từ màn hình lịch sử bill trong ca, bản in lại có chữ **"BẢN SAO — in lần N"**; mỗi lần in lại ghi log (ai, lúc nào).
4. Máy in lỗi/hết giấy: bill VẪN được lưu hoàn tất, màn hình báo lỗi in rõ ràng + nút in lại; không vì lỗi in mà tạo bill trùng.
5. Kỹ thuật in: qua print agent cài trên máy quầy (kết nối máy in nhiệt USB/LAN); mẫu bill mockup được khách duyệt (ký xác nhận) trước khi code — task riêng tuần 2.
6. Test tối thiểu trên 2 dòng máy in phổ biến khách sẽ mua (chốt model ở Sprint 0, ghi vào biên bản phần cứng).

**Phụ thuộc:** BH-03.

---

### BH-05 (Must · Sprint 4) — Chế độ offline cho quầy ★ không được cắt
**Là** thu ngân, **tôi muốn** tiếp tục tạo & in bill khi mất mạng và hệ thống tự đồng bộ khi có mạng lại, **để** không bao giờ dừng bán hàng giờ cao điểm.

**Acceptance Criteria**
1. Thiết bị quầy cache cục bộ: danh mục loại vé, bảng giá hiệu lực (kèm bảng giá tương lai đã công bố + lịch lễ + khung giờ), chương trình giảm giá đang chạy, danh sách PIN băm của QL CN — làm mới mỗi lần online.
2. Mất kết nối: banner đỏ thường trực "ĐANG OFFLINE — bill sẽ tự đồng bộ", kèm số bill đang chờ sync. Toàn bộ luồng BH-02/03/04 hoạt động bình thường tối thiểu 30 phút và tối đa dung lượng 200 bill offline/thiết bị.
3. **Đánh số offline:** thiết bị dùng dải số tạm `[MÃ CN]-[YYMMDD]-T[MÃ MÁY][NNN]`; khi sync, server cấp số chính thức tiếp theo của dải ngày và LƯU KÈM số tạm (bill in cho khách mang số tạm — chấp nhận được, ghi rõ nghiệp vụ này với kế toán). Không trùng số, không mất bill trong mọi kịch bản test ở mục 6.
4. Giảm giá cần duyệt khi offline: xác thực PIN QL bằng bản băm cache cục bộ; log duyệt sync lên sau.
5. Không khả dụng khi offline (chặn kèm thông báo): mở ca mới trên thiết bị chưa từng mở ca hôm đó, hủy bill đã sync, chốt ca (được nhập số liệu chốt tạm, hoàn tất khi online lại), voucher giới hạn lượt (chỉ cho giảm thủ công + duyệt PIN — tránh vượt quỹ lượt).
6. **Kịch bản test bắt buộc (QA viết test plan riêng):** (a) rớt mạng đúng lúc bấm thanh toán; (b) 2 thiết bị cùng CN cùng offline rồi online lệch nhau; (c) mạng chập chờn bật/tắt mỗi 30 giây trong 10 phút; (d) thiết bị tắt nguồn khi còn 20 bill chưa sync → mở lại phải còn đủ; (e) offline xuyên qua 0h (đổi ngày, đổi dải số); (f) offline khi bảng giá mới có hiệu lực lúc 0h (giá cache tương lai phải tự áp — VG-02.6).
7. Màn hình "Hàng chờ đồng bộ" cho QL CN: số bill chờ theo thiết bị, lần sync cuối, nút thử sync lại; bill kẹt sync > 15 phút khi đã online → cảnh báo đỏ.

**Phụ thuộc:** BH-02, BH-03, BH-04. **Ghi chú:** story rủi ro kỹ thuật cao nhất — Tech Lead làm spike 2–3 ngày ngay Sprint 3, không để dồn sang Sprint 4.

---

### BH-06 (Must · Sprint 4) — Hủy bill có kiểm soát
**Là** thu ngân, **tôi muốn** hủy bill nhầm với lý do và QL duyệt, **để** xử lý sai sót mà không tạo lỗ hổng gian lận.

**Acceptance Criteria**
1. Hủy = chuyển trạng thái `Đã hủy`, GIỮ NGUYÊN số bill và toàn bộ nội dung (không xóa bản ghi, không đứt dải số).
2. Điều kiện: bill thuộc ca đang mở của chính thiết bị/thu ngân; bắt buộc chọn lý do (danh mục: khách đổi ý trước khi vào, thu ngân bấm nhầm, khác + ghi chú) và QL CN nhập PIN duyệt.
3. Bill của ca ĐÃ CHỐT: không hủy tại quầy — chỉ kế toán xử lý bằng phiếu điều chỉnh (TC-03); nút hủy ẩn kèm hướng dẫn.
4. Bill hủy: không tính doanh thu/số khách; hiển thị gạch ngang trong danh sách; đếm vào chỉ số bất thường GA-02; nếu đã in → màn hình nhắc thu hồi bill giấy (quy trình vận hành, ghi vào HDSD).
5. Hoàn tiền khách khi bill hủy sau thanh toán CK: MVP xử lý ngoài hệ thống, ghi chú số tiền hoàn + tham chiếu trong phiếu chi TC-01 (khoản mục "Hoàn tiền khách") — quy trình này viết vào HDSD kế toán.

**Phụ thuộc:** BH-03, NT-02.7.

---

### BH-07 (Must · Sprint 4) — Chốt ca
**Là** thu ngân, **tôi muốn** chốt ca với số liệu hệ thống tính sẵn và chỉ nhập tiền đếm thực tế, **để** bàn giao ca trong 10 phút và số liệu đổ thẳng về kế toán.

**Acceptance Criteria**
1. Màn hình chốt ca tự tính: tổng bill hoàn tất & tổng vé theo loại; doanh thu theo phương thức; tổng giảm giá & số lượt duyệt; số bill hủy; phiếu thu/chi từ két trong ca (TC-01); **tiền mặt lý thuyết = đầu ca + thu tiền mặt + phiếu thu két − phiếu chi két**.
2. Thu ngân nhập tiền mặt đếm thực tế (có bảng đếm theo mệnh giá); hệ thống hiện CHÊNH LỆCH = thực tế − lý thuyết, tô đỏ nếu ≠ 0; chênh ≠ 0 bắt buộc ghi chú.
3. Nhập số tiền nộp về két chính/nộp ngân hàng và tiền để lại quầy cho ca sau (tổng phải khớp tiền thực tế).
4. Xác nhận chốt: ca chuyển `Đã chốt`, mọi bill trong ca đóng băng; in **phiếu chốt ca** (khổ 80mm: số liệu mục 1–3 + dòng ký thu ngân & QL); dữ liệu đổ về TC-02 và BC-01 ngay.
5. Chốt ca yêu cầu online (đồng bộ hết bill offline trước — khớp BH-05.5); còn bill chờ sync → chặn kèm hướng dẫn.
6. QL CN có quyền chốt thay (tình huống thu ngân về đột xuất) — ghi log "chốt bởi".
7. Ca đóng treo (BH-01.4) hiển thị trong danh sách chờ kế toán xử lý, không tự động chốt.

**Phụ thuộc:** BH-01→06, TC-01.

---

### BH-08 (Should · Sprint 4) — Màn hình theo dõi ca thời gian thực cho QL
**Là** quản lý CN, **tôi muốn** theo dõi ca đang chạy (vé theo loại, doanh thu lũy kế, nhịp bill 30 phút/lần, số hủy & giảm giá), **để** nắm tình hình mà không đứng sau lưng thu ngân.

**Acceptance Criteria**
1. Cập nhật ≤ 60 giây/lần; xem trên điện thoại trình duyệt tốt (QL hay di chuyển).
2. So sánh nhanh với cùng ca của tuần trước (cùng thứ).
3. Chỉ hiển thị CN thuộc phạm vi user.

**Phụ thuộc:** BH-02, BH-07.

---

# EPIC E3 — TÀI CHÍNH & ĐỐI SOÁT
*Sprint 5 · Component: finance*

---

### TC-01 (Must · Sprint 5) — Phiếu thu-chi
**Là** thu ngân/QL CN/kế toán, **tôi muốn** ghi nhận mọi khoản thu-chi ngoài bán vé bằng phiếu theo khoản mục chuẩn, **để** mọi đồng tiền tại CN đều có chứng từ và vào đúng P&L.

**Acceptance Criteria**
1. Phiếu gồm: loại (Thu/Chi), khoản mục (từ sơ đồ NT-03.4 — lọc đúng loại), số tiền, nguồn tiền (`Két quầy [ca hiện tại]` / `Két chính CN` / `Tài khoản ngân hàng`), người nhận/nộp, diễn giải, đính kèm ảnh chứng từ (tối đa 5 ảnh, bắt buộc với chi > ngưỡng cấu hình), ngày chứng từ (mặc định hôm nay, lùi tối đa N ngày cấu hình).
2. Phiếu nguồn `Két quầy`: bắt buộc gắn ca đang mở và tính vào tiền mặt lý thuyết của ca (BH-07.1).
3. Phiếu vượt ngưỡng khoản mục (NT-03.4): trạng thái `Chờ duyệt` → QL CN hoặc kế toán duyệt mới có hiệu lực vào số liệu; từ chối phải ghi lý do.
4. Sửa/xóa phiếu: chỉ khi ngày chưa khóa sổ (TC-02.6) và phiếu chưa duyệt; sau đó chỉ dùng phiếu điều chỉnh (TC-03). Mọi sửa/xóa ghi audit log giá trị trước/sau.
5. Phiếu chi thanh toán NCC: chọn thêm NCC + (tùy chọn) các phiếu nhận hàng được thanh toán → trừ công nợ MH-03.
6. Danh sách phiếu: lọc theo CN, khoảng ngày, khoản mục, nguồn tiền, trạng thái; tổng cộng chân trang theo bộ lọc; xuất Excel.

**Phụ thuộc:** NT-03.4, BH-01.

---

### TC-02 (Must · Sprint 5) — Đối soát 3 chiều & khóa sổ ★ không được cắt
**Là** kế toán chuỗi, **tôi muốn** màn hình đối soát theo ngày × CN giữa doanh thu hệ thống — tiền két thực nộp — tiền về ngân hàng, và khóa sổ ngày đã khớp, **để** phát hiện sai lệch trong vòng 1 ngày và số liệu quá khứ bất biến.

**Acceptance Criteria**
1. Màn hình chọn (ngày, CN) hiển thị 3 khối:
   - **Hệ thống:** doanh thu theo phương thức (từ bill), chi tiết theo ca; phiếu thu-chi két trong ngày.
   - **Két:** tiền thực tế các ca đã chốt (BH-07.2), số nộp ngân hàng/để lại quầy (BH-07.3), chênh lệch từng ca kèm ghi chú thu ngân.
   - **Ngân hàng:** tiền về tài khoản trong ngày — MVP: nhập tay hoặc **import sao kê Excel** (mapping cột cấu hình 1 lần theo ngân hàng); dòng sao kê có nội dung chứa số bill → tự khớp với bill CK (BH-03.3), còn lại kế toán khớp tay bằng thao tác kéo/chọn.
2. Chênh lệch giữa các khối tô đỏ kèm số tuyệt đối & %; ba trạng thái xử lý: `Chờ xử lý` / `Đã giải trình` (bắt buộc ghi nguyên nhân + đính kèm) / `Đã xử lý` (gắn phiếu điều chỉnh TC-03 nếu có).
3. Given ngày D của CN01 lệch tiền mặt −500.000đ, When kế toán mở đối soát, Then thấy được lệch nằm ở ca nào, ghi chú của thu ngân ca đó, và một luồng thao tác để giải trình hoặc tạo phiếu điều chỉnh — không phải tra 3 báo cáo rời.
4. Chênh lệch `Chờ xử lý` quá N ngày (cấu hình, mặc định 3) → cảnh báo trên Dashboard chủ (BC-01.3).
5. Đối soát tổng quan tháng: lưới ngày × CN, mỗi ô xanh (khớp)/đỏ (lệch)/xám (chưa đủ dữ liệu — ca chưa chốt) — chủ chuỗi nhìn 5 giây biết tháng này sạch hay bẩn.
6. **Khóa sổ:** kế toán khóa theo (ngày, CN) hoặc cả ngày toàn chuỗi khi mọi chênh lệch đã xử lý/giải trình. Sau khóa: bill, phiếu, chốt ca của ngày đó đóng băng tuyệt đối; mở khóa chỉ bởi Kế toán chuỗi kèm lý do, ghi audit log; mọi thay đổi sau đó khuyến nghị đi bằng TC-03.

**Phụ thuộc:** BH-03, BH-07, TC-01.

---

### TC-03 (Must · Sprint 5) — Phiếu điều chỉnh
**Là** kế toán chuỗi, **tôi muốn** điều chỉnh số liệu sau chốt/khóa bằng phiếu điều chỉnh thay vì sửa bản ghi gốc, **để** sổ sách sạch và mọi thay đổi truy vết được.

**Acceptance Criteria**
1. Phiếu điều chỉnh gồm: loại đối tượng (doanh thu ngày/ca, quỹ tiền, công nợ NCC, tồn kho — tồn kho dùng chung cơ chế với KH-02 chênh lệch), CN, ngày ảnh hưởng, số tiền/lượng (+/−), lý do bắt buộc, đính kèm, tham chiếu (số bill, số ca, số phiếu gốc).
2. Chỉ vai trò Kế toán chuỗi tạo; hiệu lực ngay khi lưu; báo cáo kỳ ảnh hưởng phản ánh điều chỉnh và chú thích "có N phiếu điều chỉnh" dẫn link xem.
3. Phiếu điều chỉnh không sửa được — sai thì tạo phiếu điều chỉnh ngược (chuẩn kế toán).
4. Ca "đóng treo" (BH-01.4) có luồng xử lý riêng bằng phiếu điều chỉnh gắn thẳng số ca.

**Phụ thuộc:** TC-02.

---

### TC-04 (Should · Sprint 5) — Sổ quỹ tiền mặt & vị trí tiền
**Là** kế toán chuỗi, **tôi muốn** theo dõi số dư quỹ theo từng CN (két quầy, két chính, tiền chưa nộp ngân hàng) biến động theo phiếu và chốt ca, **để** biết tiền của chuỗi đang nằm ở đâu tại mọi thời điểm.

**Acceptance Criteria**
1. Số dư đầu kỳ khai báo 1 lần khi golive (biên bản ký — thuộc milestone dữ liệu đầu kỳ).
2. Sổ quỹ dạng dòng thời gian: mỗi biến động (chốt ca nộp két, phiếu thu-chi, nộp ngân hàng) là 1 dòng có tham chiếu chứng từ; số dư chạy.
3. Tổng quỹ toàn chuỗi trên 1 màn hình; xuất Excel.

**Phụ thuộc:** TC-01, BH-07.

---

# EPIC E4 — MUA HÀNG & NCC
*Sprint 5–6 · Component: purchasing*

---

### MH-01 (Must · Sprint 5) — Đơn đặt hàng (PO) & luồng duyệt
**Là** thủ kho, **tôi muốn** tạo PO với giá gợi ý từ lịch sử và gửi duyệt trên hệ thống, **để** bỏ quy trình đặt hàng qua Zalo dễ thất lạc, không kiểm soát.

**Acceptance Criteria**
1. PO gồm: NCC (đang hoạt động, phạm vi phủ CN), ngày giao mong muốn, danh sách dòng hàng (nguyên liệu — đơn vị mua — số lượng — đơn giá dự kiến — thành tiền), ghi chú. Số PO tự sinh `PO-[MÃ CN]-[YYMM]-[NNN]`.
2. Gợi ý giá mỗi dòng: 3 giá nhập gần nhất tại CN (kèm ngày) + giá nhập trung bình 30 ngày toàn chuỗi của nguyên liệu đó; lệch > X% (cấu hình, mặc định 15%) so với trung bình chuỗi → cảnh báo vàng trên dòng (không chặn — giá hải sản biến động là bình thường, nhưng phải NHÌN THẤY).
3. Trạng thái: `Nháp → Chờ duyệt → Đã duyệt → Đã nhận một phần → Hoàn tất → Đóng`; `Từ chối` (kèm lý do) quay về Nháp cho sửa gửi lại.
4. Quyền duyệt: QL CN duyệt PO của CN; PO có tổng vượt ngân sách mua/ngày của CN (cấu hình theo CN) → cần thêm duyệt của Chủ chuỗi/HQ (duyệt trên web hoặc mobile browser, danh sách chờ duyệt riêng).
5. Sửa PO: chỉ ở Nháp/Từ chối; PO đã duyệt muốn đổi → hủy (lý do) tạo mới, PO hủy giữ lại tra cứu.
6. Bảng theo dõi PO theo trạng thái; nhắc PO đã duyệt quá hạn giao N ngày chưa nhận.

**Phụ thuộc:** NT-03.

---

### MH-02 (Must · Sprint 6) — Nhận hàng theo PO (giá & lượng thực tế)
**Là** thủ kho, **tôi muốn** nhận hàng theo PO với số lượng và giá THỰC TẾ có thể lệch PO, chụp ảnh chứng từ, **để** kho và giá vốn phản ánh đúng thực tế từng ngày.

**Acceptance Criteria**
1. Từ PO đã duyệt → tạo phiếu nhận: mỗi dòng hiện SL đặt / đã nhận trước / nhận lần này; nhập SL thực nhận & đơn giá thực tế; SL nhận có thể < hoặc > SL đặt (vượt > 10% → cảnh báo + lý do); giá lệch dự kiến > X% → cảnh báo vàng như MH-01.2.
2. Bắt buộc ≥ 1 ảnh phiếu giao/hàng hóa; ghi người giao (tùy chọn).
3. Hoàn tất phiếu nhận **tự sinh phiếu nhập kho** (KH-01) khớp từng dòng — một thao tác, thủ kho không nhập lần hai; đồng thời ghi tăng công nợ NCC (MH-03) theo tổng giá trị thực nhận.
4. Nhận một phần: PO chuyển `Đã nhận một phần`; phần còn lại tiếp tục nhận sau hoặc thủ kho đóng dư (lý do: NCC hết hàng...) → PO `Hoàn tất`.
5. Đơn giá thực tế theo đơn vị mua tự quy đổi về đơn vị gốc (NT-03.1) — giá này là đầu vào tính **bình quân gia quyến** giá trị tồn (phương pháp chốt với kế toán ở Sprint 0, ghi thành trang quy tắc tính trong PRD kèm ví dụ số).
6. Phiếu nhận sau khi hoàn tất không sửa — sai thì điều chỉnh kho (KH-02/TC-03); giao diện tối ưu tablet (thủ kho đứng nhận hàng ở kho).
7. Nhận hàng KHÔNG có PO (mua gấp ngoài chợ): cho phép tạo "nhận nhanh" không qua PO nhưng bắt buộc lý do + QL duyệt sau trong 24h; đếm tỷ lệ nhận nhanh/tổng vào báo cáo (nhiều = quy trình đặt hàng đang bị lách).

**Phụ thuộc:** MH-01, KH-01, NT-03.

---

### MH-03 (Should · Sprint 6) — Công nợ NCC
**Là** kế toán chuỗi, **tôi muốn** số dư công nợ từng NCC × CN tăng theo nhận hàng và giảm theo phiếu chi thanh toán, **để** biết đang nợ ai bao nhiêu và không thanh toán trùng/sót.

**Acceptance Criteria**
1. Số dư đầu kỳ công nợ khai báo khi golive (biên bản).
2. Sổ chi tiết NCC: dòng thời gian phát sinh (phiếu nhận +) và thanh toán (phiếu chi −, từ TC-01.5), số dư chạy; đối chiếu được với NCC bằng bản xuất Excel theo khoảng ngày.
3. Tổng hợp: bảng NCC × số dư × tuổi nợ (trong hạn / quá hạn theo điều khoản NT-03.5); quá hạn tô đỏ. (Lịch thanh toán & nhắc hạn tự động → v1.1.)

**Phụ thuộc:** MH-02, TC-01.

---

# EPIC E5 — KHO & HAO HỤT
*Sprint 6–7 · Component: inventory*

---

### KH-01 (Must · Sprint 6) — Nhập-xuất-tồn theo thời gian thực
**Là** thủ kho, **tôi muốn** tồn kho tự cập nhật theo phiếu nhập và các loại phiếu xuất, **để** tồn lý thuyết luôn sẵn sàng đối chiếu với thực tế.

**Acceptance Criteria**
1. **Phiếu nhập:** nguồn duy nhất là nhận hàng MH-02 (tự sinh) + phiếu nhập điều chỉnh từ kiểm kê/kế toán. Không có nhập tay tự do (chống nhét tồn ảo).
2. **Phiếu xuất, 3 loại:** `Xuất chế biến` (mặc định hàng ngày — chọn nhanh nhiều mặt hàng + SL; đây là nguồn COGS cho cost/khách BC-01); `Xuất hủy` (hàng hỏng/ươn — bắt buộc lý do từ danh mục + ảnh; tính vào hao hụt KH-03); `Xuất chuyển CN` (tạo cặp phiếu chuyển–nhận: CN nhận phải xác nhận SL thực nhận, chênh lệch trên đường đi ghi nhận là hao hụt của CN gửi kèm cảnh báo).
3. Tồn hiện tại theo (CN × nguyên liệu): SL theo đơn vị gốc + giá trị theo bình quân gia quyền (quy tắc MH-02.5); màn hình tồn lọc theo nhóm, tìm kiếm, cột cảnh báo dưới tối thiểu (KH-04).
4. **Tồn không âm — chặn mềm:** phiếu xuất làm tồn âm → cảnh báo đỏ, cho ghi đè kèm lý do bắt buộc (thực tế FnB hay nhập phiếu trễ hơn dùng hàng); mọi ghi đè vào audit log + báo cáo "số lần ghi đè âm" theo CN (nhiều = kỷ luật nhập liệu kém → PM đào tạo lại).
5. Thẻ kho từng nguyên liệu: dòng thời gian nhập/xuất/kiểm kê với số dư chạy — công cụ truy vết số 1 khi khách hỏi "sao tồn ra số này".
6. Tồn đầu kỳ import từ Excel (template + preview lỗi như NT-03.3), khóa sau khi ký biên bản.

**Phụ thuộc:** NT-03, MH-02.

---

### KH-02 (Must · Sprint 7) — Kiểm kê & chênh lệch ★ không được cắt
**Là** thủ kho, **tôi muốn** kiểm kê cuối ngày trên tablet với danh sách gọn và hệ thống tự tính chênh lệch so với tồn lý thuyết, **để** hao hụt lộ ra hằng ngày thay vì cuối tháng.

**Acceptance Criteria**
1. Tạo phiên kiểm kê: chọn phạm vi — `Toàn bộ có phát sinh hôm nay` (mặc định) / theo nhóm hàng / danh sách tùy chọn (kiểm kê luân phiên: hải sản tươi hằng ngày, đồ khô mỗi tuần — lịch khuyến nghị ghi trong HDSD).
2. Màn hình đếm tối ưu tablet: từng dòng hiện tên + đơn vị + ô nhập số thực tế; **KHÔNG hiển thị tồn lý thuyết trong lúc đếm** (chống nhìn số chép số — yêu cầu từ chống gian lận, xác nhận với chủ); hỗ trợ nhập theo đơn vị quy đổi (2 thùng + 3 kg → 23 kg).
3. Hoàn tất đếm → màn hình kết quả: từng dòng chênh lệch = thực − lý thuyết (SL & giá trị), % hao hụt so với ĐỊNH MỨC nhóm/nguyên liệu (NT-03.1); vượt định mức tô đỏ, bắt buộc chọn nguyên nhân (hàng ươn hủy chưa lập phiếu, chế biến vượt, nghi thất thoát, đếm nhầm...) trước khi xác nhận.
4. Xác nhận phiên: hệ thống sinh phiếu điều chỉnh tồn tự động (đưa lý thuyết = thực tế) gắn phiên kiểm kê; tồn sau kiểm kê là mốc cho ngày kế; phiên đã xác nhận không sửa — sai thì kiểm kê lại.
5. Given phiên kiểm kê tối có tôm sú lệch −6% trong khi định mức hải sản tươi 5%, When thủ kho xác nhận, Then dòng này bắt buộc nguyên nhân, xuất hiện trong cảnh báo Dashboard chủ (BC-01.3) NGAY TRONG NGÀY và trong báo cáo KH-03.
6. CN chưa hoàn tất kiểm kê phạm vi mặc định trong ngày → cảnh báo "CN chưa kiểm kê" trên Dashboard sáng hôm sau (chỉ số kỷ luật vận hành, North Star adoption).
7. Cho phép 2 người đếm song song 2 nhóm hàng khác nhau trong cùng phiên (khóa theo dòng, không ghi đè nhau).

**Phụ thuộc:** KH-01.

---

### KH-03 (Must · Sprint 7) — Báo cáo hao hụt so với định mức
**Là** chủ chuỗi, **tôi muốn** báo cáo hao hụt theo nhóm hàng × CN × kỳ so với định mức, **để** biết tiền đang rơi ở đâu và CN nào cần chấn chỉnh.

**Acceptance Criteria**
1. Hao hụt kỳ = (chênh lệch kiểm kê âm + xuất hủy) theo nhóm/nguyên liệu, tính cả SL và GIÁ TRỊ (bình quân gia quyền); so với định mức: hiển thị %, vượt tô đỏ.
2. Xem theo ngày/tuần/tháng; so sánh giữa các CN trên cùng bảng (xếp hạng CN theo % hao hụt — công cụ tạo áp lực quản trị lành mạnh); drill-down tới từng phiên kiểm kê & phiếu hủy gốc.
3. Top 10 nguyên liệu hao hụt giá trị lớn nhất kỳ — mặc định mở đầu báo cáo (chủ cần biết "con gì đang ăn tiền", không cần bảng 200 dòng).
4. Xuất Excel.

**Phụ thuộc:** KH-02.

---

### KH-04 (Should · Sprint 7) — Cảnh báo tồn tối thiểu
**Là** thủ kho, **tôi muốn** cảnh báo mặt hàng dưới mức tồn tối thiểu theo CN, **để** đặt hàng kịp trước cao điểm cuối tuần.

**Acceptance Criteria**
1. Mức tối thiểu: mặc định từ NT-03.1, override theo CN; hỗ trợ đặt mức riêng cho `trước cuối tuần` (áp vào thứ 5–6 — buffet cháy hàng thứ 7 là tai nạn doanh thu lớn nhất).
2. Danh sách cảnh báo trên màn hình chính thủ kho + nút "Tạo PO từ danh sách thiếu" đổ sẵn dòng hàng vào MH-01.
3. Không gửi notification ngoài hệ thống trong MVP (v1.1 gửi Zalo).

**Phụ thuộc:** KH-01, MH-01.

---

# EPIC E6 — BÁO CÁO & DASHBOARD
*Sprint 7–8 · Component: reporting*

---

### BC-01 (Must · Sprint 7) — Dashboard buổi sáng của chủ chuỗi ★
**Là** chủ chuỗi, **tôi muốn** một màn hình trả lời trong 30 giây: hôm qua bán bao nhiêu, cost/khách bao nhiêu, tiền về đủ chưa, có gì bất thường, **để** điều hành chuỗi mỗi sáng bằng số liệu thay vì gọi điện từng CN.

**Acceptance Criteria**
1. **Khối Doanh thu:** tổng chuỗi & từng CN hôm qua (doanh thu, số vé theo loại, số bill); so sánh **cùng thứ tuần trước** (buffet so theo thứ, không so ngày liền kề) với mũi tên %; biểu đồ 14 ngày.
2. **Khối Cost/khách:** = giá trị `Xuất chế biến` ÷ tổng số khách (mọi vé kể cả miễn phí) theo ngày × CN; đường 7 ngày; vượt ngưỡng đỏ (cấu hình theo CN, VD 180.000đ/khách) → tô đỏ. Chú thích công thức ngay trên widget (tránh tranh cãi số liệu).
3. **Khối Cảnh báo hành động** (mỗi dòng click đi thẳng màn hình xử lý): chênh lệch đối soát chờ xử lý quá hạn (TC-02.4); hao hụt vượt định mức hôm qua (KH-02.5); ca chưa chốt / CN chưa kiểm kê; bill kẹt sync (BH-05.7); PO chờ duyệt của tôi.
4. Bộ lọc khoảng ngày & CN; mặc định "hôm qua, toàn chuỗi".
5. **Hiệu năng:** tải < 3 giây với 12 tháng dữ liệu × 8 CN — bắt buộc dùng bảng tổng hợp theo ngày (pre-aggregate, cập nhật khi chốt ca/kiểm kê/khóa sổ), không query bảng bill thô; đây là AC kỹ thuật, QA test bằng dữ liệu sinh giả lập 8 CN × 12 tháng.
6. Xem tốt trên điện thoại (chủ xem lúc 7h sáng ở bất cứ đâu).

**Phụ thuộc:** BH-07, TC-02, KH-01, KH-02.

---

### BC-02 (Must · Sprint 8) — P&L theo CN & hợp nhất
**Là** chủ chuỗi/kế toán, **tôi muốn** báo cáo lãi-lỗ đơn giản theo tháng cho từng CN và hợp nhất, **để** biết lãi thực từng điểm bán.

**Acceptance Criteria**
1. Cấu trúc: Doanh thu vé (net sau giảm giá, có dòng tổng giảm giá riêng) − COGS nguyên liệu (giá trị xuất chế biến + xuất hủy trong kỳ) − Chi phí theo nhóm khoản mục từ phiếu chi (nhân công, thuê mặt bằng, điện nước, khác — theo sơ đồ NT-03.4) = **Lợi nhuận gộp vận hành**. Ghi rõ trên báo cáo: chưa gồm khấu hao/chi phí ngoài hệ thống (trung thực về phạm vi số liệu).
2. Cột: từng CN + Hợp nhất; % trên doanh thu cạnh mỗi dòng (food cost % chuỗi nhìn thấy ngay); so sánh với tháng trước.
3. Kỳ chưa khóa sổ đủ → banner "số liệu tạm tính, còn N ngày chưa khóa".
4. Drill-down mỗi dòng về chứng từ gốc; xuất Excel.
5. Có N phiếu điều chỉnh trong kỳ → chú thích + link (TC-03.2).

**Phụ thuộc:** TC-01, TC-02, KH-01, BC-01.5 (bảng tổng hợp).

---

### BC-03 (Must · Sprint 8) — Bộ xuất Excel đúng mẫu kế toán
**Là** kế toán chuỗi, **tôi muốn** xuất Excel các sổ chi tiết đúng mẫu tôi đang dùng, **để** làm việc với thuế và lưu trữ theo quy trình hiện tại không phải chế lại số.

**Acceptance Criteria**
1. 6 bản xuất: chi tiết bill theo ngày/CN; sổ thu-chi; nhập-xuất-tồn theo nguyên liệu; kết quả kiểm kê; công nợ NCC; bảng chốt ca. Lọc theo CN + khoảng ngày.
2. **Tiêu chí nghiệm thu: đúng cột, đúng thứ tự, đúng định dạng số theo file mẫu THẬT của kế toán khách** — PM thu thập 6 file mẫu ở Sprint 0, đính vào từng ticket Jira như spec; "xuất được Excel" không phải là done.
3. Xuất ≤ 30 giây cho 1 tháng dữ liệu 1 CN; chạy nền + thông báo tải về nếu lâu hơn.
4. Số liệu xuất khớp tuyệt đối với màn hình tại cùng thời điểm lọc (QA đối chiếu chéo).

**Phụ thuộc:** các epic dữ liệu tương ứng.

---

### BC-04 (Should · Sprint 8) — Phân tích cơ cấu vé
**Là** chủ chuỗi, **tôi muốn** báo cáo cơ cấu vé (NL/TE, trưa/tối, thường/cuối tuần/lễ) theo CN và theo kỳ, **để** quyết định giá vé, khung giờ và kế hoạch lễ Tết bằng dữ liệu.

**Acceptance Criteria**
1. Biểu đồ tỷ trọng vé theo 3 lát cắt trên; bảng số kèm doanh thu tương ứng; so sánh 2 kỳ tùy chọn (VD lễ 30/4 năm nay vs 2/9 năm nay).
2. Trung bình khách/bill (quy mô nhóm) theo CN — dữ liệu tốt cho bố trí bàn.
3. Xuất Excel.

**Phụ thuộc:** BH-02.

---

# EPIC E7 — GIÁM SÁT & AUDIT
*Xuyên suốt, hoàn thiện Sprint 8 · Component: audit · Label: security*

---

### GA-01 (Must · nền tảng Sprint 1, phủ dần) — Audit log bất biến ★ không được cắt
**Là** chủ chuỗi, **tôi muốn** mọi thao tác nhạy cảm được ghi vết không thể xóa, **để** không ai — kể cả quản trị — xóa được dấu vết.

**Acceptance Criteria**
1. Phạm vi bắt buộc log (danh sách đóng, thêm dần theo epic): hủy bill; giảm giá có duyệt; sửa/xóa/duyệt phiếu thu-chi; ghi đè tồn âm; xác nhận kiểm kê; mở/đóng/đóng treo ca & chốt thay; đổi bảng giá/loại vé/định mức; mở khóa sổ; tạo/sửa user & quyền; đăng nhập thất bại ≥ 5 lần; truy cập chéo CN bị chặn (NT-02.4).
2. Mỗi bản ghi: ai (user + vai trò), làm gì (hành động), đối tượng (loại + mã), lúc nào, tại đâu (CN, thiết bị), giá trị trước/sau (JSON), lý do/người duyệt nếu có.
3. **Append-only:** không API/màn hình nào sửa-xóa log; lưu tối thiểu 24 tháng.
4. Màn hình tra cứu (chỉ Chủ chuỗi, HQ, Kế toán chuỗi): lọc theo người, hành động, đối tượng, CN, khoảng ngày; xuất Excel.
5. Ghi log là một phần Definition of Done của mọi story liên quan — code review phải check.

**Phụ thuộc:** NT-02.

---

### GA-02 (Must · Sprint 8) — Báo cáo bất thường theo ca (chống gian lận quầy)
**Là** chủ chuỗi, **tôi muốn** báo cáo tự động các chỉ số bất thường theo ca/ngày/CN, **để** phát hiện sớm mô hình gian lận phổ biến nhất của bán vé: thu tiền không xuất bill.

**Acceptance Criteria**
1. Chỉ số theo ca: số & giá trị bill hủy; tổng giảm giá và % trên doanh thu ca; số lần giảm cần duyệt; chênh lệch két; **kiểm tra dải số bill** (dải ngày phải liên tục — thiếu số nào liệt kê số đó, tô đỏ); số lần ghi đè tồn âm trong ngày; tỷ lệ "nhận nhanh không PO" (MH-02.7).
2. Ngưỡng cảnh báo cấu hình (mặc định: >3 bill hủy/ca; giảm giá >5% doanh thu ca; chênh két >200.000đ; bất kỳ lỗ hổng dải số nào) — vượt ngưỡng đẩy lên Dashboard BC-01.3.
3. Xếp hạng ca/thu ngân theo tần suất bất thường 30 ngày (công cụ quản trị — trình bày khéo với khách: mục tiêu là quy trình, không phải săn phù thủy; đưa vào tài liệu đào tạo QL).
4. Xuất Excel; dữ liệu giữ ≥ 12 tháng.

**Phụ thuộc:** BH-04→07, VG-03, KH-01, GA-01.

---

### GA-03 (Should · Sprint 8) — Đối chiếu số khách ước lượng
**Là** quản lý CN, **tôi muốn** nhập số khách ước lượng cuối ca (đếm tay/camera) để so với số vé bán ra, **để** có chỉ số chéo phát hiện cho khách vào không xuất bill.

**Acceptance Criteria**
1. Form nhập 1 số/ca (kèm nguồn: đếm tay/camera/khác); so sánh: số khách ước lượng vs tổng vé (kể cả miễn phí) của ca; lệch > ngưỡng % cấu hình → hiện trong GA-02.
2. Không bắt buộc (CN chưa có cách đếm thì bỏ trống); báo cáo ghi rõ ca không có số ước lượng.
3. Ước lượng KHÔNG thay đổi bất kỳ số liệu doanh thu/kho nào — thuần chỉ số tham chiếu.

**Phụ thuộc:** BH-07.

---

# PHẦN C — TỔNG HỢP & KẾ HOẠCH CẮT

**Tổng: 30 stories — 24 Must, 6 Should.**

| Sprint | Stories | Milestone |
|---|---|---|
| 1 | NT-01, NT-02, NT-03 (bắt đầu), GA-01 (nền) | — |
| 2 | NT-03 (xong), NT-04, VG-01, VG-02, VG-03 | Khách bắt đầu nhập dữ liệu đầu kỳ |
| 3 | BH-01→04 (+ spike offline) | — |
| 4 | BH-05→08 | 🎯 **M1: pilot bán thật CN1, song song 2 tuần** |
| 5 | TC-01→04, MH-01 | — |
| 6 | MH-02, MH-03, KH-01 | — |
| 7 | KH-02→04, BC-01 | 🎯 **M2: báo cáo sáng tự động cho chủ** |
| 8 | BC-02→04, GA-02, GA-03, hoàn thiện GA-01 | — |
| 9 | UAT, sửa lỗi, đào tạo, tài liệu | 🎯 **M3: nghiệm thu CN1 → rollout CN2, CN3** |

**Thứ tự cắt nếu cháy tiến độ:** GA-03 → BC-04 → BH-08 → KH-04 → TC-04 → NT-04 → MH-03 (đẩy v1.1).
**Không bao giờ cắt:** BH-05 (offline) · TC-02 (đối soát & khóa sổ) · KH-02 (kiểm kê) · GA-01 (audit log).

**8 điểm gắn nhãn `needs-client-confirm` — PM chốt với khách trước sprint chứa story:**
1. Quy tắc mã CN & mẫu số bill (NT-01, BH-04)
2. Giờ ngoài khung có bán vé không (VG-02.1)
3. Giá theo thời điểm TẠO bill hay THANH TOÁN (VG-02.5)
4. Vé miễn phí có được đứng một mình trên bill không (BH-02.5)
5. Ngưỡng giảm giá phải duyệt & danh mục lý do (VG-03.3)
6. Phương pháp tính giá vốn: bình quân gia quyền — kế toán xác nhận (MH-02.5)
7. Ẩn tồn lý thuyết khi kiểm kê (KH-02.2)
8. 6 file Excel mẫu của kế toán (BC-03.2)
