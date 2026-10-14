// ============================================================================
// FILE: js/pages/home.js
// MỤC ĐÍCH: Điều khiển trang chủ Biển Phim Hay (index.html) phiên bản nâng cấp:
//           - Siêu Hero Banner + Poster 3D + 5 Thumbnail chọn nhanh
//           - Bảng xếp hạng Top 10 Phim Thịnh Hành (Số thứ tự khổng lồ phát sáng)
//           - Dải Chip Thể loại nhanh + Bộ lọc Thể loại / Quốc gia / Tìm kiếm
//           - 2 Khu vực Spotlight bổ sung: Phim Bộ Đặc Sắc & Hoạt Hình / Anime
//           - Hộp thoại Xem Nhanh Chi Tiết (Quick View Modal)
// ============================================================================

import {
  getNewlyUpdatedMovies,
  getMoviesByCategory,
  getMoviesByGenre,
  getMoviesByCountry,
  searchMovies,
  GENRES,
  COUNTRIES
} from "../services/api.js";
import { initHeaderAuthUI } from "../services/auth.js";
import { getWatchHistory, escapeHtml, showToast } from "../utils/helpers.js";

const state = {
  mode: "new", // 'new' | 'category' | 'genre' | 'country' | 'search'
  value: "",
  title: "Phim Mới Cập Nhật",
  page: 1,
  totalPages: 1,
  heroMovies: [],
  heroIndex: 0,
  heroTimer: null
};

document.addEventListener("DOMContentLoaded", () => {
  initHeaderAuthUI();
  populateFilterDropdowns();
  renderHistorySection();
  bindEvents();

  // Tải kho phim chính + Top 10 + 2 hàng Spotlight song song
  loadMovies();
  loadSpotlightRows();
});

function populateFilterDropdowns() {
  const genreSelect = document.getElementById("filter-genre");
  const countrySelect = document.getElementById("filter-country");

  if (genreSelect) {
    GENRES.forEach((g) => {
      const opt = document.createElement("option");
      opt.value = g.slug;
      opt.textContent = g.name;
      genreSelect.appendChild(opt);
    });
  }

  if (countrySelect) {
    COUNTRIES.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.slug;
      opt.textContent = c.name;
      countrySelect.appendChild(opt);
    });
  }
}

