'use client';

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import Player, { type EndCardItem, type PlayerApi } from './Player';
import { getPrefs } from '@/lib/prefs';

/**
 * Trình phát dùng chung cho cả app.
 *
 * Vấn đề cần giải: muốn xem tiếp trong cửa sổ nổi khi rời trang xem, thì thẻ `<video>`
 * **không được unmount**. Nếu để trình phát nằm trong cây của trang xem, chuyển trang
 * là React gỡ nó đi và video nạp lại từ đầu.
 *
 * Cách làm: tạo một thẻ div nằm ngoài React ngay trong `document.body`, rồi dùng
 * `createPortal` để render trình phát vào đó. Vì mục tiêu portal không đổi, React
 * không bao giờ unmount. Khi cần đổi chỗ, ta **di chuyển chính thẻ div đó** bằng
 * `appendChild` — trình duyệt coi đây là thao tác chuyển chỗ chứ không phải xoá rồi
 * tạo lại, nên video chạy liên tục.
 *
 * Chính vì vậy mà chuyển sang cửa sổ nổi rất gọn: `appendChild` sang `document.body`
 * của cửa sổ nổi là xong, video không hề gián đoạn.
 */

export type PlayingVideo = {
  videoId: string;
  title: string;
  channelName: string;
  poster?: string;
  captions?: { label: string; lang: string; url: string }[];
  related: EndCardItem[];
};

/**
 * `full`  — trình phát nằm trong khung của trang xem
 * `mini`  — thu nhỏ vào góc dưới phải **ngay trong app**, giống YouTube khi rời trang xem
 * `pip`   — cửa sổ nổi riêng của hệ điều hành, chỉ mở khi người dùng tự bấm nút
 */
type Mode = 'full' | 'mini' | 'pip';

type Ctx = {
  current: PlayingVideo | null;
  mode: Mode;
  /** Trình duyệt có hỗ trợ cửa sổ nổi kèm điều khiển riêng không */
  canPip: boolean;
  play: (v: PlayingVideo) => void;
  /** Mở cửa sổ nổi của hệ điều hành — chỉ gọi khi người dùng tự bấm */
  openPip: () => void;
  /** Đóng cửa sổ nổi, đưa trình phát về trang (hoặc về khung mini) */
  closePip: () => void;
  /** Tắt hẳn: dừng video, nhả cửa sổ nổi, gỡ trình phát */
  close: () => void;
  registerSlot: (el: HTMLDivElement | null) => void;
  /** Tua trình phát tới giây thứ t — dùng cho mốc thời gian trong mô tả */
  seek: (t: number) => void;
  /** Điều khiển đầy đủ, để vỏ desktop dùng cho taskbar và phím media */
  api: () => PlayerApi | null;
};

const PlayerCtx = createContext<Ctx>({
  current: null,
  mode: 'full',
  canPip: false,
  play: () => {},
  openPip: () => {},
  closePip: () => {},
  close: () => {},
  registerSlot: () => {},
  seek: () => {},
  api: () => null,
});

export const usePlayer = () => useContext(PlayerCtx);

/* ------------------------------------------------------------------ */

const PIP_SIZE_KEY = 'youpe.pipSize';

type PipApi = {
  requestWindow: (o: { width: number; height: number }) => Promise<Window>;
  window: Window | null;
};

/**
 * Electron **chưa cài đặt** Document PiP (electron#39633). Đối tượng
 * `documentPictureInPicture` vẫn có mặt nên feature-detect thông thường bị lừa,
 * nhưng gọi `requestWindow()` thì ném `Internal error: no window`.
 * Vì vậy phải nhận ra vỏ desktop và đi thẳng đường khác.
 */
function isDesktopShell(): boolean {
  return !!(globalThis as any).youpeDesktop?.isDesktop;
}

function pipApi(): PipApi | null {
  if (isDesktopShell()) return null;
  // Document PiP đòi ngữ cảnh bảo mật; mở app qua địa chỉ LAN thì không có
  return (globalThis as any).documentPictureInPicture ?? null;
}

