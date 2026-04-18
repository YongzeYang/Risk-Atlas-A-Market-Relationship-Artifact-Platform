cmake_minimum_required(VERSION 3.21)

project(risk_atlas_cpp LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)

set(BSM_VENDOR_DIR "${CMAKE_CURRENT_SOURCE_DIR}/third_party/bsm")

if(NOT EXISTS "${BSM_VENDOR_DIR}/CMakeLists.txt")
  message(FATAL_ERROR
    "Missing vendored bsm repository at:\n"
    "  ${BSM_VENDOR_DIR}\n\n"
    "Run:\n"
    "  git submodule update --init --recursive\n"
    "from the repository root first."
  )
endif()

# Treat bsm as vendored third-party code inside risk-atlas.
# Its upstream CMake defines:
# - library target: bsm
# - alias target  : bsm::bsm
#
# For risk-atlas we do NOT want:
# - upstream unit tests
# - upstream sanitizers enabled implicitly
# - upstream warning policy affecting our local build
set(BSM_BUILD_TESTS OFF CACHE BOOL "Disable bsm tests in risk-atlas build" FORCE)
set(BSM_ENABLE_SANITIZERS OFF CACHE BOOL "Disable bsm sanitizers in risk-atlas build" FORCE)
set(BSM_ENABLE_WARNINGS OFF CACHE BOOL "Disable bsm vendor warnings in risk-atlas build" FORCE)

add_subdirectory(
  "${BSM_VENDOR_DIR}"
  "${CMAKE_CURRENT_BINARY_DIR}/third_party/bsm-build"
  EXCLUDE_FROM_ALL
)

add_executable(risk_atlas_bsm_writer
  tools/risk_atlas_bsm_writer.cpp
)

target_link_libraries(risk_atlas_bsm_writer
  PRIVATE
    bsm::bsm
)

target_compile_features(risk_atlas_bsm_writer PRIVATE cxx_std_20)

add_executable(risk_atlas_bsm_query
  tools/risk_atlas_bsm_query.cpp
)

target_link_libraries(risk_atlas_bsm_query
  PRIVATE
    bsm::bsm
)

target_compile_features(risk_atlas_bsm_query PRIVATE cxx_std_20)

foreach(tgt risk_atlas_bsm_writer risk_atlas_bsm_query)
  if (MSVC)
    target_compile_options(${tgt} PRIVATE /W4 /permissive-)
  else()
    target_compile_options(${tgt} PRIVATE -Wall -Wextra -Wpedantic)
  endif()
endforeach()