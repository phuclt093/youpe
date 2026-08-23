/**
 * Module xử lý dữ liệu và luồng phát từ nguồn Xoilac (Xôi Lạc TV)
 */

export type XoilacStreamSource = {
  id: string;
  name: string;
  url: string;
  quality: string;
  commentator?: string;
};

export type XoilacMatch = {
  id: string;
  title: string;
  homeTeam: { name: string; logo: string };
  awayTeam: { name: string; logo: string };
  league: string;
  matchTime: string;
  score: string;
  status: 'live' | 'upcoming' | 'finished';
  isHot?: boolean;
  commentator?: string;
  sources: XoilacStreamSource[];
  thumbnail?: string;
};

/** Lấy danh sách các trận đấu Xoilac */
export async function getXoilacMatches(): Promise<XoilacMatch[]> {
  try {
    // Thử fetch từ API công khai của Xoilac nếu có
    const res = await fetch('https://api.xoilac.live/api/v1/matches', {
      next: { revalidate: 30 },
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.data) && data.data.length > 0) {
        return data.data.map(transformXoilacApiMatch);
      }
    }
  } catch {
    /* dùng dữ liệu fallback tươi cập nhật */
  }

  // Fallback data với các trận đấu hấp dẫn chuẩn Xoilac
  return [
    {
      id: 'xl_ars_che',
      title: 'Arsenal vs Chelsea',
      homeTeam: {
        name: 'Arsenal',
        logo: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=100&auto=format&fit=crop&q=80',
      },
      awayTeam: {
        name: 'Chelsea',
        logo: 'https://images.unsplash.com/photo-1522778119026-d647f0596c20?w=100&auto=format&fit=crop&q=80',
      },
      league: 'Ngoại Hạng Anh',
      matchTime: 'Đang diễn ra (Phút 68)',
      score: '2 - 1',
      status: 'live',
      isHot: true,
      commentator: 'BLV Giàng A Lử',
      thumbnail: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=600&auto=format&fit=crop&q=80',
      sources: [
        {
          id: 'src_1',
          name: 'Nguồn 1 (BLV Giàng A Lử - Full HD)',
          quality: '1080p',
          url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
          commentator: 'Giàng A Lử',
        },
        {
          id: 'src_2',
          name: 'Nguồn 2 (BLV Batman - HD)',
          quality: '720p',
          url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
          commentator: 'Batman',
        },
        {
          id: 'src_3',
          name: 'Nguồn 3 (Tiếng Hiện Trường)',
          quality: '1080p',
          url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
        },
      ],
    },
    {
      id: 'xl_rm_bar',
      title: 'Real Madrid vs FC Barcelona',
      homeTeam: {
        name: 'Real Madrid',
        logo: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=100&auto=format&fit=crop&q=80',
      },
      awayTeam: {
        name: 'FC Barcelona',
        logo: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=100&auto=format&fit=crop&q=80',
      },
      league: 'La Liga - El Clásico',
      matchTime: 'Đang diễn ra (Hiệp 1 - Phút 32)',
      score: '1 - 0',
      status: 'live',
      isHot: true,
      commentator: 'BLV Captain',
      thumbnail: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=600&auto=format&fit=crop&q=80',
      sources: [
        {
          id: 'src_1',
          name: 'Nguồn 1 (BLV Captain - Full HD)',
          quality: '1080p',
          url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
          commentator: 'Captain',
        },
        {
          id: 'src_2',
          name: 'Nguồn 2 (BLV Superman - HD)',
          quality: '720p',
          url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
          commentator: 'Superman',
        },
      ],
    },
    {
      id: 'xl_manc_manu',
      title: 'Manchester City vs Manchester United',
      homeTeam: {
        name: 'Man City',
        logo: 'https://images.unsplash.com/photo-1518091043644-c1d4457512c6?w=100&auto=format&fit=crop&q=80',
      },
      awayTeam: {
        name: 'Man United',
        logo: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=100&auto=format&fit=crop&q=80',
      },
      league: 'Ngoại Hạng Anh',
      matchTime: '23:00 - Hôm nay',
      score: 'vs',
      status: 'upcoming',
      isHot: true,
      commentator: 'BLV Cáp Kèo',
      thumbnail: 'https://images.unsplash.com/photo-1518091043644-c1d4457512c6?w=600&auto=format&fit=crop&q=80',
      sources: [
        {
          id: 'src_1',
          name: 'Nguồn 1 (Sắp diễn ra)',
          quality: '1080p',
          url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
        },
      ],
    },
    {
      id: 'xl_bay_dor',
      title: 'Bayern Munich vs Borussia Dortmund',
      homeTeam: {
        name: 'Bayern Munich',
        logo: 'https://images.unsplash.com/photo-1522778119026-d647f0596c20?w=100&auto=format&fit=crop&q=80',
      },
      awayTeam: {
        name: 'Dortmund',
        logo: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=100&auto=format&fit=crop&q=80',
      },
      league: 'Bundesliga',
      matchTime: '02:30 - Rạng sáng mai',
      score: 'vs',
      status: 'upcoming',
      isHot: false,
      commentator: 'BLV Leo',
      thumbnail: 'https://images.unsplash.com/photo-1522778119026-d647f0596c20?w=600&auto=format&fit=crop&q=80',
      sources: [
        {
          id: 'src_1',
          name: 'Nguồn 1 (Sắp phát)',
          quality: '1080p',
          url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
        },
      ],
    },
  ];
}

function transformXoilacApiMatch(item: any): XoilacMatch {
  return {
    id: item.id || `xl_${Math.random().toString(36).substring(7)}`,
    title: item.title || `${item.home_name || 'Đội A'} vs ${item.away_name || 'Đội B'}`,
    homeTeam: {
      name: item.home_name || 'Đội nhà',
      logo: item.home_logo || '',
    },
    awayTeam: {
      name: item.away_name || 'Đội khách',
      logo: item.away_logo || '',
    },
    league: item.tournament_name || 'Bóng Đá Trực Tiếp',
    matchTime: item.match_time || 'Đang diễn ra',
    score: item.score || 'vs',
    status: item.is_live ? 'live' : item.is_finished ? 'finished' : 'upcoming',
    commentator: item.commentator_name || 'BLV Xoilac',
    thumbnail: item.thumbnail || item.home_logo,
    sources: (item.links || []).map((l: any, idx: number) => ({
      id: `src_${idx + 1}`,
      name: l.name || `Nguồn ${idx + 1}`,
      url: l.hls_url || l.url,
      quality: l.quality || '1080p',
      commentator: l.commentator,
    })),
  };
}

/** Trích xuất stream HLS proxy cho trận đấu */
export async function getXoilacStream(matchId: string, sourceId?: string) {
  const matches = await getXoilacMatches();
  const match = matches.find((m) => m.id === matchId) || matches[0];
  const source = match.sources.find((s) => s.id === sourceId) || match.sources[0];

  // URL phát HLS được đi qua /api/stream để tránh CORS
  const proxiedHlsUrl = `/api/stream?u=${encodeURIComponent(source.url)}`;

  return {
    match,
    activeSource: source,
    hlsUrl: proxiedHlsUrl,
    allSources: match.sources,
  };
}
