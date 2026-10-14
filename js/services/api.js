// ============================================================================
// FILE: js/services/api.js
// MỤC ĐÍCH: Chuyên gọi API từ NguonC (https://phim.nguonc.com/api)
//           Có cơ chế tự động fallback qua CORS Proxy nếu trình duyệt chặn CORS.
// ============================================================================

const BASE_URL = "https://phim.nguonc.com/api";

// Danh sách Thể loại & Quốc gia chuẩn của NguonC để hiển thị lên bộ lọc
export const GENRES = [
  { name: "Hành Động", slug: "hanh-dong" },
  { name: "Tình Cảm", slug: "tinh-cam" },
  { name: "Hài Hước", slug: "hai-huoc" },
  { name: "Cổ Trang", slug: "co-trang" },
  { name: "Tâm Lý", slug: "tam-ly" },
  { name: "Hình Sự", slug: "hinh-su" },
  { name: "Chiến Tranh", slug: "chien-tranh" },
  { name: "Thể Thao", slug: "the-thao" },
  { name: "Võ Thuật", slug: "vo-thuat" },
  { name: "Viễn Tưởng", slug: "vien-tuong" },
  { name: "Phiêu Lưu", slug: "phieu-luu" },
  { name: "Khoa Học", slug: "khoa-hoc" },
  { name: "Kinh Dị", slug: "kinh-di" },
  { name: "Âm Nhạc", slug: "am-nhac" },
  { name: "Thần Thoại", slug: "than-thoai" },
  { name: "Tài Liệu", slug: "tai-lieu" },
  { name: "Gia Đình", slug: "gia-dinh" },
  { name: "Chính Kịch", slug: "chinh-kich" },
  { name: "Bí Ẩn", slug: "bi-an" },
  { name: "Học Đường", slug: "hoc-duong" }
];

export const COUNTRIES = [
  { name: "Hàn Quốc", slug: "han-quoc" },
  { name: "Trung Quốc", slug: "trung-quoc" },
  { name: "Âu Mỹ", slug: "au-my" },
  { name: "Nhật Bản", slug: "nhat-ban" },
  { name: "Thái Lan", slug: "thai-lan" },
  { name: "Việt Nam", slug: "viet-nam" },
  { name: "Đài Loan", slug: "dai-loan" },
  { name: "Hồng Kông", slug: "hong-kong" },
  { name: "Ấn Độ", slug: "an-do" },
  { name: "Anh", slug: "anh" }
];

/**
 * Hàm gọi API thông minh: Thử gọi trực tiếp trước, nếu vướng CORS sẽ tự động
 * bọc qua proxy để đảm bảo chạy mượt trên Live Server.
 */
async function fetchNguonC(endpoint) {
  const targetUrl = `${BASE_URL}${endpoint}`;

  try {
    const response = await fetch(targetUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (directError) {
    console.warn("Gọi trực tiếp gặp lỗi, đang chuyển sang CORS Proxy...", directError);
    // Fallback qua AllOrigins hoặc CorsProxy
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
    const fallbackRes = await fetch(proxyUrl);
    if (!fallbackRes.ok) {
      throw new Error("Không thể kết nối tới API NguonC lúc này.");
    }
    return await fallbackRes.json();
  }
}

/**
 * Chuẩn hóa đối tượng phim trả về từ NguonC để giao diện không bị lỗi thiếu ảnh/nhãn
 */
export function normalizeMovie(item = {}) {
  return {
    name: item.name || "Đang cập nhật",
    slug: item.slug || "",
    original_name: item.original_name || "",
    thumb_url: item.thumb_url || item.poster_url || "https://placehold.co/300x450/161d2f/e50914?text=No+Poster",
    poster_url: item.poster_url || item.thumb_url || "https://placehold.co/1200x600/161d2f/e50914?text=WebPhim",
    description: (item.description || "Chưa có mô tả cho bộ phim này.").replace(/<[^>]*>?/gm, ""),
    current_episode: item.current_episode || "Full",
    total_episodes: item.total_episodes || "?",
    time: item.time || "",
    quality: item.quality || "HD",
    language: item.language || "Vietsub",
    director: item.director || "Đang cập nhật",
    casts: item.casts || "Đang cập nhật",
    modified: item.modified || ""
  };
}

/**
 * 1. Lấy danh sách phim mới cập nhật
 * @param {number} page - Số trang (mặc định 1)
 */
export async function getNewlyUpdatedMovies(page = 1) {
  const data = await fetchNguonC(`/films/phim-moi-cap-nhat?page=${page}`);
  return {
    items: (data.items || []).map(normalizeMovie),
    paginate: data.paginate || { current_page: page, total_page: 1 }
  };
}

/**
 * 2. Lấy danh sách phim theo Danh mục (phim-bo, phim-le, hoat-hinh, tv-shows)
 */
export async function getMoviesByCategory(categorySlug, page = 1) {
  const data = await fetchNguonC(`/films/danh-sach/${categorySlug}?page=${page}`);
  return {
    items: (data.items || []).map(normalizeMovie),
    paginate: data.paginate || { current_page: page, total_page: 1 }
  };
}

/**
 * 3. Lấy danh sách phim theo Thể loại (hanh-dong, tinh-cam, kinh-di...)
 */
export async function getMoviesByGenre(genreSlug, page = 1) {
  const data = await fetchNguonC(`/films/the-loai/${genreSlug}?page=${page}`);
  return {
    items: (data.items || []).map(normalizeMovie),
    paginate: data.paginate || { current_page: page, total_page: 1 }
  };
}

/**
 * 4. Lấy danh sách phim theo Quốc gia (han-quoc, trung-quoc, au-my...)
 */
export async function getMoviesByCountry(countrySlug, page = 1) {
  const data = await fetchNguonC(`/films/quoc-gia/${countrySlug}?page=${page}`);
  return {
    items: (data.items || []).map(normalizeMovie),
    paginate: data.paginate || { current_page: page, total_page: 1 }
  };
}

/**
 * 5. Tìm kiếm phim theo từ khóa
 */
export async function searchMovies(keyword, page = 1) {
  const encoded = encodeURIComponent(keyword.trim());
  const data = await fetchNguonC(`/films/search?keyword=${encoded}&page=${page}`);
  return {
    items: (data.items || []).map(normalizeMovie),
    paginate: data.paginate || { current_page: page, total_page: 1 }
  };
}

/**
 * 6. Lấy chi tiết bộ phim & danh sách tập (dùng cho trang watch.html)
 */
export async function getMovieDetail(slug) {
  const data = await fetchNguonC(`/film/${slug}`);
  if (!data || !data.movie) {
    throw new Error("Không tìm thấy thông tin phim.");
  }
  return {
    movie: normalizeMovie(data.movie),
    rawMovie: data.movie,
    episodes: data.movie.episodes || []
  };
}