/**
 * Chép toàn bộ CSS của trang sang cửa sổ nổi.
 *
 * Cửa sổ nổi là một document trắng hoàn toàn — không kế thừa gì từ trang gốc.
 * Không chép thì trình phát sang đó sẽ mất sạch định dạng.
 *
 * Phải làm hai đường vì `cssRules` chỉ đọc được với stylesheet cùng nguồn; với
 * stylesheet từ nơi khác (CDN font chẳng hạn) thì trình duyệt chặn, đành chép lại
 * thẻ `<link>` để cửa sổ nổi tự tải.
 */
function copyStyles(target: Window) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const css = Array.from(sheet.cssRules).map((r) => r.cssText).join('\n');
      const el = target.document.createElement('style');
      el.textContent = css;
      target.document.head.appendChild(el);
    } catch {
      const owner = sheet.ownerNode as HTMLLinkElement | null;
      if (owner?.href) {
        const link = target.document.createElement('link');
        link.rel = 'stylesheet';
        link.href = owner.href;
        target.document.head.appendChild(link);
      }
    }
  }

  /*
    Bảng màu nằm ở dạng biến CSS gán trực tiếp lên thẻ `html` của trang chính, mà
    cửa sổ nổi có `html` riêng — chép stylesheet thôi thì mọi `rgb(var(--yt-…))`
    trong đó rỗng tuếch, trình phát sang bên kia thành đen trắng lộn xộn.
    Nên bê nguyên thuộc tính style và mấy cờ data- sang.
  */
  const root = document.documentElement;
  const there = target.document.documentElement;
  there.setAttribute('style', root.getAttribute('style') ?? '');
  if (root.dataset.theme) there.dataset.theme = root.dataset.theme;
  if (root.dataset.serif) there.dataset.serif = root.dataset.serif;
  there.className = root.className; // giữ cả cờ tắt hiệu ứng (.no-anim)

  // bỏ lề mặc định, để trình phát lấp đầy cửa sổ
  const base = target.document.createElement('style');
  base.textContent =
    'html,body{margin:0;padding:0;background:rgb(var(--yt-bg));color:rgb(var(--yt-text));' +
    'overflow:hidden;height:100%}*{box-sizing:border-box}';
  target.document.head.appendChild(base);
}

