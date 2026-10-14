// ============================================================================
// FILE: js/utils/ads-banner.js
// MỤC ĐÍCH: Quản lý 2 Banner Quảng Cáo Nổi (Trái & Phải) CHỈ HIỂN THỊ Ở INDEX.HTML.
//           Hoàn toàn độc lập trong 1 file duy nhất để bạn dễ bật/tắt hoặc đổi ảnh.
// ============================================================================

export const ADS_CONFIG = {
  // Bật (true) hoặc tắt (false) toàn bộ hệ thống banner nổi2 bên
  enabled: true,

  // Chiều rộng của mỗi banner (px) - Nhỏ gọn, không che nội dung phim
  bannerWidth: 236,

  // Cấu hình Banner bên TRÁI
  leftBanner: {
    enabled: false,
    // CÁCH 1 (Dùng ảnh trong máy): Đặt ảnh vào thư mục assets/images/ rồi ghi: "./assets/images/banner1.jpg"
    // CÁCH 2 (Dùng link ảnh trên mạng): Dán trực tiếp link https://... như bên dưới
    imageUrl: "https://placehold.co/270x720/0b1426/7dd3fc?text=QUANG+CAO\nBEN+TRAI\n(136x360)",
    targetUrl: "https://facebook.com", // Link mở ra khi người dùng bấm vào banner
    altText: "Quảng cáo bên trái"
  },

  // Cấu hình Banner bên PHẢI
  rightBanner: {
    enabled: false,
    // Bạn có thể đổi thành "./assets/images/banner2.png" hoặc link ảnh online bất kỳ
    imageUrl: "https://placehold.co/270x720/0b1426/a5f3fc?text=QUANG+CAO\nBEN+PHAI\n(136x360)",
    targetUrl: "https://discord.com", // Link mở ra khi người dùng bấm vào banner
    altText: "Quảng cáo bên phải"
  }
};

document.addEventListener("DOMContentLoaded", () => {
  if (!ADS_CONFIG.enabled) return;
  injectFloatingAdsStyles();
  renderFloatingAds();
});

/**
 * Tự động nhúng CSS cho 2 Banner nổi (Không cần sửa vào style.css)
 */
function injectFloatingAdsStyles() {
  if (document.getElementById("floating-ads-style")) return;

  const w = Number(ADS_CONFIG.bannerWidth) || 136;
  const styleEl = document.createElement("style");
  styleEl.id = "floating-ads-style";
  styleEl.textContent = `
    .floating-ad-banner {
      position: fixed;
      top: 54%;
      transform: translateY(-50%);
      width: ${w}px;
      z-index: 88;
      border-radius: 14px;
      background: rgba(11, 20, 38, 0.85);
      border: 1px solid rgba(125, 211, 252, 0.35);
      box-shadow: 0 14px 32px rgba(2, 6, 23, 0.75), 0 0 18px rgba(125, 211, 252, 0.2);
      backdrop-filter: blur(10px);
      padding: 5px;
      transition: opacity 0.28s ease, transform 0.28s ease, box-shadow 0.25s ease;
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

    .floating-ad-link img {
      width: 100%;
      height: auto;
      max-height: 370px;
      object-fit: cover;
      border-radius: 10px;
      transition: transform 0.35s ease;
    }

    .floating-ad-banner:hover .floating-ad-link img {
      transform: scale(1.03);
    }

    /* Nút X tắt banner */
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

    /* Tự động ẩn trên màn hình nhỏ / điện thoại để không che mất phim */
    @media (max-width: 1480px) {
      .floating-ad-banner {
        width: 115px;
      }
      .floating-ad-banner.left-side { left: 8px; }
      .floating-ad-banner.right-side { right: 8px; }
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
 * Tạo HTML cho 2 banner Trái và Phải kèm sự kiện bấm dấu X để tắt
 */
function renderFloatingAds() {
  const sides = [
    { key: "left", className: "left-side", config: ADS_CONFIG.leftBanner },
    { key: "right", className: "right-side", config: ADS_CONFIG.rightBanner }
  ];

  sides.forEach(({ key, className, config }) => {
    if (!config || !config.enabled || !config.imageUrl) return;

    const bannerEl = document.createElement("aside");
    bannerEl.className = `floating-ad-banner ${className}`;
    bannerEl.id = `floating-ad-${key}`;

    bannerEl.innerHTML = `
      <button type="button" class="btn-close-floating-ad" title="Tắt quảng cáo">&times;</button>
      <a href="${config.targetUrl || "#"}" target="_blank" rel="noopener noreferrer" class="floating-ad-link">
        <img
          src="${config.imageUrl}"
          alt="${config.altText || "Banner quảng cáo"}"
          onerror="this.onerror=null;this.src='https://placehold.co/270x720/0b1426/7dd3fc?text=BANNER+AD';"
        />
      </a>
      <span class="floating-ad-tag">QC</span>
    `;

    bannerEl.querySelector(".btn-close-floating-ad")?.addEventListener("click", () => {
      bannerEl.classList.add("closed");
      setTimeout(() => bannerEl.remove(), 300);
    });

    document.body.appendChild(bannerEl);
  });
}