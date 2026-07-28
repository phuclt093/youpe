package com.youpe.mobile.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.youpe.core.data.VideoItem
import com.youpe.mobile.ui.theme.Accent
import com.youpe.mobile.ui.theme.Elev
import com.youpe.mobile.ui.theme.TextSub

/**
 * Thẻ video kiểu YouTube trên điện thoại: ảnh rộng hết màn hình, thông tin bên dưới.
 *
 * Khác hẳn bản TV (thẻ nhỏ xếp lưới ngang) vì điện thoại cầm dọc và ngón tay cần
 * vùng chạm lớn.
 */
@Composable
fun VideoRow(v: VideoItem, onClick: () -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(bottom = 16.dp)
    ) {
        Box(
            Modifier
                .fillMaxWidth()
                .aspectRatio(16f / 9f)
                .background(Elev)
        ) {
            AsyncImage(
                model = v.thumbnail,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )

            val badge = if (v.isLive) "TRỰC TIẾP" else v.durationText
            if (badge.isNotEmpty()) {
                Text(
                    badge,
                    fontSize = 11.sp,
                    color = androidx.compose.ui.graphics.Color.White,
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(6.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(if (v.isLive) Accent else androidx.compose.ui.graphics.Color(0xCC000000))
                        .padding(horizontal = 5.dp, vertical = 2.dp),
                )
            }
        }

        Row(Modifier.padding(start = 12.dp, end = 12.dp, top = 10.dp)) {
            AsyncImage(
                model = v.author.avatar,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(Elev),
            )

            Column(Modifier.padding(start = 10.dp)) {
                Text(
                    v.title,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                    lineHeight = 19.sp,
                    color = MaterialTheme.colorScheme.onBackground,
                )
                Text(
                    listOf(v.author.name, v.viewsText, v.publishedText)
                        .filter { it.isNotEmpty() }
                        .joinToString(" · "),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    fontSize = 12.sp,
                    color = TextSub,
                    modifier = Modifier.padding(top = 3.dp),
                )
            }
        }
    }
}

@Composable
fun Loading(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = Accent, strokeWidth = 2.dp)
    }
}

@Composable
fun Message(title: String, hint: String = "", modifier: Modifier = Modifier) {
    Box(modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(title, fontSize = 16.sp, fontWeight = FontWeight.Medium)
            if (hint.isNotEmpty()) {
                Text(
                    hint,
                    fontSize = 13.sp,
                    color = TextSub,
                    modifier = Modifier.padding(top = 6.dp),
                )
            }
        }
    }
}
