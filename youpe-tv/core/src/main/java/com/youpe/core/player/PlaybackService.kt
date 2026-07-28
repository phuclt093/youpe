package com.youpe.core.player

import android.content.Intent
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService

/**
 * Giữ trình phát sống ngoài vòng đời của Activity.
 *
 * Không có dịch vụ này thì tắt màn hình hay chuyển sang app khác là Android được
 * phép giết Activity, và video dừng theo. Là dịch vụ chạy nền kiểu `mediaPlayback`
 * thì hệ thống giữ lại, đồng thời tự dựng khung điều khiển ở thanh thông báo và
 * màn hình khoá — không phải tự vẽ.
 *
 * `MediaSession` cũng là thứ khiến tai nghe bluetooth và nút media trên bàn phím
 * điều khiển được, hoàn toàn miễn phí.
 */
@OptIn(UnstableApi::class)
class PlaybackService : MediaSessionService() {

    private var mediaSession: MediaSession? = null

    override fun onCreate() {
        super.onCreate()

        val player = ExoPlayer.Builder(this)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
                    .setUsage(C.USAGE_MEDIA)
                    .build(),
                /* handleAudioFocus = */ true,
            )
            // có cuộc gọi đến hay app khác phát nhạc thì tự tạm dừng, không chồng tiếng
            .setHandleAudioBecomingNoisy(true)
            .build()

        mediaSession = MediaSession.Builder(this, player).build()
        PlayerHolder.attach(player)
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? =
        mediaSession

    /**
     * Người dùng vuốt app khỏi danh sách gần đây.
     *
     * Đang phát thì giữ lại — họ có thể chỉ muốn dọn màn hình chứ không muốn tắt nhạc,
     * và khung điều khiển ở thanh thông báo vẫn còn đó để tắt hẳn. Đang dừng thì
     * không có lý do gì để tiếp tục chiếm bộ nhớ.
     */
    override fun onTaskRemoved(rootIntent: Intent?) {
        val player = mediaSession?.player
        if (player == null || !player.playWhenReady || player.mediaItemCount == 0) {
            stopSelf()
        }
    }

    override fun onDestroy() {
        mediaSession?.run {
            PlayerHolder.detach()
            player.release()
            release()
        }
        mediaSession = null
        super.onDestroy()
    }
}
