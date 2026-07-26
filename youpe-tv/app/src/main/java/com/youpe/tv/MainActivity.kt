package com.youpe.tv

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext
import com.youpe.tv.data.Settings
import com.youpe.tv.data.VideoItem
import com.youpe.tv.player.PlayerScreen
import com.youpe.tv.ui.screens.HomeScreen
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
    data object Settings : Screen
    data class Play(val video: VideoItem) : Screen
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            YoupeTheme {
                val ctx = LocalContext.current
                var server by remember { mutableStateOf("") }
                var screen by remember { mutableStateOf<Screen>(Screen.Loading) }

                LaunchedEffect(Unit) {
                    val saved = Settings.serverUrl(ctx).first()
                    server = saved
                    screen = if (saved.isEmpty()) Screen.Setup else Screen.Home
                }

                when (val s = screen) {
                    Screen.Loading -> Unit

                    Screen.Setup -> SetupScreen(initial = server) { url ->
                        server = url
                        screen = Screen.Home
                    }

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

                    Screen.Settings -> SettingsScreen(
                        serverUrl = server,
                        onChangeServer = { screen = Screen.Setup },
                    )

                    is Screen.Play -> PlayerScreen(
                        videoId = s.video.id,
                        title = s.video.title,
                        serverUrl = server,
                        onExit = { screen = Screen.Home },
                    )
                }

                // Nút Back của điều khiển: từ màn con quay về trang chủ, ở trang chủ thì thoát app
                BackHandler(enabled = screen != Screen.Home) {
                    screen = Screen.Home
                }
            }
        }
    }
}

@Composable
private fun BackHandler(enabled: Boolean, onBack: () -> Unit) {
    androidx.activity.compose.BackHandler(enabled = enabled, onBack = onBack)
}
