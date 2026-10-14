// ============================================================================
// FILE: js/services/auth.js
// MỤC ĐÍCH: Quản lý Đăng nhập (Google & Email), đồng bộ hồ sơ (kèm danh hiệu
//           mặc định `nguoi_moi`) và lắng nghe Thông báo Toàn Server 60 giây
//           ngay bên dưới thanh Header trên mọi trang.
// ============================================================================

import {
  auth,
  db,
  googleProvider,
  ADMIN_EMAIL,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp
} from "../config/firebase-config.js";
import { showToast, DEFAULT_AVATARS, escapeHtml } from "../utils/helpers.js";

let currentUserProfile = undefined;
let isAuthReady = false;
const authListeners = [];

export function subscribeAuth(callback) {
  authListeners.push(callback);
  if (isAuthReady) {
    callback(currentUserProfile);
  }
}

function notifyAuthListeners(profile) {
  currentUserProfile = profile;
  isAuthReady = true;
  if (profile) {
    closeAuthModal();
  }
  authListeners.forEach((cb) => cb(profile));
}

export function isAdminEmail(email) {
  if (!email) return false;
  return email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

function buildFallbackProfile(firebaseUser) {
  const isUserAdmin = isAdminEmail(firebaseUser.email);
  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email || "",
    displayName:
      firebaseUser.displayName ||
      (firebaseUser.email ? firebaseUser.email.split("@")[0] : "Thành viên"),
    avatarUrl: firebaseUser.photoURL || DEFAULT_AVATARS[0],
    role: isUserAdmin ? "admin" : "user",
    rank: "nguoi_moi",
    isBanned: false
  };
}

/**
 * Đồng bộ thông tin user từ Firebase Auth vào bảng `users` trong Firestore.
 * Người mới đăng ký mặc định nhận rank = "nguoi_moi" (Người Mới).
 */
async function syncUserToFirestore(firebaseUser) {
  const fallback = buildFallbackProfile(firebaseUser);
  try {
    const userRef = doc(db, "users", firebaseUser.uid);
    const userSnap = await getDoc(userRef);
    const isUserAdmin = isAdminEmail(firebaseUser.email);

    if (!userSnap.exists()) {
      const newProfile = {
        ...fallback,
        createdAt: serverTimestamp()
      };
      await setDoc(userRef, newProfile);
      return newProfile;
    } else {
      const existingData = userSnap.data();
      const updates = {};
      if (isUserAdmin && existingData.role !== "admin") {
        updates.role = "admin";
        existingData.role = "admin";
      }
      if (!existingData.rank) {
        updates.rank = "nguoi_moi";
        existingData.rank = "nguoi_moi";
      }
      if (Object.keys(updates).length > 0) {
        await setDoc(userRef, updates, { merge: true });
      }
      return existingData;
    }
  } catch (firestoreErr) {
    console.warn("Cảnh báo Firestore khi đồng bộ user:", firestoreErr);
    return fallback;
  }
}

function translateAuthError(error) {
  const code = error?.code || "";
  if (code === "auth/unauthorized-domain") {
    return `Tên miền "${window.location.hostname}" chưa được thêm vào Authorized domains trên Firebase!`;
  }
  if (code === "auth/operation-not-allowed") {
    return "Bạn chưa bật công tắc Google (hoặc Email) trong mục Authentication -> Sign-in method!";
  }
  if (code === "auth/popup-blocked") {
    return "Trình duyệt đã chặn cửa sổ bật lên (Popup). Hãy cho phép Popup trên web này!";
  }
  if (code === "auth/popup-closed-by-user") {
    return "Bạn đã đóng cửa sổ đăng nhập Google trước khi hoàn tất.";
  }
  return `Lỗi đăng nhập (${code || error.message})`;
}

export async function loginWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const profile = await syncUserToFirestore(result.user);
    if (profile.isBanned) {
      showToast("Tài khoản của bạn đang bị hạn chế bình luận bởi Quản trị viên.", "error");
    } else {
      showToast(`Xin chào, ${profile.displayName}!`, "success");
    }
    closeAuthModal();
    return profile;
  } catch (error) {
    console.error("Chi tiết lỗi đăng nhập Google:", error);
    showToast(translateAuthError(error), "error");
    throw error;
  }
}

