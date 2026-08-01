package com.youpe.tv.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Button
import androidx.tv.material3.Text
import com.youpe.core.data.VideoItem
import com.youpe.tv.TvState
import com.youpe.tv.ui.components.VideoCard
import com.youpe.tv.ui.theme.TextSub

private val LISTS = listOf(
    "history" to "Đã xem",
    "later" to "Xem sau",
    "liked" to "Đã thích",
)

/**
 * Thư viện theo tài khoản, đồng bộ với bản web và bản điện thoại.
 *
 * Chưa đăng nhập thì không có gì để hiện — nói thẳng và chỉ đường tới màn hình đăng
 * nhập, thay vì để một danh sách trống khiến người dùng tưởng app hỏng.
 */
@Composable
fun LibraryScreen(
    onPick: (VideoItem) -> Unit,
    onLogin: () -> Unit,
) {
    val ctx = LocalContext.current
    val user by TvState.user.collectAsState()

    var list by remember { mutableStateOf("history") }
    var items by remember { mutableStateOf<List<VideoItem>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }

    LaunchedEffect(list, user) {
        if (user == null) {
            items = emptyList()
            return@LaunchedEffect
        }
        loading = true
        runCatching { TvState.api(ctx).library(list) }
            .onSuccess { items = it.items }
            .onFailure { items = emptyList() }
        loading = false
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(Color(0xFF0F0F0F))
            .padding(start = 20.dp, top = 28.dp)
    ) {
        Text("Thư viện", color = Color.White, fontSize = 24.sp, fontWeight = FontWeight.Bold)

        if (user == null) {
            Column(
                Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text("Chưa đăng nhập", color = Color.White, fontSize = 18.sp)
                Text(
                    "Đăng nhập để xem lịch sử và danh sách đã lưu từ máy tính.",
                    color = TextSub,
                    fontSize = 14.sp,
                    modifier = Modifier.padding(top = 8.dp, bottom = 20.dp),
                )
                Button(onClick = onLogin) { Text("Đăng nhập") }
            }
            return@Column
        }

        Text(
            user!!.name.ifEmpty { user!!.email },
            color = TextSub,
            fontSize = 14.sp,
            modifier = Modifier.padding(top = 4.dp),
        )

        LazyRow(
            Modifier.padding(top = 18.dp, bottom = 18.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            items(LISTS) { (key, label) ->
                Button(onClick = { list = key }) {
                    Text(if (key == list) "• $label" else label)
                }
            }
        }

        when {
            loading -> Text("Đang tải…", color = TextSub, fontSize = 15.sp)

            items.isEmpty() -> Text("Danh sách này trống.", color = TextSub, fontSize = 15.sp)

            else -> LazyVerticalGrid(
                columns = GridCells.Adaptive(280.dp),
                contentPadding = PaddingValues(end = 40.dp, bottom = 40.dp),
                horizontalArrangement = Arrangement.spacedBy(18.dp),
                verticalArrangement = Arrangement.spacedBy(18.dp),
            ) {
                items(items, key = { it.id }) { v ->
                    VideoCard(item = v, onClick = { onPick(v) })
                }
            }
        }
    }
}
