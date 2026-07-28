package com.youpe.mobile.ui

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.VideoLibrary
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.youpe.core.data.Settings
import com.youpe.mobile.AppState
import com.youpe.mobile.ui.screens.*
import kotlinx.coroutines.flow.first

private data class Tab(val route: String, val label: String, val icon: ImageVector)

private val TABS = listOf(
    Tab("home", "Trang chủ", Icons.Default.Home),
    Tab("shorts", "Shorts", Icons.Default.PlayCircle),
    Tab("search", "Tìm kiếm", Icons.Default.Search),
    Tab("library", "Thư viện", Icons.Default.VideoLibrary),
)

@Composable
fun YoupeApp(
    onWatchingChanged: (Boolean) -> Unit,
    onRequestPip: () -> Unit,
) {
    val ctx = LocalContext.current
    val nav = rememberNavController()

    // chưa khai báo địa chỉ server thì mọi thứ khác đều vô nghĩa
    var server by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        server = Settings.serverUrl(ctx).first()
        if (!server.isNullOrEmpty()) AppState.refreshUser(ctx)
    }

    if (server == null) return

    if (server!!.isEmpty()) {
        SetupScreen(onDone = { server = it })
        return
    }

    val entry by nav.currentBackStackEntryAsState()
    val route = entry?.destination?.route

    // thanh dưới biến mất khi đang xem, nhường hết màn hình cho video
    val showBar = route != null && TABS.any { it.route == route }

    LaunchedEffect(route) { onWatchingChanged(route?.startsWith("watch/") == true) }

    Scaffold(
        bottomBar = {
            if (showBar) {
                NavigationBar {
                    TABS.forEach { tab ->
                        val selected = entry?.destination?.hierarchy?.any { it.route == tab.route } == true
                        NavigationBarItem(
                            selected = selected,
                            onClick = {
                                nav.navigate(tab.route) {
                                    // giữ nguyên vị trí cuộn của từng tab khi quay lại
                                    popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = { Icon(tab.icon, contentDescription = tab.label) },
                            label = { Text(tab.label) },
                        )
                    }
                }
            }
        }
    ) { pad ->
        NavHost(
            navController = nav,
            startDestination = "home",
            modifier = Modifier.padding(pad),
        ) {
            composable("home") {
                HomeScreen(onOpen = { nav.navigate("watch/$it") })
            }
            composable("shorts") {
                ShortsScreen(onOpenFull = { nav.navigate("watch/$it") })
            }
            composable("search") {
                SearchScreen(onOpen = { nav.navigate("watch/$it") })
            }
            composable("library") {
                LibraryScreen(
                    onOpen = { nav.navigate("watch/$it") },
                    onLogin = { nav.navigate("login") },
                    onDownloads = { nav.navigate("downloads") },
                    onSettings = { nav.navigate("settings") },
                )
            }
            composable("watch/{id}") { back ->
                WatchScreen(
                    videoId = back.arguments?.getString("id").orEmpty(),
                    onOpen = { nav.navigate("watch/$it") },
                    onBack = { nav.popBackStack() },
                    onRequestPip = onRequestPip,
                )
            }
            composable("login") {
                LoginScreen(onDone = { nav.popBackStack() })
            }
            composable("downloads") {
                DownloadsScreen(onBack = { nav.popBackStack() })
            }
            composable("settings") {
                SettingsScreen(
                    onBack = { nav.popBackStack() },
                    onServerChanged = { server = it },
                )
            }
        }
    }
}