export default function PlayerHost({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [current, setCurrent] = useState<PlayingVideo | null>(null);
  const [mode, setMode] = useState<Mode>('full');
  const [theater, setTheater] = useState(false);
  const [canPip, setCanPip] = useState(false);

  const slotRef = useRef<HTMLDivElement | null>(null);
  /** Khung cố định góc dưới phải, nơi trình phát đậu khi thu nhỏ */
  const dockRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<PlayerApi | null>(null);
  const pipWinRef = useRef<Window | null>(null);
  /** Người dùng tự bấm mở cửa sổ nổi thì giữ nguyên ý muốn đó khi quay lại trang xem */
  const userChose = useRef(false);
  /**
   * Chính app đang đóng cửa sổ nổi, đừng nhầm thành người dùng bấm "Back to tab".
   * Không có cờ này thì vào trang Shorts (nơi trình phát bị dừng) sẽ bị đá ngược
   * về trang xem ngay lập tức.
   */
  const closingSelf = useRef(false);

  /* ---------- tạo thẻ chứa, một lần duy nhất ---------- */
  useEffect(() => {
    const el = document.createElement('div');
    el.id = 'youpe-player-host';
    el.className = 'w-full';
    document.body.appendChild(el);

    /*
      Khung mini cũng nằm ngoài React, cùng lý do với thẻ chứa: nó phải sống suốt vòng
      đời app để `appendChild` qua lại mà không lần nào dựng lại thẻ `<video>`.
    */
    const dock = document.createElement('div');
    dock.id = 'youpe-mini-dock';
    /*
      Viết thẳng bằng style chứ không dùng class tiện ích: thẻ này sinh ra bằng JS nên
      Tailwind không quét thấy nếu chuỗi bị nối lại, mà mất một class thôi là khung
      rơi xuống cuối trang. Màu vẫn trỏ vào biến chủ đề để đổi giao diện là ăn theo.
    */
    dock.style.cssText = [
      'position:fixed',
      'right:16px',
      'bottom:16px',
      'z-index:50',
      'width:min(26rem, calc(100vw - 32px))',
      'overflow:hidden',
      'border-radius:12px',
      'background:rgb(var(--yt-elev))',
      'border:1px solid rgb(var(--yt-border))',
      'box-shadow:0 12px 32px rgb(0 0 0 / 0.45)',
      'display:none',
    ].join(';');
    document.body.appendChild(dock);
    dockRef.current = dock;

    setHost(el);
    setCanPip(!!pipApi());

    return () => {
      el.remove();
      dock.remove();
      dockRef.current = null;
    };
  }, []);

  /* ---------- đưa thẻ chứa về đúng chỗ ---------- */
  const place = useCallback(() => {
    if (!host) return;

    const dock = dockRef.current;
    if (dock) dock.style.display = 'none';

    const pip = pipWinRef.current;
    if (mode === 'pip' && pip && !pip.closed) {
      if (host.ownerDocument !== pip.document) pip.document.body.appendChild(host);
      host.style.display = '';
      return;
    }

    /*
      Thu nhỏ trong app: đây mới là thứ YouTube làm khi rời trang xem. Cửa sổ nổi của
      hệ điều hành để dành cho lúc người dùng tự bấm nút.
    */
    if (mode === 'mini' && dock && current) {
      if (host.parentElement !== dock) dock.appendChild(host);
      host.style.display = '';
      dock.style.display = '';
      return;
    }

    if (slotRef.current) {
      if (host.parentElement !== slotRef.current) slotRef.current.appendChild(host);
      host.style.display = '';
      return;
    }

    /*
      Không có chỗ nào trên trang để đặt (đã rời trang xem, mà cửa sổ nổi cũng không
      mở được). Vẫn phải giữ thẻ chứa sống để video không bị nạp lại, nhưng giấu đi —
      không giấu thì trình phát nằm chình ình dưới đáy mọi trang.
    */
    if (host.parentElement !== document.body) document.body.appendChild(host);
    host.style.display = 'none';
  }, [host, mode, current]);

  useEffect(place, [place, current]);

  /*
    `registerSlot` được PlayerSlot gọi lúc gắn và lúc gỡ, nhưng nó chỉ đọc hàm này
    **một lần** (effect với mảng phụ thuộc rỗng, cố ý — chạy lại sẽ làm thẻ chứa nhảy
    lung tung). Vì vậy hàm đó phải đứng yên và tự đọc trạng thái mới nhất qua ref.

    Không có mấy cái ref này thì lúc rời trang xem, `registerSlot` vẫn là bản chụp từ
    lần render đầu — khi ấy `current` còn null vì dữ liệu video chưa về — nên nhánh
    "thu nhỏ vào góc" không bao giờ chạy: trình phát bị giấu đi thay vì đậu lại ở góc
    dưới phải. Đúng lỗi "ra trang chủ là mất khung xem nhỏ".
  */
  const currentRef = useRef(current);
  const modeRef = useRef(mode);
  const placeRef = useRef(place);
  currentRef.current = current;
  modeRef.current = mode;
  placeRef.current = place;

  /* ---------- tắt hẳn ---------- */

  /**
   * Bấm X là tắt, không phải giấu đi.
   *
   * Chỗ này trước đây chỉ `setCurrent(null)`. Mà nếu video đang nằm trong cửa sổ nổi
   * của trình duyệt thì Chromium vẫn giữ chặt thẻ `<video>` kể cả sau khi React gỡ nó
   * khỏi cây DOM: cửa sổ nổi ở lại, tiếng vẫn chạy, và không còn đường nào tắt vì
   * `document.pictureInPictureElement` trỏ tới một thẻ không ai tham chiếu nữa.
   *
   * Nên phải theo đúng thứ tự: giữ tham chiếu thẻ → câm tiếng và dừng ngay (đồng bộ,
   * để không nghe thấy khoảng hở) → nhả cửa sổ nổi → cắt nguồn cho trình duyệt thu
   * hồi bộ giải mã → cuối cùng mới gỡ trình phát.
   */
  const hostRef = useRef(host);
  hostRef.current = host;

  const stopEverything = useCallback(() => {
    closingSelf.current = true;
    setTimeout(() => (closingSelf.current = false), 500);

    const pipVideo = (document.pictureInPictureElement as HTMLVideoElement | null) ?? null;
    const h = hostRef.current;
    const inPage = (h?.querySelector('video') as HTMLVideoElement | null) ?? null;

    for (const v of new Set([pipVideo, inPage].filter(Boolean) as HTMLVideoElement[])) {
      v.muted = true;
      v.pause();
    }
    // luồng tiếng đi riêng ở chế độ 2 luồng, dừng thiếu là còn nghe tiếng
    const a = h?.querySelector('audio') as HTMLAudioElement | null;
    if (a) {
      a.muted = true;
      a.pause();
    }

    if (pipVideo) {
      document
        .exitPictureInPicture()
        .catch(() => {})
        .finally(() => {
          pipVideo.removeAttribute('src');
          try {
            pipVideo.load();
          } catch {
            /* thẻ đã bị gỡ, không sao */
          }
        });
    }

    try {
      pipWinRef.current?.close();
    } catch {
      /* cửa sổ đã đóng sẵn */
    }
    pipWinRef.current = null;
    userChose.current = false;

    setCurrent(null);
    setMode('full');
  }, []);

  /**
   * Cửa sổ nổi đóng thì trình phát về đâu: khung trên trang xem nếu còn đang ở đó,
   * không thì đậu vào khung mini, còn người dùng đã tắt mini thì dừng hẳn.
   */
  const settleAfterPip = useCallback(() => {
    if (slotRef.current) {
      setMode('full');
      return;
    }
    if (getPrefs().miniOnLeave) {
      setMode('mini');
      return;
    }
    stopEverything();
  }, [stopEverything]);

  /* ---------- đổi video khi đang ở cửa sổ nổi thường ---------- */

  const prevId = useRef<string | null>(null);

  /**
   * Trình phát được gắn `key={videoId}`, nên đổi video là React dựng lại toàn bộ,
   * kể cả thẻ `<video>`. Thẻ cũ bị gỡ khỏi cây DOM, **nhưng cửa sổ nổi của trình duyệt
   * vẫn giữ chặt nó** — Chromium cho phép cửa sổ nổi bám vào một thẻ đã rời DOM. Kết quả
   * là video cũ tiếp tục chạy trong cửa sổ nổi trong khi trang đã sang video khác: hai
   * video phát cùng lúc, đúng như những gì nhìn thấy.
   *
   * Nên phải chủ động nhả cửa sổ nổi rồi mở lại trên thẻ mới.
   */
  useEffect(() => {
    const id = current?.videoId ?? null;
    if (id === prevId.current) return;

    const isFirst = prevId.current === null;
    prevId.current = id;

    if (isFirst || !id || !host) return;
    if (!document.pictureInPictureElement) return;

    // Giữ tham chiếu thẻ cũ TRƯỚC khi nhả cửa sổ nổi — sau khi nhả xong
    // `document.pictureInPictureElement` thành null, không còn đường nào tắt nó nữa.
    const oldVideo = document.pictureInPictureElement as HTMLVideoElement | null;

    closingSelf.current = true;
    setTimeout(() => (closingSelf.current = false), 500);

    // Câm tiếng và dừng ngay, đồng bộ — không chờ `exitPictureInPicture()` (async),
    // nếu chờ sẽ có khoảng hở nghe thấy hai video cùng lúc.
    if (oldVideo) {
      oldVideo.muted = true;
      oldVideo.pause();
    }

    document
      .exitPictureInPicture()
      .catch(() => {})
      .finally(() => {
        // Thẻ đã rời DOM thì cắt hẳn nguồn, để trình duyệt thu hồi bộ giải mã.
        // Không cắt thì nó vẫn ngốn CPU và có thể tự phát lại.
        if (oldVideo && !host.contains(oldVideo)) {
          oldVideo.removeAttribute('src');
          oldVideo.load();
        }
      });

    // Người dùng có thể tắt tuỳ chọn này: video mới thì cứ phát trên trang bình
    // thường, không tự nhảy lại vào cửa sổ nổi.
    if (!getPrefs().keepPipOnVideoChange) return;

    // Chờ thẻ video mới có dữ liệu rồi mới đưa vào cửa sổ nổi. Bỏ cuộc sau 5 giây:
    // quá mốc đó thì quyền thao tác của người dùng đã hết hiệu lực, có gọi cũng bị từ chối.
    let tries = 0;
    const t = setInterval(() => {
      const v = host.querySelector('video') as HTMLVideoElement | null;

      if (v && v.readyState >= 1) {
        clearInterval(t);
        v.requestPictureInPicture().catch(() => {
          /* hết quyền thao tác — video vẫn xem được trên trang, không sao */
        });
      } else if (++tries > 20) {
        clearInterval(t);
      }
    }, 250);

    return () => clearInterval(t);
  }, [current?.videoId, host]);

  /* ---------- mở cửa sổ nổi ---------- */
  const openPip = useCallback(async (toggle = false) => {
    if (!host || !current) return;

    const api = pipApi();

    // Không có Document PiP (app desktop, Firefox, Safari, hoặc mở qua địa chỉ LAN)
    // thì dùng cửa sổ nổi gắn thẳng vào thẻ video: ít nút hơn nhưng chắc chắn chạy.
    if (!api) {
      const v = host.querySelector('video') as HTMLVideoElement | null;
      if (!v) return;
      try {
        if (document.pictureInPictureElement) {
          // Rời trang xem mà video đã ở cửa sổ nổi rồi thì để yên. Chỉ khi người dùng
          // chủ động bấm nút mới hiểu là muốn tắt.
          if (toggle) await document.exitPictureInPicture();
        } else {
          await v.requestPictureInPicture();
        }
      } catch {
        /* máy không hỗ trợ hoặc người dùng từ chối */
      }
      return;
    }

    if (pipWinRef.current && !pipWinRef.current.closed) {
      pipWinRef.current.focus();
      return;
    }

    let size = { width: 480, height: 320 };
    try {
      const saved = localStorage.getItem(PIP_SIZE_KEY);
      if (saved) size = JSON.parse(saved);
    } catch {
      /* dữ liệu hỏng thì dùng mặc định */
    }

    try {
      const win = await api.requestWindow(size);
      pipWinRef.current = win;
      copyStyles(win);
      win.document.body.appendChild(host);
      setMode('pip');
      userChose.current = true;

      // nhớ kích thước người dùng đã kéo
      const remember = () => {
        try {
          localStorage.setItem(
            PIP_SIZE_KEY,
            JSON.stringify({ width: win.innerWidth, height: win.innerHeight })
          );
        } catch {
          /* bộ nhớ đầy thì thôi */
        }
      };
      win.addEventListener('resize', remember);

      win.addEventListener('pagehide', () => {
        remember();
        pipWinRef.current = null;
        userChose.current = false;
        // app tự đóng (bấm X, hoặc "đưa về đây") thì nơi gọi đã lo phần mode rồi
        if (closingSelf.current) return;
        settleAfterPip();
      });
    } catch {
      /*
        Hỏng thì phải dọn cho sạch. Trước đây chỗ này chỉ đặt lại `mode`, mà mode vốn
        đã là 'full' nên React không render lại, `place()` không chạy, và thẻ chứa nằm
        lại chỗ dở dang — video biến mất khỏi trang.
      */
      try {
        pipWinRef.current?.close();
      } catch {
        /* cửa sổ đã đóng sẵn */
      }
      pipWinRef.current = null;
      userChose.current = false;
      setMode('full');

      if (slotRef.current) slotRef.current.appendChild(host);
      else {
        document.body.appendChild(host);
        host.style.display = 'none';
      }
    }
  }, [host, current, settleAfterPip]);

  const closePip = useCallback(() => {
    closingSelf.current = true;
    setTimeout(() => (closingSelf.current = false), 500);

    try {
      pipWinRef.current?.close();
    } catch {
      /* cửa sổ đã đóng sẵn */
    }
    pipWinRef.current = null;
    userChose.current = false;

    // cửa sổ nổi kiểu gắn thẳng vào thẻ video cũng phải nhả, nếu không video biến mất
    // khỏi trang mà vẫn chạy ở góc màn hình
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {});
    }

    settleAfterPip();
  }, [settleAfterPip]);

  /* ---------- nút điều khiển trong cửa sổ nổi của hệ điều hành ---------- */

  /**
   * Cửa sổ nổi thường của trình duyệt **không tự có nút gì ngoài phát/dừng**. Muốn có
   * nút tua và chuyển video thì phải khai báo qua Media Session — Chromium chỉ vẽ nút
   * nào mà trang đã đăng ký xử lý.
   *
   * Cùng lúc đó, khai báo tên video và ảnh bìa để thanh thông báo của hệ điều hành,
   * màn hình khoá và tai nghe bluetooth đều hiện đúng thông tin.
   */
  useEffect(() => {
    const ms = navigator.mediaSession;
    if (!ms || !current) return;

    ms.metadata = new MediaMetadata({
      title: current.title,
      artist: current.channelName,
      artwork: current.poster ? [{ src: current.poster, sizes: '480x360' }] : [],
    });

    const nextId = current.related[0]?.id;

    const handlers: [MediaSessionAction, (() => void) | null][] = [
      ['play', () => apiRef.current?.togglePlay()],
      ['pause', () => apiRef.current?.togglePlay()],
      ['seekbackward', () => apiRef.current?.seekBy(-10)],
      ['seekforward', () => apiRef.current?.seekBy(10)],
      // Không có "video trước" theo nghĩa danh sách phát, nên nút lùi dùng để tua.
      // Có nút mà bấm không ra gì thì tệ hơn là không có nút.
      ['previoustrack', () => apiRef.current?.seekBy(-10)],
      ['nexttrack', nextId ? () => router.push(`/watch?v=${nextId}`) : null],
    ];

    for (const [action, fn] of handlers) {
      try {
        ms.setActionHandler(action, fn);
      } catch {
        /* trình duyệt không biết hành động này */
      }
    }

    return () => {
      for (const [action] of handlers) {
        try {
          ms.setActionHandler(action, null);
        } catch {
          /* bỏ qua */
        }
      }
    };
  }, [current, router]);

  /* ---------- thoát cửa sổ nổi thì trình phát đậu lại trong app ---------- */

  /**
   * Trước đây chỗ này tự `router.push('/watch')`. Nhưng thoát cửa sổ nổi không có
   * nghĩa là muốn rời trang đang đọc dở — bị đá ngược về trang xem là hành vi không ai
   * mong. Giờ video chỉ rơi về khung mini ở góc, đúng như YouTube; muốn về trang xem
   * thì bấm nút phóng to trên thanh tiêu đề của khung đó.
   */
  useEffect(() => {
    const onLeave = () => {
      if (closingSelf.current) return;
      if (!current) return;
      settleAfterPip();
      requestAnimationFrame(place);
    };

    document.addEventListener('leavepictureinpicture', onLeave, true);
    return () => document.removeEventListener('leavepictureinpicture', onLeave, true);
  }, [current, settleAfterPip, place]);

  /* ---------- Esc trong cửa sổ nổi thì đóng ---------- */
  useEffect(() => {
    const win = pipWinRef.current;
    if (mode !== 'pip' || !win) return;

    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePip();
    };
    win.addEventListener('keydown', h);
    return () => win.removeEventListener('keydown', h);
  }, [mode, closePip]);

  /* ---------- đóng app thì đóng luôn cửa sổ nổi ---------- */
  useEffect(() => {
    const h = () => pipWinRef.current?.close();
    window.addEventListener('pagehide', h);
    return () => window.removeEventListener('pagehide', h);
  }, []);

  const registerSlot = useCallback(
    (el: HTMLDivElement | null) => {
      slotRef.current = el;
      const cur = currentRef.current;
      const m = modeRef.current;

      if (!el && cur && m !== 'pip') {
        /*
          Rời trang xem: thu nhỏ vào góc app. Cửa sổ nổi của hệ điều hành **không** tự
          bật ở đây nữa — nó là thứ người dùng chủ động bấm, không phải thứ nhảy ra
          mỗi lần bấm nút Back.
        */
        if (getPrefs().miniOnLeave) setMode('mini');
        else stopEverything();
      } else if (el && m !== 'pip') {
        setMode('full');
      }

      // hoãn một nhịp để chờ DOM của trang mới dựng xong
      requestAnimationFrame(() => placeRef.current());
    },
    [stopEverything]
  );

  const play = useCallback((v: PlayingVideo) => {
    setCurrent((prev) => (prev?.videoId === v.videoId ? { ...prev, ...v } : v));
  }, []);

  const close = stopEverything;

  const seek = useCallback((t: number) => apiRef.current?.seek(t), []);
  const api = useCallback(() => apiRef.current, []);

  const value = useMemo<Ctx>(
    () => ({ current, mode, canPip, play, openPip, closePip, close, registerSlot, seek, api }),
    [current, mode, canPip, play, openPip, closePip, close, registerSlot, seek, api]
  );

  return (
    <PlayerCtx.Provider value={value}>
      {children}

      {host &&
        current &&
        createPortal(
          <div className="relative">
            {mode !== 'full' && (
              <PipBar
                title={current.title}
                channel={current.channelName}
                onExpand={() => {
                  if (mode === 'pip') closePip();
                  router.push(`/watch?v=${current.videoId}`);
                  window.focus();
                }}
                onClose={close}
              />
            )}

            <Player
              key={current.videoId}
              src={`/api/manifest/${current.videoId}`}
              videoId={current.videoId}
              poster={current.poster}
              captions={current.captions ?? []}
              theater={mode === 'full' && theater}
              onToggleTheater={() => mode === 'full' && setTheater((t) => !t)}
              related={current.related}
              onPickVideo={(next) => router.push(`/watch?v=${next}`)}
              compact={mode !== 'full'}
              onMinimize={mode === 'full' ? () => openPip(true) : undefined}
              registerApi={(api) => {
                apiRef.current = api;
              }}
            />
          </div>,
          host
        )}
    </PlayerCtx.Provider>
  );
}