export async function loginWithEmail(email, password) {
  try {
    const result = await signInWithEmailAndPassword(auth, email.trim(), password);
    const profile = await syncUserToFirestore(result.user);
    showToast(`Chào mừng trở lại, ${profile.displayName}!`, "success");
    closeAuthModal();
    return profile;
  } catch (error) {
    console.error("Lỗi đăng nhập Email:", error);
    showToast(translateAuthError(error), "error");
    throw error;
  }
}

export async function registerWithEmail(displayName, email, password) {
  try {
    const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
    const randomAvatar = DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)];
    await updateProfile(result.user, {
      displayName: displayName.trim(),
      photoURL: randomAvatar
    });
    const profile = await syncUserToFirestore(result.user);
    showToast("Tạo tài khoản thành công! Bạn nhận danh hiệu Người Mới.", "success");
    closeAuthModal();
    return profile;
  } catch (error) {
    console.error("Lỗi đăng ký:", error);
    showToast(translateAuthError(error), "error");
    throw error;
  }
}

export async function logoutUser() {
  await signOut(auth);
  showToast("Đã đăng xuất tài khoản.", "info");
}

export function openAuthModal() {
  let modal = document.getElementById("auth-modal");
  if (!modal) {
    renderAuthModal();
    modal = document.getElementById("auth-modal");
  }
  modal.classList.add("active");
}

export function closeAuthModal() {
  const modal = document.getElementById("auth-modal");
  if (modal) modal.classList.remove("active");
}

