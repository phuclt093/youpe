package com.youpe.mobile.ui.screens

import android.annotation.SuppressLint
import androidx.annotation.OptIn
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.PictureInPictureAlt
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import coil.compose.AsyncImage
import com.youpe.core.data.Settings
import com.youpe.core.data.VideoDetail
import com.youpe.core.data.VideoItem
import com.youpe.core.download.DownloadCenter
import com.youpe.core.player.PlayerHolder
import com.youpe.core.player.StreamSource
import com.youpe.mobile.AppState
import com.youpe.mobile.ui.components.Loading
import com.youpe.mobile.ui.components.Message
import com.youpe.mobile.ui.components.VideoRow
import com.youpe.mobile.ui.theme.Chip
import com.youpe.mobile.ui.theme.Elev
import com.youpe.mobile.ui.theme.TextSub
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * Màn hình xem video.
 *
 * Trình phát lấy từ `PlayerHolder`, tức là cùng một `ExoPlayer` đang chạy trong
 * dịch vụ nền. Màn hình này chỉ gắn khung hình vào và nạp nguồn — rời màn hình thì
 * khung hình biến mất nhưng tiếng vẫn chạy tiếp, đúng như mong đợi trên điện thoại.
 */
@OptIn(UnstableApi::class)
@SuppressLint("UnsafeOptInUsageError")
@Composable
fun WatchScreen(
    videoId: String,
    onOpen: (String) -> Unit,
    onBack: () -> Unit,
    onRequestPip: () -> Unit,
) {
    val ctx = LocalContext.current

    var detail by remember { mutableStateOf<VideoDetail?>(null) }
    var related by remember { mutableStateOf<List<VideoItem>>(emptyList()) }
    var badge by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }
    var expanded by remember { mutableStateOf(false) }
    var downloading by remember { mutableStateOf(false) }

    val scope = rememberCoroutineScope()

    val player by PlayerHolder.player.collectAsState()

    /* ---------- nạp thông tin và luồng ---------- */
    LaunchedEffect(videoId, player) {
        val p = player ?: return@LaunchedEffect
        error = ""
        detail = null

        val api = AppState.api(ctx)
        val maxHeight = Settings.maxHeight(ctx).first()
        val h264 = Settings.forceH264(ctx).first()

        runCatching { api.video(videoId) }
            .onSuccess { detail = it }
            .onFailure { error = it.message ?: "Không lấy được thông tin video" }

        runCatching { api.related(videoId).videos }.onSuccess { related = it }

        /*
          Đã tải về máy thì phát thẳng từ đĩa: không tốn mạng, không phải chờ yt-dlp,
          và xem được cả khi server không bật.
        */
        val offline = DownloadCenter.downloads.value
            .firstOrNull { it.request.id == videoId }
            ?.let { DownloadCenter.completedItem(it) }

        if (offline != null) {
            p.setMediaItem(offline)
            p.prepare()
            p.playWhenReady = true
            badge = "đã tải về"
            PlayerHolder.markPlaying(videoId)
            return@LaunchedEffect
        }

        runCatching { api.streams(videoId, maxHeight, h264) }
            .onSuccess { data ->
                if (data.error != null) {
                    error = data.error!!
                    return@onSuccess
                }

                val source = StreamSource.build(ctx, data, maxHeight)
                if (source == null) {
                    error = "Không có luồng nào phát được"
                    return@onSuccess
                }

                // ExoPlayer nhận MediaSource nên phải là ExoPlayer thật, không phải controller
                (p as? ExoPlayer)?.setMediaSource(source) ?: p.setMediaItem(
                    MediaItem.fromUri(
                        data.hls ?: data.dash ?: data.pickMuxed()?.url
                        ?: data.pickVideo(maxHeight)?.url.orEmpty()
                    )
                )
                p.prepare()
                p.playWhenReady = true
                badge = StreamSource.describe(data, maxHeight)
                PlayerHolder.markPlaying(videoId)
            }
            .onFailure { error = it.message ?: "Không lấy được luồng video" }
    }

    Column(Modifier.fillMaxSize()) {

        /* ---------- khung hình ---------- */
        Box(
            Modifier
                .fillMaxWidth()
                .aspectRatio(16f / 9f)
                .background(Color.Black)
        ) {
            if (player == null) {
                Loading()
            } else {
                AndroidView(
                    factory = { c ->
                        PlayerView(c).apply {
                            useController = true
                            setShowNextButton(false)
                            setShowPreviousButton(false)
                        }
                    },
                    update = { it.player = player },
                    modifier = Modifier.fillMaxSize(),
                )
            }

            if (badge.isNotEmpty()) {
                Text(
                    badge,
                    fontSize = 10.sp,
                    color = Color.White,
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(8.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(Color(0x99000000))
                        .padding(horizontal = 5.dp, vertical = 2.dp),
                )
            }

            if (error.isNotEmpty()) {
                Message("Không phát được", error)
            }
        }

        LazyColumn(Modifier.fillMaxSize()) {
            item {
                Column(Modifier.padding(12.dp)) {
                    Text(
                        detail?.title ?: "Đang tải…",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold,
                        lineHeight = 21.sp,
                    )
                    Text(
                        listOf(detail?.viewsText.orEmpty(), detail?.publishedText.orEmpty())
                            .filter { it.isNotEmpty() }
                            .joinToString(" · "),
                        fontSize = 12.sp,
                        color = TextSub,
                        modifier = Modifier.padding(top = 4.dp),
                    )

                    Row(
                        Modifier.padding(top = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        AsyncImage(
                            model = detail?.channel?.avatar,
                            contentDescription = null,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.size(36.dp).clip(CircleShape).background(Elev),
                        )
                        Column(Modifier.padding(start = 10.dp).weight(1f)) {
                            Text(detail?.channel?.name.orEmpty(), fontSize = 14.sp)
                            Text(
                                detail?.channel?.subsText.orEmpty(),
                                fontSize = 12.sp,
                                color = TextSub,
                            )
                        }
                    }

                    Row(
                        Modifier.padding(top = 14.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        ActionChip(
                            icon = Icons.Default.PictureInPictureAlt,
                            label = "Cửa sổ nổi",
                            onClick = onRequestPip,
                        )
                        ActionChip(
                            icon = Icons.Default.Download,
                            label = if (downloading) "Đang tải" else "Tải về",
                            onClick = {
                                val d = detail ?: return@ActionChip
                                downloading = true
                                scope.launch { startDownload(ctx, d) }
                            },
                        )
                    }

                    if (!detail?.description.isNullOrEmpty()) {
                        Text(
                            detail!!.description,
                            fontSize = 13.sp,
                            color = TextSub,
                            maxLines = if (expanded) Int.MAX_VALUE else 3,
                            lineHeight = 18.sp,
                            modifier = Modifier
                                .padding(top = 14.dp)
                                .clip(RoundedCornerShape(8.dp))
                                .background(Elev)
                                .clickable { expanded = !expanded }
                                .padding(10.dp)
                                .fillMaxWidth(),
                        )
                    }
                }
            }

            items(related, key = { it.id }) { v ->
                VideoRow(v) { onOpen(v.id) }
            }
        }
    }
}

@Composable
private fun ActionChip(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    onClick: () -> Unit,
) {
    Row(
        Modifier
            .clip(RoundedCornerShape(20.dp))
            .background(Chip)
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp))
        Text(label, fontSize = 13.sp, modifier = Modifier.padding(start = 6.dp))
    }
}

/**
 * Tải video về máy.
 *
 * Dùng luồng gộp sẵn chứ không phải luồng hình chất lượng cao nhất: luồng gộp có cả
 * tiếng trong một file, còn ghép hai luồng rời khi xem offline sẽ phải lưu và quản lý
 * hai bản tải — phức tạp mà lợi ích không đáng trên màn hình điện thoại.
 */
private suspend fun startDownload(ctx: android.content.Context, d: VideoDetail) {
    val height = Settings.downloadHeight(ctx).first()

    // forceH264 = true: file nằm lại lâu dài trong máy, chọn codec mà mọi thiết bị
    // đều giải mã được bằng phần cứng thì an toàn hơn là chọn codec nén tốt nhất
    val data = runCatching {
        AppState.api(ctx).streams(d.id, height, forceH264 = true)
    }.getOrNull() ?: return

    val url = data.pickMuxed()?.url ?: data.pickVideo(height)?.url ?: return
    DownloadCenter.start(ctx, d.id, url, d.title)
}
