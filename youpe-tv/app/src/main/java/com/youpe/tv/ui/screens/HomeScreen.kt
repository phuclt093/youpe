package com.youpe.tv.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Button
import androidx.tv.material3.Text
import com.youpe.core.data.TOPICS
import com.youpe.tv.TvState
import kotlinx.coroutines.flow.distinctUntilChanged
import com.youpe.core.data.VideoItem
import com.youpe.tv.ui.components.VideoCard
import com.youpe.tv.ui.theme.Accent
import com.youpe.tv.ui.theme.TextSub
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.withContext

/**
 * Trang chủ dạng hàng ngang, kiểu quen thuộc của Android TV.
 *
 * Mỗi chủ đề là một hàng cuộn ngang. Tải song song tất cả các hàng để đỡ phải
 * chờ lần lượt — server có cache nên nhiều request cùng lúc không thành vấn đề.
 */
@Composable
fun HomeScreen(
    serverUrl: String,
    onPick: (VideoItem) -> Unit,
    onSearch: () -> Unit,
    onSettings: () -> Unit,
) {
    var rows by remember { mutableStateOf<List<Pair<String, List<VideoItem>>>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    val firstButton = remember { FocusRequester() }
    val listState = rememberLazyListState()

    /*
      Nạp theo đợt, mỗi đợt bốn hàng.

      Bản đầu bắn hết hơn hai mươi chủ đề cùng lúc. Trên máy tính thì không sao, nhưng
      TV box giá rẻ có RAM 1–2GB: hai mươi lời gọi mạng song song cộng với hàng trăm
      ảnh thu nhỏ giải mã cùng lúc là đủ để hệ thống giết app. Mà người xem cũng chỉ
      nhìn được ba bốn hàng đầu, phần còn lại nạp lúc họ cuộn tới cũng chưa muộn.
    */
    val batch = 4
    var loaded by remember { mutableStateOf(0) }
    var loadingMore by remember { mutableStateOf(false) }

    suspend fun loadBatch(ctx: android.content.Context) {
        if (loaded >= TOPICS.size || loadingMore) return
        loadingMore = true

        val slice = TOPICS.drop(loaded).take(batch)
        val api = TvState.api(ctx)

        val result = withContext(Dispatchers.IO) {
            slice.map { topic ->
                async {
                    val videos = runCatching { api.feed(topic.key).videos }
                        .getOrDefault(emptyList())
                    topic.label to videos
                }
            }.awaitAll()
        }

        rows = rows + result.filter { it.second.isNotEmpty() }
        loaded += slice.size
        loadingMore = false
        loading = false

        if (rows.isEmpty() && loaded >= TOPICS.size) {
            error = "Server không trả về video nào"
        }
    }

    val ctx = LocalContext.current

    LaunchedEffect(serverUrl) {
        loading = true
        error = null
        rows = emptyList()
        loaded = 0

        runCatching { loadBatch(ctx) }
            .onFailure {
                error = "Không gọi được server: ${it.message}"
                loading = false
            }
    }

    // cuộn gần hết thì nạp đợt tiếp
    LaunchedEffect(listState, rows.size) {
        snapshotFlow { listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0 }
            .distinctUntilChanged()
            .collect { last ->
                if (rows.isNotEmpty() && last >= rows.size - 2) {
                    runCatching { loadBatch(ctx) }
                }
            }
    }

    LaunchedEffect(Unit) { runCatching { firstButton.requestFocus() } }

    Column(
        Modifier
            .fillMaxSize()
            .background(Color(0xFF0F0F0F))
    ) {
        // thanh trên cùng
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 40.dp, vertical = 20.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("youpe", color = Accent, fontSize = 26.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.width(24.dp))

            Button(onClick = onSearch, modifier = Modifier.focusRequester(firstButton)) {
                Text("Tìm kiếm")
            }
            Spacer(Modifier.width(12.dp))
            Button(onClick = onSettings) { Text("Cài đặt") }
        }

        when {
            loading -> Box(Modifier.fillMaxSize(), Alignment.Center) {
                Text("Đang tải…", color = Color.White, fontSize = 18.sp)
            }

            error != null -> Column(
                Modifier.fillMaxSize().padding(40.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(error!!, color = Color.White, fontSize = 16.sp)
                Spacer(Modifier.height(16.dp))
                Button(onClick = onSettings) { Text("Đổi địa chỉ server") }
            }

            else -> LazyColumn(
                state = listState,
                contentPadding = PaddingValues(bottom = 40.dp),
                verticalArrangement = Arrangement.spacedBy(28.dp)
            ) {
                items(rows) { (label, videos) ->
                    Column {
                        Text(
                            label,
                            color = Color.White,
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Medium,
                            modifier = Modifier.padding(start = 40.dp, bottom = 12.dp)
                        )
                        LazyRow(
                            contentPadding = PaddingValues(horizontal = 40.dp),
                            horizontalArrangement = Arrangement.spacedBy(18.dp)
                        ) {
                            items(videos) { v ->
                                VideoCard(item = v, onClick = { onPick(v) })
                            }
                        }
                    }
                }
            }
        }
    }
}
