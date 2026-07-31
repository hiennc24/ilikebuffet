# DECISIONS — ilikebuffet Admin

Quyết định đã chốt, mỗi dòng một quyết định. Ghi lại lý do vì lý do là thứ mất trước tiên.
Muốn đổi ngược lại thì được, nhưng đọc lý do trước.

| # | Quyết định | Lý do | Ngày |
|---|---|---|---|
| 1 | Brand terracotta không dùng cho nút hành động | Trùng tông với warning và danger — người dùng không phân biệt được nút thường và nút nguy hiểm | 30/07/2026 |
| 2 | Dashboard là T7, không phải T4 | Trả lời câu hỏi khác: "việc gì đang mở" chứ không phải "kỳ vừa rồi thế nào". Không có kỳ báo cáo, không xuất file | 30/07/2026 |
| 3 | Danh sách dạng dòng là T8 | Dữ liệu đa loại, không lên cột được — mỗi dòng điền một tập trường khác nhau | 30/07/2026 |
| 4 | Khối "Cần xử lý" không có link cấp khối | Màn gom đa loại là màn không ai mở. Link đi theo từng dòng, về màn chuyên trách của nó | 30/07/2026 |
| 5 | Enter khác nhau giữa phiếu nhập và kiểm kê | Kiểm kê tự sinh dòng theo phạm vi nên Enter sang dòng dưới; phiếu nhập người dùng tự thêm dòng nên Enter sang ô kế | 30/07/2026 |
| 6 | Thiếu người theo ca là cảnh báo, không chặn | Chặn cứng khiến người dùng nhập sai để lách — xếp một người vào hai ca rồi sửa sau | 30/07/2026 |
| 7 | Mẫu ca lặp theo THỨ, không theo người | Nhân sự thay đổi liên tục còn nhu cầu theo thứ thì ổn định — thứ 7 luôn cần 3 phục vụ dù ai làm. Sao chép tuần giữ khung ca và số người, để trống người xếp | 30/07/2026 |
| 8 | Hai lớp chiều rộng: `office` sàn 1440 không responsive, `ops` từ 768 | Màn văn phòng nhiều cột không dùng trên thiết bị nhỏ; màn vận hành dùng ở quầy. Màn chỉ khai `widthTier`, không tự khai breakpoint | 30/07/2026 |
| 9 | Lưới ca: chế độ chấm công là `ops`, chế độ xếp ca là `office` | Chấm công dùng tại quầy giữa ca; xếp ca là việc bàn giấy cần thấy cả tuần cùng lúc | 30/07/2026 |
| 10 | Cột dài mặc định ellipsis một dòng + tooltip đầy đủ, row height cố định | Chỉ cột đánh dấu `allowWrap` mới cho 2 dòng, và khi đó **cả bảng** chuyển row height auto với min bằng comfortable. Không trộn hai chế độ trong một bảng | 30/07/2026 |
| 11 | Dòng tổng dùng chung định nghĩa cột với thân bảng | Hai lưới độc lập gây lệch cột trong bảng tài chính — lỗi khó phát hiện, hậu quả lớn, và mọi thay đổi cột phải làm hai lần | 30/07/2026 |

## Hệ quả cần theo dõi

**#6 và #7 đã giải toả cả hai câu hỏi chặn đợt 8.** Màn xếp ca giờ đủ điều kiện dựng: thiếu người thì cảnh báo chứ không chặn lưu, và sao chép tuần lặp theo thứ — giữ khung ca cùng số người cần, để trống người xếp.

**#4 đã thực hiện.** Link chân khối "Xem tất cả" của khối "Cần xử lý" ở SC-TQ-01 đã gỡ; mỗi dòng trong khối tự dẫn về màn chuyên trách của nó.

**#10 và #11 phải sửa ở Pattern 1, không sửa ở màn.** Data Table có mặt ở ~35 màn và đang mang bốn lỗi: row height cố định gặp text 2 dòng (gốc), cột px cứng cắt mất chự số, thiếu tooltip khi cắt, dòng tổng khai lại lưới. Hai lỗi giữa là hệ quả của việc chưa có luật tràn — #10 giải quyết cả ba.

**Sửa #11 trước khi thêm màn tài chính nào.** Lệch cột trong bảng tiền không ai phát hiện bằng mắt cho tới khi có người đọc sai một con số.

**#1 cần rà lại các màn đã dựng.** Audit lượt B mục B2h không phát hiện vi phạm, nhưng lượt đó chưa so chéo 24 màn T1 — nên chưa thể khẳng định không màn nào dùng terracotta cho nút hành động.
