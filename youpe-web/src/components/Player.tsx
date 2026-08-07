'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDuration } from '@/lib/format';
import { getPrefs } from '@/lib/prefs';
import { resumeAt, saveProgress } from '@/lib/progress';

type Caption = { label: string; lang: string; url: string };
type Track = { id: number; height: number; label: string; active: boolean };
type RawFormat = { url: string; height?: number | null; label?: string };

type Mode = 'dash' | 'dual' | 'muxed';

export type EndCardItem = {
  id: string;
  title: string;
  thumbnail: string;
  durationText?: string;
  author: { name: string };
};

const AUTOPLAY_DELAY = 10;

/**
 * Trần độ phân giải cho lần phát đầu.
 *
 * Ở chế độ 2 luồng không có ABR, nên nếu chọn ngay bản cao nhất (có video tới
 * 1440p/2160p) thì trình duyệt phải nạp rất nhiều dữ liệu mới phát được — đây
 * chính là lý do video lâu lên hình. Bắt đầu ở mức vừa phải rồi để người dùng
 * tự nâng nếu muốn.
 */
const DEFAULT_MAX_HEIGHT = 720;
const QUALITY_KEY = 'youpe.maxHeight';

function preferredMaxHeight(): number {
  if (typeof window === 'undefined') return DEFAULT_MAX_HEIGHT;
  return getPrefs().maxHeight || DEFAULT_MAX_HEIGHT;
}

/** Chọn bản cao nhất nhưng không vượt trần; không có bản nào đạt thì lấy thấp nhất */
function pickStartIndex(list: RawFormat[], cap: number): number {
  let best = -1;
  for (let i = 0; i < list.length; i++) {
    const h = list[i].height ?? 0;
    if (h <= cap && (best === -1 || h > (list[best].height ?? 0))) best = i;
  }
  if (best !== -1) return best;

  let lowest = 0;
  for (let i = 1; i < list.length; i++) {
    if ((list[i].height ?? 0) < (list[lowest].height ?? 0)) lowest = i;
  }
  return lowest;
}

/** Những gì trình phát cho phép bên ngoài điều khiển */
export type PlayerApi = {
  seek: (t: number) => void;
  seekBy: (delta: number) => void;
  togglePlay: () => void;
  isPlaying: () => boolean;
  /** Tỉ lệ đã xem, từ 0 đến 1 */
  progress: () => number;
};

