package com.youpe.tv

import android.content.Context
import com.youpe.core.data.Api
import com.youpe.core.data.Settings
import com.youpe.core.data.User
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first

/**
 * Giữ đúng một `Api` cho cả app TV.
 *
 * Mỗi `Api` mang theo hộp cookie riêng, mà đăng nhập bên server dựa vào cookie phiên.
 * Tạo mới ở từng màn hình thì mỗi màn hình là một phiên khác nhau — đăng nhập ở màn
 * này, sang màn kia lại thấy chưa đăng nhập.
 *
 * Trước đây từng màn hình TV tự `Api(serverUrl)` rồi `close()`; chấp nhận được khi
 * chưa có tài khoản, nhưng giờ thì không.
 */
object TvState {

    private var api: Api? = null
    private var apiBase: String = ""

    private val _user = MutableStateFlow<User?>(null)
    val user: StateFlow<User?> = _user

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
