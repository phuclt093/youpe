'use client';

import { useEffect, useState } from 'react';

export default function BackToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const h = () => setShow(window.scrollY > 900);
    h();
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);

  if (!show) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Về đầu trang"
      title="Về đầu trang"
      className="anim-fade-in fixed bottom-6 right-6 z-40 grid h-11 w-11 place-items-center rounded-full bg-yt-elev/90 shadow-xl backdrop-blur hover:bg-yt-hover"
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
        <path d="M12 8l6 6-1.4 1.4L12 10.8l-4.6 4.6L6 14z" />
      </svg>
    </button>
  );
}