function bindEvents() {
  // 1. Menu danh mục trên Header
  const navLinks = document.querySelectorAll("[data-nav-category]");
  navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      navLinks.forEach((l) => l.classList.remove("active"));
      link.classList.add("active");

      resetFilterControls();
      const cat = link.dataset.navCategory;
      const label = link.dataset.title || link.textContent.trim();

      if (cat === "phim-moi-cap-nhat") {
        state.mode = "new";
        state.value = "";
        state.title = "Phim Mới Cập Nhật";
      } else {
        state.mode = "category";
        state.value = cat;
        state.title = label;
      }
      state.page = 1;
      loadMovies(true);
    });
  });

  // 2. Dải Chip Thể loại chọn nhanh (Quick Genre Pills)
  const genrePills = document.querySelectorAll("[data-quick-genre]");
  genrePills.forEach((pill) => {
    pill.addEventListener("click", () => {
      genrePills.forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");

      const slug = pill.dataset.quickGenre;
      if (!slug) {
        state.mode = "new";
        state.value = "";
        state.title = "Phim Mới Cập Nhật";
      } else {
        state.mode = "genre";
        state.value = slug;
        state.title = `Thể loại: ${pill.textContent.replace(/^[^a-zA-ZÀ-ỹ]+/, "")}`;
        document.getElementById("filter-genre").value = slug;
      }
      state.page = 1;
      loadMovies(true);
    });
  });

  // 3. Nút "Xem toàn bộ" ở 2 khu vực Spotlight (Phim Bộ & Phim Việt Nam)
  document.querySelectorAll("[data-more-cat]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const cat = btn.dataset.moreCat;
      resetFilterControls();
      if (cat === "viet-nam") {
        state.mode = "country";
        state.value = "viet-nam";
        state.title = "Phim Việt Nam Đặc Sắc";
        const countrySelect = document.getElementById("filter-country");
        if (countrySelect) countrySelect.value = "viet-nam";
      } else {
        state.mode = "category";
        state.value = cat;
        state.title = "Tuyển Tập Phim Bộ";
      }
      state.page = 1;
      loadMovies(true);
    });
  });

  // 4. Dropdown Thể loại & Quốc gia
  const genreSelect = document.getElementById("filter-genre");
  genreSelect?.addEventListener("change", () => {
    const val = genreSelect.value;
    if (!val) return;
    document.getElementById("filter-country").value = "";
    const text = genreSelect.options[genreSelect.selectedIndex].text;
    state.mode = "genre";
    state.value = val;
    state.title = `Thể loại: ${text}`;
    state.page = 1;
    loadMovies();
  });

  const countrySelect = document.getElementById("filter-country");
  countrySelect?.addEventListener("change", () => {
    const val = countrySelect.value;
    if (!val) return;
    document.getElementById("filter-genre").value = "";
    const text = countrySelect.options[countrySelect.selectedIndex].text;
    state.mode = "country";
    state.value = val;
    state.title = `Quốc gia: ${text}`;
    state.page = 1;
    loadMovies();
  });

  // 5. Nút Làm mới bộ lọc
  document.getElementById("btn-reset-filter")?.addEventListener("click", () => {
    resetFilterControls();
    state.mode = "new";
    state.value = "";
    state.title = "Phim Mới Cập Nhật";
    state.page = 1;
    loadMovies();
  });

  // 6. Ô Tìm Kiếm Thông Minh (Live Search Dropdown xổ kết quả kèm ảnh Poster tức thì)
  const searchForm = document.getElementById("search-form");
  const searchInput = document.getElementById("search-input");
  let debounceTimer = null;

  // Tạo khung dropdown gắn ngay dưới thanh search
  let liveDropdown = document.getElementById("live-search-dropdown");
  if (searchForm && !liveDropdown) {
    liveDropdown = document.createElement("div");
    liveDropdown.id = "live-search-dropdown";
    liveDropdown.className = "live-search-dropdown";
    searchForm.appendChild(liveDropdown);
  }

  // Bấm Enter -> Đóng dropdown và cuộn xuống lưới kết quả đầy đủ
  searchForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    liveDropdown?.classList.remove("active");
    triggerSearch(searchInput.value);
  });

  // Gõ phím -> Xổ bảng gợi ý tức thì kèm ảnh Poster sau 300ms
  searchInput?.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const kw = searchInput.value.trim();
    if (!kw) {
      liveDropdown?.classList.remove("active");
      if (state.mode === "search") {
        state.mode = "new";
        state.title = "Phim Mới Cập Nhật";
        state.page = 1;
        loadMovies();
      }
      return;
    }

    if (liveDropdown) {
      liveDropdown.classList.add("active");
      liveDropdown.innerHTML = `
        <div class="live-search-status">
          <i class="ri-loader-4-line spin-icon" style="display:inline-block; font-size:1.2rem; vertical-align:middle; margin-right:6px;"></i>
          Đang tìm kiếm <strong>"${escapeHtml(kw)}"</strong>...
        </div>
      `;
    }

    debounceTimer = setTimeout(() => {
      performLiveDropdownSearch(kw, liveDropdown);
    }, 300);
  });

  // Bấm lại vào ô input khi đang có chữ -> Hiện lại dropdown
  searchInput?.addEventListener("focus", () => {
    if (searchInput.value.trim() && liveDropdown && liveDropdown.innerHTML.trim() !== "") {
      liveDropdown.classList.add("active");
    }
  });

  // Click ra ngoài -> Tự động đóng dropdown
  document.addEventListener("click", (e) => {
    if (searchForm && !searchForm.contains(e.target)) {
      liveDropdown?.classList.remove("active");
    }
  });

  // 7. Điều hướng thanh trượt Top 10
  const trendTrack = document.getElementById("trending-track");
  document.getElementById("trend-prev")?.addEventListener("click", () => {
    trendTrack?.scrollBy({ left: -520, behavior: "smooth" });
  });
  document.getElementById("trend-next")?.addEventListener("click", () => {
    trendTrack?.scrollBy({ left: 520, behavior: "smooth" });
  });

  // 8. Nút Xem Chi Tiết Nhanh trên Hero Banner
  document.getElementById("hero-btn-info")?.addEventListener("click", () => {
    const currentMovie = state.heroMovies[state.heroIndex];
    if (currentMovie) openQuickViewModal(currentMovie);
  });

  document.getElementById("btn-close-quickview")?.addEventListener("click", closeQuickViewModal);
  document.getElementById("quickview-modal")?.addEventListener("click", (e) => {
    if (e.target.id === "quickview-modal") closeQuickViewModal();
  });

  // 9. Phân trang Trước / Sau
  document.getElementById("btn-prev-page")?.addEventListener("click", () => {
    if (state.page > 1) {
      state.page--;
      loadMovies(true);
    }
  });

  document.getElementById("btn-next-page")?.addEventListener("click", () => {
    if (state.page < state.totalPages) {
      state.page++;
      loadMovies(true);
    }
  });
}

