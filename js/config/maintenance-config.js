// ============================================================================
// FILE: js/config/maintenance-config.js
// MỤC ĐÍCH: Cấu hình bật/tắt Chế độ Bảo Trì toàn web bằng tay (hoặc bạn có thể
//           bật/tắt trực tiếp bằng nút bấm trong trang admin.html đều được!).
// ============================================================================

export const MAINTENANCE_CONFIG = {
  // 1. Đổi `false` thành `true` khi bạn muốn khóa web để bảo trì:
  enabled: false,

  // 2. Mốc thời gian kết thúc bảo trì cố định (Định dạng: YYYY-MM-DDTHH:mm:ss+07:00)
  //    Nhờ dùng mốc thời gian đích cố định nên người xem có bấm F5 trăm lần
  //    thì đồng hồ đếm ngược vẫn tính đúng số giây còn lại, KHÔNG BAO GIỜ bị reset!
  //    Ví dụ: "2026-10-15T03:00:00+07:00" (3 giờ sáng ngày 15/10/2026)
  endTime: "2026-10-15T03:00:00+07:00",

  // 3. Nội dung lời nhắn hiển thị trên màn hình bảo trì:
  title: "Hệ Thống Đang Bảo Trì & Nâng Cấp",
  message:
    "Biển Phim Hay đang tiến hành nâng cấp máy chủ và cập nhật thêm kho phim Full HD mới để mang lại trải nghiệm mượt mà nhất. Vui lòng quay lại khi đồng hồ đếm ngược kết thúc!",

  // 4. Cho phép tài khoản Admin (liemtran.238460@gmail.com) vẫn vào được trang admin.html:
  allowAdminBypass: true
};