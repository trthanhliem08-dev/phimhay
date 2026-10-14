// ============================================================================
// FILE: js/services/auth.js
// MỤC ĐÍCH: Quản lý Đăng nhập (Google & Email), Đăng xuất, đồng bộ hồ sơ
//           vào bảng `users` trên Firestore, kiểm tra quyền Admin theo email
//           `liemtran.238460@gmail.com` và báo lỗi chi tiết dễ hiểu.
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
  serverTimestamp
} from "../config/firebase-config.js";
import { showToast, DEFAULT_AVATARS, escapeHtml } from "../utils/helpers.js";

let currentUserProfile = null;
const authListeners = [];

/**
 * Đăng ký hàm lắng nghe khi trạng thái đăng nhập thay đổi
 */
export function subscribeAuth(callback) {
  authListeners.push(callback);
  if (currentUserProfile !== undefined) {
    callback(currentUserProfile);
  }
}

function notifyAuthListeners(profile) {
  currentUserProfile = profile;
  authListeners.forEach((cb) => cb(profile));
}

/**
 * Kiểm tra xem một email có phải là Quản trị viên hay không
 */
export function isAdminEmail(email) {
  if (!email) return false;
  return email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

/**
 * Tạo hồ sơ dự phòng trực tiếp từ tài khoản Google/Email nếu Firestore chưa bật hoặc chặn quyền
 */
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
    isBanned: false
  };
}

/**
 * Đồng bộ thông tin user từ Firebase Auth vào bảng `users` trong Firestore.
 * Nếu Firestore chưa tạo hoặc bị chặn Rules, vẫn trả về hồ sơ tạm để không làm gãy đăng nhập!
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
      if (isUserAdmin && existingData.role !== "admin") {
        await setDoc(userRef, { role: "admin" }, { merge: true });
        existingData.role = "admin";
      }
      return existingData;
    }
  } catch (firestoreErr) {
    console.warn("Cảnh báo Firestore khi đồng bộ user:", firestoreErr);
    showToast(
      `Đã đăng nhập, nhưng Firestore báo lỗi (${firestoreErr.code || "chưa mở quyền Rules"}).`,
      "info"
    );
    return fallback;
  }
}

/**
 * Dịch mã lỗi Firebase Auth sang tiếng Việt chỉ rõ cách sửa
 */
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

/**
 * Đăng nhập nhanh bằng tài khoản Google
 */
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

/**
 * Đăng nhập bằng Email & Mật khẩu
 */
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

/**
 * Đăng ký tài khoản mới bằng Email & Mật khẩu
 */
export async function registerWithEmail(displayName, email, password) {
  try {
    const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
    const randomAvatar = DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)];
    await updateProfile(result.user, {
      displayName: displayName.trim(),
      photoURL: randomAvatar
    });
    const profile = await syncUserToFirestore(result.user);
    showToast("Tạo tài khoản thành công!", "success");
    closeAuthModal();
    return profile;
  } catch (error) {
    console.error("Lỗi đăng ký:", error);
    showToast(translateAuthError(error), "error");
    throw error;
  }
}

/**
 * Đăng xuất tài khoản
 */
export async function logoutUser() {
  await signOut(auth);
  showToast("Đã đăng xuất tài khoản.", "info");
}

/**
 * Mở / Đóng hộp thoại Đăng nhập ngay trên trang
 */
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

/**
 * Khởi tạo hộp thoại Đăng nhập / Đăng ký (dùng chung cho mọi trang)
 */
function renderAuthModal() {
  const modalHtml = `
    <div id="auth-modal" class="auth-modal-overlay">
      <div class="auth-modal-card">
        <button class="auth-modal-close" id="btn-close-auth" title="Đóng">&times;</button>
        <div class="auth-modal-header">
          <span class="brand-badge">BIỂN PHIM HAY</span>
          <h3 id="auth-modal-title">Đăng nhập tài khoản</h3>
          <p>Đăng nhập để bình luận real-time, đổi Avatar và lưu tủ phim</p>
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

/**
 * Khởi chạy lắng nghe trạng thái đăng nhập và tự động cập nhật khu vực `#header-user-area`
 */
export function initHeaderAuthUI() {
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