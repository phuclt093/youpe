package com.youpe.tv.player

import androidx.annotation.OptIn
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
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
) {
    val ctx = LocalContext.current
    var status by remember { mutableStateOf("Đang lấy luồng phát…") }
    var errorText by remember { mutableStateOf<String?>(null) }
    var badge by remember { mutableStateOf("") }
    var showControls by remember { mutableStateOf(true) }
    var isPlaying by remember { mutableStateOf(false) }

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

                when (event.key) {
                    Key.DirectionCenter, Key.Enter, Key.Spacebar, Key.MediaPlayPause -> {
                        if (exo.isPlaying) exo.pause() else exo.play()
                        true
                    }
                    Key.DirectionRight, Key.MediaFastForward -> { exo.seekForward(); true }
                    Key.DirectionLeft, Key.MediaRewind -> { exo.seekBack(); true }
                    Key.MediaPlay -> { exo.play(); true }
                    Key.MediaPause -> { exo.pause(); true }
                    Key.Back -> { onExit(); true }
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

        if (showControls) {
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
                    "OK phát/dừng · Trái Phải tua 10 giây · Back thoát",
                    color = Color(0xFFAAAAAA),
                    fontSize = 13.sp
                )
            }
        }
    }
}
