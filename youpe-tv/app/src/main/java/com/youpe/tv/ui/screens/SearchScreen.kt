package com.youpe.tv.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import com.youpe.core.data.Api
import com.youpe.core.data.VideoItem
import com.youpe.tv.ui.components.VideoCard
import com.youpe.tv.ui.theme.Accent
import com.youpe.tv.ui.theme.TextSub
import kotlinx.coroutines.launch

@Composable
fun SearchScreen(
    serverUrl: String,
    onPick: (VideoItem) -> Unit,
) {
    val scope = rememberCoroutineScope()
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<VideoItem>>(emptyList()) }
    var searching by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }

    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }

    fun run() {
        val q = query.trim()
        if (q.isEmpty() || searching) return
        searching = true
        message = null
        scope.launch {
            val api = Api(serverUrl)
            try {
                results = api.search(q).videos
                if (results.isEmpty()) message = "Không có kết quả cho \"$q\""
            } catch (e: Throwable) {
                message = "Lỗi tìm kiếm: ${e.message}"
            } finally {
                searching = false
                api.close()
            }
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(Color(0xFF0F0F0F))
            .padding(40.dp)
    ) {
        BasicTextField(
            value = query,
            onValueChange = { query = it },
            singleLine = true,
            textStyle = TextStyle(color = Color.White, fontSize = 20.sp),
            cursorBrush = SolidColor(Accent),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { run() }),
            modifier = Modifier
                .fillMaxWidth(0.7f)
                .focusRequester(focus)
                .background(Color(0xFF212121), RoundedCornerShape(8.dp))
                .padding(16.dp)
        )

        Spacer(Modifier.height(8.dp))
        Text(
            if (searching) "Đang tìm…" else "Bấm OK trên ô nhập để mở bàn phím, xong bấm nút tìm trên bàn phím",
            color = TextSub,
            fontSize = 13.sp
        )

        Spacer(Modifier.height(20.dp))

        message?.let {
            Text(it, color = Color.White, fontSize = 16.sp)
        }

        LazyVerticalGrid(
            columns = GridCells.Adaptive(minSize = 260.dp),
            horizontalArrangement = Arrangement.spacedBy(18.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
            contentPadding = PaddingValues(vertical = 8.dp)
        ) {
            items(results) { v ->
                VideoCard(item = v, onClick = { onPick(v) })
            }
        }
    }
}
