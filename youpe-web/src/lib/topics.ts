/**
 * Danh sách chủ đề dùng chung cho hàng chip ở trang chủ và mục Khám phá ở sidebar.
 *
 * Có hai kiểu:
 *   - browse: gọi thẳng endpoint browse của YouTube, dữ liệu sát nhất
 *   - search: tìm kiếm theo cụm từ, dùng cho những chủ đề YouTube không có feed riêng
 */

export type Topic = {
  key: string;
  label: string;
  kind: 'home' | 'browse' | 'search';
  query?: string;
  browseId?: string;
  params?: string;
  /** Có hiện trong mục Khám phá ở sidebar không */
  explore?: boolean;
};

export const TOPICS: Topic[] = [
  { key: 'home', label: 'Tất cả', kind: 'home' },
  { key: 'trending', label: 'Thịnh hành', kind: 'browse', browseId: 'FEtrending', explore: true },

  { key: 'music', label: 'Âm nhạc', kind: 'search', query: 'nhạc hay mới nhất', explore: true },
  { key: 'gaming', label: 'Trò chơi', kind: 'search', query: 'gameplay game hay', explore: true },
  { key: 'movies', label: 'Phim & hoạt hình', kind: 'search', query: 'phim hay review phim', explore: true },
  { key: 'sports', label: 'Thể thao', kind: 'search', query: 'thể thao bóng đá highlights', explore: true },
  { key: 'news', label: 'Tin tức', kind: 'search', query: 'tin tức mới nhất hôm nay', explore: true },
  { key: 'learning', label: 'Học tập', kind: 'search', query: 'bài giảng hướng dẫn học', explore: true },
  { key: 'tech', label: 'Công nghệ', kind: 'search', query: 'công nghệ đánh giá điện thoại laptop' },
  { key: 'coding', label: 'Lập trình', kind: 'search', query: 'lập trình tutorial code' },
  { key: 'food', label: 'Ẩm thực', kind: 'search', query: 'món ăn nấu ăn công thức' },
  { key: 'travel', label: 'Du lịch', kind: 'search', query: 'du lịch vlog khám phá' },
  { key: 'comedy', label: 'Hài', kind: 'search', query: 'hài kịch cười' },
  { key: 'podcast', label: 'Podcast', kind: 'search', query: 'podcast trò chuyện' },
  { key: 'beauty', label: 'Làm đẹp', kind: 'search', query: 'làm đẹp skincare makeup' },
  { key: 'health', label: 'Sức khoẻ', kind: 'search', query: 'sức khoẻ tập luyện gym yoga' },
  { key: 'kids', label: 'Thiếu nhi', kind: 'search', query: 'hoạt hình cho trẻ em' },
  { key: 'cars', label: 'Xe', kind: 'search', query: 'xe hơi mô tô đánh giá' },
  { key: 'pets', label: 'Thú cưng', kind: 'search', query: 'thú cưng mèo chó' },
  { key: 'diy', label: 'Tự làm', kind: 'search', query: 'diy tự làm handmade' },
  { key: 'science', label: 'Khoa học', kind: 'search', query: 'khoa học giải thích vũ trụ' },
  { key: 'history', label: 'Lịch sử', kind: 'search', query: 'lịch sử tài liệu' },
  { key: 'live', label: 'Trực tiếp', kind: 'search', query: 'live trực tiếp' },
];

export const TOPIC_MAP: Record<string, Topic> = Object.fromEntries(
  TOPICS.map((t) => [t.key, t])
);

export const EXPLORE_TOPICS = TOPICS.filter((t) => t.explore);

export function topicByKey(key?: string | null): Topic {
  return (key && TOPIC_MAP[key]) || TOPIC_MAP.home;
}
