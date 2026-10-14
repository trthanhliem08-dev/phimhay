// ============================================================================
// FILE: js/services/comment.js
// MỤC ĐÍCH: Xử lý Bình luận Real-time, Phân cấp Danh hiệu (Rank) và Phát
//           thông báo chạy chữ toàn server trong 60 giây.
// ============================================================================

import {
  auth,
  db,
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  deleteDoc,
  updateDoc,
  query,
  where,
  getDocs,
  onSnapshot,
  serverTimestamp
} from "../config/firebase-config.js";
import { isAdminEmail } from "./auth.js";
import { showToast, USER_RANKS } from "../utils/helpers.js";

/**
 * Lắng nghe danh sách bình luận Real-time của một bộ phim theo `movieSlug`
 */
export function listenMovieComments(movieSlug, onUpdate) {
  const commentsRef = collection(db, "comments");
  const q = query(commentsRef, where("movieSlug", "==", movieSlug));

  return onSnapshot(
    q,
    (snapshot) => {
      const list = [];
      snapshot.forEach((docSnap) => {
        list.push({
          id: docSnap.id,
          ...docSnap.data()
        });
      });

      list.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.clientTime || 0);
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.clientTime || 0);
        return timeB - timeA;
      });

      onUpdate(list);
    },
    (error) => {
      console.error("Lỗi lắng nghe bình luận real-time:", error);
    }
  );
}

/**
 * Gửi bình luận mới vào bộ phim (Lưu kèm cả `userRank` để hiển thị Badge)
 */
export async function addMovieComment({ movieSlug, movieName, content }) {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    showToast("Vui lòng đăng nhập để bình luận!", "error");
    throw new Error("NOT_AUTHENTICATED");
  }

  const cleanContent = (content || "").trim();
  if (!cleanContent) {
    showToast("Nội dung bình luận không được để trống!", "error");
    throw new Error("EMPTY_CONTENT");
  }

  const userRef = doc(db, "users", currentUser.uid);
  const userSnap = await getDoc(userRef);
  const userData = userSnap.exists() ? userSnap.data() : null;

  if (userData && userData.isBanned) {
    showToast("Tài khoản của bạn đã bị Quản trị viên chặn quyền bình luận!", "error");
    throw new Error("USER_BANNED");
  }

  const displayName =
    userData?.displayName ||
    currentUser.displayName ||
    (currentUser.email ? currentUser.email.split("@")[0] : "Thành viên");

  const avatarUrl =
    userData?.avatarUrl ||
    currentUser.photoURL ||
    "https://api.dicebear.com/9.x/adventurer/svg?seed=Felix&backgroundColor=b6e3f4";

  const role =
    userData?.role === "admin" || isAdminEmail(currentUser.email) ? "admin" : "user";

  const userRank = userData?.rank || "nguoi_moi";

  await addDoc(collection(db, "comments"), {
    movieSlug,
    movieName: movieName || movieSlug,
    uid: currentUser.uid,
    userEmail: currentUser.email || "",
    userName: displayName,
    userAvatar: avatarUrl,
    userRole: role,
    userRank: userRank,
    content: cleanContent,
    clientTime: Date.now(),
    createdAt: serverTimestamp()
  });

  showToast("Đã đăng bình luận!", "success");
}

/**
 * Xóa một bình luận (Dành cho chính chủ hoặc Admin)
 */
export async function deleteMovieComment(commentId) {
  try {
    await deleteDoc(doc(db, "comments", commentId));
    showToast("Đã xóa bình luận.", "info");
  } catch (error) {
    console.error("Lỗi khi xóa bình luận:", error);
    showToast("Không thể xóa bình luận này.", "error");
    throw error;
  }
}

/**
 * Chặn / Mở chặn một người dùng (Chỉ dành cho Admin)
 */
export async function toggleBanUserByAdmin(targetUid, banStatus = true) {
  try {
    const userRef = doc(db, "users", targetUid);
    await updateDoc(userRef, {
      isBanned: banStatus
    });
    showToast(
      banStatus
        ? "Đã chặn quyền bình luận của người dùng này!"
        : "Đã mở khóa bình luận cho người dùng!",
      "success"
    );
  } catch (error) {
    console.error("Lỗi cập nhật trạng thái chặn:", error);
    showToast("Không thể thay đổi trạng thái người dùng.", "error");
    throw error;
  }
}

/**
 * Admin phân cấp Danh hiệu (Rank) cho thành viên và đồng bộ lên mọi bình luận của họ
 */
export async function updateUserRankByAdmin(targetUid, newRankKey) {
  if (!USER_RANKS[newRankKey]) return;
  try {
    // 1. Cập nhật trong bảng `users`
    await updateDoc(doc(db, "users", targetUid), {
      rank: newRankKey
    });

    // 2. Đồng bộ lại toàn bộ bình luận cũ của user này trong bảng `comments`
    const q = query(collection(db, "comments"), where("uid", "==", targetUid));
    const snap = await getDocs(q);
    const tasks = [];
    snap.forEach((d) => {
      tasks.push(updateDoc(doc(db, "comments", d.id), { userRank: newRankKey }));
    });
    await Promise.all(tasks);

    showToast(`Đã cấp danh hiệu "${USER_RANKS[newRankKey].label}" cho thành viên!`, "success");
  } catch (error) {
    console.error("Lỗi cập nhật danh hiệu:", error);
    showToast("Không thể cập nhật danh hiệu lúc này.", "error");
    throw error;
  }
}

/**
 * Admin phát thông báo chạy chữ toàn Server trong đúng 1 phút (60,000ms)
 */
export async function publishGlobalBroadcast(messageText) {
  const clean = (messageText || "").trim();
  if (!clean) {
    showToast("Vui lòng nhập nội dung thông báo!", "error");
    return;
  }

  const now = Date.now();
  const expiresAtMs = now + 60 * 1000; // Đúng 1 phút (60 giây)

  await setDoc(doc(db, "settings", "broadcast"), {
    message: clean,
    active: true,
    createdAtMs: now,
    expiresAtMs: expiresAtMs,
    broadcastId: `bc_${now}`,
    updatedAt: serverTimestamp()
  });

  showToast("Đã phát thông báo chạy chữ lên toàn Server trong 1 phút!", "success");
}

/**
 * Admin tắt sớm thông báo toàn Server
 */
export async function stopGlobalBroadcast() {
  await setDoc(
    doc(db, "settings", "broadcast"),
    { active: false, expiresAtMs: 0 },
    { merge: true }
  );
  showToast("Đã dừng phát thông báo toàn Server.", "info");
}