function resetFilterControls() {
  const g = document.getElementById("filter-genre");
  const c = document.getElementById("filter-country");
  const s = document.getElementById("search-input");
  if (g) g.value = "";
  if (c) c.value = "";
  if (s) s.value = "";
}

/**
 * Gọi API tìm kiếm và đổ 6 bộ phim khớp nhất kèm ảnh Poster vào bảng xổ xuống tức thì
 */
async function performLiveDropdownSearch(keyword, dropdownEl) {
  if (!dropdownEl) return;
  try {
    const result = await searchMovies(keyword, 1);
    const items = result.items || [];
    const total = result.paginate?.total_items || items.length;

    if (items.length === 0) {
      dropdownEl.innerHTML = `
        <div class="live-search-status">
          <i class="ri-film-line"></i> Không tìm thấy phim nào khớp với <strong>"${escapeHtml(keyword)}"</strong>
        </div>
      `;
      return;
    }

    const topItems = items.slice(0, 6);
    dropdownEl.innerHTML = `
      <div class="live-search-header">
        <span><i class="ri-flashlight-fill"></i> Gợi ý nhanh (${total} kết quả)</span>
        <span>Bấm để xem ngay</span>
      </div>
      <div class="live-search-list">
        ${topItems
          .map(
            (m) => `
          <a href="watch.html?slug=${encodeURIComponent(m.slug)}" class="live-search-item">
            <img
              src="${escapeHtml(m.thumb_url)}"
              alt="${escapeHtml(m.name)}"
              class="live-search-thumb"
              onerror="this.onerror=null;this.src='https://placehold.co/80x120/0f1b33/7dd3fc?text=Phim';"
            />
            <div class="live-search-info">
              <div class="live-search-title">${escapeHtml(m.name)}</div>
              <div class="live-search-origin">${escapeHtml(m.original_name)}</div>
              <div class="live-search-badges">
                <span class="ls-badge">${escapeHtml(m.current_episode)}</span>
                <span class="ls-badge lang">${escapeHtml(m.quality)} • ${escapeHtml(m.language)}</span>
              </div>
            </div>
          </a>
        `
          )
          .join("")}
      </div>
      <button type="button" class="live-search-footer" id="btn-live-view-all">
        <i class="ri-search-eye-line"></i>
        <span>Xem toàn bộ kết quả cho "${escapeHtml(keyword)}" →</span>
      </button>
    `;

    document.getElementById("btn-live-view-all")?.addEventListener("click", () => {
      dropdownEl.classList.remove("active");
      triggerSearch(keyword);
    });
  } catch (err) {
    console.warn("Lỗi tìm kiếm nhanh:", err);
    dropdownEl.innerHTML = `
      <div class="live-search-status">Không thể kết nối tìm kiếm lúc này.</div>
    `;
  }
}

function triggerSearch(keyword) {
  const kw = keyword.trim();
  if (!kw) return;
  state.mode = "search";
  state.value = kw;
  state.title = `Kết quả tìm kiếm: "${kw}"`;
  state.page = 1;
  loadMovies(true);
}

/**
 * Tải danh sách phim chính và nạp Hero Banner + Top 10 Thịnh Hành ở lần tải đầu
 */
