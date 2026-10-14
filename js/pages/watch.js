// ============================================================================
// FILE: js/pages/watch.js
// MỤC ĐÍCH: Điều khiển trang xem phim (watch.html):
//           - Đọc tham số ?slug=... trên thanh địa chỉ
//           - Tải chi tiết phim & danh sách Server/Tập từ API NguonC
//           - Phát phim bằng link `embed` qua thẻ <iframe>
//           - Kết nối bình luận Real-time từ Firebase Firestore
// ============================================================================

import { getMovieDetail } from "../services/api.js";
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
  saveWatchHistory,
  escapeHtml,
  timeAgo,
  showToast
} from "../utils/helpers.js";

const watchState = {
  slug: "",
  movie: null,
  servers: [],
  currentServerIndex: 0,
  currentEpisodeIndex: 0,
  userProfile: null,
  unsubscribeComments: null
};

document.addEventListener("DOMContentLoaded", () => {
  initHeaderAuthUI();

  // Lấy mã phim `slug` từ URL (ví dụ: watch.html?slug=tro-choi-con-muc)
  const params = new URLSearchParams(window.location.search);
  const slug = params.get("slug");

  if (!slug) {
    showToast("Không tìm thấy mã phim! Đang quay về trang chủ...", "error");
    setTimeout(() => {
      window.location.href = "index.html";
    }, 1500);
    return;
  }

  watchState.slug = slug;

  // Lắng nghe trạng thái đăng nhập để hiển thị ô nhập bình luận tương ứng
  subscribeAuth((profile) => {
    watchState.userProfile = profile;
    renderCommentInputBox();
  });

  bindPlayerToolbarEvents();
  loadMovieData();
  startRealtimeComments();
});

/**
 * Tải thông tin chi tiết phim và danh sách tập từ API NguonC
 */
async function loadMovieData() {
  try {
    const { movie, episodes } = await getMovieDetail(watchState.slug);
    watchState.movie = movie;
    watchState.servers = episodes.filter(
      (srv) => Array.isArray(srv.items) && srv.items.length > 0
    );

    document.title = `${movie.name} - Biển Phim Hay`;
    renderMovieDetails(movie);

    if (watchState.servers.length === 0) {
      const placeholder = document.getElementById("player-placeholder");
      if (placeholder) {
        placeholder.innerHTML = `<p><i class="ri-error-warning-line"></i> Phim này hiện chưa có link embed từ NguonC.</p>`;
      }
      return;
    }

    renderServerTabs();
    renderEpisodeButtons();
    playEpisode(0, 0);
  } catch (error) {
    console.error("Lỗi tải chi tiết phim:", error);
    showToast(error.message || "Không thể tải thông tin phim.", "error");
  }
}

/**
 * Hiển thị thông tin chi tiết bộ phim
 */
function renderMovieDetails(movie) {
  document.getElementById("breadcrumb-title").textContent = movie.name;
  document.getElementById("detail-poster").src = movie.thumb_url;
  document.getElementById("detail-title").textContent = movie.name;
  document.getElementById("detail-origin").textContent = movie.original_name;
  document.getElementById("meta-ep").textContent = movie.current_episode;
  document.getElementById("meta-quality").textContent = movie.quality;
  document.getElementById("meta-lang").textContent = movie.language;
  document.getElementById("meta-time").textContent = movie.time || "Đang cập nhật";
  document.getElementById("meta-director").textContent = movie.director;
  document.getElementById("meta-casts").textContent = movie.casts;
  document.getElementById("detail-desc").textContent = movie.description;
}

/**
 * Hiển thị các nút chọn Server (Vietsub, Thuyết minh, Lồng tiếng...)
 */
