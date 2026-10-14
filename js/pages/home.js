// ============================================================================
// FILE: js/pages/home.js
// MỤC ĐÍCH: Điều khiển toàn bộ hoạt động của trang chủ (index.html):
//           - Hiển thị Hero Banner phim nổi bật
//           - Chuyển đổi danh mục (Phim mới, Phim bộ, Phim lẻ, Hoạt hình, TV Shows)
//           - Lọc theo Thể loại & Quốc gia từ API NguonC
//           - Tìm kiếm phim trực tiếp (Debounce) & Phân trang
//           - Hiển thị lịch sử xem phim từ LocalStorage
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

// Trạng thái bộ lọc hiện tại trên trang chủ
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
  // 1. Khởi tạo xác thực Firebase trên Header
  initHeaderAuthUI();

  // 2. Đổ danh sách Thể loại & Quốc gia vào 2 ô select
  populateFilterDropdowns();

  // 3. Hiển thị tủ phim đã xem gần đây (nếu có)
  renderHistorySection();

  // 4. Gắn sự kiện cho Menu, Tìm kiếm, Bộ lọc, Phân trang
  bindEvents();

  // 5. Tải dữ liệu trang chủ lần đầu
  loadMovies();
});

/**
 * Đổ dữ liệu Thể loại và Quốc gia vào dropdown
 */
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

/**
 * Gắn sự kiện tương tác trên trang chủ
 */
function bindEvents() {
  // Các nút tab danh mục trên thanh điều hướng & bộ lọc nhanh
  const navLinks = document.querySelectorAll("[data-nav-category]");
  navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      navLinks.forEach((l) => l.classList.remove("active"));
      link.classList.add("active");

      // Reset dropdowns
      document.getElementById("filter-genre").value = "";
      document.getElementById("filter-country").value = "";
      document.getElementById("search-input").value = "";

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
      loadMovies();
    });
  });

  // Lọc theo Thể loại
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

  // Lọc theo Quốc gia
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

  // Nút Đặt lại bộ lọc
  document.getElementById("btn-reset-filter")?.addEventListener("click", () => {
    document.getElementById("filter-genre").value = "";
    document.getElementById("filter-country").value = "";
    document.getElementById("search-input").value = "";
    state.mode = "new";
    state.value = "";
    state.title = "Phim Mới Cập Nhật";
    state.page = 1;
    loadMovies();
  });

  // Tìm kiếm phim (Bấm nút hoặc gõ phím với debounce 450ms)
  const searchForm = document.getElementById("search-form");
  const searchInput = document.getElementById("search-input");
  let debounceTimer = null;

  searchForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    triggerSearch(searchInput.value);
  });

  searchInput?.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const kw = searchInput.value.trim();
    if (!kw) {
      if (state.mode === "search") {
        state.mode = "new";
        state.title = "Phim Mới Cập Nhật";
        state.page = 1;
        loadMovies();
      }
      return;
    }
    debounceTimer = setTimeout(() => {
      triggerSearch(kw);
    }, 500);
  });

  // Phân trang Trước / Sau
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

function triggerSearch(keyword) {
  const kw = keyword.trim();
  if (!kw) return;
  state.mode = "search";
  state.value = kw;
  state.title = `Kết quả tìm kiếm: "${kw}"`;
  state.page = 1;
  loadMovies();
}

/**
 * Gọi API NguonC tương ứng với trạng thái lọc hiện tại và hiển thị ra màn hình
 */
