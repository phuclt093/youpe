package com.youpe.tv.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Button
import androidx.tv.material3.Text
import com.youpe.core.data.Api
import com.youpe.core.data.Settings
import com.youpe.tv.ui.theme.Accent
import com.youpe.tv.ui.theme.TextSub
import kotlinx.coroutines.launch

/** Màn hình nhập địa chỉ server, hiện lần đầu mở app hoặc khi mất kết nối */
@Composable
fun SetupScreen(initial: String, onDone: (String) -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()

    var url by remember { mutableStateOf(initial.ifEmpty { "http://192.168.1." }) }
    var checking by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }

    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }

    fun connect() {
        if (checking) return
        checking = true
        message = null
        scope.launch {
            val clean = Settings.normalize(url)
            val api = Api(clean)
            val ok = api.ping()
            api.close()
            checking = false

            if (ok) {
                Settings.setServerUrl(ctx, clean)
                onDone(clean)
            } else {
                message = "Không kết nối được tới $clean\n" +
                        "Kiểm tra: server đã chạy chưa, TV và máy chủ có cùng mạng Wi-Fi không, " +
                        "và tường lửa Windows có chặn cổng 3000 không."
            }
        }
    }

    Box(
        Modifier
            .fillMaxSize()
            .background(Color(0xFF0F0F0F))
            .padding(64.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(Modifier.widthIn(max = 720.dp)) {
            Text("youpe", color = Accent, fontSize = 40.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            Text("Kết nối tới server youpe", color = Color.White, fontSize = 22.sp)
            Spacer(Modifier.height(24.dp))

            BasicTextField(
                value = url,
                onValueChange = { url = it },
                singleLine = true,
                textStyle = TextStyle(color = Color.White, fontSize = 20.sp),
                cursorBrush = SolidColor(Accent),
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Uri,
                    imeAction = ImeAction.Go
                ),
                keyboardActions = KeyboardActions(onGo = { connect() }),
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(focus)
                    .background(Color(0xFF212121), RoundedCornerShape(8.dp))
                    .padding(16.dp)
            )

            Spacer(Modifier.height(20.dp))

            Button(onClick = { connect() }) {
                Text(if (checking) "Đang kiểm tra…" else "Kết nối")
            }

            Spacer(Modifier.height(20.dp))

            message?.let {
                Text(it, color = Accent, fontSize = 14.sp, lineHeight = 20.sp)
                Spacer(Modifier.height(16.dp))
            }

            Text(
                "Trên máy chạy server, mở terminal và gõ ipconfig (Windows) hoặc ip addr (Linux) " +
                        "để xem địa chỉ IP nội bộ. Địa chỉ thường có dạng 192.168.x.x — nhớ kèm cổng :3000.",
                color = TextSub,
                fontSize = 14.sp,
                lineHeight = 20.sp
            )
        }
    }
}
