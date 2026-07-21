cmake_minimum_required(VERSION 3.18.2)

#   Program:   Visualization Toolkit
#   Module:    Copyright.txt

# Copyright (c) 1993-2015 Ken Martin, Will Schroeder, Bill Lorensen
# All rights reserved.

# Redistribution and use in source and binary forms, with or without
# modification, are permitted provided that the following conditions are met:

#  * Redistributions of source code must retain the above copyright notice,
#    this list of conditions and the following disclaimer.

#  * Redistributions in binary form must reproduce the above copyright notice,
#    this list of conditions and the following disclaimer in the documentation
#    and/or other materials provided with the distribution.

#  * Neither name of Ken Martin, Will Schroeder, or Bill Lorensen nor the names
#    of any contributors may be used to endorse or promote products derived
#    from this software without specific prior written permission.

# THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS ``AS IS''
# AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
# IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
# ARE DISCLAIMED. IN NO EVENT SHALL THE AUTHORS OR CONTRIBUTORS BE LIABLE FOR
# ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
# DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
# SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
# CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
# OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
# OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

# - Try to find ExprTk lib
#
# This module supports requiring a minimum version, e.g. you can do
#   find_package(ExprTk 2.71828)
# to require version 2.71828 or newer of ExprTk.
#
# Once done this will define
#
#  ExprTk_FOUND - system has eigen lib with correct version
#  ExprTk_INCLUDE_DIRS - the eigen include directory
#  ExprTk_VERSION - eigen version
#
# And the following imported target:
#
#  ExprTk::ExprTk

find_path(ExprTk_INCLUDE_DIR
  NAMES exprtk.hpp
  DOC "Path to ExprTk header")
mark_as_advanced(ExprTk_INCLUDE_DIR)

if (ExprTk_INCLUDE_DIR)
  file(STRINGS "${ExprTk_INCLUDE_DIR}/exprtk.hpp" _exprtk_version_header
    REGEX "static \\* version")
  string(REGEX MATCH "static \\* version = \"([0-9.]+)\"" _exprtk_version_match "${_exprtk_version_header}")
  set(ExprTk_VERSION "${CMAKE_MATCH_1}")
  unset(_exprtk_version_header)
  unset(_exprtk_version_match)
endif ()

include(FindPackageHandleStandardArgs)
find_package_handle_standard_args(ExprTk
  REQUIRED_VARS ExprTk_INCLUDE_DIR
  VERSION_VAR ExprTk_VERSION)

if (ExprTk_FOUND)
  set(ExprTk_INCLUDE_DIRS "${ExprTk_INCLUDE_DIR}")
  if (NOT TARGET ExprTk::ExprTk)
    add_library(ExprTk::ExprTk INTERFACE IMPORTED)
    set_target_properties(ExprTk::ExprTk PROPERTIES
      INTERFACE_INCLUDE_DIRECTORIES "${ExprTk_INCLUDE_DIR}")
  endif ()
endif ()
