// ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
// ┃ ██████ ██████ ██████       █      █      █      █      █ █▄  ▀███ █       ┃
// ┃ ▄▄▄▄▄█ █▄▄▄▄▄ ▄▄▄▄▄█  ▀▀▀▀▀█▀▀▀▀▀ █ ▀▀▀▀▀█ ████████▌▐███ ███▄  ▀█ █ ▀▀▀▀▀ ┃
// ┃ █▀▀▀▀▀ █▀▀▀▀▀ █▀██▀▀ ▄▄▄▄▄ █ ▄▄▄▄▄█ ▄▄▄▄▄█ ████████▌▐███ █████▄   █ ▄▄▄▄▄ ┃
// ┃ █      ██████ █  ▀█▄       █ ██████      █      ███▌▐███ ███████▄ █       ┃
// ┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
// ┃ Copyright (c) 2017, the Perspective Authors.                              ┃
// ┃ ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ ┃
// ┃ This file is part of the Perspective library, distributed under the terms ┃
// ┃ of the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0). ┃
// ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛


#pragma once
#include <perspective/first.h>
#include <perspective/base.h>
#include <perspective/exports.h>
#include <perspective/raw_types.h>
#include <perspective/scalar.h>
#include <perspective/column.h>
#include <perspective/schema.h>
#include <perspective/data_table.h>
#include <perspective/last.h>
#include <string>
#include <vector>

namespace perspective {

/**
 * @brief Encodes a composite primary key into one order-preserving,
 * NUL-free string so a multi-column `index` can live in a `DTYPE_STR`
 * `psp_pkey` column.
 */
class PERSPECTIVE_EXPORT t_pkey_codec {
public:
    explicit t_pkey_codec(std::vector<t_dtype> dtypes);

    static t_pkey_codec from_schema(
        const t_schema& schema, const std::vector<std::string>& index
    );

    static bool is_supported(t_dtype dtype);

    const std::vector<t_dtype>& dtypes() const;

    std::size_t arity() const;

    void encode(
        const std::vector<const t_column*>& cols,
        t_uindex ridx,
        std::string& out
    ) const;

    void encode(const std::vector<t_tscalar>& key, std::string& out) const;

    std::vector<t_tscalar>
    decode(const char* bytes, std::vector<std::string>& storage) const;

    t_tscalar coerce(const t_tscalar& value, t_dtype dtype) const;

private:
    void encode_field(const t_tscalar& value, t_dtype dtype, std::string& raw)
        const;

    std::vector<t_dtype> m_dtypes;
};

/**
 * @brief Encode every row's composite key from `index` into `psp_pkey`, and
 * `psp_okey` when requested.
 */
PERSPECTIVE_EXPORT void fill_pkey_from_index(
    t_data_table& tbl,
    const std::vector<std::string>& index,
    const t_pkey_codec& codec,
    bool is_update,
    bool fill_okey
);

} // namespace perspective
