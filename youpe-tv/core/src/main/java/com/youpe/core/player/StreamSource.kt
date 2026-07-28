package com.youpe.core.player

import android.content.Context
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.dash.DashMediaSource
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.exoplayer.source.MediaSource
import androidx.media3.exoplayer.source.MergingMediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import com.youpe.core.data.StreamsResponse

/**
 * Dựng nguồn phát cho ExoPlayer từ dữ liệu server trả về.
 *
 * Điểm mạnh so với bản web: `MergingMediaSource` ghép luồng hình và luồng tiếng
 * ngay trong ExoPlayer. Bên web phải đồng bộ thủ công hai thẻ <video> và <audio>
 * rồi tự sửa lệch mỗi giây, vì trình duyệt không có sẵn khả năng này.
 */
@OptIn(UnstableApi::class)
object StreamSource {

    fun build(ctx: Context, data: StreamsResponse, maxHeight: Int): MediaSource? {
        val http = DefaultHttpDataSource.Factory()
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(15_000)
            .setReadTimeoutMs(30_000)
        val factory = DefaultDataSource.Factory(ctx, http)

        // 1. Trực tiếp: HLS
        data.hls?.let { url ->
            return HlsMediaSource.Factory(factory).createMediaSource(MediaItem.fromUri(url))
        }

        // 2. DASH: ExoPlayer tự chọn chất lượng theo băng thông
        data.dash?.let { url ->
            return DashMediaSource.Factory(factory).createMediaSource(MediaItem.fromUri(url))
        }

        // 3. Hai luồng riêng — ghép lại
        val v = data.pickVideo(maxHeight)
        val a = data.pickAudio()
        if (v != null && a != null) {
            val videoSource = ProgressiveMediaSource.Factory(factory)
                .createMediaSource(MediaItem.fromUri(v.url))
            val audioSource = ProgressiveMediaSource.Factory(factory)
                .createMediaSource(MediaItem.fromUri(a.url))
            return MergingMediaSource(videoSource, audioSource)
        }

        // 4. Luồng gộp sẵn
        data.pickMuxed()?.let { m ->
            return ProgressiveMediaSource.Factory(factory)
                .createMediaSource(MediaItem.fromUri(m.url))
        }

        return null
    }

    /** Nhãn hiện ở góc màn hình cho biết đang phát bằng nguồn nào */
    fun describe(data: StreamsResponse, maxHeight: Int): String = when {
        data.hls != null -> "${data.source} · HLS"
        data.dash != null -> "${data.source} · DASH"
        data.video.isNotEmpty() && data.audio.isNotEmpty() ->
            "${data.source} · ${data.pickVideo(maxHeight)?.label ?: ""}"
        data.muxed.isNotEmpty() -> "${data.source} · luồng gộp"
        else -> data.source
    }
}
