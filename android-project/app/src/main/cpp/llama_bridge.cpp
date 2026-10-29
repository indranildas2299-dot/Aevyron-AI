#include <jni.h>
#include <android/log.h>
#include <atomic>
#include <chrono>
#include <cstring>
#include <fstream>
#include <mutex>
#include <sstream>
#include <string>
#include <vector>
#include <sys/sysinfo.h>

#ifdef AEVYRON_HAS_LLAMA_CPP
#include "llama.h"
#endif

#define LOG_TAG "AevyronJNI"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

namespace {
std::mutex g_engine_mutex;
std::atomic<bool> g_cancel_requested{false};
std::string g_last_error;

#ifdef AEVYRON_HAS_LLAMA_CPP
llama_model* g_model = nullptr;
llama_context* g_ctx = nullptr;
#endif

bool verifyGgufMagic(const char* path, uint32_t& outVersion, uint64_t& outTensorCount, uint64_t& outKvCount) {
    std::ifstream file(path, std::ios::binary);
    if (!file.is_open()) {
        g_last_error = "Cannot open GGUF file descriptor/path. Verify SAF URI permission.";
        return false;
    }
    char magic[4] = {0};
    file.read(magic, 4);
    if (file.gcount() != 4 || std::memcmp(magic, "GGUF", 4) != 0) {
        g_last_error = "Invalid file signature: expected 'GGUF' (0x47475546) header.";
        return false;
    }
    file.read(reinterpret_cast<char*>(&outVersion), sizeof(uint32_t));
    file.read(reinterpret_cast<char*>(&outTensorCount), sizeof(uint64_t));
    file.read(reinterpret_cast<char*>(&outKvCount), sizeof(uint64_t));
    if (outVersion < 2 || outVersion > 3) {
        g_last_error = "Unsupported GGUF specification version: " + std::to_string(outVersion);
        return false;
    }
    return true;
}
} // namespace

