// ============================================================================
// FILE: js/config/firebase-config.js
// MỤC ĐÍCH: Kết nối Firebase (Authentication + Firestore) bằng CDN chính thức
//           và khai báo email Quản trị viên (Admin).
// ============================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// Cấu hình Firebase của project: webphimtest
const firebaseConfig = {
  apiKey: "AIzaSyC_kGtXJNOsuaIEzZCcRtTezkxBxvzdo5g",
  authDomain: "webphimtest.firebaseapp.com",
  projectId: "webphimtest",
  storageBucket: "webphimtest.firebasestorage.app",
  messagingSenderId: "976987840726",
  appId: "1:976987840726:web:c496dff1fa4b51f5122977",
  measurementId: "G-NCTVEYMCJ7"
};

// Email duy nhất có toàn quyền Quản trị viên (Admin)
export const ADMIN_EMAIL = "liemtran.238460@gmail.com";

// Khởi tạo Firebase App, Auth và Firestore Database
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

// Xuất các hàm Firebase để các file ở thư mục services/ sử dụng lại gọn gàng
export {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
  serverTimestamp
};