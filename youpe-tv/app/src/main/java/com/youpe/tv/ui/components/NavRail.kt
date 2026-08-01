package com.youpe.tv.ui.components

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.ClickableSurfaceDefaults
import androidx.tv.material3.Surface
import androidx.tv.material3.Text
import com.youpe.tv.ui.theme.Accent

/**
 * Menu dọc bám mép trái, kiểu chuẩn của Android TV.
 *
 * Bình thường chỉ hiện biểu tượng cho gọn; đẩy tiêu điểm sang trái là nó bung ra kèm
 * chữ. Đây là cách duy nhất hợp lý trên TV — không có chuột để rê, mà bắt người dùng
 * nhớ biểu tượng nào là gì thì quá khó.
 *
 * Chữ dùng làm biểu tượng thay vì ảnh vector: TV box đời cũ vẽ vector chậm, mà một
 * ký tự thì hệ thống đã có sẵn trong bộ đệm phông.
 */
data class NavItem(val key: String, val label: String, val glyph: String)

@Composable
fun NavRail(
    items: List<NavItem>,
    selected: String,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var expanded by remember { mutableStateOf(false) }

    Column(
        modifier
            .fillMaxHeight()
            .background(Color(0xEE0F0F0F))
            .onFocusChanged { expanded = it.hasFocus }
            .animateContentSize()
            .width(if (expanded) 200.dp else 68.dp)
            .padding(vertical = 24.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        items.forEach { item ->
            RailButton(
                item = item,
                expanded = expanded,
                active = item.key == selected,
                onClick = { onSelect(item.key) },
            )
        }
    }
}

@Composable
private fun RailButton(
    item: NavItem,
    expanded: Boolean,
    active: Boolean,
    onClick: () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()

    Surface(
        onClick = onClick,
        interactionSource = interaction,
        shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(10.dp)),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = if (active) Color(0xFF272727) else Color.Transparent,
            focusedContainerColor = Accent,
        ),
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 10.dp)
            .height(46.dp),
    ) {
        Row(
            Modifier.fillMaxSize().padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                item.glyph,
                fontSize = 18.sp,
                color = Color.White,
            )
            if (expanded) {
                Text(
                    item.label,
                    fontSize = 15.sp,
                    color = Color.White,
                    fontWeight = if (active || focused) FontWeight.Medium else FontWeight.Normal,
                    modifier = Modifier.padding(start = 14.dp),
                )
            }
        }
    }
}
