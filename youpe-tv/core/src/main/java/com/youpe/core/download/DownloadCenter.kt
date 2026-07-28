package com.youpe.core.download

import android.content.Context
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.cache.NoOpCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.exoplayer.offline.Download
import androidx.media3.exoplayer.offline.DownloadManager
import androidx.media3.exoplayer.offline.DownloadRequest
import androidx.media3.exoplayer.offline.DownloadService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.io.File
import java.util.concurrent.Executors

/**
 * Tải video về máy để xem khi không có mạng.
 *
 * Dùng bộ máy tải sẵn của Media3 thay vì tự viết: nó lo tiếp tục sau khi mất mạng,
 * chạy tiếp khi app bị đóng, và quan trọng nhất là **file tải về nằm trong cùng bộ
 * nhớ đệm mà ExoPlayer đọc khi phát**. Nhờ vậy lúc xem offline không phải viết
 * nhánh riêng — cứ mở như bình thường, có sẵn thì nó lấy từ đĩa.
 *
 * Lưu ý về hạn dùng: URL của Google khoá theo IP và hết hạn sau vài giờ, nên mọi
 * đường dẫn đều đi qua proxy của server youpe. Đổi lại, xem offline vẫn cần server
 * **lúc tải**, còn lúc xem thì không.
 */
@OptIn(UnstableApi::class)
object DownloadCenter {

    private const val CACHE_DIR = "youpe-downloads"

    private var cache: SimpleCache? = null
    private var manager: DownloadManager? = null

    private val _downloads = MutableStateFlow<List<Download>>(emptyList())
    val downloads: StateFlow<List<Download>> = _downloads

    @Synchronized
    fun cache(ctx: Context): SimpleCache {
        cache?.let { return it }

        val dir = File(ctx.getExternalFilesDir(null) ?: ctx.filesDir, CACHE_DIR)
        val db = StandaloneDatabaseProvider(ctx)

        /*
          NoOpCacheEvictor: không tự xoá bớt khi đầy.
          Đây là chủ ý — người dùng bấm tải là muốn giữ. Bộ dọn theo dung lượng sẽ
          âm thầm xoá mất video họ để dành cho chuyến bay.
        */
        return SimpleCache(dir, NoOpCacheEvictor(), db).also { cache = it }
    }

    @Synchronized
    fun manager(ctx: Context): DownloadManager {
        manager?.let { return it }

        val app = ctx.applicationContext
        val http = DefaultHttpDataSource.Factory()
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(15_000)
            .setReadTimeoutMs(30_000)

        val m = DownloadManager(
            app,
            StandaloneDatabaseProvider(app),
            cache(app),
            http,
            Executors.newFixedThreadPool(2),
        ).apply {
            maxParallelDownloads = 2
            addListener(object : DownloadManager.Listener {
                override fun onDownloadChanged(
                    downloadManager: DownloadManager,
                    download: Download,
                    finalException: Exception?,
                ) {
                    refresh(downloadManager)
                }

                override fun onDownloadRemoved(
                    downloadManager: DownloadManager,
                    download: Download,
                ) {
                    refresh(downloadManager)
                }
            })
        }

        manager = m
        refresh(m)
        return m
    }

    private fun refresh(m: DownloadManager) {
        _downloads.value = m.currentDownloads.toList().ifEmpty { readAll(m) }
    }

    private fun readAll(m: DownloadManager): List<Download> {
        val out = mutableListOf<Download>()
        m.downloadIndex.getDownloads().use { cursor ->
            while (cursor.moveToNext()) out.add(cursor.download)
        }
        return out
    }

    /** Nạp lại danh sách từ đĩa — gọi khi mở màn hình quản lý tải về */
    fun reload(ctx: Context) {
        _downloads.value = readAll(manager(ctx))
    }

    /**
     * @param title để hiện trong danh sách; Media3 lưu nó dưới dạng byte tuỳ ý,
     *   nên phải tự mã hoá và tự đọc lại.
     */
    fun start(ctx: Context, videoId: String, url: String, title: String) {
        val request = DownloadRequest.Builder(videoId, android.net.Uri.parse(url))
            .setData(title.toByteArray())
            .build()

        DownloadService.sendAddDownload(
            ctx,
            YoupeDownloadService::class.java,
            request,
            /* foreground = */ false,
        )
    }

    fun remove(ctx: Context, videoId: String) {
        DownloadService.sendRemoveDownload(
            ctx,
            YoupeDownloadService::class.java,
            videoId,
            /* foreground = */ false,
        )
    }

    fun pauseAll(ctx: Context) {
        DownloadService.sendPauseDownloads(ctx, YoupeDownloadService::class.java, false)
    }

    fun resumeAll(ctx: Context) {
        DownloadService.sendResumeDownloads(ctx, YoupeDownloadService::class.java, false)
    }

    fun titleOf(d: Download): String = runCatching { String(d.request.data) }.getOrDefault("")

    /** Đã tải xong thì mở thẳng từ đĩa, không cần server */
    fun completedItem(d: Download): MediaItem? =
        if (d.state == Download.STATE_COMPLETED) d.request.toMediaItem() else null

    fun isDownloaded(videoId: String): Boolean =
        _downloads.value.any { it.request.id == videoId && it.state == Download.STATE_COMPLETED }
}
