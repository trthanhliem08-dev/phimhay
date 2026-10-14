// ============================================================================
// FILE: js/pages/profile.js
// MỤC ĐÍCH: Xử lý trang Hồ sơ cá nhân (profile.html):
//           - Đổi tên hiển thị và đổi Avatar (Chọn mẫu, tải ảnh từ máy hoặc dán link)
//           - Khi lưu hồ sơ mới, tự động đồng bộ lại tên & Avatar trên toàn bộ
//             bình luận cũ của người dùng trong bảng `comments`
// ============================================================================

import {
  auth,
  db,
  updateProfile,
  doc,
  updateDoc,
  collection,
  query,
  where,
  getDocs
} from "../config/firebase-config.js";
import {
  initHeaderAuthUI,
  subscribeAuth,
  openAuthModal,
  isAdminEmail
} from "../services/auth.js";
import {
  DEFAULT_AVATARS,
  getWatchHistory,
  showToast,
  escapeHtml
} from "../utils/helpers.js";

let activeProfile = null;
let selectedAvatarData = "";

document.addEventListener("DOMContentLoaded", () => {
  initHeaderAuthUI();
  renderPresetAvatars();
  renderProfileWatchHistory();
  bindProfileEvents();

  subscribeAuth((profile) => {
    activeProfile = profile;
    if (!profile) {
      showToast("Vui lòng đăng nhập để chỉnh sửa hồ sơ!", "info");
      openAuthModal();
      return;
    }
    // Đảm bảo đóng hộp thoại đăng nhập nếu đã nhận diện được tài khoản
    document.getElementById("auth-modal")?.classList.remove("active");
    populateProfileUI(profile);
  });
});

function populateProfileUI(profile) {
  selectedAvatarData = profile.avatarUrl || DEFAULT_AVATARS[0];

  document.getElementById("profile-current-avatar").src = selectedAvatarData;
  document.getElementById("profile-display-name").textContent = profile.displayName;
  document.getElementById("profile-email").textContent = profile.email;
  document.getElementById("input-profile-name").value = profile.displayName;
  document.getElementById("input-profile-avatar-url").value = selectedAvatarData;

  const badge = document.getElementById("profile-role-badge");
  const isAdmin = profile.role === "admin" || isAdminEmail(profile.email);
  if (badge) {
    badge.className = `role-pill ${isAdmin ? "admin" : "user"}`;
    badge.innerHTML = isAdmin ? '<i class="ri-shield-star-fill"></i> Quản trị viên (Admin)' : '<i class="ri-user-smile-line"></i> Thành viên';
  }
}

function renderPresetAvatars() {
  const container = document.getElementById("preset-avatar-list");
  if (!container) return;

  container.innerHTML = DEFAULT_AVATARS.map(
    (url) => `
      <img
        src="${url}"
        alt="Preset Avatar"
        class="preset-avatar-item"
        data-avatar-url="${url}"
      />
    `
  ).join("");

  container.querySelectorAll(".preset-avatar-item").forEach((img) => {
    img.addEventListener("click", () => {
      container
        .querySelectorAll(".preset-avatar-item")
        .forEach((i) => i.classList.remove("selected"));
      img.classList.add("selected");

      selectedAvatarData = img.dataset.avatarUrl;
      document.getElementById("profile-current-avatar").src = selectedAvatarData;
      document.getElementById("input-profile-avatar-url").value = selectedAvatarData;
    });
  });
}

