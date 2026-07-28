package com.youpe.mobile.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.youpe.mobile.AppState
import com.youpe.mobile.ui.theme.Accent
import com.youpe.mobile.ui.theme.TextSub
import kotlinx.coroutines.launch

/**
 * Đăng nhập tài khoản youpe.
 *
 * Đây là tài khoản nội bộ của server chứ không phải tài khoản Google — nó chỉ dùng
 * để đồng bộ lịch sử, kênh đăng ký và danh sách phát giữa web, TV và điện thoại.
 */
@Composable
fun LoginScreen(onDone: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()

    var registering by remember { mutableStateOf(false) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }

    fun submit() {
        if (email.isBlank() || password.isBlank()) return
        scope.launch {
            busy = true
            error = ""

            val res = runCatching {
                val api = AppState.api(ctx)
                if (registering) api.register(email.trim(), password, name.trim())
                else api.login(email.trim(), password)
            }.getOrElse {
                error = it.message ?: "Không kết nối được tới server"
                busy = false
                return@launch
            }

            busy = false
            if (res.user != null) {
                AppState.setUser(res.user)
                onDone()
            } else {
                error = res.error ?: "Đăng nhập không thành công"
            }
        }
    }

    Column(
        Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            if (registering) "Tạo tài khoản youpe" else "Đăng nhập youpe",
            fontSize = 20.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Text(
            "Tài khoản của server bạn tự chạy, không liên quan tới Google.",
            fontSize = 12.sp,
            color = TextSub,
            modifier = Modifier.padding(top = 6.dp, bottom = 20.dp),
        )

        if (registering) {
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text("Tên hiển thị") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp),
            )
        }

        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Email") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp),
        )

        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Mật khẩu") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            modifier = Modifier.fillMaxWidth(),
        )

        if (error.isNotEmpty()) {
            Text(error, color = Accent, fontSize = 13.sp, modifier = Modifier.padding(top = 12.dp))
        }

        Button(
            onClick = { submit() },
            enabled = !busy,
            modifier = Modifier.fillMaxWidth().padding(top = 18.dp),
        ) {
            Text(if (busy) "Đang xử lý…" else if (registering) "Tạo tài khoản" else "Đăng nhập")
        }

        TextButton(onClick = { registering = !registering; error = "" }) {
            Text(if (registering) "Đã có tài khoản? Đăng nhập" else "Chưa có tài khoản? Tạo mới")
        }
    }
}
