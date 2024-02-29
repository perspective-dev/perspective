if(NOT WORKSPACE_ROOT)
    message(STATUS "${Yellow}WORKSPACE_ROOT not set, assuming ${CMAKE_CURRENT_SOURCE_DIR}/../..${ColorReset}")
    set(WORKSPACE_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../..")
endif()

if(CMAKE_SYSTEM_NAME STREQUAL "Emscripten")
    set(CLANGD_ADD_FLAGS "Add:
        [
            -target,
            wasm32-unknown-emscripten,
            --sysroot=${WORKSPACE_ROOT}/.emsdk/upstream/emscripten/cache/sysroot,
        ]")
else()
    set(CLANGD_ADD_FLAGS "")
endif()


# Check for existence of .clangd file
if(EXISTS ${CMAKE_CURRENT_LIST_DIR}/.clangd.in)
    if(${CMAKE_SOURCE_DIR} STREQUAL ${CMAKE_CURRENT_SOURCE_DIR})
      message(STATUS "${Cyan}Found ${CMAKE_CURRENT_LIST_DIR}/.clangd.in${ColorReset}")
      # Configure the .clangd file from the template
      configure_file(
          ${CMAKE_CURRENT_LIST_DIR}/.clangd.in
          ${CMAKE_BINARY_DIR}/.clangd
          @ONLY
      )
      # Symlink .clangd to the project root
      execute_process(
          COMMAND ln -sf ${CMAKE_BINARY_DIR}/.clangd ${WORKSPACE_ROOT}/.clangd
      )
      message(STATUS "${Cyan}Created ${CMAKE_BINARY_DIR}/.clangd${ColorReset}")
    else()
      message("${Cyan} ${CMAKE_CURRENT_SOURCE_DIR} is not the root of the project, skipping IDE setup${ColorReset}")
    endif()
else()
    message("${Yellow}No .clangd.in found, skipping IDE setup${ColorReset}")
endif()

if(NOT WIN32)
    include_directories(SYSTEM ${Boost_INCLUDE_DIRS})
endif()