function renderAuthModal() {
  const modalHtml = `
    <div id="auth-modal" class="auth-modal-overlay">
      <div class="auth-modal-card">
        <button class="auth-modal-close" id="btn-close-auth" title="Đóng">&times;</button>
        <div class="auth-modal-header">
          <span class="brand-badge">BIỂN PHIM HAY</span>
          <h3 id="auth-modal-title">Đăng nhập tài khoản</h3>
          <p>Đăng nhập để bình luận real-time, nhận danh hiệu và đổi Avatar</p>
        </div>

        <button type="button" class="btn-google-login" id="btn-google-auth">
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" />
          <span>Tiếp tục bằng Google (Khuyên dùng)</span>
        </button>

        <div class="auth-divider"><span>hoặc dùng Email</span></div>

        <div class="auth-tabs">
          <button type="button" class="auth-tab active" data-mode="login">Đăng nhập</button>
          <button type="button" class="auth-tab" data-mode="register">Đăng ký mới</button>
        </div>

        <form id="auth-email-form" class="auth-form">
          <div class="form-group" id="group-display-name" style="display:none;">
            <label>Tên hiển thị</label>
            <input type="text" id="auth-input-name" placeholder="Nhập biệt danh của bạn..." />
          </div>
          <div class="form-group">
            <label>Địa chỉ Email</label>
            <input type="email" id="auth-input-email" required placeholder="example@gmail.com" />
          </div>
          <div class="form-group">
            <label>Mật khẩu</label>
            <input type="password" id="auth-input-password" required minlength="6" placeholder="Tối thiểu 6 ký tự..." />
          </div>
          <button type="submit" class="btn-primary-submit" id="btn-submit-email">Đăng Nhập</button>
        </form>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", modalHtml);

  const modal = document.getElementById("auth-modal");
  const closeBtn = document.getElementById("btn-close-auth");
  const googleBtn = document.getElementById("btn-google-auth");
  const tabs = modal.querySelectorAll(".auth-tab");
  const nameGroup = document.getElementById("group-display-name");
  const submitBtn = document.getElementById("btn-submit-email");
  const form = document.getElementById("auth-email-form");
  let mode = "login";

  closeBtn.addEventListener("click", closeAuthModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeAuthModal();
  });

  googleBtn.addEventListener("click", () => loginWithGoogle());

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      mode = tab.dataset.mode;
      if (mode === "register") {
        nameGroup.style.display = "block";
        submitBtn.textContent = "Tạo Tài Khoản";
      } else {
        nameGroup.style.display = "none";
        submitBtn.textContent = "Đăng Nhập";
      }
    });
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("auth-input-email").value;
    const password = document.getElementById("auth-input-password").value;
    const name = document.getElementById("auth-input-name").value || "Thành viên";

    submitBtn.disabled = true;
    try {
      if (mode === "login") {
        await loginWithEmail(email, password);
      } else {
        await registerWithEmail(name, email, password);
      }
      form.reset();
    } finally {
      submitBtn.disabled = false;
    }
  });
}

// ============================================================================
// HỆ THỐNG THÔNG BÁO TOÀN SERVER (HỖ TRỢ CẢ CHẾ ĐỘ 60 GIÂY & TREO VĨNH VIỄN)
// ============================================================================
let broadcastHideTimer = null;
let broadcastCountdownInterval = null;
let broadcastListenerStarted = false;
let currentActiveBroadcastId = null;
let currentActiveMode = null;

function initGlobalBroadcastListener() {
  if (broadcastListenerStarted) return;
  broadcastListenerStarted = true;

  const broadcastRef = doc(db, "users", "GLOBAL_BROADCAST_CONFIG");
  onSnapshot(
    broadcastRef,
    (docSnap) => {
      if (!docSnap.exists()) {
        hideBroadcastBar();
        return;
      }

      const data = docSnap.data();
      if (!data || !data.active || !data.message) {
        currentActiveBroadcastId = null;
        currentActiveMode = null;
        hideBroadcastBar();
        return;
      }

      const broadcastId = data.broadcastId || String(data.createdAtMs || "default");
      const mode = data.mode || "60s";

      // CHẾ ĐỘ 1: THÔNG BÁO TREO VĨNH VIỄN (BẢO TRÌ / SỰ KIỆN DÀI NGÀY)
      // Luôn hiển thị cho tất cả mọi người vào web bất kể lúc nào, chỉ tắt khi Admin bấm "Tắt Ngay"
      if (mode === "permanent") {
        if (
          currentActiveBroadcastId === broadcastId &&
          currentActiveMode === "permanent" &&
          document.getElementById("global-broadcast-bar")?.classList.contains("active")
        ) {
          return;
        }
        currentActiveBroadcastId = broadcastId;
        currentActiveMode = "permanent";
        showBroadcastBar(data.message, 0, true);
        return;
      }

      // CHẾ ĐỘ 2: THÔNG BÁO NHANH 60 GIÂY
      const now = Date.now();
      if (data.createdAtMs && Math.abs(now - Number(data.createdAtMs)) > 10 * 60 * 1000) {
        hideBroadcastBar();
        return;
      }

      const storageKey = `bph_seen_${broadcastId}`;
      let firstSeenAt = Number(sessionStorage.getItem(storageKey) || 0);
      if (!firstSeenAt) {
        firstSeenAt = now;
        sessionStorage.setItem(storageKey, String(firstSeenAt));
      }

      const elapsedMs = now - firstSeenAt;
      const remainingMs = 60000 - elapsedMs;

      if (remainingMs <= 500) {
        hideBroadcastBar();
        return;
      }

      if (
        currentActiveBroadcastId === broadcastId &&
        currentActiveMode === "60s" &&
        document.getElementById("global-broadcast-bar")?.classList.contains("active")
      ) {
        return;
      }

      currentActiveBroadcastId = broadcastId;
      currentActiveMode = "60s";
      showBroadcastBar(data.message, Math.min(60000, remainingMs), false);
    },
    (err) => {
      console.error("Lỗi lắng nghe thông báo toàn server:", err);
    }
  );
}

function showBroadcastBar(message, durationMs, isPermanent = false) {
  let bar = document.getElementById("global-broadcast-bar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "global-broadcast-bar";
    bar.className = "global-broadcast-bar";

    const headerEl = document.querySelector(".site-header");
    if (headerEl) {
      headerEl.appendChild(bar);
    } else {
      document.body.prepend(bar);
    }
  }

  const cleanMsg = escapeHtml(message);
  const tagLabel = isPermanent ? "THÔNG BÁO QUAN TRỌNG:" : "THÔNG BÁO ADMIN:";
  const repeatedUnits = Array.from({ length: 12 })
    .map(
      () => `
      <span class="broadcast-item">
        <span class="broadcast-tag"><i class="ri-megaphone-fill"></i> ${tagLabel}</span>
        <span class="broadcast-text">${cleanMsg}</span>
        <span class="broadcast-sep">✦</span>
      </span>
    `
    )
    .join("");

  const rightPillHtml = isPermanent
    ? `<div class="broadcast-timer-pill" style="background: rgba(245, 158, 11, 0.2); border-color: rgba(245, 158, 11, 0.5); color: #fde68a;">
         <i class="ri-pushpin-2-fill"></i>
         <span>GHIM CỐ ĐỊNH</span>
       </div>`
    : `<div class="broadcast-timer-pill" id="broadcast-timer-pill">
         <i class="ri-timer-flash-line"></i>
         <span id="broadcast-seconds-left">${Math.ceil(durationMs / 1000)}s</span>
       </div>`;

  bar.innerHTML = `
    <div class="broadcast-inner">
      <div class="broadcast-pinned-label">
        <span class="broadcast-live-dot"></span>
        <i class="ri-volume-up-fill"></i>
        <span>${isPermanent ? "HỆ THỐNG" : "TOÀN SERVER"}</span>
      </div>
      <div class="broadcast-marquee-viewport">
        <div class="broadcast-marquee-track">
          ${repeatedUnits}
        </div>
      </div>
      ${rightPillHtml}
    </div>
  `;

  bar.classList.add("active");

  clearTimeout(broadcastHideTimer);
  clearInterval(broadcastCountdownInterval);

  // Nếu là thông báo Vĩnh viễn thì KHÔNG đếm ngược và KHÔNG tự đóng
  if (isPermanent) {
    return;
  }

  const endTime = Date.now() + durationMs;
  broadcastCountdownInterval = setInterval(() => {
    const secLeft = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
    const secEl = document.getElementById("broadcast-seconds-left");
    if (secEl) secEl.textContent = `${secLeft}s`;
    if (secLeft <= 0) {
      clearInterval(broadcastCountdownInterval);
    }
  }, 500);

  broadcastHideTimer = setTimeout(() => {
    hideBroadcastBar();
  }, durationMs);
}

function hideBroadcastBar() {
  clearTimeout(broadcastHideTimer);
  clearInterval(broadcastCountdownInterval);
  const bar = document.getElementById("global-broadcast-bar");
  if (bar) {
    bar.classList.remove("active");
  }
}

/**
 * Khởi chạy lắng nghe trạng thái đăng nhập + Lắng nghe thông báo toàn server
 */
export function initHeaderAuthUI() {
  // Bật lắng nghe thông báo chạy chữ dưới Header cho TẤT CẢ người đang mở web
  initGlobalBroadcastListener();

  onAuthStateChanged(auth, async (firebaseUser) => {
    const userArea = document.getElementById("header-user-area");

    if (!firebaseUser) {
      notifyAuthListeners(null);
      if (userArea) {
        userArea.innerHTML = `
          <button class="btn-login-header" id="btn-open-auth">
            <i class="ri-user-3-line"></i> <span>Đăng nhập</span>
          </button>
        `;
        document
          .getElementById("btn-open-auth")
          ?.addEventListener("click", openAuthModal);
      }
      return;
    }

    try {
      const profile = await syncUserToFirestore(firebaseUser);
      notifyAuthListeners(profile);

      if (userArea) {
        const isAdmin = profile.role === "admin" || isAdminEmail(profile.email);
        userArea.innerHTML = `
          <div class="user-Menu-wrapper">
            ${
              isAdmin
                ? `<a href="admin.html" class="btn-admin-badge" title="Chỉ hiển thị cho ${ADMIN_EMAIL}">
                     <i class="ri-shield-star-fill"></i> Quản trị Web
                   </a>`
                : ""
            }
            <a href="profile.html" class="user-profile-pill" title="Đổi Avatar & Hồ sơ cá nhân">
              <img src="${escapeHtml(profile.avatarUrl)}" alt="Avatar" class="header-avatar" />
              <span class="header-username">${escapeHtml(profile.displayName)}</span>
            </a>
            <button class="btn-logout-icon" id="btn-header-logout" title="Đăng xuất"><i class="ri-shut-down-line"></i></button>
          </div>
        `;

        document
          .getElementById("btn-header-logout")
          ?.addEventListener("click", logoutUser);
      }
    } catch (err) {
      console.error("Không thể đồng bộ hồ sơ người dùng:", err);
    }
  });
}