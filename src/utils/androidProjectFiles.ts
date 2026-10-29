export interface AndroidSourceFile {
  path: string;
  language: string;
  description: string;
  content: string;
}

export const ANDROID_PROJECT_FILES: AndroidSourceFile[] = [
  {
    path: '.github/workflows/build-apk.yml',
    language: 'yaml',
    description: 'Reproducible Cloud APK Builder for Realme P4 5G (arm64-v8a) when no PC is available.',
    content: `name: Build Aevyron Android APK (arm64-v8a)

on:
  workflow_dispatch:
  push:
    branches: [ main, master ]

jobs:
  build-android-apk:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Aevyron Source
        uses: actions/checkout@v4

      - name: Clone Upstream llama.cpp into JNI Tree
        run: |
          rm -rf app/src/main/cpp/llama.cpp
          git clone --depth 1 https://github.com/ggml-org/llama.cpp.git app/src/main/cpp/llama.cpp

      - name: Set up JDK 17
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'

      - name: Setup Android SDK & NDK r26d
        uses: android-actions/setup-android@v3

      - name: Install NDK 26.3.11579264 & CMake 3.22.1
        run: |
          sdkmanager --install "ndk;26.3.11579264" "cmake;3.22.1" "platforms;android-35" "build-tools;35.0.0"

      - name: Run Unit Tests & Build Debug APK (arm64-v8a for Realme P4 5G)
        run: |
          gradle testDebugUnitTest assembleDebug --stacktrace

      - name: Upload Installable Aevyron APK Artifact
        uses: actions/upload-artifact@v4
        with:
          name: aevyron-arm64-v8a-debug-apk
          path: app/build/outputs/apk/debug/app-debug.apk
          if-no-files-found: error`,
  },
  {
    path: 'app/build.gradle.kts',
    language: 'kotlin',
    description: 'Pinned Android Gradle configuration targeting SDK 35, NDK 26.3, CMake 3.22.1, Room 2.6.1, and arm64-v8a.',
    content: `plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("com.google.devtools.ksp")
}

android {
    namespace = "com.indranil.aevyron"
    compileSdk = 35
    ndkVersion = "26.3.11579264"

    defaultConfig {
        applicationId = "com.indranil.aevyron"
        minSdk = 28
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0-realme-p4"

        ndk {
            abiFilters += listOf("arm64-v8a")
        }

        externalNativeBuild {
            cmake {
                cppFlags += listOf("-std=c++17", "-O3", "-DNDEBUG")
                arguments += listOf(
                    "-DANDROID_STL=c++_shared",
                    "-DANDROID_ARM_NEON=ON",
                    "-DGGML_OPENMP=OFF"
                )
            }
        }
    }
}`,
  },
  {
    path: 'app/src/main/cpp/CMakeLists.txt',
    language: 'cmake',
    description: 'Native CMake build linking upstream llama.cpp with armv8.2-a+dotprod+fp16 SIMD acceleration.',
    content: `cmake_minimum_required(VERSION 3.22.1)
project("aevyron_jni" C CXX)

set(CMAKE_CXX_STANDARD 17)
if (\${ANDROID_ABI} STREQUAL "arm64-v8a")
    add_compile_options(-march=armv8.2-a+dotprod+fp16 -O3 -ffast-math -funroll-loops)
endif()

set(LLAMA_CPP_DIR "\${CMAKE_CURRENT_SOURCE_DIR}/llama.cpp")
if (EXISTS "\${LLAMA_CPP_DIR}/CMakeLists.txt")
    add_subdirectory(\${LLAMA_CPP_DIR} build-llama)
    add_compile_definitions(AEVYRON_HAS_LLAMA_CPP=1)
endif()

add_library(aevyron_jni SHARED llama_bridge.cpp)
target_link_libraries(aevyron_jni llama ggml common log android)`,
  },
  {
    path: 'app/src/main/cpp/llama_bridge.cpp',
    language: 'cpp',
    description: 'JNI boundary implementing GGUF magic header check, mmap model loading, token streaming, TTFT timing, and atomic cancellation.',
    content: `// Excerpt from android-project/app/src/main/cpp/llama_bridge.cpp
extern "C" JNIEXPORT jboolean JNICALL
Java_com_indranil_aevyron_nativebridge_LlamaBridge_nativeLoadModel(
    JNIEnv* env, jobject, jstring jModelPath, jint nCtx, jint nThreads, jint nBatch, jint nGpuLayers
) {
    std::lock_guard<std::mutex> lock(g_engine_mutex);
    const char* path = env->GetStringUTFChars(jModelPath, nullptr);
    llama_model_params model_params = llama_model_default_params();
    model_params.n_gpu_layers = nGpuLayers;
    model_params.use_mmap = true; // Memory-maps SAF /proc/self/fd without copying multi-GB files
    g_model = llama_model_load_from_file(path, model_params);
    env->ReleaseStringUTFChars(jModelPath, path);
    if (!g_model) return JNI_FALSE;

    llama_context_params ctx_params = llama_context_default_params();
    ctx_params.n_ctx = nCtx > 0 ? nCtx : 2048;
    ctx_params.n_batch = nBatch > 0 ? nBatch : 256;
    ctx_params.n_threads = nThreads > 0 ? nThreads : 4;
    g_ctx = llama_init_from_model(g_model, ctx_params);
    return g_ctx != nullptr ? JNI_TRUE : JNI_FALSE;
}`,
  },
  {
    path: 'app/src/main/java/com/indranil/aevyron/nativebridge/LlamaBridge.kt',
    language: 'kotlin',
    description: 'Zero-copy Android SAF ContentResolver file descriptor wrapper (/proc/self/fd/N).',
    content: `package com.indranil.aevyron.nativebridge

import android.content.ContentResolver
import android.net.Uri
import android.os.ParcelFileDescriptor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

object LlamaBridge {
    init {
        System.loadLibrary("aevyron_jni")
        nativeInitBackend()
    }
    private var activeDescriptor: ParcelFileDescriptor? = null

    external fun nativeInitBackend()
    external fun nativeLoadModel(modelPath: String, nCtx: Int, nThreads: Int, nBatch: Int, nGpuLayers: Int): Boolean
    external fun nativeCancelGeneration()
    external fun nativeUnloadModel()

    suspend fun loadModelFromSafUri(
        contentResolver: ContentResolver,
        uri: Uri,
        nCtx: Int = 2048,
        nThreads: Int = 4
    ): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            activeDescriptor?.close()
            val pfd = contentResolver.openFileDescriptor(uri, "r")
                ?: error("Unable to open SAF descriptor")
            activeDescriptor = pfd
            val fdPath = "/proc/self/fd/\${pfd.fd}"
            check(nativeLoadModel(fdPath, nCtx, nThreads, 256, 0)) {
                "Native llama.cpp initialization failed"
            }
        }
    }
}`,
  },
  {
    path: 'app/src/main/java/com/indranil/aevyron/data/AevyronDatabase.kt',
    language: 'kotlin',
    description: 'Room persistent SQLite database with Conversation, Message, MemoryFact, RegisteredModel entities & Migration(1, 2).',
    content: `@Database(
    entities = [
        ConversationEntity::class,
        MessageEntity::class,
        MemoryFactEntity::class,
        RegisteredModelEntity::class
    ],
    version = 2,
    exportSchema = true
)
abstract class AevyronDatabase : RoomDatabase() {
    abstract fun dao(): AevyronDao
    companion object {
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE registered_models ADD COLUMN supportsAudio INTEGER NOT NULL DEFAULT 0")
            }
        }
    }
}`,
  },
];
