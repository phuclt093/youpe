import type { PipedFormat, PipedResult } from './piped';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** giây -> ISO-8601 duration (PT1H2M3.456S) */
function iso(seconds: number): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = (s % 60).toFixed(3).replace(/\.?0+$/, '');
  return `PT${h ? h + 'H' : ''}${m ? m + 'M' : ''}${sec || 0}S`;
}

/** DASH SegmentBase cần cả init range lẫn index range mới phát được */
function usable(f: PipedFormat): boolean {
  return (
    f.kind !== 'muxed' &&
    !!f.url &&
    f.initStart != null && f.initEnd != null &&
    f.indexStart != null && f.indexEnd != null &&
    !!f.mimeType && !!f.codecs
  );
}

function representation(f: PipedFormat, proxy: (u: string) => string): string {
  const attrs = [
    `id="${f.itag}"`,
    `codecs="${esc(f.codecs)}"`,
    `bandwidth="${Math.max(1, Math.round(f.bitrate))}"`,
  ];
  if (f.kind === 'video') {
    if (f.width) attrs.push(`width="${f.width}"`);
    if (f.height) attrs.push(`height="${f.height}"`);
    if (f.fps) attrs.push(`frameRate="${Math.round(f.fps)}"`);
  } else {
    if (f.audioSampleRate) attrs.push(`audioSamplingRate="${f.audioSampleRate}"`);
  }

  const channels =
    f.kind === 'audio'
      ? `      <AudioChannelConfiguration schemeIdUri="urn:mpeg:dash:23003:3:audio_channel_configuration:2011" value="${f.audioChannels ?? 2}"/>\n`
      : '';

  return (
    `    <Representation ${attrs.join(' ')}>\n` +
    channels +
    `      <BaseURL>${esc(proxy(f.url))}</BaseURL>\n` +
    `      <SegmentBase indexRange="${f.indexStart}-${f.indexEnd}">\n` +
    `        <Initialization range="${f.initStart}-${f.initEnd}"/>\n` +
    `      </SegmentBase>\n` +
    `    </Representation>\n`
  );
}

/** Sinh MPD từ format của Piped/Invidious. Trả '' nếu không đủ dữ liệu. */
export function buildDashFromFormats(
  res: PipedResult,
  proxy: (u: string) => string
): string {
  const good = res.formats.filter(usable);
  if (!good.length) return '';

  // Gộp theo container: trộn mp4 với webm trong cùng AdaptationSet sẽ hỏng
  const groups = new Map<string, PipedFormat[]>();
  for (const f of good) {
    const list = groups.get(f.mimeType) ?? [];
    list.push(f);
    groups.set(f.mimeType, list);
  }

  const hasVideo = good.some((f) => f.kind === 'video');
  const hasAudio = good.some((f) => f.kind === 'audio');
  if (!hasVideo || !hasAudio) return '';

  const dur = iso(res.durationSec);

  let sets = '';
  for (const [mimeType, list] of groups) {
    const kind = list[0].kind;
    list.sort((a, b) => b.bitrate - a.bitrate);
    sets +=
      `  <AdaptationSet mimeType="${esc(mimeType)}" ` +
      `contentType="${kind}" subsegmentAlignment="true" ` +
      (kind === 'audio' ? `lang="und" ` : '') +
      `startWithSAP="1">\n` +
      list.map((f) => representation(f, proxy)).join('') +
      `  </AdaptationSet>\n`;
  }

  return (
    `<?xml version="1.0" encoding="utf-8"?>\n` +
    `<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" ` +
    `profiles="urn:mpeg:dash:profile:isoff-on-demand:2011" ` +
    `type="static" mediaPresentationDuration="${dur}" minBufferTime="PT1.5S">\n` +
    `<Period duration="${dur}">\n${sets}</Period>\n</MPD>\n`
  );
}