/**
 * Thanh tiêu đề của trình phát thu nhỏ — dùng chung cho khung mini trong app và cho
 * cửa sổ nổi của hệ điều hành.
 *
 * Cả hai đều không có thanh tiêu đề sẵn, nên nếu không tự vẽ thì chẳng biết mình đang
 * xem video nào và cũng không có lối quay về trang xem hay tắt hẳn.
 */
function PipBar({
  title,
  channel,
  onExpand,
  onClose,
}: {
  title: string;
  channel: string;
  onExpand: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center gap-2 bg-yt-elev px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{title}</p>
        <p className="truncate text-[11px] text-yt-sub">{channel}</p>
      </div>

      <button
        onClick={onExpand}
        title="Mở trang xem"
        aria-label="Mở trang xem"
        className="rounded-full p-1.5 hover:bg-yt-hover"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
          <path d="M4 4h7v2H6v5H4V4zm16 0v7h-2V6h-5V4h7zM4 20v-7h2v5h5v2H4zm16 0h-7v-2h5v-5h2v7z" />
        </svg>
      </button>

      <button
        onClick={onClose}
        title="Tắt video"
        aria-label="Tắt video"
        className="rounded-full p-1.5 hover:bg-yt-red"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
          <path d="M13.06 12l6.47-6.47-1.06-1.06L12 10.94 5.53 4.47 4.47 5.53 10.94 12l-6.47 6.47 1.06 1.06L12 13.06l6.47 6.47 1.06-1.06L13.06 12z" />
        </svg>
      </button>
    </div>
  );
}

/**
 * Chỗ đặt trình phát trên trang xem.
 *
 * Bình thường là khung rỗng để trình phát chuyển vào. Khi video đang ở cửa sổ nổi
 * thì hiện lời nhắc kèm nút đưa về.
 */
export function PlayerSlot({ className = '' }: { className?: string }) {
  const { registerSlot, mode, closePip } = usePlayer();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    registerSlot(ref.current);
    return () => registerSlot(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div ref={ref} className={`w-full ${className}`} />

      {mode === 'pip' && (
        <div className="grid aspect-video w-full place-items-center rounded-xl bg-yt-elev text-center">
          <div>
            <p className="text-sm text-yt-sub">Đang phát ở cửa sổ nổi</p>
            <button
              onClick={closePip}
              className="mt-3 rounded-full bg-yt-text px-4 py-2 text-sm font-medium text-yt-bg hover:bg-yt-text/90"
            >
              Đưa về đây
            </button>
          </div>
        </div>
      )}
    </>
  );
}
