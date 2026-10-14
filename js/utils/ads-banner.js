// ============================================================================
// FILE: js/utils/ads-banner.js
// MỤC ĐÍCH: Hiển thị 2 Banner Quảng Cáo Nổi (Trái & Phải) ở Trang chủ (index.html)
//           - Tự động đồng bộ Real-time từ bảng điều khiển trong admin.html
//           - Tự động co giãn theo đúng tỉ lệ hình gốc (không bị cắt mất chữ/hình)
//           - Hỗ trợ chọn "Kích thước ảnh gốc" hoặc "Tùy chỉnh độ rộng" ngay tại Admin
// ============================================================================

import { db, doc, onSnapshot } from "../config/firebase-config.js";

// Cấu hình mặc định khi bạn chưa bấm Lưu lần nào trong trang Admin
export const DEFAULT_ADS_CONFIG = {
  enabled: true,
  sizeMode: "custom", // "custom" (tự co chiều cao theo độ rộng) | "original" (giữ kích thước ảnh gốc)
  bannerWidth: 145,   // Độ rộng (px) khi dùng chế độ "custom"
  leftBanner: {
    enabled: true,
    imageUrl: "https://placehold.co/290x640/0b1426/7dd3fc?text=QUANG+CAO\nBEN+TRAI",
    targetUrl: "https://facebook.com",
    altText: "Quảng cáo bên trái"
  },
  rightBanner: {
    enabled: true,
    imageUrl: "https://placehold.co/290x640/0b1426/a5f3fc?text=QUANG+CAO\nBEN+PHAI",
    targetUrl: "https://discord.com",
    altText: "Quảng cáo bên phải"
  }
};

const closedSidesInSession = new Set();

document.addEventListener("DOMContentLoaded", () => {
  injectFloatingAdsStyles();
  initRealtimeAdsBanner();
});

function injectFloatingAdsStyles() {
  if (document.getElementById("floating-ads-style")) return;

  const styleEl = document.createElement("style");
  styleEl.id = "floating-ads-style";
  styleEl.textContent = `
    .floating-ad-banner {
      position: fixed;
      top: 54%;
      transform: translateY(-50%);
      z-index: 88;
      border-radius: 14px;
      background: rgba(11, 20, 38, 0.86);
      border: 1px solid rgba(125, 211, 252, 0.35);
      box-shadow: 0 14px 32px rgba(2, 6, 23, 0.75), 0 0 18px rgba(125, 211, 252, 0.2);
      backdrop-filter: blur(10px);
      padding: 5px;
      transition: opacity 0.28s ease, transform 0.28s ease, box-shadow 0.25s ease, width 0.25s ease;
      max-height: 84vh;
      display: flex;
      flex-direction: column;
    }

    .floating-ad-banner:hover {
      border-color: #7dd3fc;
      box-shadow: 0 16px 36px rgba(2, 6, 23, 0.85), 0 0 25px rgba(125, 211, 252, 0.45);
    }

    .floating-ad-banner.left-side {
      left: 14px;
    }

    .floating-ad-banner.right-side {
      right: 14px;
    }

    .floating-ad-banner.closed {
      opacity: 0;
      pointer-events: none;
      transform: translateY(-50%) scale(0.85);
    }

    .floating-ad-link {
      display: block;
      width: 100%;
      border-radius: 10px;
      overflow: hidden;
      line-height: 0;
    }

    /* Tự động co giãn theo đúng tỉ lệ hình gốc (height: auto, không cắt hình) */
    .floating-ad-link img {
      display: block;
      width: 100%;
      height: auto;
      max-height: 80vh;
      object-fit: contain;
      border-radius: 10px;
      transition: transform 0.35s ease;
    }

    /* Khi chọn chế độ giữ nguyên kích thước ảnh gốc (Original Size) */
    .floating-ad-banner.mode-original {
      width: auto !important;
      max-width: 280px;
    }

    .floating-ad-banner.mode-original .floating-ad-link img {
      width: auto;
      max-width: 100%;
      height: auto;
      max-height: 80vh;
    }

    .floating-ad-banner:hover .floating-ad-link img {
      transform: scale(1.02);
    }

    .btn-close-floating-ad {
      position: absolute;
      top: -10px;
      right: -10px;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: #0b1426;
      border: 1.5px solid #7dd3fc;
      color: #f0f9ff;
      font-size: 14px;
      font-weight: 700;
      line-height: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.65);
      transition: all 0.2s ease;
      z-index: 3;
    }

    .btn-close-floating-ad:hover {
      background: #fb7185;
      border-color: #fb7185;
      color: #040914;
      transform: scale(1.12);
    }

    .floating-ad-tag {
      position: absolute;
      bottom: 10px;
      left: 10px;
      background: rgba(6, 11, 22, 0.82);
      border: 1px solid rgba(125, 211, 252, 0.3);
      color: #7dd3fc;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 5px;
      pointer-events: none;
    }

    @media (max-width: 1180px) {
      .floating-ad-banner {
        display: none !important;
      }
    }
  `;
  document.head.appendChild(styleEl);
}

/**
 * Lắng nghe cấu hình Banner Real-time từ Firestore (do Admin chỉnh trong admin.html)
 */
function initRealtimeAdsBanner() {
  onSnapshot(
    doc(db, "users", "GLOBAL_ADS_CONFIG"),
    (docSnap) => {
      if (docSnap.exists()) {
        const liveConfig = docSnap.data();
        renderFloatingAds(liveConfig);
      } else {
        renderFloatingAds(DEFAULT_ADS_CONFIG);
      }
    },
    (err) => {
      console.warn("Không thể tải cấu hình Ads từ Firebase, dùng cấu hình mặc định:", err);
      renderFloatingAds(DEFAULT_ADS_CONFIG);
    }
  );
}

function renderFloatingAds(config) {
  // Xóa banner cũ trước khi vẽ lại cấu hình mới
  document.querySelectorAll(".floating-ad-banner").forEach((el) => el.remove());

  if (!config || config.enabled === false) return;

  const sizeMode = config.sizeMode || "custom";
  const customWidth = Math.min(360, Math.max(90, Number(config.bannerWidth) || 145));

  const sides = [
    { key: "left", className: "left-side", item: config.leftBanner },
    { key: "right", className: "right-side", item: config.rightBanner }
  ];

  sides.forEach(({ key, className, item }) => {
    if (!item || !item.enabled || !item.imageUrl) return;
    if (closedSidesInSession.has(key)) return;

    const bannerEl = document.createElement("aside");
    bannerEl.className = `floating-ad-banner ${className} ${
      sizeMode === "original" ? "mode-original" : "mode-custom"
    }`;
    bannerEl.id = `floating-ad-${key}`;

    if (sizeMode !== "original") {
      bannerEl.style.width = `${customWidth}px`;
    }

    bannerEl.innerHTML = `
      <button type="button" class="btn-close-floating-ad" title="Tắt quảng cáo">&times;</button>
      <a href="${item.targetUrl || "#"}" target="_blank" rel="noopener noreferrer" class="floating-ad-link">
        <img
          src="${item.imageUrl}"
          alt="${item.altText || "Banner quảng cáo"}"
          onerror="this.onerror=null;this.src='https://placehold.co/270x600/0b1426/7dd3fc?text=BANNER+AD';"
        />
      </a>
      <span class="floating-ad-tag">QC</span>
    `;

    bannerEl.querySelector(".btn-close-floating-ad")?.addEventListener("click", () => {
      closedSidesInSession.add(key);
      bannerEl.classList.add("closed");
      setTimeout(() => bannerEl.remove(), 300);
    });

    document.body.appendChild(bannerEl);
  });
}