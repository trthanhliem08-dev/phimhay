// ============================================================================
// FILE: js/pages/chat.js
// MỤC ĐÍCH: Điều khiển Phòng Tán Gẫu Cộng Đồng (chat.html) Real-time:
//           - Chỉ cho phép người đã đăng nhập (và không bị ban) gửi tin nhắn
//           - Hiển thị Avatar, Tên & Badge Danh hiệu (Người Mới / Mọt Phim /
//             Thánh Cày Phim / Vương miện ADMIN)
//           - Tự động cuộn mượt xuống tin nhắn mới nhất trên cả PC & Điện thoại
// ============================================================================

import {
  initHeaderAuthUI,
  subscribeAuth,
  openAuthModal,
  isAdminEmail
} from "../services/auth.js";
import {
  listenMovieComments,
  addMovieComment,
  deleteMovieComment,
  toggleBanUserByAdmin
} from "../services/comment.js";
import {
  escapeHtml,
  timeAgo,
  showToast,
  renderUserBadgeHtml,
  DEFAULT_AVATARS
} from "../utils/helpers.js";

// Mã kênh cố định dùng riêng cho Phòng Tán Gẫu Cộng Đồng
const CHAT_ROOM_SLUG = "COMMUNITY_CHAT_ROOM";
const QUICK_EMOJIS = ["😂", "🔥", "❤️", "😭", "🍿", "👍", "😱", "🎉", "✨", "😎"];

let currentProfile = null;
let allChatMessages = [];
let isFirstLoad = true;

document.addEventListener("DOMContentLoaded", () => {
  initHeaderAuthUI();

  subscribeAuth((profile) => {
    currentProfile = profile;
    renderMyChatProfile();
    renderChatInputArea();
    renderChatMessages(false);
    updateAdminClearButton();
  });

  startRealtimeChatRoom();

  // Sự kiện Admin bấm nút "Dọn phòng"
  document.getElementById("btn-clear-all-chat")?.addEventListener("click", async () => {
    if (!allChatMessages.length) return;
    if (confirm(`Bạn muốn xóa toàn bộ ${allChatMessages.length} tin nhắn trong phòng chat này?`)) {
      try {
        for (const msg of allChatMessages) {
          await deleteMovieComment(msg.id);
        }
        showToast("Đã dọn sạch toàn bộ phòng chat!", "success");
      } catch (err) {
        console.error("Lỗi dọn phòng:", err);
      }
    }
  });
});

function updateAdminClearButton() {
  const clearBtn = document.getElementById("btn-clear-all-chat");
  if (!clearBtn) return;
  const isAdmin =
    currentProfile &&
    (currentProfile.role === "admin" || isAdminEmail(currentProfile.email));
  clearBtn.style.display = isAdmin ? "inline-flex" : "none";
}

function renderMyChatProfile() {
  const box = document.getElementById("my-chat-profile-box");
  if (!box) return;

  if (!currentProfile) {
    box.innerHTML = `
      <div>
        <p style="color: var(--text-muted); font-size: 0.84rem; margin-bottom: 10px;">
          Bạn chưa đăng nhập. Hãy đăng nhập để nhận Danh hiệu và trò chuyện cùng mọi người!
        </p>
        <button type="button" class="btn-login-header" id="btn-sidebar-login">
          <i class="ri-user-3-line"></i> Đăng nhập ngay
        </button>
      </div>
    `;
    document.getElementById("btn-sidebar-login")?.addEventListener("click", openAuthModal);
    return;
  }

  const isAdmin = currentProfile.role === "admin" || isAdminEmail(currentProfile.email);
  box.innerHTML = `
    <img src="${escapeHtml(currentProfile.avatarUrl || DEFAULT_AVATARS[0])}" alt="Avatar" />
    <div>
      <div style="font-weight: 800; font-size: 0.95rem; margin-bottom: 4px;">
        ${escapeHtml(currentProfile.displayName)}
      </div>
      <div>${renderUserBadgeHtml(isAdmin ? "admin" : "user", currentProfile.rank)}</div>
      <a href="profile.html" style="display: inline-block; margin-top: 6px; font-size: 0.76rem; color: var(--primary);">
        <i class="ri-edit-circle-line"></i> Đổi Avatar / Tên →
      </a>
    </div>
  `;
}

