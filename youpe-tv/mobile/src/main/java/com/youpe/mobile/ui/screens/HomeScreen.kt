package com.youpe.mobile.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.youpe.core.data.TOPICS
import com.youpe.core.data.VideoItem
import com.youpe.mobile.AppState
import com.youpe.mobile.ui.components.Loading
import com.youpe.mobile.ui.components.Message
import com.youpe.mobile.ui.components.VideoRow
import com.youpe.mobile.ui.theme.Chip
import com.youpe.mobile.ui.theme.TextMain
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter

@Composable
fun HomeScreen(onOpen: (String) -> Unit) {
    val ctx = LocalContext.current

    var tab by remember { mutableStateOf("home") }
    var videos by remember { mutableStateOf<List<VideoItem>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var loadingMore by remember { mutableStateOf(false) }
    var canLoadMore by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }

    val listState = rememberLazyListState()

    LaunchedEffect(tab) {
        loading = true
        error = ""
        videos = emptyList()

        runCatching { AppState.api(ctx).feed(tab) }
            .onSuccess {
                videos = it.videos
                canLoadMore = it.canLoadMore
                if (it.videos.isEmpty()) error = it.error ?: "Không có video nào"
            }
            .onFailure { error = it.message ?: "Không kết nối được tới server" }

        loading = false
    }

    /*
      Cuộn vô hạn: nạp thêm khi còn cách đáy 4 thẻ.
      Chờ tới sát đáy mới nạp thì người dùng luôn nhìn thấy một khoảng trống chờ.
    */
    LaunchedEffect(listState, videos.size, canLoadMore) {
        snapshotFlow { listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0 }
            .distinctUntilChanged()
            .filter { canLoadMore && !loadingMore && it >= videos.size - 4 && videos.isNotEmpty() }
            .collect {
                loadingMore = true
                runCatching { AppState.api(ctx).feed(tab, more = true) }
                    .onSuccess { r ->
                        videos = videos + r.videos
                        if (r.done || r.videos.isEmpty()) canLoadMore = false
                    }
                    .onFailure { canLoadMore = false }
                loadingMore = false
            }
    }

    Column(Modifier.fillMaxSize()) {
        LazyRow(
            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(TOPICS) { t ->
                val on = t.key == tab
                Text(
                    t.label,
                    fontSize = 13.sp,
                    color = if (on) Color.Black else TextMain,
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(if (on) Color.White else Chip)
                        .clickable { tab = t.key }
                        .padding(horizontal = 12.dp, vertical = 7.dp),
                )
            }
        }

        when {
            loading -> Loading()
            videos.isEmpty() -> Message("Chưa lấy được video", error)
            else -> LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
                items(videos, key = { it.id + it.title.hashCode() }) { v ->
                    VideoRow(v) { onOpen(v.id) }
                }
                if (loadingMore) {
                    item { Box(Modifier.fillMaxWidth().height(72.dp)) { Loading() } }
                }
            }
        }
    }
}
