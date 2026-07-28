package com.youpe.mobile.ui.screens

import androidx.annotation.OptIn
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.offline.Download
import com.youpe.core.download.DownloadCenter
import com.youpe.mobile.ui.components.Message
import com.youpe.mobile.ui.theme.TextSub

/**
 * Quản lý video đã tải.
 *
 * Video tải xong xem được cả khi server tắt hoặc điện thoại ra khỏi nhà — file nằm
 * trong bộ nhớ đệm của chính ExoPlayer nên lúc phát không cần nhánh xử lý riêng.
 */
@OptIn(UnstableApi::class)
@Composable
fun DownloadsScreen(onBack: () -> Unit) {
    val ctx = LocalContext.current
    val downloads by DownloadCenter.downloads.collectAsState()

    LaunchedEffect(Unit) { DownloadCenter.reload(ctx) }

    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().padding(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Quay lại")
            }
            Text("Video đã tải", fontSize = 17.sp)
        }

        if (downloads.isEmpty()) {
            Message(
                "Chưa tải video nào",
                "Mở một video rồi bấm Tải về. Tải xong xem được cả khi không có mạng.",
            )
            return@Column
        }

        LazyColumn(Modifier.fillMaxSize()) {
            items(downloads, key = { it.request.id }) { d ->
                ListItem(
                    headlineContent = { Text(DownloadCenter.titleOf(d), maxLines = 2) },
                    supportingContent = { Text(stateLabel(d), fontSize = 12.sp, color = TextSub) },
                    trailingContent = {
                        IconButton(onClick = { DownloadCenter.remove(ctx, d.request.id) }) {
                            Icon(Icons.Default.Delete, contentDescription = "Xoá")
                        }
                    },
                )
                if (d.state == Download.STATE_DOWNLOADING) {
                    LinearProgressIndicator(
                        progress = { (d.percentDownloaded / 100f).coerceIn(0f, 1f) },
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                    )
                }
            }
        }
    }
}

@OptIn(UnstableApi::class)
private fun stateLabel(d: Download): String = when (d.state) {
    Download.STATE_COMPLETED -> "Đã tải xong"
    Download.STATE_DOWNLOADING -> "Đang tải ${d.percentDownloaded.toInt()}%"
    Download.STATE_QUEUED -> "Đang chờ"
    Download.STATE_STOPPED -> "Đã tạm dừng"
    Download.STATE_FAILED -> "Tải hỏng"
    Download.STATE_REMOVING -> "Đang xoá"
    else -> ""
}