async function loadMovies(scrollToGrid = false) {
  const gridEl = document.getElementById("movie-grid");
  const sectionTitleEl = document.getElementById("section-title");
  const totalBadgeEl = document.getElementById("total-items-badge");

  if (sectionTitleEl) sectionTitleEl.textContent = state.title;
  if (scrollToGrid) {
    document
      .getElementById("catalog-section")
      ?.scrollIntoView({ behavior: "smooth" });
  }

  // Hiển thị hiệu ứng khung xương (Skeleton Loading) trong lúc chờ API
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

    // Nếu đang ở trang 1 của Phim Mới, nạp 5 phim đầu tiên vào Hero Banner
    if (state.mode === "new" && state.page === 1 && movies.length > 0 && state.heroMovies.length === 0) {
      state.heroMovies = movies.slice(0, 5);
      initHeroBanner();
    }

    renderMovieGrid(gridEl, movies);
    updatePaginationUI();
  } catch (error) {
    console.error("Lỗi tải danh sách phim:", error);
    showToast(error.message || "Lỗi kết nối tới API NguonC", "error");
    gridEl.innerHTML = `
      <div class="empty-state">
        <p>⚠️ Không thể tải danh sách phim từ NguonC lúc này.</p>
        <button class="btn-retry" id="btn-retry-load">Thử tải lại</button>
      </div>
    `;
    document.getElementById("btn-retry-load")?.addEventListener("click", () => loadMovies());
  }
}

/**
 * Hiển thị hiệu ứng chờ (Skeleton)
 */
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

/**
 * Đổ danh sách thẻ phim ra lưới
 */
function renderMovieGrid(container, movies) {
  if (!container) return;

  if (!movies || movies.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>🎬 Không tìm thấy bộ phim nào phù hợp với từ khóa hoặc bộ lọc này.</p>
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
            onerror="this.onerror=null;this.src='https://placehold.co/300x450/161d2f/e50914?text=WebPhim';"
          />
          <span class="badge-episode">${escapeHtml(movie.current_episode)}</span>
          <span class="badge-quality">${escapeHtml(movie.quality)} • ${escapeHtml(movie.language)}</span>
          <div class="poster-overlay">
            <div class="play-circle">▶</div>
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
 * Khởi tạo Hero Banner tự động chuyển slide trên đầu trang chủ
 */
function initHeroBanner() {
  const heroSection = document.getElementById("hero-banner");
  if (!heroSection || state.heroMovies.length === 0) return;

  renderHeroSlide(0);

  clearInterval(state.heroTimer);
  state.heroTimer = setInterval(() => {
    state.heroIndex = (state.heroIndex + 1) % state.heroMovies.length;
    renderHeroSlide(state.heroIndex);
  }, 6000);
}

function renderHeroSlide(index) {
  const movie = state.heroMovies[index];
  if (!movie) return;

  const backdropEl = document.getElementById("hero-backdrop");
  const titleEl = document.getElementById("hero-title");
  const originEl = document.getElementById("hero-origin");
  const metaEl = document.getElementById("hero-meta");
  const descEl = document.getElementById("hero-desc");
  const playBtn = document.getElementById("hero-btn-play");
  const dotsEl = document.getElementById("hero-dots");

  if (backdropEl) {
    backdropEl.style.backgroundImage = `url('${movie.poster_url || movie.thumb_url}')`;
  }
  if (titleEl) titleEl.textContent = movie.name;
  if (originEl) originEl.textContent = movie.original_name;
  if (metaEl) {
    metaEl.innerHTML = `
      <span class="hero-tag hot">🔥 Thịnh hành</span>
      <span class="hero-tag">${escapeHtml(movie.current_episode)}</span>
      <span class="hero-tag">${escapeHtml(movie.quality)}</span>
      <span class="hero-tag">${escapeHtml(movie.language)}</span>
    `;
  }
  if (descEl) {
    descEl.textContent =
      movie.description && movie.description.length > 10
        ? movie.description
        : `Thưởng thức bộ phim ${movie.name} (${movie.original_name}) chất lượng cao Vietsub / Thuyết minh cập nhật nhanh nhất từ NguonC.`;
  }
  if (playBtn) {
    playBtn.href = `watch.html?slug=${encodeURIComponent(movie.slug)}`;
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
 * Cập nhật thanh phân trang
 */
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

/**
 * Hiển thị khu vực "Phim Đang Xem Dở" từ LocalStorage
 */
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