function renderServerTabs() {
  const container = document.getElementById("server-tabs");
  if (!container) return;

  const buttonsHtml = watchState.servers
    .map(
      (srv, idx) => `
      <button
        type="button"
        class="btn-server ${idx === watchState.currentServerIndex ? "active" : ""}"
        data-server-idx="${idx}"
      >
        ${escapeHtml(srv.server_name || `Server #${idx + 1}`)}
      </button>
    `
    )
    .join("");

  container.innerHTML = `<span class="server-label"><i class="ri-base-station-line"></i> Chọn Server:</span> ${buttonsHtml}`;

  container.querySelectorAll(".btn-server").forEach((btn) => {
    btn.addEventListener("click", () => {
      const newSrvIdx = Number(btn.dataset.serverIdx);
      if (newSrvIdx === watchState.currentServerIndex) return;

      // Giữ nguyên tập đang xem nếu server mới cũng có tập đó
      const targetEpIdx = Math.min(
        watchState.currentEpisodeIndex,
        watchState.servers[newSrvIdx].items.length - 1
      );
      playEpisode(newSrvIdx, Math.max(0, targetEpIdx));
    });
  });
}

/**
 * Hiển thị danh sách nút chọn tập của Server hiện tại
 */
function renderEpisodeButtons() {
  const listEl = document.getElementById("episode-list");
  if (!listEl) return;

  const currentServer = watchState.servers[watchState.currentServerIndex];
  if (!currentServer) return;

  listEl.innerHTML = currentServer.items
    .map(
      (ep, idx) => `
      <button
        type="button"
        class="btn-episode ${idx === watchState.currentEpisodeIndex ? "active" : ""}"
        data-ep-idx="${idx}"
      >
        Tập ${escapeHtml(ep.name)}
      </button>
    `
    )
    .join("");

  listEl.querySelectorAll(".btn-episode").forEach((btn) => {
    btn.addEventListener("click", () => {
      const epIdx = Number(btn.dataset.epIdx);
      playEpisode(watchState.currentServerIndex, epIdx);
    });
  });
}

/**
 * Phát một tập phim cụ thể bằng cách đưa link `embed` vào thẻ `<iframe>`
 */
function playEpisode(serverIndex, episodeIndex) {
  const server = watchState.servers[serverIndex];
  if (!server || !server.items[episodeIndex]) return;

  watchState.currentServerIndex = serverIndex;
  watchState.currentEpisodeIndex = episodeIndex;

  const episode = server.items[episodeIndex];
  const iframe = document.getElementById("movie-iframe");
  const placeholder = document.getElementById("player-placeholder");
  const epLabel = document.getElementById("current-ep-label");

  if (episode.embed) {
    iframe.src = episode.embed;
    iframe.style.display = "block";
    if (placeholder) placeholder.style.display = "none";
  } else {
    iframe.style.display = "none";
    if (placeholder) {
      placeholder.style.display = "flex";
      placeholder.innerHTML = `<p><i class="ri-error-warning-line"></i> Tập này chưa có link nhúng (embed).</p>`;
    }
  }

  const epDisplayName = `Tập ${episode.name} (${server.server_name})`;
  if (epLabel) epLabel.textContent = epDisplayName;

  // Cập nhật trạng thái nút active
  renderServerTabs();
  renderEpisodeButtons();
  updatePrevNextButtons();

  // Lưu vào Lịch sử xem trên trình duyệt
  if (watchState.movie) {
    saveWatchHistory({
      slug: watchState.slug,
      name: watchState.movie.name,
      thumb_url: watchState.movie.thumb_url,
      episodeName: `Tập ${episode.name}`
    });
  }
}

/**
 * Cập nhật nút Tập trước / Tập tiếp theo và nút Tắt đèn
 */
function bindPlayerToolbarEvents() {
  document.getElementById("btn-prev-ep")?.addEventListener("click", () => {
    if (watchState.currentEpisodeIndex > 0) {
      playEpisode(watchState.currentServerIndex, watchState.currentEpisodeIndex - 1);
    }
  });

  document.getElementById("btn-next-ep")?.addEventListener("click", () => {
    const currentServer = watchState.servers[watchState.currentServerIndex];
    if (currentServer && watchState.currentEpisodeIndex < currentServer.items.length - 1) {
      playEpisode(watchState.currentServerIndex, watchState.currentEpisodeIndex + 1);
    }
  });

  const lightsBtn = document.getElementById("btn-toggle-lights");
  lightsBtn?.addEventListener("click", () => {
    document.body.classList.toggle("lights-off");
    const isOff = document.body.classList.contains("lights-off");
    lightsBtn.innerHTML = isOff ? '<i class="ri-sun-line"></i> <span>Bật đèn</span>' : '<i class="ri-lightbulb-flash-line"></i> <span>Tắt đèn</span>';
  });
}

function updatePrevNextButtons() {
  const prevBtn = document.getElementById("btn-prev-ep");
  const nextBtn = document.getElementById("btn-next-ep");
  const currentServer = watchState.servers[watchState.currentServerIndex];

  if (!currentServer) return;
  if (prevBtn) prevBtn.disabled = watchState.currentEpisodeIndex <= 0;
  if (nextBtn) {
    nextBtn.disabled = watchState.currentEpisodeIndex >= currentServer.items.length - 1;
  }
}

// ============================================================================
// PHẦN BÌNH LUẬN REAL-TIME (FIREBASE FIRESTORE)
// ============================================================================

function renderCommentInputBox() {
  const container = document.getElementById("comment-auth-container");
  if (!container) return;

  const profile = watchState.userProfile;

  // Chưa đăng nhập
  if (!profile) {
    container.innerHTML = `
      <div class="login-prompt-box">
        <p>Bạn cần đăng nhập tài khoản để tham gia bình luận thời gian thực.</p>
        <button type="button" id="btn-prompt-login">Đăng nhập ngay</button>
      </div>
    `;
    document
      .getElementById("btn-prompt-login")
      ?.addEventListener("click", openAuthModal);
    return;
  }

  // Đã đăng nhập nhưng đang bị Admin chặn
  if (profile.isBanned) {
    container.innerHTML = `
      <div class="login-prompt-box" style="border-color: #ef4444; color: #fca5a5;">
        <p>🚫 Tài khoản của bạn hiện đang bị Quản trị viên khóa quyền bình luận.</p>
      </div>
    `;
    return;
  }

  // Đã đăng nhập hợp lệ
  container.innerHTML = `
    <form id="comment-form" class="comment-form-box">
      <div class="comment-user-bar">
        <img src="${escapeHtml(profile.avatarUrl)}" alt="Avatar" />
        <span>Bình luận với tên <strong>${escapeHtml(profile.displayName)}</strong></span>
      </div>
      <textarea
        id="comment-input"
        class="comment-textarea"
        placeholder="Chia sẻ cảm nghĩ của bạn về bộ phim này..."
        maxlength="600"
        required
      ></textarea>
      <div class="comment-form-actions">
        <button type="submit" class="btn-send-comment" id="btn-submit-comment">
          Gửi Bình Luận
        </button>
      </div>
    </form>
  `;

  const form = document.getElementById("comment-form");
  const input = document.getElementById("comment-input");
  const submitBtn = document.getElementById("btn-submit-comment");

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    try {
      await addMovieComment({
        movieSlug: watchState.slug,
        movieName: watchState.movie?.name || watchState.slug,
        content: input.value
      });
      input.value = "";
    } catch {
      // Lỗi đã được showToast trong comment.js
    } finally {
      submitBtn.disabled = false;
    }
  });
}

function startRealtimeComments() {
  if (watchState.unsubscribeComments) {
    watchState.unsubscribeComments();
  }

  watchState.unsubscribeComments = listenMovieComments(watchState.slug, (comments) => {
    const countEl = document.getElementById("comment-count");
    const listEl = document.getElementById("comments-list");
    if (countEl) countEl.textContent = comments.length;
    if (!listEl) return;

    if (comments.length === 0) {
      listEl.innerHTML = `
        <p style="color: var(--text-muted); font-size: 0.88rem; text-align: center; padding: 20px 0;">
          Chưa có bình luận nào. Hãy là người đầu tiên bình luận về bộ phim này!
        </p>
      `;
      return;
    }

    const currentUid = watchState.userProfile?.uid;
    const isCurrentUserAdmin =
      watchState.userProfile?.role === "admin" ||
      isAdminEmail(watchState.userProfile?.email);

    listEl.innerHTML = comments
      .map((cmt) => {
        const canDelete = isCurrentUserAdmin || (currentUid && currentUid === cmt.uid);
        const canBan = isCurrentUserAdmin && cmt.userRole !== "admin" && cmt.uid !== currentUid;

        return `
          <div class="comment-item">
            <img
              src="${escapeHtml(cmt.userAvatar || "https://placehold.co/40x40")}"
              alt="${escapeHtml(cmt.userName)}"
              class="comment-avatar"
            />
            <div class="comment-body">
              <div class="comment-meta">
                <span class="comment-author">
                  ${escapeHtml(cmt.userName || "Thành viên")}
                  ${
                    cmt.userRole === "admin"
                      ? `<span class="role-badge-admin">ADMIN</span>`
                      : ""
                  }
                </span>
                <span class="comment-time">${timeAgo(cmt.createdAt || cmt.clientTime)}</span>
              </div>
              <div class="comment-text">${escapeHtml(cmt.content)}</div>
              ${
                canDelete || canBan
                  ? `<div class="comment-mod-actions">
                       ${
                         canDelete
                           ? `<button type="button" class="btn-comment-action delete" data-del-id="${cmt.id}"><i class="ri-delete-bin-6-line"></i> Xóa bình luận</button>`
                           : ""
                       }
                       ${
                         canBan
                           ? `<button type="button" class="btn-comment-action ban" data-ban-uid="${cmt.uid}"><i class="ri-forbid-2-line"></i> Chặn người dùng</button>`
                           : ""
                       }
                     </div>`
                  : ""
              }
            </div>
          </div>
        `;
      })
      .join("");

    // Gắn sự kiện xóa bình luận
    listEl.querySelectorAll("[data-del-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (confirm("Bạn chắc chắn muốn xóa bình luận này?")) {
          deleteMovieComment(btn.dataset.delId);
        }
      });
    });

    // Gắn sự kiện Admin chặn nhanh người dùng
    listEl.querySelectorAll("[data-ban-uid]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (confirm("Chặn quyền bình luận của tài khoản này trên toàn trang web?")) {
          toggleBanUserByAdmin(btn.dataset.banUid, true);
        }
      });
    });
  });
}