package com.youpe.mobile

import android.app.PictureInPictureParams
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Rational
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.youpe.core.player.PlaybackService
import com.youpe.core.player.PlayerHolder
import com.youpe.mobile.ui.YoupeApp
import com.youpe.mobile.ui.theme.YoupeTheme

/**
 * Cửa sổ duy nhất của app.
 *
 * Trình phát **không** sống ở đây mà ở `PlaybackService`. Activity chỉ mượn nó về
 * để hiển thị. Nhờ vậy xoay máy, tắt màn hình hay chuyển sang app khác đều không
 * làm video dừng — đúng vấn đề mà bản web phải giải bằng thủ thuật di chuyển thẻ DOM.
 */
class MainActivity : ComponentActivity() {

    private var controller: MediaController? = null

    /** Màn hình xem có đang mở không — chỉ lúc đó mới thu về cửa sổ nổi mới có nghĩa */
    var watching by mutableStateOf(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // dịch vụ phải chạy trước, giao diện chờ `PlayerHolder` báo sẵn sàng
        ContextCompat.startForegroundService(this, Intent(this, PlaybackService::class.java))
        connectController()

        setContent {
            YoupeTheme {
                YoupeApp(
                    onWatchingChanged = { watching = it },
                    onRequestPip = { enterPipIfPossible() },
                )
            }
        }
    }

    /**
     * Nối tới dịch vụ phát.
     *
     * `MediaController` là cầu nối chính thức: nó gửi lệnh qua `MediaSession` nên
     * điều khiển ở thanh thông báo, tai nghe bluetooth và giao diện luôn nhất quán
     * với nhau. Điều khiển thẳng `ExoPlayer` sẽ khiến ba nơi này lệch nhau.
     */
    private fun connectController() {
        val token = SessionToken(this, android.content.ComponentName(this, PlaybackService::class.java))
        val future = MediaController.Builder(this, token).buildAsync()
        future.addListener(
            {
                controller = runCatching { future.get() }.getOrNull()
                controller?.let { PlayerHolder.attach(it) }
            },
            // Executor của androidx thay vì của guava — bớt một phụ thuộc phải phỏng đoán
            ContextCompat.getMainExecutor(this),
        )
    }

    private fun supportsPip(): Boolean =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)

    fun enterPipIfPossible() {
        if (!supportsPip() || !watching) return
        val player = PlayerHolder.player.value ?: return
        if (!player.isPlaying) return

        val params = PictureInPictureParams.Builder()
            .setAspectRatio(Rational(16, 9))
            .build()
        runCatching { enterPictureInPictureMode(params) }
    }

    /**
     * Người dùng bấm nút Home hoặc vuốt lên.
     *
     * Android gọi hàm này **trước** khi thu app xuống, và đây là cơ hội duy nhất để
     * chuyển sang cửa sổ nổi. Gọi muộn hơn (`onPause`, `onStop`) thì hệ thống đã
     * quyết định xong và lệnh bị bỏ qua.
     */
    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        enterPipIfPossible()
    }

    override fun onDestroy() {
        controller?.release()
        controller = null
        super.onDestroy()
    }
}
