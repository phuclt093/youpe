package com.youpe.tv

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.youpe.core.data.Settings
import com.youpe.core.data.VideoItem
import com.youpe.tv.player.PlayerScreen
import com.youpe.tv.ui.components.NavItem
import com.youpe.tv.ui.components.NavRail
import com.youpe.tv.ui.screens.HomeScreen
import com.youpe.tv.ui.screens.LibraryScreen
import com.youpe.tv.ui.screens.LoginScreen
import com.youpe.tv.ui.screens.SearchScreen
import com.youpe.tv.ui.screens.SettingsScreen
import com.youpe.tv.ui.screens.SetupScreen
import com.youpe.tv.ui.theme.YoupeTheme
import kotlinx.coroutines.flow.first

private sealed interface Screen {
    data object Loading : Screen
    data object Setup : Screen
    data object Home : Screen
    data object Search : Screen
    data object Library : Screen
    data object Login : Screen
    data object Settings : Screen
    data class Play(val video: VideoItem) : Screen
}

/**
 * Ký tự thay cho ảnh vector: TV box đời cũ vẽ vector chậm, mà ký tự thì phông chữ
 * hệ thống đã có sẵn trong bộ đệm.
 */
private val NAV = listOf(
    NavItem("home", "Trang chủ", "⌂"),
    NavItem("search", "Tìm kiếm", "⌕"),
    NavItem("library", "Thư viện", "☰"),
    NavItem("settings", "Cài đặt", "⚙"),
)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            YoupeTheme {
                val ctx = LocalContext.current
                var server by remember { mutableStateOf("") }
                var screen by remember { mutableStateOf<Screen>(Screen.Loading) }

                LaunchedEffect(Unit) {
                    /*
                      Mặc định thận trọng cho TV box: ép H.264 và chặn trần 720p.

                      Box giá rẻ dùng chip Amlogic/Allwinner đời cũ thường không có bộ
                      giải mã phần cứng cho VP9 và AV1. Gặp phải là ExoPlayer tụt xuống
                      giải mã bằng CPU, và trên phần cứng đó nghĩa là giật từng khung.

                      Chỉ ghi một lần. Người dùng tự chỉnh lên 1080p rồi mà mở app lại
                      bị kéo về 720p thì rất khó hiểu.
                    */
                    Settings.initDefaults(ctx, maxHeight = 720, forceH264 = true)

                    val saved = Settings.serverUrl(ctx).first()
                    server = saved
                    screen = if (saved.isEmpty()) Screen.Setup else Screen.Home

                    if (saved.isNotEmpty()) TvState.refreshUser(ctx)
                }

                val current = screen

                // Màn hình phát, thiết lập và đăng nhập chiếm trọn màn hình:
                // lúc đó menu bên cạnh chỉ tổ vướng.
                val fullBleed = current is Screen.Play ||
                    current is Screen.Setup ||
                    current is Screen.Login ||
                    current is Screen.Loading

                if (fullBleed) {
                    when (current) {
                        Screen.Loading -> Unit

                        Screen.Setup -> SetupScreen(initial = server) { url ->
                            server = url
                            screen = Screen.Home
                        }

                        Screen.Login -> LoginScreen(onDone = { screen = Screen.Library })

                        is Screen.Play -> PlayerScreen(
                            videoId = current.video.id,
                            title = current.video.title,
                            serverUrl = server,
                            onExit = { screen = Screen.Home },
                            onPick = { screen = Screen.Play(it) },
                        )

                        else -> Unit
                    }
                } else {
                    Row(Modifier.fillMaxSize()) {
                        NavRail(
                            items = NAV,
                            selected = when (current) {
                                Screen.Search -> "search"
                                Screen.Library -> "library"
                                Screen.Settings -> "settings"
                                else -> "home"
                            },
                            onSelect = { key ->
                                screen = when (key) {
                                    "search" -> Screen.Search
                                    "library" -> Screen.Library
                                    "settings" -> Screen.Settings
                                    else -> Screen.Home
                                }
                            },
                        )

                        Box(Modifier.weight(1f).fillMaxSize()) {
                          when (current) {
                            Screen.Home -> HomeScreen(
                                serverUrl = server,
                                onPick = { screen = Screen.Play(it) },
                                onSearch = { screen = Screen.Search },
                                onSettings = { screen = Screen.Settings },
                            )

                            Screen.Search -> SearchScreen(
                                serverUrl = server,
                                onPick = { screen = Screen.Play(it) },
                            )

                            Screen.Library -> LibraryScreen(
                                onPick = { screen = Screen.Play(it) },
                                onLogin = { screen = Screen.Login },
                            )

                            Screen.Settings -> SettingsScreen(
                                serverUrl = server,
                                onChangeServer = { screen = Screen.Setup },
                            )

                            else -> Unit
                          }
                        }
                    }
                }

                // Nút Back: từ màn con quay về trang chủ, ở trang chủ thì thoát app
                androidx.activity.compose.BackHandler(enabled = screen != Screen.Home) {
                    screen = Screen.Home
                }
            }
        }
    }
}
