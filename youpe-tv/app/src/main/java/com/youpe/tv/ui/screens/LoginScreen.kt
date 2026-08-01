package com.youpe.tv.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Button
import androidx.tv.material3.Text
import com.youpe.tv.TvState
import com.youpe.tv.ui.theme.Accent
import com.youpe.tv.ui.theme.TextSub
import kotlinx.coroutines.launch

/**
 * Đăng nhập trên TV.
 *
 * Gõ trên điều khiển từ xa rất cực, nên ở đây chỉ có đăng nhập chứ không có đăng ký —
 * tạo tài khoản cứ làm trên máy tính, TV chỉ cần nhập lại một lần rồi thôi.
 */
@Composable
fun LoginScreen(onDone: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()

    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }

    val firstField = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { firstField.requestFocus() } }

    Column(
        Modifier
            .fillMaxSize()
            .background(Color(0xFF0F0F0F))
            .padding(horizontal = 80.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Đăng nhập youpe", color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Bold)
        Text(
            "Tài khoản của server bạn tự chạy. Tạo tài khoản trên máy tính rồi nhập lại ở đây.",
            color = TextSub,
            fontSize = 14.sp,
            modifier = Modifier.padding(top = 8.dp, bottom = 24.dp),
        )

        TvField(
            value = email,
            onChange = { email = it },
            hint = "Email",
            modifier = Modifier.focusRequester(firstField),
        )
        Spacer(Modifier.height(12.dp))
        TvField(
            value = password,
            onChange = { password = it },
            hint = "Mật khẩu",
            password = true,
        )

        if (error.isNotEmpty()) {
            Text(error, color = Accent, fontSize = 14.sp, modifier = Modifier.padding(top = 14.dp))
        }

        Spacer(Modifier.height(20.dp))

        Button(
            onClick = {
                if (email.isBlank() || password.isBlank()) return@Button
                scope.launch {
                    busy = true
                    error = ""

                    val res = runCatching {
                        TvState.api(ctx).login(email.trim(), password)
                    }.getOrElse {
                        error = "Không kết nối được tới server"
                        busy = false
                        return@launch
                    }

                    busy = false
                    if (res.user != null) {
                        TvState.setUser(res.user)
                        onDone()
                    } else {
                        error = res.error ?: "Email hoặc mật khẩu không đúng"
                    }
                }
            },
        ) {
            Text(if (busy) "Đang đăng nhập…" else "Đăng nhập")
        }
    }
}

/**
 * Ô nhập cho TV.
 *
 * Dùng `BasicTextField` thay vì ô nhập dựng sẵn vì các thành phần của tv-material
 * chưa có ô nhập, mà ô nhập của material thường thì viền và nhãn quá nhỏ để nhìn từ
 * xa. Ở đây viền dày và chữ lớn hẳn lên.
 */
@Composable
private fun TvField(
    value: String,
    onChange: (String) -> Unit,
    hint: String,
    modifier: Modifier = Modifier,
    password: Boolean = false,
) {
    Box(
        modifier
            .fillMaxWidth(0.6f)
            .background(Color(0xFF212121), RoundedCornerShape(8.dp))
            .padding(horizontal = 16.dp, vertical = 14.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        if (value.isEmpty()) {
            Text(hint, color = TextSub, fontSize = 16.sp)
        }
        BasicTextField(
            value = value,
            onValueChange = onChange,
            singleLine = true,
            textStyle = TextStyle(color = Color.White, fontSize = 16.sp),
            cursorBrush = SolidColor(Accent),
            visualTransformation =
                if (password) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
            keyboardOptions = KeyboardOptions(
                keyboardType = if (password) KeyboardType.Password else KeyboardType.Email
            ),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}
