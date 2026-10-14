// ============================================================================
// FILE: js/services/comment.js
// MỤC ĐÍCH: Xử lý Bình luận Real-time trên Firestore cho từng bộ phim:
//           - Lắng nghe bình luận mới theo thời gian thực (onSnapshot)
//           - Kiểm tra tài khoản có bị Admin chặn (isBanned) trước khi gửi
//           - Cho phép chính chủ hoặc Admin (liemtran.238460@gmail.com) xóa cmt
// ============================================================================

import {
  auth,
  db,
  doc,
  getDoc,
  collection,
  addDoc,
  deleteDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp
} from "../config/firebase-config.js";
import { isAdminEmail } from "./auth.js";
import { showToast } from "../utils/helpers.js";

/**
 * Lắng nghe danh sách bình luận Real-time của một bộ phim theo `movieSlug`
 * (Sắp xếp thời gian mới nhất ở phía Client để không bắt buộc tạo Composite Index trên Firebase)
 * @param {string} movieSlug - Mã slug của phim
 * @param {Function} onUpdate - Hàm callback nhận mảng bình luận mỗi khi có thay đổi
 * @returns {Function} Hàm hủy lắng nghe (unsubscribe)
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

      // Sắp xếp bình luận mới nhất lên đầu
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
 * Gửi bình luận mới vào bộ phim
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

  // Kiểm tra trực tiếp trong bảng `users` xem tài khoản có đang bị Admin khóa mõm không
  const userRef = doc(db, "users", currentUser.uid);
  const userSnap = await getDoc(userRef);
  let userData = userSnap.exists() ? userSnap.data() : null;

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

  await addDoc(collection(db, "comments"), {
    movieSlug,
    movieName: movieName || movieSlug,
    uid: currentUser.uid,
    userEmail: currentUser.email || "",
    userName: displayName,
    userAvatar: avatarUrl,
    userRole: role,
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
 * Chặn nhanh một người dùng ngay từ khung bình luận (Chỉ dành cho Admin)
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