async function loadMovies(scrollToGrid = false) {
  const gridEl = document.getElementById("movie-grid");
  const sectionTitleEl = document.getElementById("section-title");
  const totalBadgeEl = document.getElementById("total-items-badge");

  if (sectionTitleEl) sectionTitleEl.textContent = state.title;
  if (scrollToGrid) {
    document.getElementById("catalog-section")?.scrollIntoView({ behavior: "smooth" });
  }

  renderSkeletons(gridEl, 10);

  try {
    let result;
    switch (state.mode) {
      case "category":
        result = await getMoviesByCategory(state.value, state.page);
        break;
      case "genre":
        result = await getMoviesByGenre(state.value, state.page);
        break;
      case "country":
        result = await getMoviesByCountry(state.value, state.page);
        break;
      case "search":
        result = await searchMovies(state.value, state.page);
        break;
      case "new":
      default:
        result = await getNewlyUpdatedMovies(state.page);
        break;
    }

    const movies = result.items || [];
    state.totalPages = result.paginate?.total_page || 1;

    if (totalBadgeEl) {
      const totalItems = result.paginate?.total_items;
      totalBadgeEl.textContent = totalItems
        ? `${totalItems.toLocaleString("vi-VN")} phim`
        : `Trang ${state.page}/${state.totalPages}`;
    }

    // Lần đầu vào trang chủ: Khởi tạo Hero Banner (5 phim) & Top 10 Thịnh Hành (10 phim)
    if (state.mode === "new" && state.page === 1 && movies.length > 0 && state.heroMovies.length === 0) {
      state.heroMovies = movies.slice(0, 5);
      initHeroBanner();
      renderTrendingTop10(movies.slice(0, 10));
    }

    renderMovieGrid(gridEl, movies);
    updatePaginationUI();
  } catch (error) {
    console.error("Lỗi tải danh sách phim:", error);
    showToast(error.message || "Lỗi kết nối tới API NguonC", "error");
    gridEl.innerHTML = `
      <div class="empty-state">
        <p><i class="ri-error-warning-line"></i> Không thể tải danh sách phim từ NguonC lúc này.</p>
        <button class="btn-retry" id="btn-retry-load">Thử tải lại</button>
      </div>
    `;
    document.getElementById("btn-retry-load")?.addEventListener("click", () => loadMovies());
  }
}

/**
 * Tải song song 2 hàng Spotlight (Phim Bộ & Hoạt Hình) để trang chủ cực kỳ phong phú
 */
async function loadSpotlightRows() {
  const seriesGrid = document.getElementById("series-spotlight-grid");
  const animeGrid = document.getElementById("anime-spotlight-grid");

  renderSkeletons(seriesGrid, 5);
  renderSkeletons(animeGrid, 5);

  try {
    const [seriesRes, animeRes] = await Promise.all([
      getMoviesByCategory("phim-bo", 1),
      getMoviesByCountry("viet-nam", 1)
    ]);

    renderMovieGrid(seriesGrid, (seriesRes.items || []).slice(0, 5));
    renderMovieGrid(animeGrid, (animeRes.items || []).slice(0, 5));
  } catch (err) {
    console.warn("Không thể tải Spotlight phụ:", err);
  }
}

/**
 * Hiển thị Bảng xếp hạng Top 10 Phim Thịnh Hành có số thứ tự lớn phát sáng
 */
function renderTrendingTop10(movies) {
  const track = document.getElementById("trending-track");
  if (!track || !movies || movies.length === 0) return;

  track.innerHTML = movies
    .map(
      (movie, idx) => `
      <a href="watch.html?slug=${encodeURIComponent(movie.slug)}" class="trending-card" title="${escapeHtml(movie.name)}">
        <span class="rank-number">${idx + 1}</span>
        <div class="trending-poster-box">
          <img
            src="${escapeHtml(movie.thumb_url)}"
            alt="${escapeHtml(movie.name)}"
            loading="lazy"
            onerror="this.onerror=null;this.src='https://placehold.co/300x450/0f1b33/7dd3fc?text=Top+${idx + 1}';"
          />
          <span class="badge-episode">${escapeHtml(movie.current_episode)}</span>
          <div class="trending-poster-caption">
            <h4>${escapeHtml(movie.name)}</h4>
            <span>${escapeHtml(movie.quality)} • ${escapeHtml(movie.language)}</span>
          </div>
        </div>
      </a>
    `
    )
    .join("");
}

