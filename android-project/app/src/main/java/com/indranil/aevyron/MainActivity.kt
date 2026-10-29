package com.indranil.aevyron

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.indranil.aevyron.data.AevyronDatabase
import com.indranil.aevyron.nativebridge.LlamaBridge
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val db = AevyronDatabase.getInstance(this)

        setContent {
            val scope = rememberCoroutineScope()
            var selectedTab by remember { mutableStateOf("Chat") }
            var statusMessage by remember { mutableStateOf("Ready for offline GGUF inference on Realme P4 5G") }

            val ggufPickerLauncher = rememberLauncherForActivityResult(
                contract = ActivityResultContracts.OpenDocument()
            ) { uri: Uri? ->
                if (uri != null) {
                    try {
                        contentResolver.takePersistableUriPermission(
                            uri,
                            Intent.FLAG_GRANT_READ_URI_PERMISSION
                        )
                    } catch (_: SecurityException) {
                        // Some document providers do not support persistable grants
                    }
                    scope.launch {
                        statusMessage = "Loading GGUF via SAF zero-copy descriptor..."
                        val result = LlamaBridge.loadModelFromSafUri(
                            contentResolver = contentResolver,
                            uri = uri,
                            nCtx = 2048,
                            nThreads = 4,
                            nBatch = 256,
                            nGpuLayers = 0
                        )
                        statusMessage = result.fold(
                            onSuccess = { "Model initialized in native arm64-v8a memory." },
                            onFailure = { "Load error: ${it.message}" }
                        )
                    }
                }
            }

            MaterialTheme(
                colorScheme = darkColorScheme(
                    primary = Color(0xFF14B8A6),
                    background = Color(0xFF090D16),
                    surface = Color(0xFF111827)
                )
            ) {
                Scaffold(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color(0xFF090D16)),
                    bottomBar = {
                        NavigationBar(containerColor = Color(0xFF111827)) {
                            listOf("Chat", "Memory", "Models", "Settings").forEach { tab ->
                                NavigationBarItem(
                                    selected = selectedTab == tab,
                                    onClick = { selectedTab = tab },
                                    icon = {},
                                    label = { Text(tab) }
                                )
                            }
                        }
                    }
                ) { innerPadding ->
                    Column(
                        modifier = Modifier
                            .padding(innerPadding)
                            .padding(16.dp)
                            .fillMaxSize()
                    ) {
                        Text(
                            text = "Aevyron — Personal Offline AI",
                            style = MaterialTheme.typography.titleLarge,
                            color = Color.White
                        )
                        Text(
                            text = "Created by Indranil Officals",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color(0xFF14B8A6)
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            text = statusMessage,
                            style = MaterialTheme.typography.bodyMedium,
                            color = Color(0xFF94A3B8)
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(onClick = { ggufPickerLauncher.launch(arrayOf("*/*")) }) {
                            Text("Import .gguf Model (SAF)")
                        }
                    }
                }
            }
        }
    }
}