function renderChatInputArea() {
  const container = document.getElementById("chat-input-area");
  if (!container) return;

  if (!currentProfile) {
    container.innerHTML = `
      <div class="chat-login-gate">
        <span><i class="ri-lock-line"></i> Chỉ thành viên đã đăng nhập tài khoản mới có thể gửi tin nhắn tán gẫu.</span>
        <button type="button" class="btn-login-header" id="btn-gate-login">
          <i class="ri-login-circle-line"></i> Đăng nhập để Chat
        </button>
      </div>
    `;
    document.getElementById("btn-gate-login")?.addEventListener("click", openAuthModal);
    return;
  }

  if (currentProfile.isBanned) {
    container.innerHTML = `
      <div class="chat-login-gate" style="color: #fb7185;">
        <span><i class="ri-forbid-2-line"></i> Tài khoản của bạn hiện đang bị Quản trị viên tạm khóa quyền trò chuyện.</span>
      </div>
    `;
    return;
  }

  const emojisHtml = QUICK_EMOJIS.map(
    (emo) => `<button type="button" class="btn-emoji-quick" data-emo="${emo}">${emo}</button>`
  ).join("");

  container.innerHTML = `
    <div class="quick-emoji-bar">${emojisHtml}</div>
    <form id="chat-send-form" class="chat-form-row">
      <input
        type="text"
        id="chat-msg-input"
        class="chat-text-input"
        placeholder="Nhập tin nhắn tán gẫu cùng mọi người..."
        maxlength="500"
        autocomplete="off"
        required
      />
      <button type="submit" id="btn-chat-submit" class="btn-chat-send">
        <i class="ri-send-plane-2-fill"></i>
        <span>Gửi</span>
      </button>
    </form>
  `;

  const inputEl = document.getElementById("chat-msg-input");
  const formEl = document.getElementById("chat-send-form");
  const submitBtn = document.getElementById("btn-chat-submit");

  // Bấm biểu cảm nhanh -> Chèn vào ô nhập
  container.querySelectorAll(".btn-emoji-quick").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!inputEl) return;
      inputEl.value += btn.dataset.emo;
      inputEl.focus();
    });
  });

  formEl?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = inputEl.value.trim();
    if (!text) return;

    submitBtn.disabled = true;
    try {
      await addMovieComment({
        movieSlug: CHAT_ROOM_SLUG,
        movieName: "💬 Phòng Tán Gẫu",
        content: text
      });
      inputEl.value = "";
      inputEl.focus();
    } catch {
      // Lỗi đã được hiển thị qua Toast
    } finally {
      submitBtn.disabled = false;
    }
  });
}

function startRealtimeChatRoom() {
  listenMovieComments(CHAT_ROOM_SLUG, (messagesDesc) => {
    // Đảo ngược mảng để tin nhắn cũ ở trên, tin nhắn mới nhất nằm ở dưới đáy giống Messenger/Discord
    allChatMessages = [...messagesDesc].reverse();

    const countEl = document.getElementById("chat-total-count");
    if (countEl) countEl.textContent = allChatMessages.length;

    renderChatMessages(true);
    renderActiveChatters(messagesDesc);
  });
}

