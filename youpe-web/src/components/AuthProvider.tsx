'use client';

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import * as store from '@/lib/storage';
import { apiFetch, onApiBaseChange } from '@/lib/api';

export type User = { id: number; email: string; name: string };

type Ctx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthCtx = createContext<Ctx>({
  user: null,
  loading: true,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
});

export const useAuth = () => useContext(AuthCtx);

async function post(url: string, body?: any) {
  const r = await apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? 'Có lỗi xảy ra');
  return j;
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const apply = useCallback(async (u: User | null, firstLogin = false) => {
    setUser(u);
    store.setSignedIn(!!u);
    if (u) {
      if (firstLogin) await store.pushAllToServer();
      await Promise.all(
        (['history', 'later', 'liked', 'playlists'] as const).map((k) => store.pullFromServer(k))
      );
    }
  }, []);

  /**
   * Hỏi lại "tôi là ai" mỗi khi đổi máy chủ đồng bộ.
   *
   * Không có phần lắng nghe đó thì sau khi đổi địa chỉ trong Cài đặt, giao diện
   * vẫn hiện tài khoản của server cũ cho tới lần tải lại trang — trông như đang
   * đăng nhập nhưng mọi thao tác lại đi tới server mới.
   */
  useEffect(() => {
    let dead = false;

    const refresh = () => {
      setLoading(true);
      apiFetch('/api/auth/me')
        .then((r) => r.json())
        .then((j) => {
          if (!dead) return apply(j.user ?? null);
        })
        .catch(() => {
          if (!dead) return apply(null);
        })
        .finally(() => {
          if (!dead) setLoading(false);
        });
    };

    refresh();
    const off = onApiBaseChange(refresh);
    return () => {
      dead = true;
      off();
    };
  }, [apply]);

  const value = useMemo<Ctx>(
    () => ({
      user,
      loading,
      login: async (email, password) => {
        const j = await post('/api/auth/login', { email, password });
        await apply(j.user, true);
      },
      register: async (name, email, password) => {
        const j = await post('/api/auth/register', { name, email, password });
        await apply(j.user, true);
      },
      logout: async () => {
        await post('/api/auth/logout');
        setUser(null);
        store.setSignedIn(false);
      },
    }),
    [user, loading, apply]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
