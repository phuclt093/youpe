package com.youpe.tv.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.LazyColumn
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
import com.youpe.tv.data.Api
import com.youpe.tv.data.TV_TOPICS
import com.youpe.tv.data.VideoItem
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

    LaunchedEffect(serverUrl) {
        loading = true
        error = null
        val api = Api(serverUrl)
        try {
            val result = withContext(Dispatchers.IO) {
                TV_TOPICS.map { topic ->
                    async {
                        val videos = runCatching { api.feed(topic.key).videos }.getOrDefault(emptyList())
                        topic.label to videos
                    }
                }.awaitAll()
            }
            rows = result.filter { it.second.isNotEmpty() }
            if (rows.isEmpty()) error = "Server không trả về video nào"
        } catch (e: Throwable) {
            error = "Không gọi được server: ${e.message}"
        } finally {
            loading = false
            api.close()
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
