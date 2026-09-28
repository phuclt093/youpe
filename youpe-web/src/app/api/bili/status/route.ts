import { NextResponse } from 'next/server';
import { existsSync } from 'node:fs';
import { isYtdlpAvailable } from '@/lib/ytdlp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Tình trạng cấu hình để xem Bilibili.tv.
 *
 * Chỉ soi cấu hình phía máy chủ, **không** gọi ra bilibili.tv: gọi thử cần một
 * đường dẫn video cụ thể, mà việc đó để chính lúc người dùng mở video làm — báo
 * lỗi ở đó mới đúng chỗ và không tốn một lượt trích xuất mỗi lần mở tab.
 */
export async function GET() {
  const fromBrowser =
    process.env.BILI_COOKIES_FROM_BROWSER?.trim() ||
    process.env.YTDLP_COOKIES_FROM_BROWSER?.trim() ||
    '';
  const file = process.env.BILI_COOKIES_FILE?.trim() || '';

  return NextResponse.json({
    ytdlp: await isYtdlpAvailable(),
    // nguồn cookie đang dùng: 'browser' | 'file' | '' (chưa cấu hình)
    cookieSource: file ? 'file' : fromBrowser ? 'browser' : '',
    browser: fromBrowser || null,
    // chỉ báo có tồn tại hay không, không trả nội dung lẫn đường dẫn đầy đủ
    fileExists: file ? existsSync(file) : null,
    // biến riêng cho Bilibili, hay đang dùng chung với YouTube
    dedicated: !!(process.env.BILI_COOKIES_FROM_BROWSER?.trim() || file),
  });
}
