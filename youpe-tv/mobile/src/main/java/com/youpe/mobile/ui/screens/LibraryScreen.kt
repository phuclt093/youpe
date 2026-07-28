package com.youpe.mobile.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.youpe.core.data.VideoItem
import com.youpe.mobile.AppState
import com.youpe.mobile.ui.components.Loading
import com.youpe.mobile.ui.components.Message
import com.youpe.mobile.ui.components.VideoRow
import com.youpe.mobile.ui.theme.TextSub
import kotlinx.coroutines.launch

private val LISTS = listOf(
    "history" to "Đã xem",
    "later" to "Xem sau",
    "liked" to "Đã thích",
)

@Composable
fun LibraryScreen(
    onOpen: (String) -> Unit,
    onLogin: () -> Unit,
    onDownloads: () -> Unit,
    onSettings: () -> Unit,
) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val user by AppState.user.collectAsState()

    var list by remember { mutableStateOf("history") }
    var items by remember { mutableStateOf<List<VideoItem>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }

    LaunchedEffect(list, user) {
        if (user == null) {
            items = emptyList()
            return@LaunchedEffect
        }
        loading = true
        runCatching { AppState.api(ctx).library(list) }
            .onSuccess { items = it.items }
            .onFailure { items = emptyList() }
        loading = false
    }

    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    user?.name?.ifEmpty { user?.email.orEmpty() } ?: "Chưa đăng nhập",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    if (user == null) "Đăng nhập để đồng bộ với bản web và TV"
                    else user!!.email,
                    fontSize = 12.sp,
                    color = TextSub,
                )
            }

            IconButton(onClick = onDownloads) {
                Icon(Icons.Default.Download, contentDescription = "Video đã tải")
            }
            IconButton(onClick = onSettings) {
                Icon(Icons.Default.Settings, contentDescription = "Cài đặt")
            }
        }

        if (user == null) {
            Column(
                Modifier.fillMaxWidth().padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Button(onClick = onLogin) { Text("Đăng nhập") }
                TextButton(onClick = onDownloads) { Text("Xem video đã tải về") }
            }
            return@Column
        }

        Row(
            Modifier.padding(horizontal = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            LISTS.forEach { (key, label) ->
                FilterChip(
                    selected = list == key,
                    onClick = { list = key },
                    label = { Text(label) },
                )
            }
        }

        Spacer(Modifier.height(10.dp))

        when {
            loading -> Loading()
            items.isEmpty() -> Message("Danh sách trống")
            else -> LazyColumn(Modifier.fillMaxSize()) {
                items(items, key = { it.id }) { v -> VideoRow(v) { onOpen(v.id) } }
            }
        }

        TextButton(
            onClick = { scope.launch { AppState.logout(ctx) } },
            modifier = Modifier.padding(12.dp),
        ) {
            Text("Đăng xuất")
        }
    }
}
