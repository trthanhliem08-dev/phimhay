// ============================================================================
// FILE: js/utils/helpers.js
// MỤC ĐÍCH: Các hàm tiện ích dùng chung cho toàn bộ website (Toast thông báo,
//           định dạng thời gian, lưu lịch sử xem phim trên trình duyệt).
// ============================================================================

/**
 * Hiển thị thông báo nổi (Toast) ở góc dưới bên phải màn hình
 * @param {string} message - Nội dung thông báo
 * @param {"success"|"error"|"info"} type - Loại thông báo
 */
export function showToast(message, type = "info") {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  const iconMap = {
    success: "✓",
    error: "✕",
    info: "ℹ"
  };

  toast.innerHTML = `
    <span class="toast-icon">${iconMap[type] || "ℹ"}</span>
    <span class="toast-msg">${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  // Hiệu ứng trượt vào
  requestAnimationFrame(() => {
    toast.classList.add("show");
  });

  // Tự động ẩn sau 3.5 giây
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

/**
 * Chống lỗi XSS khi hiển thị chuỗi người dùng nhập
 */
export function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Chuyển đổi thời gian sang dạng "Vừa xong", "5 phút trước"...
 */
export function timeAgo(dateInput) {
  if (!dateInput) return "Vừa xong";
  const date = dateInput.toDate ? dateInput.toDate() : new Date(dateInput);
  const seconds = Math.floor((new Date() - date) / 1000);

  if (isNaN(seconds) || seconds < 30) return "Vừa xong";
  const intervals = [
    { label: "năm", seconds: 31536000 },
    { label: "tháng", seconds: 2592000 },
    { label: "ngày", seconds: 86400 },
    { label: "giờ", seconds: 3600 },
    { label: "phút", seconds: 60 }
  ];

  for (const interval of intervals) {
    const count = Math.floor(seconds / interval.seconds);
    if (count >= 1) {
      return `${count} ${interval.label} trước`;
    }
  }
  return "Vừa xong";
}

/**
 * Lấy danh sách lịch sử xem phim từ LocalStorage
 */
export function getWatchHistory() {
  try {
    const raw = localStorage.getItem("webphim_history");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Lưu phim vào lịch sử xem trên LocalStorage (tối đa 12 phim gần nhất)
 */
export function saveWatchHistory(movieObj) {
  if (!movieObj || !movieObj.slug) return;
  try {
    const list = getWatchHistory().filter((item) => item.slug !== movieObj.slug);
    list.unshift({
      slug: movieObj.slug,
      name: movieObj.name,
      thumb_url: movieObj.thumb_url,
      episodeName: movieObj.episodeName || "Tập 1",
      updatedAt: new Date().toISOString()
    });
    localStorage.setItem("webphim_history", JSON.stringify(list.slice(0, 12)));
  } catch (err) {
    console.warn("Không thể lưu lịch sử xem:", err);
  }
}

/**
 * Danh sách Avatar mặc định đẹp mắt cho người dùng mới hoặc chọn nhanh
 */
export const DEFAULT_AVATARS = [
  "https://api.dicebear.com/9.x/adventurer/svg?seed=Felix&backgroundColor=b6e3f4",
  "https://api.dicebear.com/9.x/adventurer/svg?seed=Aneka&backgroundColor=ffdfbf",
  "https://api.dicebear.com/9.x/adventurer/svg?seed=Liem&backgroundColor=c0aede",
  "https://api.dicebear.com/9.x/adventurer/svg?seed=Milo&backgroundColor=d1d4f9",
  "https://api.dicebear.com/9.x/adventurer/svg?seed=Zoe&backgroundColor=ffd5dc",
  "https://api.dicebear.com/9.x/bottts/svg?seed=Cyber&backgroundColor=b6e3f4"
];