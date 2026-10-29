# Aevyron — Complete Personal Offline AI for Android

**Created by Indranil Officals**

Target Device Profile: **Realme P4 5G (8 GB RAM, 256 GB Storage, 64-bit ARM `arm64-v8a`)**

## Phone-Only Cloud APK Build & Installation Instructions (No PC Required)

Because you are developing and installing directly from your Realme P4 5G without a PC:

### Option 1: Install the Instant Offline PWA Directly on Your Realme P4 5G
1. Open the running Aevyron application in Chrome or Brave on your Realme P4 5G.
2. Tap **Install App** in the top header (or tap browser menu -> **Add to Home screen / Install app**).
3. All chats, long-term personal memories, registered `.gguf` metadata, and custom device wallpapers are persisted locally in IndexedDB/LocalStorage and cached for offline execution via the Service Worker.
4. For local native GGUF inference on your phone without rebuilding an APK, you can also run `llama-server -m /sdcard/Download/your-model.gguf --port 8080` inside Termux on your Realme P4 5G and Aevyron will stream directly from `http://127.0.0.1:8080` offline!

### Option 2: Compile the Native `arm64-v8a` APK in the Cloud via GitHub Actions (From Your Phone Browser)
1. Download `aevyron-android-source.zip` from the **Settings -> Android APK & Source** tab inside Aevyron.
2. Create a free repository on GitHub from your phone's browser and upload the extracted project files (preserving `.github/workflows/build-apk.yml`).
3. Open the **Actions** tab in your GitHub repository and tap **Run workflow** on **Build Aevyron Android APK (arm64-v8a)**.
4. GitHub Actions automatically:
   - Clones upstream `https://github.com/ggml-org/llama.cpp` into `app/src/main/cpp/llama.cpp`.
   - Configures JDK 17, Android SDK 35, CMake 3.22.1, and Android NDK `26.3.11579264`.
   - Compiles the C++17 JNI library (`libaevyron_jni.so`) with `-march=armv8.2-a+dotprod+fp16` SIMD optimizations for the Realme P4 5G.
   - Publishes `aevyron-arm64-v8a-debug-apk` as a downloadable artifact.
5. Download the APK artifact on your Realme P4 5G, tap the `.apk` file in the **Files by Google / Realme File Manager**, confirm **"Allow from this source"** when prompted by Android Package Installer, and tap **Install**.
