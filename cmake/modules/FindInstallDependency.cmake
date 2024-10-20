cmake_minimum_required(VERSION 3.7.2)

# Workaround for: https://gitlab.kitware.com/cmake/cmake/-/issues/22740
set(D "$")

# ##################################################
# Helper to grab dependencies from remote sources #
# ##################################################
function(psp_build_dep name cmake_file)
    if(EXISTS ${CMAKE_BINARY_DIR}/${name}-build)
        psp_build_message("${Cyan}Dependency found - not rebuilding - ${CMAKE_BINARY_DIR}/${name}-build${ColorReset}")
    elseif(NAME STREQUAL "Boost")
        psp_build_message("${Cyan}Not building boost${ColorReset}")
    else()
        configure_file(${cmake_file} ${CMAKE_BINARY_DIR}/${name}-download/CMakeLists.txt)
        set(_cwd ${CMAKE_BINARY_DIR}/${name}-download)

        message(STATUS "Configuring ${name} in ${_cwd}")

        execute_process(COMMAND ${CMAKE_COMMAND} -G "${CMAKE_GENERATOR}" .
            RESULT_VARIABLE result
            OUTPUT_VARIABLE cmd_output
            ERROR_VARIABLE cmd_error
            WORKING_DIRECTORY ${_cwd})

        if(result)
            message(FATAL_ERROR "CMake step for ${name} failed:\nSTDOUT:${cmd_output}\nSTDERR: ${cmd_error}")
        endif()

        message("${cmd_output}")

        execute_process(COMMAND ${CMAKE_COMMAND} --build .
            RESULT_VARIABLE result
            WORKING_DIRECTORY ${CMAKE_BINARY_DIR}/${name}-download)

        if(result)
            message(FATAL_ERROR "Build step for ${name} failed: ${result}")
        endif()
    endif()
    if(${name} STREQUAL arrow)
        set(ARROW_SIMD_LEVEL "NONE")
        set(ARROW_DEFINE_OPTIONS ON)
        set(ARROW_RUNTIME_SIMD_LEVEL "NONE")
        set(ARROW_BUILD_SHARED OFF)
        set(ARROW_BUILD_STATIC ON)
        set(ARROW_BUILD_INTEGRATION OFF)
        set(ARROW_JEMALLOC OFF)
        set(ARROW_CSV ON)
        set(ARROW_LZ4 ON)
        set(ARROW_WITH_ZSTD ON)
        set(ARROW_WITH_LZ4 ON)
        set(ARROW_NO_EXPORT ON)
        set(ARROW_DEPENDENCY_SOURCE "BUNDLED" CACHE STRING "override arrow's dependency source" FORCE)
        if(PSP_WASM_BUILD)
            set(ARROW_ENABLE_THREADING OFF)
        else()
            set(ARROW_ENABLE_THREADING ON)
        endif()

        add_subdirectory(${CMAKE_BINARY_DIR}/${name}-src/cpp/
            ${CMAKE_BINARY_DIR}/${name}-build
            EXCLUDE_FROM_ALL
        )
        set(${name}_INCLUDE_DIRS
            "${CMAKE_BINARY_DIR}/${name}-build/src" # needed for generated headers, e.g. <arrow/util/config.h>
            "${CMAKE_BINARY_DIR}/${name}-src/cpp/src"
            PARENT_SCOPE)
    elseif(${name} STREQUAL re2)
        # Overwrite re2's CMakeLists with our custom CMakeLists.
        configure_file(${PSP_CMAKE_MODULE_PATH}/${name}/CMakeLists.txt ${CMAKE_BINARY_DIR}/${name}-src/ COPYONLY)

        add_subdirectory(${CMAKE_BINARY_DIR}/${name}-src
            ${CMAKE_BINARY_DIR}/${name}-build
            EXCLUDE_FROM_ALL)
        set(${name}_INCLUDE_DIRS ${CMAKE_BINARY_DIR}/${name}-src PARENT_SCOPE)
    elseif(${name} STREQUAL lz4)
        # lz4's CMakeLists.txt is in a subdir, build/cmake
        add_subdirectory(${CMAKE_BINARY_DIR}/${name}-src/build/cmake
            ${CMAKE_BINARY_DIR}/${name}-build
            EXCLUDE_FROM_ALL)
        include_directories(SYSTEM ${CMAKE_BINARY_DIR}/${name}-src/lib)
    elseif(${name} STREQUAL protobuf)
        add_subdirectory(${CMAKE_BINARY_DIR}/${name}-src
            ${CMAKE_BINARY_DIR}/${name}-build
            EXCLUDE_FROM_ALL)
        set(${name}_INCLUDE_DIRS ${CMAKE_BINARY_DIR}/${name}-src/src PARENT_SCOPE)
    elseif(${name} STREQUAL rapidjson)
        add_subdirectory(${CMAKE_BINARY_DIR}/${name}-src
            ${CMAKE_BINARY_DIR}/${name}-build
            EXCLUDE_FROM_ALL)
        set(${name}_INCLUDE_DIRS "${CMAKE_BINARY_DIR}/${name}-src/include" PARENT_SCOPE)
    # Header-only dependencies without a build step - no add_subdirectory()
    elseif(${name} MATCHES "^(Boost|exprtk)")
        set(${name}_INCLUDE_DIRS "${CMAKE_BINARY_DIR}/${name}-src" PARENT_SCOPE)
    elseif(${name} MATCHES "^(hopscotch|date|ordered-map)$")
        set(${name}_INCLUDE_DIRS "${CMAKE_BINARY_DIR}/${name}-src/include" PARENT_SCOPE)
    else()
        message(FATAL_ERROR "Unknown dependency `${name}`")
    endif()
endfunction()