extern "C" JNIEXPORT void JNICALL
Java_com_indranil_aevyron_nativebridge_LlamaBridge_nativeInitBackend(JNIEnv* /*env*/, jobject /*thiz*/) {
#ifdef AEVYRON_HAS_LLAMA_CPP
    llama_backend_init();
    LOGI("llama.cpp backend initialized for arm64-v8a");
#else
    LOGI("Aevyron JNI initialized (llama.cpp submodule not linked in this build)");
#endif
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_indranil_aevyron_nativebridge_LlamaBridge_nativeInspectGgufHeader(
    JNIEnv* env,
    jobject /*thiz*/,
    jstring jFilePath
) {
    const char* path = env->GetStringUTFChars(jFilePath, nullptr);
    uint32_t version = 0;
    uint64_t tensorCount = 0;
    uint64_t kvCount = 0;
    bool ok = verifyGgufMagic(path, version, tensorCount, kvCount);
    env->ReleaseStringUTFChars(jFilePath, path);

    std::ostringstream oss;
    if (!ok) {
        oss << "{\"valid\":false,\"error\":\"" << g_last_error << "\"}";
    } else {
        oss << "{\"valid\":true,\"version\":" << version
            << ",\"tensorCount\":" << tensorCount
            << ",\"kvCount\":" << kvCount << "}";
    }
    return env->NewStringUTF(oss.str().c_str());
}

extern "C" JNIEXPORT jlongArray JNICALL
Java_com_indranil_aevyron_nativebridge_LlamaBridge_nativeGetSystemRamInfo(JNIEnv* env, jobject /*thiz*/) {
    struct sysinfo memInfo{};
    sysinfo(&memInfo);
    jlong totalRamBytes = static_cast<jlong>(memInfo.totalram) * memInfo.mem_unit;
    jlong freeRamBytes = static_cast<jlong>(memInfo.freeram) * memInfo.mem_unit;
    jlong result[2] = {totalRamBytes, freeRamBytes};
    jlongArray out = env->NewLongArray(2);
    env->SetLongArrayRegion(out, 0, 2, result);
    return out;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_indranil_aevyron_nativebridge_LlamaBridge_nativeLoadModel(
    JNIEnv* env,
    jobject /*thiz*/,
    jstring jModelPath,
    jint nCtx,
    jint nThreads,
    jint nBatch,
    jint nGpuLayers
) {
    std::lock_guard<std::mutex> lock(g_engine_mutex);
    g_cancel_requested.store(false);
    const char* path = env->GetStringUTFChars(jModelPath, nullptr);

    uint32_t version = 0;
    uint64_t tensors = 0;
    uint64_t kvs = 0;
    if (!verifyGgufMagic(path, version, tensors, kvs)) {
        env->ReleaseStringUTFChars(jModelPath, path);
        return JNI_FALSE;
    }

#ifdef AEVYRON_HAS_LLAMA_CPP
    if (g_ctx != nullptr) {
        llama_free(g_ctx);
        g_ctx = nullptr;
    }
    if (g_model != nullptr) {
        llama_model_free(g_model);
        g_model = nullptr;
    }

    llama_model_params model_params = llama_model_default_params();
    model_params.n_gpu_layers = nGpuLayers;
    model_params.use_mmap = true; // Use mmap via SAF /proc/self/fd without copying multi-GB files

    g_model = llama_model_load_from_file(path, model_params);
    env->ReleaseStringUTFChars(jModelPath, path);

    if (g_model == nullptr) {
        g_last_error = "llama_model_load_from_file failed. Model architecture may be unsupported or exceeds Realme P4 5G available RAM.";
        LOGE("%s", g_last_error.c_str());
        return JNI_FALSE;
    }

    llama_context_params ctx_params = llama_context_default_params();
    ctx_params.n_ctx = static_cast<uint32_t>(nCtx > 0 ? nCtx : 2048);
    ctx_params.n_batch = static_cast<uint32_t>(nBatch > 0 ? nBatch : 256);
    ctx_params.n_threads = nThreads > 0 ? nThreads : 4;
    ctx_params.n_threads_batch = nThreads > 0 ? nThreads : 4;

    g_ctx = llama_init_from_model(g_model, ctx_params);
    if (g_ctx == nullptr) {
        llama_model_free(g_model);
        g_model = nullptr;
        g_last_error = "Failed to allocate KV cache for context length " + std::to_string(nCtx);
        LOGE("%s", g_last_error.c_str());
        return JNI_FALSE;
    }

    LOGI("Model loaded successfully with n_ctx=%d, threads=%d", nCtx, nThreads);
    return JNI_TRUE;
#else
    env->ReleaseStringUTFChars(jModelPath, path);
    g_last_error = "Native binary compiled without llama.cpp submodule.";
    return JNI_FALSE;
#endif
}

extern "C" JNIEXPORT void JNICALL
Java_com_indranil_aevyron_nativebridge_LlamaBridge_nativeCancelGeneration(JNIEnv* /*env*/, jobject /*thiz*/) {
    g_cancel_requested.store(true);
}

extern "C" JNIEXPORT void JNICALL
Java_com_indranil_aevyron_nativebridge_LlamaBridge_nativeUnloadModel(JNIEnv* /*env*/, jobject /*thiz*/) {
    g_cancel_requested.store(true);
    std::lock_guard<std::mutex> lock(g_engine_mutex);
#ifdef AEVYRON_HAS_LLAMA_CPP
    if (g_ctx != nullptr) {
        llama_free(g_ctx);
        g_ctx = nullptr;
    }
    if (g_model != nullptr) {
        llama_model_free(g_model);
        g_model = nullptr;
    }
#endif
    LOGI("Native model and KV cache released.");
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_indranil_aevyron_nativebridge_LlamaBridge_nativeGetLastError(JNIEnv* env, jobject /*thiz*/) {
    return env->NewStringUTF(g_last_error.c_str());
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_indranil_aevyron_nativebridge_LlamaBridge_nativeGenerateStream(
    JNIEnv* env,
    jobject /*thiz*/,
    jstring jPrompt,
    jint maxTokens,
    jobject callback
) {
    std::lock_guard<std::mutex> lock(g_engine_mutex);
    g_cancel_requested.store(false);

#ifdef AEVYRON_HAS_LLAMA_CPP
    if (g_model == nullptr || g_ctx == nullptr) {
        g_last_error = "No GGUF model is currently initialized in native memory.";
        return env->NewStringUTF("");
    }

    const char* promptCStr = env->GetStringUTFChars(jPrompt, nullptr);
    std::string prompt(promptCStr);
    env->ReleaseStringUTFChars(jPrompt, promptCStr);

    jclass cbClass = env->GetObjectClass(callback);
    jmethodID onTokenMethod = env->GetMethodID(cbClass, "onToken", "(Ljava/lang/String;JJ)V");

    const auto tStart = std::chrono::steady_clock::now();
    long long ttftMs = -1;

    const llama_vocab* vocab = llama_model_get_vocab(g_model);
    std::vector<llama_token> tokens(prompt.size() + 16);
    int nPromptTokens = llama_tokenize(
        vocab,
        prompt.c_str(),
        static_cast<int>(prompt.size()),
        tokens.data(),
        static_cast<int>(tokens.size()),
        true,
        true
    );
    if (nPromptTokens < 0) {
        tokens.resize(-nPromptTokens);
        nPromptTokens = llama_tokenize(
            vocab,
            prompt.c_str(),
            static_cast<int>(prompt.size()),
            tokens.data(),
            static_cast<int>(tokens.size()),
            true,
            true
        );
    }
    tokens.resize(nPromptTokens);

    llama_kv_cache_clear(g_ctx);
    llama_batch batch = llama_batch_get_one(tokens.data(), static_cast<int32_t>(tokens.size()));
    if (llama_decode(g_ctx, batch) != 0) {
        g_last_error = "llama_decode failed during prompt prefill.";
        return env->NewStringUTF("");
    }

    auto sparams = llama_sampler_chain_default_params();
    llama_sampler* sampler = llama_sampler_chain_init(sparams);
    llama_sampler_chain_add(sampler, llama_sampler_init_temp(0.7f));
    llama_sampler_chain_add(sampler, llama_sampler_init_dist(LLAMA_DEFAULT_SEED));

    std::string fullResponse;
    int generatedCount = 0;

    for (int i = 0; i < maxTokens && !g_cancel_requested.load(); ++i) {
        llama_token newTokenId = llama_sampler_sample(sampler, g_ctx, -1);
        if (llama_vocab_is_eog(vocab, newTokenId)) {
            break;
        }

        char piece[256];
        int nChars = llama_token_to_piece(vocab, newTokenId, piece, sizeof(piece), 0, true);
        if (nChars > 0) {
            std::string tokenStr(piece, nChars);
            fullResponse += tokenStr;
            generatedCount++;

            auto now = std::chrono::steady_clock::now();
            long long elapsedMs = std::chrono::duration_cast<std::chrono::milliseconds>(now - tStart).count();
            if (ttftMs < 0) {
                ttftMs = elapsedMs;
            }

            jstring jPiece = env->NewStringUTF(tokenStr.c_str());
            env->CallVoidMethod(callback, onTokenMethod, jPiece, static_cast<jlong>(ttftMs), static_cast<jlong>(generatedCount));
            env->DeleteLocalRef(jPiece);
        }

        batch = llama_batch_get_one(&newTokenId, 1);
        if (llama_decode(g_ctx, batch) != 0) {
            break;
        }
    }

    llama_sampler_free(sampler);
    return env->NewStringUTF(fullResponse.c_str());
#else
    (void)jPrompt;
    (void)maxTokens;
    (void)callback;
    return env->NewStringUTF("");
#endif
}
