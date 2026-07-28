package com.youpe.mobile

import android.content.Context
import com.youpe.core.data.Api
import com.youpe.core.data.Settings
import com.youpe.core.data.User
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first

/**
 * Giữ đúng một `Api` cho cả app.
 *
 * Mỗi `Api` mang theo một `HttpClient` với bể kết nối và **hộp cookie riêng**. Tạo
 * mới ở từng màn hình thì mỗi màn hình sẽ là một phiên đăng nhập khác nhau — người
 * dùng đăng nhập ở màn hình này, sang màn hình kia lại thấy chưa đăng nhập.
 */
object AppState {

    private var api: Api? = null
    private var apiBase: String = ""

    private val _user = MutableStateFlow<User?>(null)
    val user: StateFlow<User?> = _user

    /** Trả về client cho địa chỉ server hiện tại, dựng lại nếu người dùng đổi địa chỉ */
    suspend fun api(ctx: Context): Api {
        val base = Settings.serverUrl(ctx.applicationContext).first()

        val cur = api
        if (cur != null && apiBase == base) return cur

        cur?.close()
        return Api(base).also {
            api = it
            apiBase = base
        }
    }

    suspend fun refreshUser(ctx: Context) {
        _user.value = runCatching { api(ctx).me().user }.getOrNull()
    }

    fun setUser(u: User?) {
        _user.value = u
    }

    suspend fun logout(ctx: Context) {
        runCatching { api(ctx).logout() }
        _user.value = null
    }
}