export default function Player({
  src,
  videoId,
  poster,
  captions = [],
  theater,
  onToggleTheater,
  onEnded,
  related = [],
  onPickVideo,
  compact = false,
  onMinimize,
  registerApi,
}: {
  src: string;
  videoId: string;
  poster?: string;
  captions?: Caption[];
  theater: boolean;
  onToggleTheater: () => void;
  onEnded?: () => void;
  related?: EndCardItem[];
  onPickVideo?: (id: string) => void;
  /** Cửa sổ nhỏ: ẩn bớt nút và không hiện màn hình kết thúc */
  compact?: boolean;
  /** Bấm nút thu nhỏ trên thanh điều khiển */
  onMinimize?: () => void;
  /** Phơi vài thao tác ra ngoài, ví dụ để mô tả bấm vào mốc thời gian là tua tới */
  registerApi?: (api: PlayerApi | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Giữ bản sao trong ref để các listener và setTimeout không đọc phải giá trị cũ
  const playingRef = useRef(false);
  const menuRef = useRef<string | null>(null);

  const [mode, setMode] = useState<Mode>('dash');
  const [dualList, setDualList] = useState<RawFormat[] | null>(null);
  const [dualAudio, setDualAudio] = useState<RawFormat | null>(null);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [errorDetail, setErrorDetail] = useState('');
  const [showDetail, setShowDetail] = useState(false);
  const [degraded, setDegraded] = useState('');
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [showUI, setShowUI] = useState(true);
  const [menu, setMenu] = useState<null | 'settings' | 'quality' | 'speed'>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [auto, setAuto] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [ccOn, setCcOn] = useState(false);
  const [fs, setFs] = useState(false);
  const [needUnmute, setNeedUnmute] = useState(false);
  const [ended, setEnded] = useState(false);
  const [countdown, setCountdown] = useState(AUTOPLAY_DELAY);
  const [autoNext, setAutoNext] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [waited, setWaited] = useState(0);
  const [isLive, setIsLive] = useState(false);
  const [resumed, setResumed] = useState(0);
  const resumeDone = useRef(false);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);
  useEffect(() => {
    menuRef.current = menu;
  }, [menu]);

  /**
   * Trình duyệt chặn tự phát khi có tiếng và người dùng chưa tương tác với trang.
   * Thử phát có tiếng trước; bị chặn thì tắt tiếng phát tiếp rồi hiện nút bật tiếng.
   */
  const autoplay = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;

    try {
      await v.play();
      // Ở chế độ 2 luồng, tiếng nằm ở thẻ audio riêng nên phải kiểm tra thêm
      const a = audioRef.current;
      if (a?.src) {
        try {
          await a.play();
        } catch {
          v.muted = true;
          a.muted = true;
          setNeedUnmute(true);
        }
      }
      return;
    } catch {
      /* bị chặn — thử lại ở chế độ tắt tiếng */
    }

    try {
      v.muted = true;
      const a = audioRef.current;
      if (a) a.muted = true;
      await v.play();
      if (a?.src) await a.play().catch(() => {});
      setNeedUnmute(true);
    } catch {
      /* vẫn không được thì để người dùng tự bấm nút phát */
    }
  }, []);

  /** Bật tiếng sau khi người dùng bấm — lúc này trình duyệt đã cho phép */
  const unmute = useCallback(() => {
    const v = videoRef.current;
    const a = audioRef.current;
    if (v) {
      v.muted = false;
      if (v.volume === 0) v.volume = 1;
    }
    if (a) {
      a.muted = false;
      a.volume = v?.volume ?? 1;
      if (a.src && !a.paused === false) a.play().catch(() => {});
    }
    setNeedUnmute(false);
  }, []);

  /* ---------------- gắn luồng ---------------- */

  /** Gắn một luồng hình + một luồng tiếng rồi giữ chúng đồng bộ */
  const attachDual = useCallback(
    (list: RawFormat[], aud: RawFormat | null, index: number, keepTime = 0) => {
      const v = videoRef.current;
      const a = audioRef.current;
      if (!v) return;

      v.src = list[index].url;
      if (a) a.src = aud?.url ?? '';

      if (keepTime > 0) {
        const restore = () => {
          v.currentTime = keepTime;
          if (a && aud) a.currentTime = keepTime;
          v.removeEventListener('loadedmetadata', restore);
        };
        v.addEventListener('loadedmetadata', restore);
      }

      setDualList(list);
      setDualAudio(aud);
      setTracks(
        list.map((f, i) => ({
          id: i,
          height: f.height ?? 0,
          label: f.label || `${f.height ?? '?'}p`,
          active: i === index,
        }))
      );
    },
    []
  );

  /* ---------------- khởi tạo ---------------- */

  useEffect(() => {
    let dead = false;

    // dọn sạch trạng thái của video trước
    setMode('dash');
    setDualList(null);
    setDualAudio(null);
    setTracks([]);
    setReady(false);
    setError('');
    setErrorDetail('');
    setShowDetail(false);
    setDegraded('');
    setNeedUnmute(false);
    setEnded(false);
    setCountdown(AUTOPLAY_DELAY);
    setAutoNext(getPrefs().autoplayNext);
    setBuffering(true);
    setResolving(false);
    setWaited(0);
    setIsLive(false);
    setResumed(0);
    resumeDone.current = false;
    setPlaying(false);
    setTime(0);
    setDuration(0);
    setBuffered(0);
    setAuto(true);

    const startShaka = async (manifestUrl: string) => {
      const mod: any = await import('shaka-player/dist/shaka-player.compiled.js');
      const shaka = mod.default ?? mod;
      shaka.polyfill.installAll();
      if (!shaka.Player.isBrowserSupported()) throw new Error('Trình duyệt không hỗ trợ DASH');

      const video = videoRef.current;
      if (!video || dead) return;

      const player = new shaka.Player();
      await player.attach(video);
      if (dead) {
        await player.destroy();
        return;
      }
      playerRef.current = player;

      player.configure({
        streaming: { bufferingGoal: 30, rebufferingGoal: 4, retryParameters: { maxAttempts: 3 } },
        abr: { enabled: true },
      });
      player.addEventListener('error', (e: any) => !dead && showError(e?.detail?.message || `Shaka Error ${e?.detail?.code}`));

      await player.load(manifestUrl);
      if (dead) return;

      const byHeight = new Map<number, any>();
      player.getVariantTracks().forEach((t: any) => {
        if (t.height && (!byHeight.has(t.height) || t.bandwidth > byHeight.get(t.height).bandwidth))
          byHeight.set(t.height, t);
      });
      setTracks(
        [...byHeight.values()]
          .sort((a, b) => b.height - a.height)
          .map((t: any) => ({ id: t.id, height: t.height, label: `${t.height}p`, active: t.active }))
      );

      setMode('dash');
      setReady(true);
      autoplay();
    };

    const showError = (msg: string, detail = '') => {
      if (dead) return;
      setError(msg);
      setErrorDetail(detail && detail !== msg ? detail : '');
      setShowDetail(false);
      setBuffering(false);
      setReady(false);
    };

    (async () => {
      try {
        // Một request duy nhất quyết định tất cả: nguồn nào, dựng được DASH không.
        setResolving(true);
        const r = await fetch(`/api/streams/${videoId}`);
        if (!dead) setResolving(false);
        const j = await r.json().catch(() => ({}));
        if (dead) return;

        if (!r.ok) {
          // /api/manifest dùng ít nguồn hơn /api/streams nên thử tiếp là vô ích
          showError(j?.error ?? `Không lấy được luồng (HTTP ${r.status})`, j?.detail ?? '');
          return;
        }

        setIsLive(!!j.isLive);

        // HLS phải được xét TRƯỚC dual/muxed.
        // Với video trực tiếp, yt-dlp cũng trả vài format rời nhưng chúng là đoạn
        // cố định — phát được ít phút rồi đứng hình. Chỉ HLS mới bám theo luồng.
        if (j.hls) {
          setDegraded(`${j.source} · trực tiếp`);
          await startShaka(j.hls);
          return;
        }

        if (j.liveWithoutHls) {
          showError(
            'Không lấy được luồng trực tiếp cho video này. ' +
              'Buổi phát có thể vừa kết thúc, hoặc kênh giới hạn người xem.',
            (j.tried ?? []).map((t: any) => `${t.source}: ${t.note}`).join(' | ')
          );
          return;
        }

        if (j.dash) {
          await startShaka(j.dash);
          return;
        }

        const v = videoRef.current;
        if (!v) return;

        if (j.video?.length && j.audio?.length) {
          const start = pickStartIndex(j.video, preferredMaxHeight());
          attachDual(j.video, j.audio[0], start);
          setMode('dual');
          setDegraded(
            `${j.source} · ${j.video[start]?.label ?? ''}${j.ms ? ` · ${(j.ms / 1000).toFixed(1)}s` : ''}`
          );
        } else if (j.muxed?.length) {
          v.src = j.muxed[0].url;
          setMode('muxed');
          setDegraded(
            `${j.source} · luồng gộp${j.muxed[0].height ? ` ${j.muxed[0].height}p` : ''}` +
              (j.ms ? ` · ${(j.ms / 1000).toFixed(1)}s` : '')
          );
        } else {
          showError('Không có luồng nào phát được cho video này');
          return;
        }

        setReady(true);
        autoplay();
      } catch (e: any) {
        setResolving(false);
        showError(e?.message ?? 'Không tải được luồng video');
      }
    })();

    return () => {
      dead = true;

      const p = playerRef.current;
      playerRef.current = null;

      // Dừng trước đã, bất kể đang ở chế độ nào. Thẻ media có thể đang bị cửa sổ nổi
      // của trình duyệt giữ, lúc đó nó rời khỏi cây DOM nhưng **vẫn phát tiếp** —
      // không dừng thì video cũ chạy song song với video mới.
      videoRef.current?.pause();
      audioRef.current?.pause();

      if (p) {
        // shaka tự ngắt các request đang bay khi destroy
        p.destroy?.().catch?.(() => {});
        return;
      }

      // Chế độ 2 luồng / luồng gộp: phải tự ngắt, nếu không thẻ media vẫn tải tiếp
      // luồng của video cũ sau khi đã chuyển sang video khác — vừa phí băng thông
      // vừa tranh chấp với luồng mới.
      for (const el of [videoRef.current, audioRef.current]) {
        if (!el || !el.getAttribute('src')) continue;
        el.removeAttribute('src');
        el.load(); // bắt buộc: chỉ xoá src thôi thì request vẫn chạy
      }
    };
  }, [videoId, attachDual, autoplay]);

  /* ---------------- đếm giây trong lúc chờ ---------------- */

  useEffect(() => {
    if (!resolving) return;
    setWaited(0);
    const t = setInterval(() => setWaited((w) => w + 1), 1000);
    return () => clearInterval(t);
  }, [resolving]);

  /* ---------------- sự kiện của thẻ video ---------------- */

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    // readyState >= 3 (HAVE_FUTURE_DATA) nghĩa là phát tiếp được ngay.
    // Bám vào đây thay vì chỉ nghe sự kiện 'playing' — sự kiện đó có trình duyệt
    // không bắn, khiến vòng xoay treo mãi.
    const settle = () => {
      if (v.readyState >= 3) setBuffering(false);
    };

    const onTime = () => {
      setTime(v.currentTime);
      if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
      settle();
    };
    const onMeta = () => {
      if (Number.isFinite(v.duration)) setDuration(v.duration);
      settle();
    };
    const onPlay = () => {
      setPlaying(true);
      setEnded(false);
    };
    const onPause = () => setPlaying(false);
    const onFinish = () => {
      setPlaying(false);
      setEnded(true);
      setShowUI(true);
      audioRef.current?.pause();
      onEnded?.();
    };
    const onWaiting = () => setBuffering(true);
    const onVolume = () => {
      setVolume(v.volume);
      setMuted(v.muted);
    };
    const onRate = () => setSpeed(v.playbackRate);
    const onErr = () => {
      const code = v.error?.code;
      if (code) {
        if ((code === 4 || code === 3) && mode === 'dual' && dualList && dualList.length > 0) {
          console.warn(`[Player] HTMLVideoElement error ${code}, trying next stream format...`);
          const curIndex = tracks.findIndex((t) => t.active);
          if (curIndex >= 0 && curIndex + 1 < dualList.length) {
            attachDual(dualList, dualAudio, curIndex + 1);
            return;
          }
        }
        setError(`Thẻ video báo lỗi ${code}: ${v.error?.message || 'không rõ'}`);
      }
    };

    const events: [string, EventListener][] = [
      ['timeupdate', onTime],
      ['durationchange', onMeta],
      ['loadedmetadata', onMeta],
      ['loadeddata', settle],
      ['canplay', settle],
      ['canplaythrough', settle],
      ['playing', settle],
      ['progress', settle],
      ['seeked', settle],
      ['play', onPlay],
      ['pause', onPause],
      ['waiting', onWaiting],
      ['stalled', onWaiting],
      ['volumechange', onVolume],
      ['ratechange', onRate],
      ['error', onErr],
    ];
    events.push(['ended', onFinish]);

    events.forEach(([n, h]) => v.addEventListener(n, h));

    // lưới an toàn: nếu vì lý do nào đó không sự kiện nào bắn
    const poll = setInterval(settle, 500);

    return () => {
      clearInterval(poll);
      events.forEach(([n, h]) => v.removeEventListener(n, h));
    };
  }, [onEnded]);

  /* ---------------- tiến độ xem ---------------- */

  useEffect(() => {
    const v = videoRef.current;
    if (!v || isLive) return;

    /**
     * Nhảy tới chỗ xem dở, chỉ làm một lần cho mỗi video.
     * Chờ có metadata mới biết được tổng thời lượng.
     */
    const tryResume = () => {
      if (resumeDone.current || !Number.isFinite(v.duration) || v.duration <= 0) return;
      resumeDone.current = true;

      const at = resumeAt(videoId);
      if (at > 0 && at < v.duration - 20) {
        v.currentTime = at;
        const a = audioRef.current;
        if (a?.src) a.currentTime = at;
        setResumed(at);
        setTimeout(() => setResumed(0), 6000);
      }
    };

    v.addEventListener('loadedmetadata', tryResume);
    tryResume();

    // ghi mỗi 5 giây, đủ chính xác mà không làm phiền localStorage
    const timer = setInterval(() => {
      if (!v.paused && Number.isFinite(v.duration)) saveProgress(videoId, v.currentTime, v.duration);
    }, 5000);

    const onLeave = () => {
      if (Number.isFinite(v.duration)) saveProgress(videoId, v.currentTime, v.duration);
    };
    v.addEventListener('pause', onLeave);
    window.addEventListener('beforeunload', onLeave);

    return () => {
      clearInterval(timer);
      v.removeEventListener('loadedmetadata', tryResume);
      v.removeEventListener('pause', onLeave);
      window.removeEventListener('beforeunload', onLeave);
      onLeave();
    };
  }, [videoId, isLive]);

  /* ---------------- đồng bộ tiếng ở chế độ 2 luồng ---------------- */

  useEffect(() => {
    const v = videoRef.current;
    const a = audioRef.current;
    if (!v || !a || mode !== 'dual' || !dualAudio) return;

    const MAX_DRIFT = 0.3;

    const onPlay = () => {
      a.currentTime = v.currentTime;
      a.play().catch(() => {});
    };
    const onPause = () => a.pause();
    const onSeek = () => {
      a.currentTime = v.currentTime;
    };
    const onRate = () => {
      a.playbackRate = v.playbackRate;
    };
    const onVolume = () => {
      a.volume = v.volume;
      a.muted = v.muted;
    };
    const onWaiting = () => a.pause();
    const onPlaying = () => {
      if (!v.paused) a.play().catch(() => {});
    };

    const events: [string, EventListener][] = [
      ['play', onPlay],
      ['pause', onPause],
      ['seeking', onSeek],
      ['seeked', onSeek],
      ['ratechange', onRate],
      ['volumechange', onVolume],
      ['waiting', onWaiting],
      ['playing', onPlaying],
    ];
    events.forEach(([n, h]) => v.addEventListener(n, h));

    onVolume();
    onRate();

    /*
      Vòng canh gác mỗi giây, làm hai việc.

      Sửa lệch thì dễ hiểu. Việc thứ hai quan trọng hơn: **cho thẻ tiếng chạy lại nếu
      nó bị dừng oan**. Ở chế độ hai luồng, cửa sổ nổi chỉ mang theo thẻ `<video>` —
      thẻ `<audio>` ở lại trong trang. Khi trang bị ẩn (chuyển tab, rời trang xem),
      trình duyệt có quyền dừng media của trang ẩn, và thế là hình vẫn chạy trong cửa
      sổ nổi mà mất sạch tiếng.

      Không thể bắt bằng sự kiện vì trình duyệt dừng lúc nào là tuỳ nó, nên phải canh.
    */
    const timer = setInterval(() => {
      if (v.paused) return;

      if (a.paused && a.src) {
        a.currentTime = v.currentTime;
        a.play().catch(() => {});
        return;
      }

      if (a.readyState < 2) return;
      if (Math.abs(a.currentTime - v.currentTime) > MAX_DRIFT) a.currentTime = v.currentTime;
    }, 1000);

    return () => {
      clearInterval(timer);
      events.forEach(([n, h]) => v.removeEventListener(n, h));
    };
  }, [mode, dualAudio]);

  /* ---------------- đếm ngược sang video kế tiếp ---------------- */

  useEffect(() => {
    const next = related[0];
    if (!ended || !autoNext || !next || !onPickVideo) return;

    setCountdown(AUTOPLAY_DELAY);
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          onPickVideo(next.id);
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [ended, autoNext, related, onPickVideo]);

  const replay = useCallback(() => {
    const v = videoRef.current;
    const a = audioRef.current;
    if (!v) return;
    setEnded(false);
    setAutoNext(false);
    v.currentTime = 0;
    if (a) a.currentTime = 0;
    v.play().catch(() => {});
    if (a?.src) a.play().catch(() => {});
  }, []);

  /* ---------------- tiếp tục phát khi cửa sổ bị ẩn ---------------- */

  useEffect(() => {
    if (!getPrefs().playInBackground) return;

    /**
     * Chuyển sang tab khác hoặc thu nhỏ cửa sổ, trình duyệt có thể tự dừng media.
     * Ở đây theo dõi và cho chạy lại nếu người dùng chưa chủ động bấm dừng.
     */
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') return;
      const v = videoRef.current;
      const a = audioRef.current;
      if (!v || !playingRef.current) return;

      // đợi một nhịp: nếu trình duyệt vừa dừng thì cho chạy tiếp
      setTimeout(() => {
        if (!playingRef.current) return;
        if (v.paused) v.play().catch(() => {});
        if (a?.src && a.paused) a.play().catch(() => {});
      }, 250);
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  /* ---------------- toàn màn hình & phụ đề ---------------- */

  useEffect(() => {
    const h = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    for (let i = 0; i < v.textTracks.length; i++) {
      v.textTracks[i].mode = ccOn && i === 0 ? 'showing' : 'hidden';
    }
  }, [ccOn, captions.length, ready]);

  /* ---------------- điều khiển ---------------- */

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }, []);

  const seek = useCallback(
    (t: number) => {
      const v = videoRef.current;
      if (!v || !Number.isFinite(t)) return;
      v.currentTime = Math.max(0, Math.min(t, duration || v.duration || 0));
    },
    [duration]
  );

  const toggleFs = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen();
    else wrapRef.current?.requestFullscreen?.();
  }, []);

  /** Hiện thanh điều khiển, rồi hẹn giờ ẩn đi nếu đang phát và không mở menu */
  const nudgeUI = useCallback(() => {
    setShowUI(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (playingRef.current && !menuRef.current) setShowUI(false);
    }, 3000);
  }, []);

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  /*
    Phơi API ra ngoài sau khi seek đã sẵn sàng.
    Ngoài mô tả video bấm mốc thời gian, chỗ này còn để vỏ desktop điều khiển được
    từ thanh taskbar và phím media của bàn phím.
  */
  useEffect(() => {
    registerApi?.({
      seek: (t: number) => seek(t),
      seekBy: (d: number) => seek((videoRef.current?.currentTime ?? 0) + d),
      togglePlay,
      isPlaying: () => !!playingRef.current,
      progress: () => {
        const v = videoRef.current;
        return v?.duration ? v.currentTime / v.duration : 0;
      },
    });
    return () => registerApi?.(null);
  }, [registerApi, seek, togglePlay]);

  /* phím tắt giống YouTube */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable)
        return;
      const v = videoRef.current;
      if (!v) return;

      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'arrowright': seek(v.currentTime + 5); break;
        case 'arrowleft': seek(v.currentTime - 5); break;
        case 'j': seek(v.currentTime - 10); break;
        case 'l': seek(v.currentTime + 10); break;
        case 'm': v.muted = !v.muted; break;
        case 'f': toggleFs(); break;
        case 't': onToggleTheater(); break;
        case 'c': setCcOn((c) => !c); break;
        case 'i': onMinimize?.(); break;
        default: return;
      }
      nudgeUI();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [togglePlay, seek, toggleFs, onToggleTheater, nudgeUI, onMinimize]);

  const pickQuality = (t: Track) => {
    // nhớ lại để lần sau mở video khác cũng dùng mức này
    if (t.height) {
      try {
        localStorage.setItem(QUALITY_KEY, String(t.height));
      } catch {
        /* chế độ riêng tư có thể chặn localStorage */
      }
    }

    if (mode === 'dual' && dualList) {
      const wasPlaying = !videoRef.current?.paused;
      attachDual(dualList, dualAudio, t.id, videoRef.current?.currentTime ?? 0);
      if (wasPlaying) setTimeout(() => autoplay(), 0);
    } else {
      const p = playerRef.current;
      p?.configure({ abr: { enabled: false } });
      const target = p?.getVariantTracks().find((x: any) => x.id === t.id);
      if (target) p.selectVariantTrack(target, true);
    }
    setAuto(false);
    setTracks((ts) => ts.map((x) => ({ ...x, active: x.id === t.id })));
    setMenu(null);
  };

  const pct = duration ? (time / duration) * 100 : 0;
  const bufPct = duration ? (buffered / duration) * 100 : 0;
  const showSpinner = !error && !ended && (buffering || !ready);
  const controlsVisible = !ended && (showUI || !playing || !!menu);

  return (
    <div
      ref={wrapRef}
      onMouseMove={nudgeUI}
      onMouseLeave={() => !menu && playing && setShowUI(false)}
      className={`group relative w-full overflow-hidden bg-black transition-[border-radius] duration-200 ${
        fs ? 'h-screen' : 'aspect-video rounded-xl'
      }`}
    >
      <video
        ref={videoRef}
        poster={poster}
        playsInline
        onClick={togglePlay}
        onDoubleClick={toggleFs}
        className="h-full w-full"
        crossOrigin="anonymous"
      >
        {captions.map((c, i) => (
          <track
            key={c.lang}
            kind="subtitles"
            src={c.url}
            srcLang={c.lang}
            label={c.label}
            default={i === 0 && ccOn}
          />
        ))}
      </video>

      {/* luồng tiếng riêng, chỉ dùng ở chế độ 2 luồng */}
      <audio ref={audioRef} preload="auto" className="hidden" crossOrigin="anonymous" />

      {showSpinner && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/30">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-white" />

            {resolving && (
              <div className="anim-fade-in">
                <p className="text-sm">Đang lấy luồng phát…</p>
                {waited >= 3 && (
                  <p className="mt-1 text-xs text-yt-sub">
                    {waited}s · YouTube trả lời hơi chậm với video này
                  </p>
                )}
              </div>
            )}

            {!resolving && ready && (
              <p className="anim-fade-in text-sm text-yt-sub">Đang tải dữ liệu…</p>
            )}
          </div>
        </div>
      )}

      {needUnmute && !error && (
        <button
          onClick={unmute}
          className="anim-fade-in absolute left-1/2 top-4 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-yt-red px-4 py-2 text-sm font-medium text-white shadow-lg hover:brightness-110"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
          </svg>
          Bấm để bật tiếng
        </button>
      )}

      {isLive && !error && (
        <div className="anim-fade-in pointer-events-none absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-yt-red px-2.5 py-1 text-xs font-medium">
          <span className="h-1.5 w-1.5 rounded-full bg-white" />
          TRỰC TIẾP
        </div>
      )}

      {resumed > 0 && !error && (
        <div className="anim-fade-in absolute bottom-16 left-3 flex items-center gap-3 rounded-lg bg-black/85 px-3 py-2 text-xs">
          <span>Đã tiếp tục từ {formatDuration(resumed)}</span>
          <button
            onClick={() => {
              const v = videoRef.current;
              const a = audioRef.current;
              if (v) v.currentTime = 0;
              if (a?.src) a.currentTime = 0;
              setResumed(0);
            }}
            className="font-medium text-yt-blue hover:underline"
          >
            Xem từ đầu
          </button>
        </div>
      )}

      {degraded && !error && (
        <div className="anim-fade-in pointer-events-none absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs text-yt-sub">
          {degraded}
        </div>
      )}

      {error && (
        <div className="absolute inset-0 grid place-items-center overflow-y-auto bg-black/85 px-6 py-8 text-center">
          <div className="max-w-xl">
            <svg viewBox="0 0 24 24" className="mx-auto mb-3 h-10 w-10 text-yt-sub" fill="currentColor" aria-hidden>
              <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 18a8 8 0 110-16 8 8 0 010 16zm-1-5h2v2h-2v-2zm0-8h2v6h-2V7z" />
            </svg>

            <p className="text-base leading-relaxed">{error}</p>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm">
              <button
                onClick={() => window.location.reload()}
                className="rounded-full bg-yt-chip px-4 py-2 hover:bg-[#3f3f3f]"
              >
                Thử lại
              </button>
              <a
                href={`https://www.youtube.com/watch?v=${videoId}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-yt-chip px-4 py-2 hover:bg-[#3f3f3f]"
              >
                Mở trên YouTube
              </a>
              {errorDetail && (
                <button
                  onClick={() => setShowDetail((d) => !d)}
                  className="rounded-full px-4 py-2 text-yt-sub hover:text-yt-text"
                >
                  {showDetail ? 'Ẩn chi tiết' : 'Chi tiết kỹ thuật'}
                </button>
              )}
            </div>

            {showDetail && errorDetail && (
              <pre className="anim-fade-in mt-4 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-black/60 p-3 text-left text-[11px] leading-relaxed text-yt-sub">
                {errorDetail}
              </pre>
            )}

            <p className="mt-4 text-xs text-yt-sub">
              Chẩn đoán đầy đủ: <code className="rounded bg-yt-elev px-1">/api/debug/{videoId}</code>
            </p>
          </div>
        </div>
      )}

      {ended && !error && !compact && (
        <div className="anim-fade-in absolute inset-0 z-20 flex flex-col overflow-y-auto bg-black/90 p-4 sm:p-6">
          {/* hàng trên: xem lại + đếm ngược */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={replay}
              className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/20"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                <path d="M12 5V1L7 6l5 5V7a6 6 0 11-6 6H4a8 8 0 108-8z" />
              </svg>
              Xem lại
            </button>

            {related[0] && onPickVideo && (
              autoNext ? (
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-yt-sub">
                    Video kế tiếp sau <span className="tabular-nums text-yt-text">{countdown}</span>s
                  </span>
                  <button
                    onClick={() => setAutoNext(false)}
                    className="rounded-full bg-white/10 px-4 py-2 font-medium hover:bg-white/20"
                  >
                    Huỷ
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => onPickVideo(related[0].id)}
                  className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/20"
                >
                  Phát video kế tiếp
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                    <path d="M6 4l10 8-10 8V4zm12 0h2v16h-2V4z" />
                  </svg>
                </button>
              )
            )}
          </div>

          {/* lưới video liên quan */}
          {related.length > 0 ? (
            <div className="mt-4 flex-1">
              <p className="mb-3 text-sm font-medium text-yt-sub">Video liên quan</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {related.slice(0, 8).map((r, i) => (
                  <button
                    key={r.id}
                    onClick={() => onPickVideo?.(r.id)}
                    style={{ animationDelay: `${i * 40}ms` }}
                    className="anim-fade-up group/end text-left"
                  >
                    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-yt-elev">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={r.thumbnail}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover/end:scale-105"
                      />
                      {r.durationText && (
                        <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[10px]">
                          {r.durationText}
                        </span>
                      )}
                      {i === 0 && autoNext && onPickVideo && (
                        <span className="absolute left-1 top-1 rounded bg-yt-red px-1.5 py-0.5 text-[10px] font-medium">
                          Kế tiếp
                        </span>
                      )}
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs font-medium leading-4">{r.title}</p>
                    <p className="mt-0.5 truncate text-[11px] text-yt-sub">{r.author.name}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid flex-1 place-items-center text-sm text-yt-sub">
              Không có video liên quan
            </div>
          )}
        </div>
      )}

      {/* thanh điều khiển */}
      <div
        className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-6 transition-opacity duration-200 ${
          controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <div
          className="seek-wrap group/seek relative mb-1 flex h-3 cursor-pointer items-center"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            seek(((e.clientX - r.left) / r.width) * duration);
          }}
        >
          <div className="seek-bar relative h-[3px] w-full overflow-hidden rounded-full bg-white/25">
            {/* trực tiếp thì không có tổng thời lượng để vẽ tiến trình */}
            <div
              className="absolute inset-y-0 left-0 bg-white/40"
              style={{ width: isLive ? '100%' : `${bufPct}%` }}
            />
            <div
              className="absolute inset-y-0 left-0 bg-yt-red"
              style={{ width: isLive ? '100%' : `${pct}%` }}
            />
          </div>
          <div
            className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 scale-0 rounded-full bg-yt-red transition-transform duration-150 group-hover/seek:scale-100"
            style={{ left: `${pct}%` }}
          />
        </div>

        <div className="flex items-center gap-1 text-white">
          <Btn onClick={togglePlay} label={playing ? 'Tạm dừng' : 'Phát'}>
            {playing ? <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /> : <path d="M8 5v14l11-7z" />}
          </Btn>

          <div className="group/vol flex items-center">
            <Btn
              onClick={() => {
                const v = videoRef.current;
                if (v) v.muted = !v.muted;
              }}
              label="Âm lượng"
            >
              {muted || volume === 0 ? (
                <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0021 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 003.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
              ) : (
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
              )}
            </Btn>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              onChange={(e) => {
                const val = Number(e.target.value);
                const v = videoRef.current;
                if (!v) return;
                v.volume = val;
                v.muted = val === 0;
              }}
              aria-label="Âm lượng"
              className="h-1 w-0 cursor-pointer appearance-none rounded bg-white/40 accent-white opacity-0 transition-all group-hover/vol:w-16 group-hover/vol:opacity-100"
            />
          </div>

          {isLive ? (
            <span className="ml-2 flex items-center gap-1.5 text-xs font-medium">
              <span className="h-2 w-2 rounded-full bg-yt-red" />
              TRỰC TIẾP
            </span>
          ) : (
            <span className="ml-2 text-xs tabular-nums">
              {formatDuration(time)} / {formatDuration(duration)}
            </span>
          )}

          <div className="flex-1" />

          {captions.length > 0 && (
            <button
              onClick={() => setCcOn((c) => !c)}
              className={`rounded px-2 py-1 text-xs font-semibold ${
                ccOn ? 'border-b-2 border-white' : 'opacity-80'
              }`}
            >
              CC
            </button>
          )}

          <div className="relative">
            <Btn onClick={() => setMenu(menu ? null : 'settings')} label="Cài đặt">
              <path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z" />
            </Btn>

            {menu && (
              <div className="anim-pop absolute bottom-12 right-0 min-w-[220px] origin-bottom-right overflow-hidden rounded-xl bg-[#282828]/95 py-2 text-sm shadow-2xl backdrop-blur">
                {menu === 'settings' && (
                  <>
                    <MenuRow
                      label="Tốc độ phát"
                      value={speed === 1 ? 'Chuẩn' : `${speed}x`}
                      onClick={() => setMenu('speed')}
                    />
                    <MenuRow
                      label="Chất lượng"
                      value={
                        auto && mode === 'dash'
                          ? 'Tự động'
                          : tracks.find((t) => t.active)?.label ?? '—'
                      }
                      onClick={() => setMenu('quality')}
                    />
                  </>
                )}

                {menu === 'speed' &&
                  [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        const v = videoRef.current;
                        if (v) v.playbackRate = s;
                        setMenu(null);
                      }}
                      className={`block w-full px-4 py-2 text-left hover:bg-white/10 ${
                        speed === s ? 'font-semibold' : ''
                      }`}
                    >
                      {s === 1 ? 'Chuẩn' : s}
                    </button>
                  ))}

                {menu === 'quality' && (
                  <>
                    {mode === 'dash' && (
                      <button
                        onClick={() => {
                          playerRef.current?.configure({ abr: { enabled: true } });
                          setAuto(true);
                          setMenu(null);
                        }}
                        className={`block w-full px-4 py-2 text-left hover:bg-white/10 ${
                          auto ? 'font-semibold' : ''
                        }`}
                      >
                        Tự động
                      </button>
                    )}
                    {tracks.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => pickQuality(t)}
                        className={`block w-full px-4 py-2 text-left hover:bg-white/10 ${
                          t.active && !(auto && mode === 'dash') ? 'font-semibold' : ''
                        }`}
                      >
                        {t.label}
                        {t.height >= 1080 && (
                          <span className="ml-1 align-super text-[9px] text-yt-sub">HD</span>
                        )}
                      </button>
                    ))}
                    {!tracks.length && (
                      <p className="px-4 py-2 text-yt-sub">Nguồn này chỉ có một chất lượng</p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {!compact && (
          <Btn onClick={onToggleTheater} label="Chế độ rạp hát">
            {theater ? (
              <path d="M19 7H5v10h14V7zm2-2v14H3V5h18zM4 8v8h16V8H4z" />
            ) : (
              <path d="M21 6H3v12h18V6zM4 7h16v10H4V7z" />
            )}
          </Btn>
          )}

          {/*
            Một nút duy nhất cho cửa sổ nổi. Trước đây có hai nút — "thu nhỏ" tự vẽ và
            "cửa sổ nổi" của trình duyệt — làm cùng một việc nhưng giành nhau thẻ video.
            Giờ chỉ còn một đường: `onMinimize` mở cửa sổ nổi có đủ nút điều khiển,
            và tự lùi về cửa sổ nổi thường của trình duyệt nếu máy không hỗ trợ.
          */}
          {!compact && onMinimize && (
            <Btn onClick={onMinimize} label="Cửa sổ nổi (I)">
              <path d="M19 11h-8v6h8v-6zm4 8V4.98C23 3.88 22.1 3 21 3H3c-1.1 0-2 .88-2 1.98V19c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 .02H3V4.97h18v14.05z" />
            </Btn>
          )}

          <Btn onClick={toggleFs} label="Toàn màn hình">
            {fs ? (
              <path d="M14 14h5v1h-4v4h-1v-5zm-9 0h5v5H9v-4H5v-1zM9 5h1v5H5V9h4V5zm10 4v1h-5V5h1v4h4z" />
            ) : (
              <path d="M10 4v1H5v5H4V4h6zm10 0v6h-1V5h-5V4h6zM4 14h1v5h5v1H4v-6zm15 0h1v6h-6v-1h5v-5z" />
            )}
          </Btn>
        </div>
      </div>
    </div>
  );
}

function Btn({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="rounded p-2 hover:bg-white/10">
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
        {children}
      </svg>
    </button>
  );
}

function MenuRow({
  label,
  value,
  onClick,
}: {
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between gap-8 px-4 py-2 hover:bg-white/10"
    >
      <span>{label}</span>
      <span className="text-yt-sub">{value} ›</span>
    </button>
  );
}
