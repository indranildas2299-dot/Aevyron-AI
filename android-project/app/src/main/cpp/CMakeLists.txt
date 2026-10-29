cmake_minimum_required(VERSION 3.22.1)
project("aevyron_jni" C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Optimize for Realme P4 5G 64-bit ARMv8.2-A (dotprod + fp16 SIMD acceleration)
if (${ANDROID_ABI} STREQUAL "arm64-v8a")
    add_compile_options(-march=armv8.2-a+dotprod+fp16 -O3 -ffast-math -funroll-loops)
endif()

# Point to upstream llama.cpp source tree (cloned into app/src/main/cpp/llama.cpp in CI or local checkout)
set(LLAMA_CPP_DIR "${CMAKE_CURRENT_SOURCE_DIR}/llama.cpp")

if (EXISTS "${LLAMA_CPP_DIR}/CMakeLists.txt")
    set(LLAMA_BUILD_TESTS OFF CACHE BOOL "" FORCE)
    set(LLAMA_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
    set(LLAMA_BUILD_SERVER OFF CACHE BOOL "" FORCE)
    set(GGML_OPENMP OFF CACHE BOOL "" FORCE)
    add_subdirectory(${LLAMA_CPP_DIR} build-llama)
    add_compile_definitions(AEVYRON_HAS_LLAMA_CPP=1)
endif()

add_library(
    aevyron_jni
    SHARED
    llama_bridge.cpp
)

find_library(log-lib log)
find_library(android-lib android)

if (TARGET llama)
    target_include_directories(aevyron_jni PRIVATE
        ${LLAMA_CPP_DIR}/include
        ${LLAMA_CPP_DIR}/ggml/include
        ${LLAMA_CPP_DIR}/common
    )
    target_link_libraries(
        aevyron_jni
        llama
        ggml
        common
        ${log-lib}
        ${android-lib}
    )
else()
    target_link_libraries(
        aevyron_jni
        ${log-lib}
        ${android-lib}
    )
endif()
