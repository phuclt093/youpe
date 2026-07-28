package com.youpe.tv.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Surface
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import com.youpe.core.data.VideoItem
import com.youpe.tv.ui.theme.Accent
import com.youpe.tv.ui.theme.TextSub

/**
 * Card video cho TV.
 *
 * Trên TV không có con trỏ chuột, nên trạng thái "đang chọn" phải nhìn thấy rõ từ
 * khoảng cách 2–3 mét: phóng to nhẹ cộng viền sáng, thay vì đổi màu nền tinh tế
 * như bản web.
 */
@Composable
fun VideoCard(
    item: VideoItem,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    width: Int = 260,
) {
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val scale by animateFloatAsState(if (focused) 1.08f else 1f, label = "cardScale")

    Column(
        modifier
            .width(width.dp)
            .scale(scale)
    ) {
        Surface(
            onClick = onClick,
            interactionSource = interaction,
            shape = androidx.tv.material3.ClickableSurfaceDefaults.shape(RoundedCornerShape(10.dp)),
            colors = androidx.tv.material3.ClickableSurfaceDefaults.colors(
                containerColor = Color(0xFF212121),
                focusedContainerColor = Color(0xFF212121),
            ),
            modifier = Modifier
                .width(width.dp)
                .height((width * 9 / 16).dp)
                .then(
                    if (focused) Modifier.border(3.dp, Accent, RoundedCornerShape(10.dp))
                    else Modifier
                )
        ) {
            Box(Modifier.fillMaxSize()) {
                AsyncImage(
                    model = item.thumbnail,
                    contentDescription = item.title,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize().clip(RoundedCornerShape(10.dp))
                )

                val badge = if (item.isLive) "TRỰC TIẾP" else item.durationText
                if (badge.isNotEmpty()) {
                    Text(
                        text = badge,
                        color = Color.White,
                        fontSize = 11.sp,
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .padding(6.dp)
                            .background(
                                if (item.isLive) Accent else Color(0xCC000000),
                                RoundedCornerShape(4.dp)
                            )
                            .padding(horizontal = 5.dp, vertical = 2.dp)
                    )
                }
            }
        }

        Spacer(Modifier.height(8.dp))

        Text(
            text = item.title,
            color = Color.White,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            lineHeight = 18.sp,
        )
        Text(
            text = item.author.name,
            color = TextSub,
            fontSize = 12.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (item.viewsText.isNotEmpty()) {
            Text(item.viewsText, color = TextSub, fontSize = 11.sp, maxLines = 1)
        }
    }
}
