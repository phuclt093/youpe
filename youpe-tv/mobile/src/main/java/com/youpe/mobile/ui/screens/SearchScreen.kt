package com.youpe.mobile.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.youpe.core.data.VideoItem
import com.youpe.mobile.AppState
import com.youpe.mobile.ui.components.Loading
import com.youpe.mobile.ui.components.Message
import com.youpe.mobile.ui.components.VideoRow
import kotlinx.coroutines.launch

@Composable
fun SearchScreen(onOpen: (String) -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val keyboard = LocalSoftwareKeyboardController.current

    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<VideoItem>>(emptyList()) }
    var searching by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var searched by remember { mutableStateOf(false) }

    fun run() {
        if (query.isBlank()) return
        keyboard?.hide()
        scope.launch {
            searching = true
            searched = true
            error = ""
            runCatching { AppState.api(ctx).search(query.trim()) }
                .onSuccess {
                    results = it.videos
                    if (it.videos.isEmpty()) error = it.error ?: "Không tìm thấy video nào"
                }
                .onFailure { error = it.message ?: "Không kết nối được tới server" }
            searching = false
        }
    }

    Column(Modifier.fillMaxSize()) {
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            singleLine = true,
            placeholder = { Text("Tìm video") },
            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { run() }),
            modifier = Modifier.fillMaxWidth().padding(12.dp),
        )

        when {
            searching -> Loading()
            !searched -> Message("Nhập từ khoá để tìm")
            results.isEmpty() -> Message("Không có kết quả", error)
            else -> LazyColumn(Modifier.fillMaxSize()) {
                items(results, key = { it.id }) { v -> VideoRow(v) { onOpen(v.id) } }
            }
        }
    }
}
