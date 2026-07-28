package com.youpe.mobile.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.youpe.core.data.Api
import com.youpe.core.data.Settings
import com.youpe.mobile.ui.theme.Accent
import com.youpe.mobile.ui.theme.TextSub
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

private val HEIGHTS = listOf(360, 480, 720, 1080)

@Composable
fun SettingsScreen(onBack: () -> Unit, onServerChanged: (String) -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()

    var server by remember { mutableStateOf("") }
    var maxHeight by remember { mutableStateOf(1080) }
    var downloadHeight by remember { mutableStateOf(720) }
    var h264 by remember { mutableStateOf(false) }
    var background by remember { mutableStateOf(true) }
    var pipOnLeave by remember { mutableStateOf(true) }
    var note by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        server = Settings.serverUrl(ctx).first()
        maxHeight = Settings.maxHeight(ctx).first()
        downloadHeight = Settings.downloadHeight(ctx).first()
        h264 = Settings.forceH264(ctx).first()
        background = Settings.backgroundPlay(ctx).first()
        pipOnLeave = Settings.pipOnLeave(ctx).first()
    }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
    ) {
        Row(
            Modifier.fillMaxWidth().padding(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Quay lại")
            }
            Text("Cài đặt", fontSize = 17.sp)
        }

        Section("Máy chủ")
        OutlinedTextField(
            value = server,
            onValueChange = { server = it },
            singleLine = true,
            label = { Text("Địa chỉ server") },
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        )
        Row(Modifier.padding(16.dp)) {
            Button(onClick = {
                scope.launch {
                    val normalized = Settings.normalize(server)
                    val api = Api(normalized)
                    val ok = api.ping()
                    api.close()

                    if (ok) {
                        Settings.setServerUrl(ctx, normalized)
                        onServerChanged(normalized)
                        note = "Đã lưu và kết nối được"
                    } else {
                        note = "Không kết nối được tới địa chỉ này"
                    }
                }
            }) { Text("Lưu và kiểm tra") }
        }
        if (note.isNotEmpty()) {
            Text(note, color = Accent, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 16.dp))
        }

        Section("Phát video")
        Choice("Chất lượng tối đa", HEIGHTS, maxHeight) {
            maxHeight = it
            scope.launch { Settings.setMaxHeight(ctx, it) }
        }
        Toggle(
            "Chỉ dùng H.264",
            "Bật nếu video hay giật hoặc chỉ có tiếng mà không có hình. " +
                "Máy đời cũ thường không giải mã nổi VP9 và AV1 bằng phần cứng.",
            h264,
        ) {
            h264 = it
            scope.launch { Settings.setForceH264(ctx, it) }
        }
        Toggle(
            "Tắt màn hình vẫn phát tiếp",
            "Nghe tiếp như nghe nhạc, điều khiển ở thanh thông báo.",
            background,
        ) {
            background = it
            scope.launch { Settings.setBackgroundPlay(ctx, it) }
        }
        Toggle(
            "Thoát app thì thu về cửa sổ nổi",
            "Bấm nút Home khi đang xem sẽ thu video thành cửa sổ nhỏ nổi trên màn hình.",
            pipOnLeave,
        ) {
            pipOnLeave = it
            scope.launch { Settings.setPipOnLeave(ctx, it) }
        }

        Section("Tải về")
        Choice("Chất lượng khi tải", HEIGHTS, downloadHeight) {
            downloadHeight = it
            scope.launch { Settings.setDownloadHeight(ctx, it) }
        }
        Text(
            "Video tải về nằm trong bộ nhớ riêng của app, gỡ app là mất.",
            fontSize = 12.sp,
            color = TextSub,
            modifier = Modifier.padding(16.dp),
        )
    }
}

@Composable
private fun Section(title: String) {
    Text(
        title,
        fontSize = 13.sp,
        fontWeight = FontWeight.SemiBold,
        color = TextSub,
        modifier = Modifier.padding(start = 16.dp, top = 20.dp, bottom = 8.dp),
    )
}

@Composable
private fun Toggle(label: String, hint: String, value: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(label, fontSize = 14.sp)
            Text(hint, fontSize = 12.sp, color = TextSub, lineHeight = 16.sp)
        }
        Switch(checked = value, onCheckedChange = onChange)
    }
}

@Composable
private fun Choice(label: String, options: List<Int>, value: Int, onChange: (Int) -> Unit) {
    Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
        Text(label, fontSize = 14.sp)
        Row(
            Modifier.padding(top = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            options.forEach { h ->
                FilterChip(
                    selected = h == value,
                    onClick = { onChange(h) },
                    label = { Text("${h}p") },
                )
            }
        }
    }
}
