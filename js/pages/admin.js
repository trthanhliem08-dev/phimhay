// ============================================================================
// FILE: js/pages/admin.js
// MỤC ĐÍCH: Điều khiển trang Quản trị viên (admin.html):
//           - Kiểm tra chặt chẽ email `liemtran.238460@gmail.com`, nếu không phải
//             sẽ từ chối truy cập ngay lập tức
//           - Lắng nghe Real-time toàn bộ bảng `comments` và `users`
//           - Cho phép xóa bình luận, chặn/mở chặn người dùng và đặt lại Avatar vi phạm
// ============================================================================

import {
  db,
  ADMIN_EMAIL,
  doc,
  updateDoc,
  collection,
  onSnapshot
} from "../config/firebase-config.js";
import {
  initHeaderAuthUI,
  subscribeAuth,
  isAdminEmail
} from "../services/auth.js";
import {
  deleteMovieComment,
  toggleBanUserByAdmin
} from "../services/comment.js";
import {
  escapeHtml,
  timeAgo,
  showToast,
  DEFAULT_AVATARS
} from "../utils/helpers.js";

let allComments = [];
let allUsers = [];
let commentKeyword = "";
let userKeyword = "";

document.addEventListener("DOMContentLoaded", () => {
  initHeaderAuthUI();

  subscribeAuth((profile) => {
    const adminRoot = document.getElementById("admin-root");
    const deniedBox = document.getElementById("admin-denied-box");

    if (!profile || (!isAdminEmail(profile.email) && profile.role !== "admin")) {
      if (adminRoot) adminRoot.style.display = "none";
      if (deniedBox) {
        deniedBox.style.display = "block";
        deniedBox.innerHTML = `
          <h2>⛔ Truy Cập Bị Từ Chối</h2>
          <p style="color: var(--text-muted); margin: 10px 0 18px;">
            Chỉ tài khoản Quản trị viên (<strong>${ADMIN_EMAIL}</strong>) mới có quyền vào trang này.
          </p>
          <a href="index.html" class="btn-hero-play" style="display: inline-flex;">Quay về Trang Chủ</a>
        `;
      }
      return;
    }

    // Hợp lệ: Mở khóa giao diện Admin
    if (deniedBox) deniedBox.style.display = "none";
    if (adminRoot) adminRoot.style.display = "block";
    document.getElementById("admin-email-label").textContent = profile.email;

    startAdminRealtimeListeners();
  });

  document.getElementById("search-comments-admin")?.addEventListener("input", (e) => {
    commentKeyword = e.target.value.trim().toLowerCase();
    renderAdminComments();
  });

  document.getElementById("search-users-admin")?.addEventListener("input", (e) => {
    userKeyword = e.target.value.trim().toLowerCase();
    renderAdminUsers();
  });
});

let listenersStarted = false;
function startAdminRealtimeListeners() {
  if (listenersStarted) return;
  listenersStarted = true;

  // 1. Lắng nghe toàn bộ bảng `comments`
  onSnapshot(collection(db, "comments"), (snapshot) => {
    const list = [];
    snapshot.forEach((docSnap) => {
      list.push({ id: docSnap.id, ...docSnap.data() });
    });
    list.sort((a, b) => {
      const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.clientTime || 0);
      const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.clientTime || 0);
      return tB - tA;
    });
    allComments = list;
    document.getElementById("stat-total-comments").textContent = allComments.length;
    renderAdminComments();
  });

  // 2. Lắng nghe toàn bộ bảng `users`
  onSnapshot(collection(db, "users"), (snapshot) => {
    const list = [];
    snapshot.forEach((docSnap) => {
      list.push({ id: docSnap.id, ...docSnap.data() });
    });
    allUsers = list;
    const bannedCount = allUsers.filter((u) => u.isBanned).length;
    document.getElementById("stat-total-users").textContent = allUsers.length;
    document.getElementById("stat-banned-users").textContent = bannedCount;
    renderAdminUsers();
  });
}

