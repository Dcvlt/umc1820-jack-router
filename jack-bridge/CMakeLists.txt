cmake_minimum_required(VERSION 3.16)
project(jack-bridge-windows VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find JACK2 installation with fallback paths
set(JACK_POSSIBLE_ROOTS 
    "C:/Program Files/JACK2"
    "C:/Program Files (x86)/JACK2"
    "C:/JACK2"
)

foreach(JACK_ROOT_CANDIDATE ${JACK_POSSIBLE_ROOTS})
    if(EXISTS "${JACK_ROOT_CANDIDATE}")
        set(JACK_ROOT "${JACK_ROOT_CANDIDATE}")
        break()
    endif()
endforeach()

if(NOT JACK_ROOT)
    message(FATAL_ERROR "JACK2 installation not found in standard locations")
endif()

message(STATUS "Using JACK2 from: ${JACK_ROOT}")

# Find headers and library
find_path(JACK_INCLUDE_DIR 
    NAMES jack/jack.h
    PATHS "${JACK_ROOT}/includes" "${JACK_ROOT}/include"
    NO_DEFAULT_PATH
)

find_library(JACK_LIBRARY 
    NAMES libjack64 libjack jack
    PATHS "${JACK_ROOT}/lib" "${JACK_ROOT}/lib64"
    NO_DEFAULT_PATH
)

if(NOT JACK_INCLUDE_DIR)
    message(FATAL_ERROR "JACK headers not found. Searched in: ${JACK_ROOT}/includes, ${JACK_ROOT}/include")
endif()

if(NOT JACK_LIBRARY)
    message(FATAL_ERROR "JACK library not found. Searched in: ${JACK_ROOT}/lib, ${JACK_ROOT}/lib64")
endif()

message(STATUS "JACK Include Dir: ${JACK_INCLUDE_DIR}")
message(STATUS "JACK Library: ${JACK_LIBRARY}")

# Source files
set(SOURCES src/main-windows.cpp)

# Create executable
add_executable(${PROJECT_NAME} ${SOURCES})

# Include directories
target_include_directories(${PROJECT_NAME} PRIVATE ${JACK_INCLUDE_DIR})

# Link libraries
target_link_libraries(${PROJECT_NAME} PRIVATE ${JACK_LIBRARY} ws2_32 wsock32)

# Windows-specific definitions
target_compile_definitions(${PROJECT_NAME} PRIVATE
    _WIN32_WINNT=0x0601
    WIN32_LEAN_AND_MEAN
    NOMINMAX
    UNICODE
    _UNICODE
)

# Compiler options
target_compile_options(${PROJECT_NAME} PRIVATE
    $<$<CONFIG:Debug>:/W4 /Od /Zi>
    $<$<CONFIG:Release>:/O2 /DNDEBUG>
)

# Set output directory
set_target_properties(${PROJECT_NAME} PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}
)

install(TARGETS ${PROJECT_NAME} RUNTIME DESTINATION bin)