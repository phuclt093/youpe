package com.youpe.tv.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Button
import androidx.tv.material3.Text
import com.youpe.tv.data.Settings
import com.youpe.tv.ui.theme.Accent
import com.youpe.tv.ui.theme.TextSub
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

private val HEIGHTS = listOf(480, 720, 1080, 1440, 2160)

@Composable
fun SettingsScreen(serverUrl: String, onChangeServer: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()

    var maxHeight by remember { mutableStateOf(1080) }
    var forceH264 by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        maxHeight = Settings.maxHeight(ctx).first()
        forceH264 = Settings.forceH264(ctx).first()
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(Color(0xFF0F0F0F))
            .padding(48.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp)
    ) {
        Text("Cài đặt", color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Bold)

        Text("Server: $serverUrl", color = TextSub, fontSize = 15.sp)
        Button(onClick = onChangeServer) { Text("Đổi địa chỉ server") }

        Spacer(Modifier.height(8.dp))
        Text("Chất lượng tối đa", color = Color.White, fontSize = 18.sp)
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            HEIGHTS.forEach { h ->
                Button(onClick = {
                    maxHeight = h
                    scope.launch { Settings.setMaxHeight(ctx, h) }
                }) {
                    Text(if (h == maxHeight) "● ${h}p" else "${h}p")
                }
            }
        }

        Spacer(Modifier.height(8.dp))
        Text("Chỉ dùng H.264", color = Color.White, fontSize = 18.sp)
        Text(
            "Bật nếu video bị giật hoặc mất tiếng. Nhiều TV box đời rẻ chỉ giải mã được " +
                    "H.264 bằng phần cứng, gặp VP9 hay AV1 là phải dùng CPU nên không kịp.",
            color = TextSub,
            fontSize = 13.sp,
            lineHeight = 19.sp
        )
        Button(onClick = {
            forceH264 = !forceH264
            scope.launch { Settings.setForceH264(ctx, forceH264) }
        }) {
            Text(if (forceH264) "Đang bật" else "Đang tắt")
        }
    }
}
