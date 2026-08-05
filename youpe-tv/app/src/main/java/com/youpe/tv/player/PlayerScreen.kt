package com.youpe.tv.player

import androidx.annotation.OptIn
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.*
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import androidx.tv.material3.Text
import com.youpe.core.data.Api
import com.youpe.core.data.Settings
import com.youpe.core.data.StreamsResponse
import com.youpe.core.data.VideoItem
import com.youpe.tv.TvState
import com.youpe.tv.ui.components.VideoCard
import com.youpe.core.player.StreamSource
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first

/**
 * Màn hình phát.
 *
 * Điều khiển bằng phím trên điều khiển từ xa:
 *   OK / Play-Pause  phát hoặc dừng
 *   Trái / Phải      tua 10 giây
 *   Back             thoát
 */
@OptIn(UnstableApi::class)
@Composable
fun PlayerScreen(
    videoId: String,
    title: String,
    serverUrl: String,
    onExit: () -> Unit,
    onPick: (VideoItem) -> Unit = {},
) {
    val ctx = LocalContext.current
    var status by remember { mutableStateOf("Đang lấy luồng phát…") }
    var errorText by remember { mutableStateOf<String?>(null) }
    var badge by remember { mutableStateOf("") }
    var showControls by remember { mutableStateOf(true) }
    var isPlaying by remember { mutableStateOf(false) }
    var related by remember { mutableStateOf<List<VideoItem>>(emptyList()) }
    /** Bấm phím Xuống thì mở hàng gợi ý — trên TV không có chỗ nào khác để đặt nó */
    var showRelated by remember { mutableStateOf(false) }
    var ended by remember { mutableStateOf(false) }
    var countdown by remember { mutableStateOf(0) }

    val focus = remember { FocusRequester() }

    val exo = remember {
        ExoPlayer.Builder(ctx)
            .setSeekBackIncrementMs(10_000)
            .setSeekForwardIncrementMs(10_000)
            .build()
    }

    DisposableEffect(Unit) {
        val listener = object : Player.Listener {
            override fun onIsPlayingChanged(playing: Boolean) {
                isPlaying = playing
                if (playing) status = ""
            }

            override fun onPlayerError(error: PlaybackException) {
                errorText = "Lỗi phát: ${error.errorCodeName}\n${error.message ?: ""}"
            }

            override fun onPlaybackStateChanged(state: Int) {
                ended = state == Player.STATE_ENDED
            }
        }
        exo.addListener(listener)
        onDispose {
            exo.removeListener(listener)
            exo.release()
        }
    }

    LaunchedEffect(videoId) {
        errorText = null
        status = "Đang lấy luồng phát…"

        val maxHeight = Settings.maxHeight(ctx).first()
        val h264 = Settings.forceH264(ctx).first()
        val api = Api(serverUrl)

        try {
            val data: StreamsResponse = api.streams(videoId, maxHeight, h264)

            if (data.error != null) {
                errorText = data.error
                return@LaunchedEffect
            }

            val source = StreamSource.build(ctx, data, maxHeight)
            if (source == null) {
                errorText = "Không có luồng nào phát được cho video này"
                return@LaunchedEffect
            }

            badge = StreamSource.describe(data, maxHeight)
            status = "Đang tải dữ liệu…"

            exo.setMediaSource(source)
            exo.prepare()
            exo.playWhenReady = true
        } catch (e: Throwable) {
            errorText = "Không gọi được server: ${e.message}"
        } finally {
            api.close()
        }
    }

    // lấy gợi ý song song với việc phát, không chặn gì cả
    LaunchedEffect(videoId) {
        related = runCatching { TvState.api(ctx).related(videoId).videos }
            .getOrDefault(emptyList())
    }

    /*
      Hết video thì đếm ngược rồi sang video kế.
      Bấm phím bất kỳ là huỷ — người xem còn muốn ngồi lại thì đừng ép họ.
    */
    LaunchedEffect(ended, related) {
        val next = related.firstOrNull()
        if (!ended || next == null) {
            countdown = 0
            return@LaunchedEffect
        }

        countdown = 8
        while (countdown > 0) {
            delay(1000)
            countdown -= 1
        }
        onPick(next)
    }

    // thanh điều khiển tự ẩn sau 3 giây khi đang phát
    LaunchedEffect(showControls, isPlaying) {
        if (showControls && isPlaying) {
            delay(3000)
            showControls = false
        }
    }

    LaunchedEffect(Unit) { focus.requestFocus() }

    Box(
        Modifier
            .fillMaxSize()
            .background(Color.Black)
            .focusRequester(focus)
            .focusable()
            .onKeyEvent { event ->
                if (event.type != KeyEventType.KeyDown) return@onKeyEvent false
                showControls = true

                // đang đếm ngược mà bấm gì đó nghĩa là muốn ở lại
                if (countdown > 0) {
                    countdown = 0
                    ended = false
                }

                when (event.key) {
                    Key.DirectionDown -> { showRelated = related.isNotEmpty(); true }
                    Key.DirectionUp -> { showRelated = false; true }

                    Key.DirectionCenter, Key.Enter, Key.Spacebar, Key.MediaPlayPause -> {
                        if (exo.isPlaying) exo.pause() else exo.play()
                        true
                    }
                    Key.DirectionRight, Key.MediaFastForward -> { exo.seekForward(); true }
                    Key.DirectionLeft, Key.MediaRewind -> { exo.seekBack(); true }
                    Key.MediaPlay -> { exo.play(); true }
                    Key.MediaPause -> { exo.pause(); true }
                    Key.Back -> {
                        if (showRelated) showRelated = false else onExit()
                        true
                    }
                    else -> false
                }
            }
    ) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { c ->
                PlayerView(c).apply {
                    player = exo
                    useController = false   // tự vẽ giao diện bằng Compose
                    setShutterBackgroundColor(android.graphics.Color.BLACK)
                }
            }
        )

        if (badge.isNotEmpty() && showControls) {
            Text(
                text = badge,
                color = Color(0xFFAAAAAA),
                fontSize = 12.sp,
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(24.dp)
                    .background(Color(0xCC000000), RoundedCornerShape(999.dp))
                    .padding(horizontal = 12.dp, vertical = 6.dp)
            )
        }

        if (status.isNotEmpty() && errorText == null) {
            Column(
                Modifier.align(Alignment.Center),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(status, color = Color.White, fontSize = 16.sp)
            }
        }

        errorText?.let { msg ->
            Column(
                Modifier
                    .align(Alignment.Center)
                    .padding(48.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(msg, color = Color.White, fontSize = 16.sp)
                Spacer(Modifier.height(12.dp))
                Text("Bấm Back để quay lại", color = Color(0xFFAAAAAA), fontSize = 13.sp)
            }
        }

        if (countdown > 0) {
            Column(
                Modifier
                    .align(Alignment.Center)
                    .background(Color(0xDD000000), RoundedCornerShape(12.dp))
                    .padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text("Video kế tiếp sau ${countdown}s", color = Color.White, fontSize = 20.sp)
                Spacer(Modifier.height(8.dp))
                Text(
                    related.firstOrNull()?.title.orEmpty(),
                    color = Color(0xFFAAAAAA),
                    fontSize = 15.sp,
                )
                Spacer(Modifier.height(12.dp))
                Text("Bấm phím bất kỳ để ở lại", color = Color(0xFF888888), fontSize = 13.sp)
            }
        }

        /*
          Hàng gợi ý trượt lên từ đáy khi bấm phím Xuống.
          Đặt đè lên video chứ không đẩy video co lại: TV box yếu, đổi kích thước
          khung hình giữa chừng là một lần dựng lại bộ giải mã, hình sẽ khựng.
        */
        if (showRelated) {
            Column(
                Modifier
                    .align(Alignment.BottomStart)
                    .fillMaxWidth()
                    .background(Color(0xEE000000))
                    .padding(vertical = 20.dp),
            ) {
                Text(
                    "Video liên quan",
                    color = Color.White,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.padding(start = 40.dp, bottom = 12.dp),
                )
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 40.dp),
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    items(related) { v ->
                        VideoCard(item = v, onClick = { onPick(v) }, width = 220)
                    }
                }
            }
        }

        if (showControls && !showRelated) {
            Column(
                Modifier
                    .align(Alignment.BottomStart)
                    .fillMaxWidth()
                    .background(Color(0xCC000000))
                    .padding(24.dp)
            ) {
                Text(title, color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Medium)
                Spacer(Modifier.height(6.dp))
                Text(
                    "OK phát/dừng · Trái Phải tua 10 giây · Xuống xem gợi ý · Back thoát",
                    color = Color(0xFFAAAAAA),
                    fontSize = 13.sp
                )
            }
        }
    }
}