function renderChatMessages(autoScroll = true) {
  const box = document.getElementById("chat-messages-box");
  if (!box) return;

  if (allChatMessages.length === 0) {
    box.innerHTML = `
      <div class="chat-loading-state">
        <i class="ri-chat-smile-2-line" style="font-size: 2.2rem; color: var(--primary);"></i>
        <span>Chưa có tin nhắn nào. Hãy mở lời chào đầu tiên nhé!</span>
      </div>
    `;
    return;
  }

  const myUid = currentProfile?.uid;
  const isCurrentUserAdmin =
    currentProfile?.role === "admin" || isAdminEmail(currentProfile?.email);

  box.innerHTML = allChatMessages
    .map((msg) => {
      const isMe = myUid && msg.uid === myUid;
      const isAdminAuthor = msg.userRole === "admin" || isAdminEmail(msg.userEmail);
      const canDelete = isCurrentUserAdmin || isMe;
      const canBan = isCurrentUserAdmin && !isAdminAuthor && !isMe;

      return `
        <div class="chat-msg-row ${isMe ? "is-me" : ""} ${isAdminAuthor ? "is-admin-msg" : ""}">
          <img
            src="${escapeHtml(msg.userAvatar || DEFAULT_AVATARS[0])}"
            alt="${escapeHtml(msg.userName)}"
            class="chat-msg-avatar"
          />
          <div class="chat-msg-content-wrap">
            <div class="chat-msg-meta">
              <span class="chat-author-name">${escapeHtml(msg.userName || "Thành viên")}</span>
              ${renderUserBadgeHtml(isAdminAuthor ? "admin" : "user", msg.userRank)}
              <span class="chat-msg-time">${timeAgo(msg.createdAt || msg.clientTime)}</span>
            </div>

            <div class="chat-bubble">${escapeHtml(msg.content)}</div>

            <div class="chat-msg-tools">
              ${
                currentProfile
                  ? `<button type="button" class="btn-msg-tool reply" data-reply-name="${escapeHtml(msg.userName || "Thành viên")}">
                       <i class="ri-reply-line"></i> Trả lời
                     </button>`
                  : ""
              }
              ${
                canDelete
                  ? `<button type="button" class="btn-msg-tool del" data-del-msg="${msg.id}">
                       <i class="ri-delete-bin-6-line"></i> Xóa
                     </button>`
                  : ""
              }
              ${
                canBan
                  ? `<button type="button" class="btn-msg-tool ban" data-ban-uid="${msg.uid}">
                       <i class="ri-forbid-2-line"></i> Chặn
                     </button>`
                  : ""
              }
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  // Sự kiện bấm "Trả lời @Tên"
  box.querySelectorAll("[data-reply-name]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const inputEl = document.getElementById("chat-msg-input");
      if (inputEl) {
        inputEl.value = `@${btn.dataset.replyName} ` + inputEl.value;
        inputEl.focus();
      }
    });
  });

  // Sự kiện Xóa tin nhắn
  box.querySelectorAll("[data-del-msg]").forEach((btn) => {
    btn.addEventListener("click", () => {
      deleteMovieComment(btn.dataset.delMsg);
    });
  });

  // Sự kiện Admin chặn người dùng ngay trong phòng chat
  box.querySelectorAll("[data-ban-uid]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (confirm("Chặn quyền bình luận và chat của tài khoản này?")) {
        toggleBanUserByAdmin(btn.dataset.banUid, true);
      }
    });
  });

  if (autoScroll || isFirstLoad) {
    box.scrollTop = box.scrollHeight;
    isFirstLoad = false;
  }
}

/**
 * Hiển thị danh sách các thành viên vừa tham gia trò chuyện
 */
function renderActiveChatters(messagesDesc) {
  const listEl = document.getElementById("active-chatters-list");
  if (!listEl) return;

  const uniqueMap = new Map();
  messagesDesc.forEach((m) => {
    if (m.uid && !uniqueMap.has(m.uid)) {
      uniqueMap.set(m.uid, m);
    }
  });

  const chatters = Array.from(uniqueMap.values()).slice(0, 8);
  if (chatters.length === 0) {
    listEl.innerHTML = `<p style="color: var(--text-muted); font-size: 0.82rem;">Chưa có thành viên nào.</p>`;
    return;
  }

  listEl.innerHTML = chatters
    .map((u) => {
      const isAdminAuthor = u.userRole === "admin" || isAdminEmail(u.userEmail);
      return `
        <div class="chatter-item">
          <img src="${escapeHtml(u.userAvatar || DEFAULT_AVATARS[0])}" alt="Avatar" />
          <div class="chatter-item-info">
            <strong>${escapeHtml(u.userName || "Thành viên")}</strong>
            <div>${renderUserBadgeHtml(isAdminAuthor ? "admin" : "user", u.userRank)}</div>
          </div>
        </div>
      `;
    })
    .join("");
}