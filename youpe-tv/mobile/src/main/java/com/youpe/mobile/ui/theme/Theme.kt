package com.youpe.mobile.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/** Bảng màu bám theo bản web để ba nền tảng nhìn như một app */
val Bg = Color(0xFF0F0F0F)
val Elev = Color(0xFF212121)
val Chip = Color(0xFF272727)
val Accent = Color(0xFFFF0033)
val TextMain = Color(0xFFF1F1F1)
val TextSub = Color(0xFFAAAAAA)

private val Dark = darkColorScheme(
    primary = Accent,
    onPrimary = Color.White,
    background = Bg,
    onBackground = TextMain,
    surface = Elev,
    onSurface = TextMain,
    surfaceVariant = Chip,
    onSurfaceVariant = TextSub,
)

/**
 * Chỉ có chủ đề tối.
 *
 * Không phải vì lười: app xem video thì nền tối đúng hơn hẳn — mắt đỡ mỏi trong
 * phòng tối và màn OLED bớt tốn pin. Bản web cũng chỉ có tối.
 */
private val Light = Dark

@Composable
fun YoupeTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (isSystemInDarkTheme()) Dark else Light,
        content = content,
    )
}
