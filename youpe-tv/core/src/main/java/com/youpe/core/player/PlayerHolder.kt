package com.youpe.core.player

import androidx.media3.common.Player
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * Chỗ giao nhau giữa dịch vụ phát và giao diện.
 *
 * Dịch vụ tạo ra `ExoPlayer` và sở hữu nó; giao diện chỉ mượn để gắn vào khung
 * hình và đọc trạng thái. Để ở dạng `StateFlow` thay vì biến thường vì giao diện
 * có thể được dựng trước khi dịch vụ kịp khởi động, và nó cần biết lúc nào thì
 * trình phát sẵn sàng.
 */
object PlayerHolder {

    private val _player = MutableStateFlow<Player?>(null)
    val player: StateFlow<Player?> = _player

    /** Video đang phát, để giao diện biết mà hiện đúng thông tin */
    var currentVideoId: String? = null
        private set

    fun attach(p: Player) {
        _player.value = p
    }

    fun detach() {
        _player.value = null
        currentVideoId = null
    }

    fun markPlaying(videoId: String?) {
        currentVideoId = videoId
    }
}
