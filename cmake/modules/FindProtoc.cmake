set(DEFAULT_PROTOBUF_VERSION "25.1")

# Function to download and extract protoc
function(download_protoc VERSION DESTINATION)
    if(CMAKE_HOST_SYSTEM_NAME STREQUAL "Windows")
        set(PROTOC_ZIP "protoc-${VERSION}-win64.zip")
    elseif(CMAKE_HOST_SYSTEM_NAME STREQUAL "Darwin")
        set(PROTOC_ZIP "protoc-${VERSION}-osx-x86_64.zip")
    elseif(CMAKE_HOST_SYSTEM_NAME STREQUAL "Linux")
        set(PROTOC_ZIP "protoc-${VERSION}-linux-x86_64.zip")
    else()
        message(FATAL_ERROR "Unsupported host system: ${CMAKE_HOST_SYSTEM_NAME}")
    endif()

    set(PROTOC_URL "https://github.com/protocolbuffers/protobuf/releases/download/v${VERSION}/${PROTOC_ZIP}")
    set(DOWNLOAD_PATH "${CMAKE_BINARY_DIR}/downloaded/${PROTOC_ZIP}")

    file(DOWNLOAD ${PROTOC_URL} ${DOWNLOAD_PATH}
         STATUS DOWNLOAD_STATUS
         SHOW_PROGRESS)

    list(GET DOWNLOAD_STATUS 0 STATUS_CODE)
    if(STATUS_CODE EQUAL 0)
        message(STATUS "Downloaded protoc: ${DOWNLOAD_PATH}")
        file(ARCHIVE_EXTRACT INPUT ${DOWNLOAD_PATH} DESTINATION ${DESTINATION})
        file(REMOVE ${DOWNLOAD_PATH})
    else()
        message(FATAL_ERROR "Failed to download protoc: Status code ${STATUS_CODE}")
    endif()
endfunction()

if(EXISTS ${CMAKE_BINARY_DIR}/protoc-release/bin/protoc)
    message(STATUS "Found protoc in ${CMAKE_BINARY_DIR}/protoc-release/bin/protoc")
    set(Protobuf_EXECUTABLE ${CMAKE_BINARY_DIR}/protoc-release/bin/protoc)
endif()

if(NOT Protobuf_EXECUTABLE)
    message(STATUS "Protobuf_EXECUTABLE not found, searching for protoc")
    download_protoc(${DEFAULT_PROTOBUF_VERSION} ${CMAKE_BINARY_DIR}/protoc-release)
    set(PROTOC_EXECUTABLE ${CMAKE_BINARY_DIR}/protoc-release/bin/protoc)
    # find_program(PROTOC_EXECUTABLE NAMES protoc)
else()
    message(STATUS "Using Protobuf_EXECUTABLE from parent scope")
    set(PROTOC_EXECUTABLE ${Protobuf_EXECUTABLE})
endif()

if(NOT PROTOC_EXECUTABLE)
    message(FATAL_ERROR "protoc not found")
    set(Protoc_FOUND FALSE)
else()
    set(Protoc_FOUND TRUE)
    message(STATUS "Found protoc: ${PROTOC_EXECUTABLE}")

    function(CHECK_PROTOC_VERSION)
        execute_process(
            COMMAND ${PROTOC_EXECUTABLE} --version
            OUTPUT_VARIABLE PROTOC_VERSION_OUTPUT
            OUTPUT_STRIP_TRAILING_WHITESPACE
        )
        
        if(NOT PROTOC_VERSION_OUTPUT MATCHES "^libprotoc ([0-9]+)\\.([0-9]+)(:?\\.([0-9]+))?")
            message(WARNING "Unable to determine protoc version")
            return()
        endif()

        set(PROTOC_VERSION_MAJOR ${CMAKE_MATCH_1})
        set(PROTOC_VERSION_MINOR ${CMAKE_MATCH_2})
        set(PROTOC_VERSION_PATCH ${CMAKE_MATCH_4})

        if (NOT PROTOC_VERSION_PATCH)
            set(FOUND_VERSION "${PROTOC_VERSION_MAJOR}.${PROTOC_VERSION_MINOR}")
        else()
            set(FOUND_VERSION "${PROTOC_VERSION_MAJOR}.${PROTOC_VERSION_MINOR}.${PROTOC_VERSION_PATCH}")
        endif()
        
        # Force the external project to use the same version as our installed protoc CLI
        set(LIBPROTOBUF_VERSION "v${FOUND_VERSION}" PARENT_SCOPE)

        set(MIN_PROTOC_VERSION_MAJOR 3)

        if(PROTOC_VERSION_MAJOR LESS MIN_PROTOC_VERSION_MAJOR)
            message(FATAL_ERROR "protoc version ${FOUND_VERSION} is too old, at least ${MIN_PROTOC_VERSION_MAJOR}.x.x is required")
        else()
            message(STATUS "Found protoc version ${FOUND_VERSION}")
        endif()
    endfunction()

    # Check the version of protoc
    CHECK_PROTOC_VERSION()
endif()

function(protobuf_generate_cpp SRCS HDRS)
    if(NOT ARGN)
        message(SEND_ERROR "Error: protobuf_generate_cpp() called without any proto files")
        return()
    endif()

    set(_PROTOBUF_GENERATE_CPP_SRCS)
    set(_PROTOBUF_GENERATE_CPP_HDRS)

    foreach(PROTO_FILE ${ARGN})
        get_filename_component(PROTO_NAME ${PROTO_FILE} NAME_WE)
        get_filename_component(PROTO_PATH ${PROTO_FILE} PATH)

        set(GENERATED_SRC "${CMAKE_CURRENT_BINARY_DIR}/${PROTO_NAME}.pb.cc")
        set(GENERATED_HDR "${CMAKE_CURRENT_BINARY_DIR}/${PROTO_NAME}.pb.h")

        add_custom_command(
            OUTPUT ${GENERATED_SRC} ${GENERATED_HDR}
            COMMAND ${PROTOC_EXECUTABLE} --cpp_out ${CMAKE_CURRENT_BINARY_DIR} ${PROTO_FILE}
            DEPENDS ${PROTO_FILE} ${PROTOC_EXECUTABLE}
            WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}
            COMMENT "Generating ${GENERATED_SRC} and ${GENERATED_HDR} from ${PROTO_FILE}"
        )

        set_source_files_properties(${GENERATED_SRC} ${GENERATED_HDR} PROPERTIES GENERATED TRUE)

        list(APPEND _PROTOBUF_GENERATE_CPP_SRCS ${GENERATED_SRC})
        list(APPEND _PROTOBUF_GENERATE_CPP_HDRS ${GENERATED_HDR})
    endforeach()
    set(${SRCS} ${_PROTOBUF_GENERATE_CPP_SRCS} PARENT_SCOPE)
    set(${HDRS} ${_PROTOBUF_GENERATE_CPP_HDRS} PARENT_SCOPE)
endfunction()

