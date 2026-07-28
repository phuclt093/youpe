package com.youpe.mobile.ui.screens

import androidx.annotation.OptIn
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.OpenInFull
import androidx.compose.material.icons.filled.VolumeOff
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
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
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import coil.compose.AsyncImage
import com.youpe.core.data.Settings
import com.youpe.core.data.VideoItem
import com.youpe.mobile.AppState
import com.youpe.mobile.ui.components.Loading
import com.youpe.mobile.ui.components.Message
import com.youpe.mobile.ui.theme.TextSub
import kotlinx.coroutines.flow.first

/**
 * Video ngắn, vuốt dọc.
 *
 * Điểm khác quan trọng so với trang chủ: **chỉ một video được nạp luồng tại một thời
 * điểm**. Mỗi lần nạp là một lần server chạy yt-dlp, nạp cả trang thì vuốt vài cái là
 * server ngộp.
 *
 * Cũng chỉ dùng **một** `ExoPlayer` riêng cho màn hình này chứ không phải mỗi trang
 * một cái — mỗi ExoPlayer chiếm một bộ giải mã phần cứng, mà điện thoại chỉ có vài cái.
 */
@OptIn(UnstableApi::class)
@Composable
fun ShortsScreen(onOpenFull: (String) -> Unit) {
    val ctx = LocalContext.current

    var items by remember { mutableStateOf<List<VideoItem>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf("") }
    var muted by remember { mutableStateOf(false) }

    val seen = remember { mutableListOf<String>() }
    val pager = rememberPagerState { items.size }

    // trình phát riêng, tách khỏi dịch vụ nền: shorts không cần phát nền
    val player = remember {
        ExoPlayer.Builder(ctx).build().apply {
            repeatMode = Player.REPEAT_MODE_ONE
            playWhenReady = true
        }
    }
    DisposableEffect(Unit) {
        onDispose { player.release() }
    }

    suspend fun fetchMore() {
        runCatching { AppState.api(ctx).shorts(seen) }
            .onSuccess { r ->
                if (r.videos.isEmpty() && items.isEmpty()) {
                    error = r.error ?: "Không lấy được video ngắn"
                }
                seen += r.videos.map { it.id }
                items = items + r.videos
            }
            .onFailure { if (items.isEmpty()) error = it.message ?: "Không kết nối được" }
        loading = false
    }

    LaunchedEffect(Unit) { fetchMore() }

    // gần hết thì lấy thêm
    LaunchedEffect(pager.currentPage, items.size) {
        if (items.isNotEmpty() && pager.currentPage >= items.size - 3) fetchMore()
    }

    /* ---------- nạp và phát video đang hiện ---------- */
    LaunchedEffect(pager.currentPage, items.size) {
        val v = items.getOrNull(pager.currentPage) ?: return@LaunchedEffect

        player.stop()
        val height = Settings.downloadHeight(ctx).first()

        runCatching { AppState.api(ctx).streams(v.id, height, forceH264 = true) }
            .onSuccess { data ->
                // luồng gộp có sẵn tiếng trong một file — đơn giản nhất cho video ngắn
                val url = data.pickMuxed()?.url ?: data.pickVideo(height)?.url ?: return@onSuccess
                player.setMediaItem(MediaItem.fromUri(url))
                player.prepare()
                player.playWhenReady = true
            }
    }

    LaunchedEffect(muted) { player.volume = if (muted) 0f else 1f }

    when {
        loading -> Loading()
        items.isEmpty() -> Message("Chưa có video ngắn", error)
        else -> Box(Modifier.fillMaxSize().background(Color.Black)) {
            VerticalPager(state = pager, modifier = Modifier.fillMaxSize()) { page ->
                val v = items[page]
                Box(Modifier.fillMaxSize()) {

                    if (page == pager.currentPage) {
                        AndroidView(
                            factory = { c ->
                                PlayerView(c).apply {
                                    useController = false
                                    resizeMode =
                                        androidx.media3.ui.AspectRatioFrameLayout.RESIZE_MODE_FIT
                                }
                            },
                            update = { it.player = player },
                            modifier = Modifier.fillMaxSize(),
                        )
                    } else {
                        // trang chưa tới lượt: chỉ hiện ảnh, không tốn bộ giải mã
                        AsyncImage(
                            model = v.thumbnail,
                            contentDescription = null,
                            contentScale = ContentScale.Fit,
                            modifier = Modifier.fillMaxSize(),
                        )
                    }

                    Column(
                        Modifier
                            .align(Alignment.BottomStart)
                            .fillMaxWidth()
                            .padding(16.dp)
                    ) {
                        Text(
                            v.title,
                            color = Color.White,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Medium,
                            maxLines = 2,
                        )
                        Row(
                            Modifier.padding(top = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            AsyncImage(
                                model = v.author.avatar,
                                contentDescription = null,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.size(28.dp).clip(CircleShape),
                            )
                            Text(
                                v.author.name,
                                color = Color.White,
                                fontSize = 12.sp,
                                modifier = Modifier.padding(start = 8.dp),
                            )
                            Text(
                                v.viewsText,
                                color = TextSub,
                                fontSize = 11.sp,
                                modifier = Modifier.padding(start = 8.dp),
                            )
                        }
                    }

                    Column(
                        Modifier
                            .align(Alignment.BottomEnd)
                            .padding(end = 12.dp, bottom = 96.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        Icon(
                            if (muted) Icons.Default.VolumeOff else Icons.Default.VolumeUp,
                            contentDescription = if (muted) "Bật tiếng" else "Tắt tiếng",
                            tint = Color.White,
                            modifier = Modifier.size(28.dp).clickable { muted = !muted },
                        )
                        Icon(
                            Icons.Default.OpenInFull,
                            contentDescription = "Mở trang xem đầy đủ",
                            tint = Color.White,
                            modifier = Modifier.size(28.dp).clickable { onOpenFull(v.id) },
                        )
                    }
                }
            }
        }
    }
}