function renderSkeletons(container, count = 10) {
  if (!container) return;
  container.innerHTML = Array.from({ length: count })
    .map(
      () => `
      <div class="movie-card skeleton-card">
        <div class="skeleton-poster"></div>
        <div class="skeleton-line title"></div>
        <div class="skeleton-line sub"></div>
      </div>
    `
    )
    .join("");
}

function renderMovieGrid(container, movies) {
  if (!container) return;

  if (!movies || movies.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p><i class="ri-film-line"></i> Không tìm thấy bộ phim nào phù hợp với từ khóa hoặc bộ lọc này.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = movies
    .map(
      (movie) => `
      <a href="watch.html?slug=${encodeURIComponent(movie.slug)}" class="movie-card" title="${escapeHtml(movie.name)}">
        <div class="movie-poster-wrap">
          <img
            src="${escapeHtml(movie.thumb_url)}"
            alt="${escapeHtml(movie.name)}"
            loading="lazy"
            onerror="this.onerror=null;this.src='https://placehold.co/300x450/0f1b33/7dd3fc?text=Biển Phim Hay';"
          />
          <span class="badge-episode">${escapeHtml(movie.current_episode)}</span>
          <span class="badge-quality">${escapeHtml(movie.quality)} • ${escapeHtml(movie.language)}</span>
          <div class="poster-overlay">
            <div class="play-circle"><i class="ri-play-fill"></i></div>
          </div>
        </div>
        <div class="movie-card-info">
          <h3 class="movie-title">${escapeHtml(movie.name)}</h3>
          <p class="movie-origin">${escapeHtml(movie.original_name)}</p>
        </div>
      </a>
    `
    )
    .join("");
}

/**
 * Khởi tạo Siêu Hero Banner kèm 5 Thumbnail tương tác
 */
function initHeroBanner() {
  const heroSection = document.getElementById("hero-banner");
  if (!heroSection || state.heroMovies.length === 0) return;

  renderHeroSlide(0);

  clearInterval(state.heroTimer);
  state.heroTimer = setInterval(() => {
    state.heroIndex = (state.heroIndex + 1) % state.heroMovies.length;
    renderHeroSlide(state.heroIndex);
  }, 6500);
}

function renderHeroSlide(index) {
  const movie = state.heroMovies[index];
  if (!movie) return;

  const backdropEl = document.getElementById("hero-backdrop");
  const floatingPosterEl = document.getElementById("hero-floating-poster");
  const floatingBadgeEl = document.getElementById("hero-floating-badge");
  const titleEl = document.getElementById("hero-title");
  const originEl = document.getElementById("hero-origin");
  const metaEl = document.getElementById("hero-meta");
  const descEl = document.getElementById("hero-desc");
  const playBtn = document.getElementById("hero-btn-play");
  const thumbsEl = document.getElementById("hero-thumbs");
  const dotsEl = document.getElementById("hero-dots");

  if (backdropEl) {
    backdropEl.style.backgroundImage = `url('${movie.poster_url || movie.thumb_url}')`;
  }
  if (floatingPosterEl) {
    floatingPosterEl.src = movie.thumb_url || movie.poster_url;
  }
  if (floatingBadgeEl) {
    floatingBadgeEl.textContent = `${movie.current_episode} • ${movie.quality}`;
  }
  if (titleEl) titleEl.textContent = movie.name;
  if (originEl) originEl.textContent = movie.original_name;
  if (metaEl) {
    metaEl.innerHTML = `
      <span class="hero-tag hot"><span class="live-ping"></span> <i class="ri-fire-fill"></i> TOP #${index + 1} ĐỀ CỬ</span>
      <span class="hero-tag">${escapeHtml(movie.current_episode)}</span>
      <span class="hero-tag">${escapeHtml(movie.quality)}</span>
      <span class="hero-tag">${escapeHtml(movie.language)}</span>
    `;
  }
  if (descEl) {
    descEl.textContent =
      movie.description && movie.description.length > 10
        ? movie.description
        : `Thưởng thức bộ phim ${movie.name} (${movie.original_name}) chất lượng cao Vietsub / Thuyết minh cập nhật nhanh nhất trên Biển Phim Hay.`;
  }
  if (playBtn) {
    playBtn.href = `watch.html?slug=${encodeURIComponent(movie.slug)}`;
  }

  // Render 5 Thumbnail chọn nhanh
  if (thumbsEl) {
    thumbsEl.innerHTML = state.heroMovies
      .map(
        (m, i) => `
        <div class="hero-thumb-item ${i === index ? "active" : ""}" data-thumb-idx="${i}">
          <img src="${escapeHtml(m.thumb_url)}" alt="${escapeHtml(m.name)}" />
          <div class="hero-thumb-info">
            <h4>${escapeHtml(m.name)}</h4>
            <span>${escapeHtml(m.current_episode)}</span>
          </div>
        </div>
      `
      )
      .join("");

    thumbsEl.querySelectorAll(".hero-thumb-item").forEach((item) => {
      item.addEventListener("click", () => {
        state.heroIndex = Number(item.dataset.thumbIdx);
        renderHeroSlide(state.heroIndex);
      });
    });
  }

  if (dotsEl) {
    dotsEl.innerHTML = state.heroMovies
      .map(
        (_, i) =>
          `<button class="hero-dot ${i === index ? "active" : ""}" data-slide="${i}" aria-label="Slide ${i + 1}"></button>`
      )
      .join("");

    dotsEl.querySelectorAll(".hero-dot").forEach((dot) => {
      dot.addEventListener("click", () => {
        state.heroIndex = Number(dot.dataset.slide);
        renderHeroSlide(state.heroIndex);
      });
    });
  }
}

/**
 * Mở hộp thoại Xem Nhanh Chi Tiết (Quick View Modal)
 */
function openQuickViewModal(movie) {
  const modal = document.getElementById("quickview-modal");
  const body = document.getElementById("quickview-body");
  if (!modal || !body) return;

  body.innerHTML = `
    <img src="${escapeHtml(movie.thumb_url)}" alt="${escapeHtml(movie.name)}" />
    <div>
      <span class="brand-badge">${escapeHtml(movie.current_episode)} • ${escapeHtml(movie.quality)}</span>
      <h2 style="font-size: 1.6rem; margin-bottom: 4px;">${escapeHtml(movie.name)}</h2>
      <p style="color: var(--accent-aqua); font-weight: 600; margin-bottom: 12px;">${escapeHtml(movie.original_name)}</p>
      <p style="color: #cbd5e1; font-size: 0.92rem; margin-bottom: 18px; line-height: 1.6;">
        ${escapeHtml(movie.description || "Bấm Xem Phim Ngay để thưởng thức trọn bộ với tốc độ cao.")}
      </p>
      <a href="watch.html?slug=${encodeURIComponent(movie.slug)}" class="btn-hero-play" style="display: inline-flex;">
        <span class="play-icon-ring"><i class="ri-play-fill"></i></span>
        <span>Vào Xem Phim Ngay</span>
      </a>
    </div>
  `;
  modal.classList.add("active");
}

function closeQuickViewModal() {
  document.getElementById("quickview-modal")?.classList.remove("active");
}

function updatePaginationUI() {
  const pageInfo = document.getElementById("page-indicator");
  const prevBtn = document.getElementById("btn-prev-page");
  const nextBtn = document.getElementById("btn-next-page");

  if (pageInfo) {
    pageInfo.textContent = `Trang ${state.page} / ${state.totalPages}`;
  }
  if (prevBtn) prevBtn.disabled = state.page <= 1;
  if (nextBtn) nextBtn.disabled = state.page >= state.totalPages;
}

function renderHistorySection() {
  const history = getWatchHistory();
  const section = document.getElementById("history-section");
  const listEl = document.getElementById("history-grid");

  if (!section || !listEl) return;
  if (history.length === 0) {
    section.style.display = "none";
    return;
  }

  section.style.display = "block";
  listEl.innerHTML = history
    .slice(0, 6)
    .map(
      (item) => `
      <a href="watch.html?slug=${encodeURIComponent(item.slug)}" class="history-card">
        <img src="${escapeHtml(item.thumb_url)}" alt="${escapeHtml(item.name)}" />
        <div class="history-card-body">
          <h4>${escapeHtml(item.name)}</h4>
          <span>Đang xem: ${escapeHtml(item.episodeName || "Tập 1")}</span>
        </div>
      </a>
    `
    )
    .join("");
}