package com.youpe.core.download

import android.app.Notification
import androidx.annotation.OptIn
import androidx.media3.common.util.NotificationUtil
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.offline.Download
import androidx.media3.exoplayer.offline.DownloadManager
import androidx.media3.exoplayer.offline.DownloadService
import androidx.media3.exoplayer.scheduler.Requirements
import androidx.media3.exoplayer.scheduler.Scheduler
import androidx.media3.ui.R as Media3UiR

/**
 * Dịch vụ chạy nền cho việc tải video.
 *
 * Android bắt buộc mọi việc chạy dài phải có dịch vụ nền kèm thông báo, nếu không
 * hệ thống sẽ giết tiến trình khi người dùng rời app — tải được nửa chừng rồi mất.
 * Media3 lo phần lớn, ở đây chỉ khai báo kênh thông báo và điều kiện chạy.
 */
@OptIn(UnstableApi::class)
class YoupeDownloadService : DownloadService(
    FOREGROUND_ID,
    DEFAULT_FOREGROUND_NOTIFICATION_UPDATE_INTERVAL,
    CHANNEL_ID,
    Media3UiR.string.exo_download_notification_channel_name,
    /* channelDescriptionResourceId = */ 0,
) {

    companion object {
        private const val FOREGROUND_ID = 4021
        private const val CHANNEL_ID = "youpe_downloads"
    }

    override fun getDownloadManager(): DownloadManager =
        DownloadCenter.manager(this).apply {
            /*
              Chỉ tải khi có mạng. Không ràng buộc "phải là wifi" — nhiều người dùng
              gói dữ liệu không giới hạn, ép họ chờ wifi là quyết định thay họ.
            */
            requirements = Requirements(Requirements.NETWORK)
        }

    override fun getScheduler(): Scheduler? = null

    override fun getForegroundNotification(
        downloads: MutableList<Download>,
        notMetRequirements: Int,
    ): Notification {
        NotificationUtil.createNotificationChannel(
            this,
            CHANNEL_ID,
            Media3UiR.string.exo_download_notification_channel_name,
            0,
            NotificationUtil.IMPORTANCE_LOW,
        )

        val done = downloads.count { it.state == Download.STATE_COMPLETED }
        val text = "Đang tải ${downloads.size - done}/${downloads.size} video"

        return androidx.core.app.NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle("youpe")
            .setContentText(text)
            .setOngoing(true)
            .setPriority(androidx.core.app.NotificationCompat.PRIORITY_LOW)
            .build()
    }
}
