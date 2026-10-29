package com.indranil.aevyron.nativebridge

import android.content.ContentResolver
import android.net.Uri
import android.os.ParcelFileDescriptor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

interface TokenStreamCallback {
    fun onToken(tokenPiece: String, ttftMs: Long, generatedTokens: Long)
}

/**
 * Native JNI bridge to llama.cpp compiled for 64-bit ARM (arm64-v8a).
 * Uses Android Storage Access Framework (SAF) ParcelFileDescriptor (/proc/self/fd/N)
 * so multi-gigabyte GGUF files in Downloads/internal storage are memory-mapped in-place
 * without making duplicate copies in app-private storage.
 */
object LlamaBridge {
    init {
        System.loadLibrary("aevyron_jni")
        nativeInitBackend()
    }

    private var activeDescriptor: ParcelFileDescriptor? = null

    external fun nativeInitBackend()
    external fun nativeInspectGgufHeader(filePath: String): String
    external fun nativeGetSystemRamInfo(): LongArray
    external fun nativeLoadModel(
        modelPath: String,
        nCtx: Int,
        nThreads: Int,
        nBatch: Int,
        nGpuLayers: Int
    ): Boolean
    external fun nativeGenerateStream(
        prompt: String,
        maxTokens: Int,
        callback: TokenStreamCallback
    ): String
    external fun nativeCancelGeneration()
    external fun nativeUnloadModel()
    external fun nativeGetLastError(): String

    suspend fun loadModelFromSafUri(
        contentResolver: ContentResolver,
        uri: Uri,
        nCtx: Int = 2048,
        nThreads: Int = 4,
        nBatch: Int = 256,
        nGpuLayers: Int = 0
    ): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            activeDescriptor?.close()
            val pfd = contentResolver.openFileDescriptor(uri, "r")
                ?: error("Unable to open SAF file descriptor for URI: $uri")
            activeDescriptor = pfd
            val fdPath = "/proc/self/fd/${pfd.fd}"
            val loaded = nativeLoadModel(fdPath, nCtx, nThreads, nBatch, nGpuLayers)
            if (!loaded) {
                pfd.close()
                activeDescriptor = null
                error(nativeGetLastError().ifBlank { "Native llama.cpp model initialization failed." })
            }
        }
    }

    suspend fun unloadSafModel() = withContext(Dispatchers.IO) {
        nativeUnloadModel()
        activeDescriptor?.close()
        activeDescriptor = null
    }
}