function renderAdminComments() {
  const container = document.getElementById("admin-comments-list");
  if (!container) return;

  const filtered = allComments.filter((c) => {
    if (!commentKeyword) return true;
    return (
      (c.content || "").toLowerCase().includes(commentKeyword) ||
      (c.userName || "").toLowerCase().includes(commentKeyword) ||
      (c.movieName || "").toLowerCase().includes(commentKeyword)
    );
  });

  if (filtered.length === 0) {
    container.innerHTML = `<p style="color: var(--text-muted); font-size: 0.88rem;">Không có bình luận nào khớp bộ lọc.</p>`;
    return;
  }

  container.innerHTML = filtered
    .map(
      (c) => `
      <div class="admin-item">
        <div class="admin-item-left">
          <img
            src="${escapeHtml(c.userAvatar || DEFAULT_AVATARS[0])}"
            alt="Avatar"
            class="admin-item-avatar"
          />
          <div class="admin-item-info">
            <h4>
              ${escapeHtml(c.userName || "Thành viên")}
              <span style="font-weight: 400; font-size: 0.75rem; color: var(--text-muted);">
                (${escapeHtml(c.userEmail || "Ẩn email")})
              </span>
            </h4>
            <div class="sub-meta">${timeAgo(c.createdAt || c.clientTime)}</div>
            <div class="cmt-content">${escapeHtml(c.content)}</div>
            <a href="watch.html?slug=${encodeURIComponent(c.movieSlug)}" class="movie-link-tag">
              🎬 Phim: ${escapeHtml(c.movieName || c.movieSlug)} ↗
            </a>
          </div>
        </div>
        <div class="admin-item-actions">
          <button type="button" class="btn-admin-sm del" data-del-cmt="${c.id}">
            🗑 Xóa Cmt
          </button>
          ${
            !isAdminEmail(c.userEmail)
              ? `<button type="button" class="btn-admin-sm ban" data-ban-user="${c.uid}">
                   🚫 Chặn User
                 </button>`
              : ""
          }
        </div>
      </div>
    `
    )
    .join("");

  container.querySelectorAll("[data-del-cmt]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (confirm("Xóa vĩnh viễn bình luận này?")) {
        deleteMovieComment(btn.dataset.delCmt);
      }
    });
  });

  container.querySelectorAll("[data-ban-user]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (confirm("Chặn quyền bình luận của người dùng này?")) {
        toggleBanUserByAdmin(btn.dataset.banUser, true);
      }
    });
  });
}

function renderAdminUsers() {
  const container = document.getElementById("admin-users-list");
  if (!container) return;

  const filtered = allUsers.filter((u) => {
    if (!userKeyword) return true;
    return (
      (u.displayName || "").toLowerCase().includes(userKeyword) ||
      (u.email || "").toLowerCase().includes(userKeyword)
    );
  });

  if (filtered.length === 0) {
    container.innerHTML = `<p style="color: var(--text-muted); font-size: 0.88rem;">Không tìm thấy người dùng nào.</p>`;
    return;
  }

  container.innerHTML = filtered
    .map((u) => {
      const isUserAdmin = isAdminEmail(u.email) || u.role === "admin";
      return `
        <div class="admin-item">
          <div class="admin-item-left">
            <img
              src="${escapeHtml(u.avatarUrl || DEFAULT_AVATARS[0])}"
              alt="Avatar"
              class="admin-item-avatar"
            />
            <div class="admin-item-info">
              <h4>
                ${escapeHtml(u.displayName || "Thành viên")}
                ${isUserAdmin ? `<span class="role-badge-admin">ADMIN</span>` : ""}
                ${u.isBanned ? `<span class="status-banned-tag">ĐANG BỊ CHẶN</span>` : ""}
              </h4>
              <div class="sub-meta">${escapeHtml(u.email || "Không có email")}</div>
            </div>
          </div>
          <div class="admin-item-actions">
            ${
              !isUserAdmin
                ? `
                  <button
                    type="button"
                    class="btn-admin-sm ${u.isBanned ? "unban" : "ban"}"
                    data-toggle-ban="${u.uid}"
                    data-current-ban="${u.isBanned ? "1" : "0"}"
                  >
                    ${u.isBanned ? "✓ Mở Chặn" : "🚫 Chặn Cmt"}
                  </button>
                  <button
                    type="button"
                    class="btn-admin-sm del"
                    data-reset-avatar="${u.uid}"
                    title="Đặt lại Avatar mặc định nếu ảnh vi phạm"
                  >
                    ↺ Reset Avatar
                  </button>
                `
                : ""
            }
          </div>
        </div>
      `;
    })
    .join("");

  container.querySelectorAll("[data-toggle-ban]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const uid = btn.dataset.toggleBan;
      const isCurrentlyBanned = btn.dataset.currentBan === "1";
      toggleBanUserByAdmin(uid, !isCurrentlyBanned);
    });
  });

  container.querySelectorAll("[data-reset-avatar]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const uid = btn.dataset.resetAvatar;
      if (confirm("Đặt lại Avatar của người dùng này về mặc định?")) {
        await updateDoc(doc(db, "users", uid), {
          avatarUrl: DEFAULT_AVATARS[0]
        });
        showToast("Đã đặt lại Avatar mặc định cho người dùng!", "success");
      }
    });
  });
}