function bindProfileEvents() {
  // Khi người dùng dán link URL trực tiếp
  const urlInput = document.getElementById("input-profile-avatar-url");
  urlInput?.addEventListener("input", () => {
    const val = urlInput.value.trim();
    if (val) {
      selectedAvatarData = val;
      document.getElementById("profile-current-avatar").src = val;
    }
  });

  // Khi người dùng chọn ảnh từ máy tính -> Nén bằng Canvas sang chuỗi Base64 nhẹ
  const fileInput = document.getElementById("input-avatar-file");
  fileInput?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const base64Avatar = await resizeAndCompressImage(file, 180, 180, 0.82);
      selectedAvatarData = base64Avatar;
      document.getElementById("profile-current-avatar").src = base64Avatar;
      document.getElementById("input-profile-avatar-url").value = base64Avatar;
      document.getElementById("upload-status-text").textContent = `Đã nạp ảnh: ${file.name}`;
      showToast("Đã xử lý ảnh đại diện mới! Bấm Lưu để hoàn tất.", "info");
    } catch (err) {
      console.error("Lỗi xử lý ảnh:", err);
      showToast("Không thể đọc file ảnh này.", "error");
    }
  });

  // Submit lưu thay đổi hồ sơ
  const form = document.getElementById("profile-edit-form");
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!auth.currentUser || !activeProfile) {
      openAuthModal();
      return;
    }

    const newName = document.getElementById("input-profile-name").value.trim();
    const newAvatar =
      document.getElementById("input-profile-avatar-url").value.trim() ||
      selectedAvatarData ||
      DEFAULT_AVATARS[0];

    if (!newName) {
      showToast("Tên hiển thị không được để trống!", "error");
      return;
    }

    const saveBtn = document.getElementById("btn-save-profile");
    saveBtn.disabled = true;
    saveBtn.textContent = "Đang lưu...";

    try {
      const uid = auth.currentUser.uid;

      // 1. Cập nhật bảng `users` trong Firestore
      await updateDoc(doc(db, "users", uid), {
        displayName: newName,
        avatarUrl: newAvatar
      });

      // 2. Cập nhật Firebase Auth Profile (nếu avatar là URL ngắn)
      if (newAvatar.length < 1800) {
        await updateProfile(auth.currentUser, {
          displayName: newName,
          photoURL: newAvatar
        }).catch(() => {});
      }

      // 3. Đồng bộ lại tên và Avatar mới lên tất cả bình luận cũ của user này
      const commentsQuery = query(collection(db, "comments"), where("uid", "==", uid));
      const snap = await getDocs(commentsQuery);
      const updatePromises = [];
      snap.forEach((docSnap) => {
        updatePromises.push(
          updateDoc(doc(db, "comments", docSnap.id), {
            userName: newName,
            userAvatar: newAvatar
          })
        );
      });
      await Promise.all(updatePromises);

      // Cập nhật lại giao diện ngay lập tức
      document.getElementById("profile-display-name").textContent = newName;
      const headerAvatar = document.querySelector(".header-avatar");
      const headerName = document.querySelector(".header-username");
      if (headerAvatar) headerAvatar.src = newAvatar;
      if (headerName) headerName.textContent = newName;

      showToast("Đã cập nhật Hồ sơ & Avatar thành công!", "success");
    } catch (error) {
      console.error("Lỗi lưu hồ sơ:", error);
      showToast("Không thể lưu hồ sơ lúc này.", "error");
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="ri-save-3-line"></i> Lưu Thay Đổi Hồ Sơ';
    }
  });

  // Xóa lịch sử xem phim
  document.getElementById("btn-clear-history")?.addEventListener("click", () => {
    localStorage.removeItem("webphim_history");
    renderProfileWatchHistory();
    showToast("Đã xóa lịch sử xem phim.", "info");
  });
}

/**
 * Nén ảnh đại diện người dùng chọn từ máy tính về kích thước 180x180 gọn nhẹ
 */
function resizeAndCompressImage(file, maxWidth = 180, maxHeight = 180, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = maxWidth;
        canvas.height = maxHeight;
        const ctx = canvas.getContext("2d");

        // Cắt vuông chính giữa ảnh (Center crop)
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;

        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, maxWidth, maxHeight);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = event.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderProfileWatchHistory() {
  const grid = document.getElementById("profile-history-grid");
  if (!grid) return;
  const list = getWatchHistory();

  if (list.length === 0) {
    grid.innerHTML = `<p style="color: var(--text-muted); font-size: 0.88rem;">Bạn chưa có lịch sử xem phim nào.</p>`;
    return;
  }

  grid.innerHTML = list
    .map(
      (item) => `
      <a href="watch.html?slug=${encodeURIComponent(item.slug)}" class="history-card">
        <img src="${escapeHtml(item.thumb_url)}" alt="${escapeHtml(item.name)}" />
        <div class="history-card-body">
          <h4>${escapeHtml(item.name)}</h4>
          <span>${escapeHtml(item.episodeName || "Tập 1")}</span>
        </div>
      </a>
    `
    )
    .join("");
}