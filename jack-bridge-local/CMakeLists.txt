# jack-bridge-local/CMakeLists.txt
cmake_minimum_required(VERSION 3.16)
project(jack-bridge-local VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Build configuration
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

message(STATUS "Building JACK Bridge Local for Windows")
message(STATUS "Build type: ${CMAKE_BUILD_TYPE}")

# Find JACK2 installation (multiple possible locations)
set(JACK_POSSIBLE_ROOTS 
    "C:/Program Files/JACK2"
    "C:/Program Files (x86)/JACK2"
    "C:/JACK2"
    "$ENV{JACK_PATH}"
)

set(JACK_ROOT "")
foreach(JACK_ROOT_CANDIDATE ${JACK_POSSIBLE_ROOTS})
    if(EXISTS "${JACK_ROOT_CANDIDATE}")
        set(JACK_ROOT "${JACK_ROOT_CANDIDATE}")
        message(STATUS "Found JACK2 at: ${JACK_ROOT}")
        break()
    endif()
endforeach()

if(NOT JACK_ROOT)
    message(FATAL_ERROR "JACK2 installation not found. Please install JACK2 or set JACK_PATH environment variable")
endif()

# Find JACK headers
find_path(JACK_INCLUDE_DIR 
    NAMES jack/jack.h
    PATHS 
        "${JACK_ROOT}/include" 
        "${JACK_ROOT}/inc"
    NO_DEFAULT_PATH
)

# Find JACK library (try both 64-bit and 32-bit)
find_library(JACK_LIBRARY 
    NAMES libjack64 libjack jack jack64
    PATHS 
        "${JACK_ROOT}/lib" 
        "${JACK_ROOT}/lib64"
        "${JACK_ROOT}/libs"
    NO_DEFAULT_PATH
)

# Validation
if(NOT JACK_INCLUDE_DIR)
    message(FATAL_ERROR "JACK headers not found. Searched in: ${JACK_ROOT}/include")
endif()

if(NOT JACK_LIBRARY)
    message(FATAL_ERROR "JACK library not found. Searched in: ${JACK_ROOT}/lib, ${JACK_ROOT}/lib64")
endif()

message(STATUS "JACK Include Directory: ${JACK_INCLUDE_DIR}")
message(STATUS "JACK Library: ${JACK_LIBRARY}")

# Source files
set(SOURCES 
    src/main.cpp
)

# Create executable
add_executable(${PROJECT_NAME} ${SOURCES})

# Include directories
target_include_directories(${PROJECT_NAME} PRIVATE 
    ${JACK_INCLUDE_DIR}
    include
)

# Link libraries
target_link_libraries(${PROJECT_NAME} PRIVATE 
    ${JACK_LIBRARY} 
    ws2_32 
    wsock32
)

# Windows-specific definitions
target_compile_definitions(${PROJECT_NAME} PRIVATE
    _WIN32_WINNT=0x0601
    WIN32_LEAN_AND_MEAN
    NOMINMAX
    UNICODE
    _UNICODE
    _CRT_SECURE_NO_WARNINGS
)

# Compiler options
if(MSVC)
    target_compile_options(${PROJECT_NAME} PRIVATE
        $<$<CONFIG:Debug>:/W4 /Od /Zi /MDd>
        $<$<CONFIG:Release>:/O2 /DNDEBUG /MD>
    )
else()
    target_compile_options(${PROJECT_NAME} PRIVATE
        $<$<CONFIG:Debug>:-g -O0 -Wall>
        $<$<CONFIG:Release>:-O3 -DNDEBUG>
    )
endif()

# Set output directory and name
set_target_properties(${PROJECT_NAME} PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}
    OUTPUT_NAME "jack-bridge"
)

# Installation
install(TARGETS ${PROJECT_NAME} 
    RUNTIME DESTINATION bin
)

# Copy JACK DLLs to output directory (for runtime)
if(EXISTS "${JACK_ROOT}/lib/libjack64.dll")
    add_custom_command(TARGET ${PROJECT_NAME} POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
            "${JACK_ROOT}/lib/libjack64.dll"
            $<TARGET_FILE_DIR:${PROJECT_NAME}>
        COMMENT "Copying JACK DLL to output directory"
    )
endif()

# Create config file template
file(WRITE "${CMAKE_BINARY_DIR}/jack-bridge.conf" 
"# JACK Bridge Local Configuration
# API port for HTTP server
port=6666

# Log file location
log_file=jack-bridge.log

# Enable verbose logging
verbose=false
")

# Print build summary
message(STATUS "")
message(STATUS "JACK Bridge Local Build Configuration:")
message(STATUS "=====================================")
message(STATUS "Source files: ${SOURCES}")
message(STATUS "Output executable: jack-bridge.exe")
message(STATUS "JACK root: ${JACK_ROOT}")
message(STATUS "Build type: ${CMAKE_BUILD_TYPE}")
message(STATUS "C++ standard: ${CMAKE_CXX_STANDARD}")
message(STATUS "")
message(STATUS "After building:")
message(STATUS "  1. Ensure JACK2 is running (qjackctl)")
message(STATUS "  2. Run: ./jack-bridge.exe")
message(STATUS "  3. Test: curl http://localhost:6666/health")
message(STATUS "")