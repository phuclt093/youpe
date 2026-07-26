package com.youpe.tv.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.darkColorScheme

val Bg = Color(0xFF0F0F0F)
val Surface = Color(0xFF212121)
val Hover = Color(0xFF383838)
val TextMain = Color(0xFFF1F1F1)
val TextSub = Color(0xFFAAAAAA)
val Accent = Color(0xFFFF0033)

@Composable
fun YoupeTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Accent,
            background = Bg,
            surface = Surface,
            onBackground = TextMain,
            onSurface = TextMain,
        ),
        content = content
    )
}
