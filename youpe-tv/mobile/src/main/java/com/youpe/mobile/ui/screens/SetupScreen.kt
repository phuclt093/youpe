package com.youpe.mobile.ui.screens

import androidx.compose.foundation.layout.*
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
import kotlinx.coroutines.launch

/**
 * Màn hình đầu tiên: hỏi địa chỉ server.
 *
 * App không tự trích xuất video — mọi thứ đi qua server youpe-web chạy trên máy tính
 * trong nhà. Không có địa chỉ đó thì chẳng có gì để hiển thị, nên phải hỏi trước tiên.
 */
@Composable
fun SetupScreen(onDone: (String) -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()

    var url by remember { mutableStateOf("") }
    var checking by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }

    Column(
        Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Kết nối tới server youpe", fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
        Text(
            "Nhập địa chỉ máy tính đang chạy youpe-web. " +
                "Xem địa chỉ đó bằng lệnh ipconfig trên Windows, thường có dạng 192.168.x.x:3000",
            fontSize = 13.sp,
            color = TextSub,
            modifier = Modifier.padding(top = 8.dp, bottom = 20.dp),
        )

        OutlinedTextField(
            value = url,
            onValueChange = { url = it },
            singleLine = true,
            placeholder = { Text("192.168.1.10:3000") },
            modifier = Modifier.fillMaxWidth(),
        )

        if (error.isNotEmpty()) {
            Text(error, color = Accent, fontSize = 13.sp, modifier = Modifier.padding(top = 12.dp))
        }

        Button(
            onClick = {
                scope.launch {
                    checking = true
                    error = ""

                    val normalized = Settings.normalize(url)
                    val api = Api(normalized)
                    val ok = api.ping()
                    api.close()

                    checking = false
                    if (ok) {
                        Settings.setServerUrl(ctx, normalized)
                        onDone(normalized)
                    } else {
                        error = "Không kết nối được. Kiểm tra server đã bật và " +
                            "điện thoại có cùng mạng wifi với máy tính không."
                    }
                }
            },
            enabled = !checking && url.isNotBlank(),
            modifier = Modifier.fillMaxWidth().padding(top = 18.dp),
        ) {
            Text(if (checking) "Đang kiểm tra…" else "Kết nối")
        }
    }
}
