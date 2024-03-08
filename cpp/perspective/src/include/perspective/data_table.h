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
#include <perspective/column.h>
#include <perspective/schema.h>
#include <perspective/schema_column.h>
#include <perspective/exports.h>
#include <perspective/mask.h>
#include <perspective/filter.h>
#include <perspective/compat.h>
#include <perspective/parallel_for.h>
#include <tuple>

namespace perspective {

template <typename DATA_T>
struct t_rowpack {
    DATA_T m_pkey;
    bool m_pkey_is_valid;
    t_index m_idx;
    t_op m_op;
};

struct t_flatten_record {
    t_uindex m_store_idx;
    t_uindex m_bidx;
    t_uindex m_eidx;
};

class t_data_table;

class PERSPECTIVE_EXPORT t_tabular {};

/**
 * @brief `t_data_table` is the underlying structure used to store and access
 * tabluar data within Perspective.
 *
 * Do not directly construct or use `t_data_table` - use the `Table` class
 * instead.
 *
 */
class PERSPECTIVE_EXPORT t_data_table {
public:
#ifdef PSP_DBG_MALLOC
    PSP_NEW_DELETE(t_data_table)
#endif
    PSP_NON_COPYABLE(t_data_table);

    t_data_table(t_schema s, t_uindex init_cap = DEFAULT_EMPTY_CAPACITY);

    // Only use in tests, it inits the table unlike other constructors
    t_data_table(
        const t_schema& s, const std::vector<std::vector<t_tscalar>>& v
    );

    t_data_table(
        std::string name,
        std::string dirname,
        t_schema s,
        t_uindex init_cap,
        t_backing_store backing_store
    );
    ~t_data_table();

    /**
     * @brief Initialize the `t_data_table`. If `make_columns` is True (the
     * default option), construct and initialize the `t_column`s for the
     * table.
     */
    void init(bool make_columns = true);

    const std::string& name() const;

    t_uindex num_columns() const;
    t_uindex num_rows() const;

    const t_schema& get_schema() const;

    t_uindex size() const;
    t_uindex get_capacity() const;
    t_dtype get_dtype(const std::string& colname) const;

    std::shared_ptr<t_column> get_column(std::string_view colname);

    std::shared_ptr<t_column> get_column_safe(std::string_view colname);

    std::shared_ptr<t_column> get_column(std::string_view colname) const;

    std::shared_ptr<t_column> get_column_safe(std::string_view colname) const;

    std::shared_ptr<const t_column> get_const_column(std::string_view colname
    ) const;

    std::shared_ptr<const t_column>
    get_const_column_safe(std::string_view colname) const;

    std::shared_ptr<const t_column> get_const_column(t_uindex idx) const;

    std::shared_ptr<const t_column> get_const_column_safe(t_uindex idx) const;

    // Only increment capacity
    void reserve(t_uindex capacity);

    // Increment capacity and size
    void extend(t_uindex nelems);

    void set_size(t_uindex size);

    /**
     * @brief Only set `m_size` for the table without setting it for columns.
     *
     * @param size
     */
    void set_table_size(t_uindex size);

    t_column* _get_column(std::string_view colname);

    std::shared_ptr<t_data_table> flatten() const;

    bool is_pkey_table() const;
    bool is_same_shape(t_data_table& tbl) const;

    void pprint() const;
    void pprint(t_uindex nrows, std::ostream* os = 0) const;
    void pprint(const std::string& fname) const;
    void pprint(const std::vector<t_uindex>& vec) const;

    void append(const t_data_table& other);

    void clear();
    void reset();

    t_mask
    filter_cpp(t_filter_op combiner, const std::vector<t_fterm>& fterms_) const;
    t_data_table* clone_(const t_mask& mask) const;
    std::shared_ptr<t_data_table> clone(const t_mask& mask) const;
    std::shared_ptr<t_data_table> clone() const;

    /**
     * @brief Given `other_table`, return a new `t_data_table` that references
     * both the columns of the current table and `table` without making any
     * copies of the underlying data.
     *
     * If a column is present in both the current table and `other_table`, the
     * column from the current table takes precedence. This method is designed
     * for quick, temporary copies of a `t_data_table` that can be used and
     * disposed of, which is why it returns a stack-allocated table instead
     * of a heap-allocated pointer to a table.
     *
     * @param table
     * @return t_data_table
     */
    std::shared_ptr<t_data_table>
    join(const std::shared_ptr<t_data_table>& other_table) const;

    /**
     * @brief Create a new `t_data_table` from the specified schema. For each
     * column in the schema, retrieve a shared pointer to the current instance's
     * column, and set it in the new `t_data_table` to be returned.
     *
     * @return std::shared_ptr<t_data_table>
     */
    std::shared_ptr<t_data_table> borrow(const std::vector<std::string>& columns
    ) const;

    t_column* clone_column(
        const std::string& existing_col, const std::string& new_colname
    );

    std::vector<const t_column*> get_const_columns() const;
    std::vector<t_column*> get_columns();

    void set_column(t_uindex idx, std::shared_ptr<t_column> col);
    void set_column(const std::string& name, std::shared_ptr<t_column> col);

    std::shared_ptr<t_column> add_column_sptr(
        const std::string& cname, t_dtype dtype, bool status_enabled
    );

    t_column*
    add_column(const std::string& cname, t_dtype dtype, bool status_enabled);

    void promote_column(
        std::string_view col_name,
        t_dtype new_dtype,
        std::int32_t iter_limit,
        bool fill
    );

    std::shared_ptr<t_column>
    make_column(const std::string& colname, t_dtype dtype, bool status_enabled);

    /**
     * @brief Given a column name, clear the underlying column but do not
     * mutate the `t_data_table` instance's `m_schema` and `m_columns`. Use
     * `t_data_table::reindex` with a vector of column names signifying
     * dropped columns that can be cleared by mutating `m_schema` and
     * `m_columns`.
     *
     * @param name
     */
    void drop_column(const std::string& name);

    /**
     * @brief Given a vector of column names marking dropped columns,
     * mutate the instance's `m_schema` and `m_columns` to ensure that column
     * indices belonging to deleted columns are dropped, and that new column
     * indices are assigned sequentially.
     *
     * @param dropped_columns
     */
    void reindex(const std::vector<std::string&> dropped_columns);

    void verify() const;
    void set_capacity(t_uindex idx);

    std::vector<t_tscalar> get_scalvec() const;
    std::shared_ptr<t_column> operator[](const std::string& name);

protected:
    template <typename FLATTENED_T>
    void flatten_body(FLATTENED_T flattened) const;

    template <typename FLATTENED_T, typename PKEY_T>
    void flatten_helper_1(FLATTENED_T flattened) const;

    template <typename DATA_T, typename ROWPACK_VEC_T>
    void flatten_helper_2(
        ROWPACK_VEC_T& sorted,
        std::vector<t_flatten_record>& fltrecs,
        const t_column* scol,
        t_column* dcol
    ) const;
    std::string repr() const;

private:
    std::string m_name;
    std::string m_dirname;
    t_schema m_schema;
    t_uindex m_size;
    t_uindex m_capacity;
    t_backing_store m_backing_store;
    bool m_init;
    std::vector<std::shared_ptr<t_column>> m_columns;
};

PERSPECTIVE_EXPORT bool
operator==(const t_data_table& lhs, const t_data_table& rhs);

template <typename FLATTENED_T>
void
t_data_table::flatten_body(FLATTENED_T flattened) const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    PSP_VERBOSE_ASSERT(is_pkey_table(), "Not a pkeyed table");

    t_dtype pkey_dtype = get_const_column("psp_pkey")->get_dtype();
    switch (pkey_dtype) {
        case DTYPE_INT64: {
            flatten_helper_1<FLATTENED_T, std::int64_t>(flattened);
        } break;
        case DTYPE_INT32: {
            flatten_helper_1<FLATTENED_T, std::int32_t>(flattened);
        } break;
        case DTYPE_INT16: {
            flatten_helper_1<FLATTENED_T, std::int16_t>(flattened);
        } break;
        case DTYPE_INT8: {
            flatten_helper_1<FLATTENED_T, std::int8_t>(flattened);
        } break;
        case DTYPE_UINT64: {
            flatten_helper_1<FLATTENED_T, std::uint64_t>(flattened);
        } break;
        case DTYPE_UINT32: {
            flatten_helper_1<FLATTENED_T, std::uint32_t>(flattened);
        } break;
        case DTYPE_UINT16: {
            flatten_helper_1<FLATTENED_T, std::uint16_t>(flattened);
        } break;
        case DTYPE_UINT8: {
            flatten_helper_1<FLATTENED_T, std::uint8_t>(flattened);
        } break;
        case DTYPE_TIME: {
            flatten_helper_1<FLATTENED_T, std::int64_t>(flattened);
        } break;
        case DTYPE_DATE: {
            flatten_helper_1<FLATTENED_T, std::uint32_t>(flattened);
        } break;
        case DTYPE_STR: {
            flatten_helper_1<FLATTENED_T, t_uindex>(flattened);
        } break;
        case DTYPE_FLOAT64: {
            flatten_helper_1<FLATTENED_T, double>(flattened);
        } break;
        case DTYPE_FLOAT32: {
            flatten_helper_1<FLATTENED_T, float>(flattened);
        } break;
        default: {
            std::stringstream ss;
            ss << "Unsupported type `" << get_dtype_descr(pkey_dtype)
               << "` for `index`."
               << "\n";
            PSP_COMPLAIN_AND_ABORT(ss.str());
        }
    }

    return;
}

template <typename DATA_T, typename ROWPACK_VEC_T>
void
t_data_table::flatten_helper_2(
    ROWPACK_VEC_T& sorted,
    std::vector<t_flatten_record>& fltrecs,
    const t_column* scol,
    t_column* dcol
) const {
    for (const auto& rec : fltrecs) {
        bool added = false;
        t_index fragidx = 0;
        t_status status = STATUS_INVALID;
        for (t_index spanidx = rec.m_eidx - 1; spanidx >= t_index(rec.m_bidx);
             --spanidx) {
            const auto& sort_rec = sorted[spanidx];
            fragidx = sort_rec.m_idx;
            status = *(scol->get_nth_status(fragidx));
            if (status != STATUS_INVALID) {
                added = true;
                break;
            }
        }

        if (added) {
            dcol->set_nth<DATA_T>(
                rec.m_store_idx, *(scol->get_nth<DATA_T>(fragidx)), status
            );
        }
    }
}

template <typename FLATTENED_T, typename PKEY_T>
void
t_data_table::flatten_helper_1(FLATTENED_T flattened) const {

    t_uindex frags_size = size();

    PSP_VERBOSE_ASSERT(is_same_shape(*flattened), "Misaligned shaped found");

    if (frags_size == 0) {
        return;
    }

    std::vector<const t_column*> s_columns;
    std::vector<t_column*> d_columns;

    for (const auto& colname : m_schema.m_columns) {
        if (colname != "psp_pkey" && colname != "psp_op") {
            s_columns.push_back(get_const_column(colname).get());
            d_columns.push_back(flattened->get_column(colname).get());
        }
    }

    const t_column* s_pkey_col = get_const_column("psp_pkey").get();
    const t_column* s_op_col = get_const_column("psp_op").get();

    t_column* d_pkey_col = flattened->get_column("psp_pkey").get();
    t_column* d_op_col = flattened->get_column("psp_op").get();

    typedef std::vector<t_rowpack<PKEY_T>> t_rpvec;

    std::vector<t_rowpack<PKEY_T>> sorted(frags_size);
    for (t_uindex fragidx = 0; fragidx < frags_size; ++fragidx) {
        sorted[fragidx].m_pkey = *(s_pkey_col->get_nth<PKEY_T>(fragidx));
        sorted[fragidx].m_pkey_is_valid = s_pkey_col->is_valid(fragidx);
        sorted[fragidx].m_op =
            static_cast<t_op>(*(s_op_col->get_nth<std::uint8_t>(fragidx)));
        sorted[fragidx].m_idx = fragidx;
    }

    struct t_packcomp {
        bool
        operator()(const t_rowpack<PKEY_T>& a, const t_rowpack<PKEY_T>& b)
            const {
            return a.m_pkey < b.m_pkey
                || (!(b.m_pkey < a.m_pkey) && a.m_idx < b.m_idx);
        }
    };

    t_packcomp cmp;
    std::sort(sorted.begin(), sorted.end(), cmp);

    std::vector<t_index> edges;
    edges.push_back(0);

    for (t_index idx = 1, loop_end = sorted.size(); idx < loop_end; ++idx) {
        if ((sorted[idx].m_pkey_is_valid != sorted[idx - 1].m_pkey_is_valid)
            || (sorted[idx].m_pkey != sorted[idx - 1].m_pkey)) {
            edges.push_back(idx);
        }
    }

    flattened->reserve(size());

    std::vector<t_flatten_record> fltrecs;

    t_uindex store_idx = 0;

    for (t_index fidx = 0, loop_end = edges.size(); fidx < loop_end; ++fidx) {
        t_index bidx = edges[fidx];
        bool edge_bool = fidx == static_cast<t_index>(edges.size() - 1);
        t_index eidx = edge_bool ? sorted.size() : edges[fidx + 1];

        bool delete_encountered = false;

        for (t_index spanidx = bidx; spanidx < eidx; ++spanidx) {
            if (sorted[spanidx].m_op == OP_DELETE) {
                bidx = spanidx;
                delete_encountered = true;
            }
        }

        const auto& sort_rec = sorted[bidx];
        if (delete_encountered) {
            d_pkey_col->push_back(
                sort_rec.m_pkey,
                sort_rec.m_pkey_is_valid ? t_status::STATUS_VALID
                                         : t_status::STATUS_INVALID
            );
            std::uint8_t op8 = OP_DELETE;
            d_op_col->push_back(op8);
            ++store_idx;
        }

        if (!delete_encountered || (bidx + 1 != eidx)) {
            t_flatten_record rec;
            rec.m_store_idx = store_idx;
            rec.m_bidx = bidx;
            rec.m_eidx = eidx;
            fltrecs.push_back(rec);

            d_pkey_col->push_back(
                sort_rec.m_pkey,
                sort_rec.m_pkey_is_valid ? t_status::STATUS_VALID
                                         : t_status::STATUS_INVALID
            );

            std::uint8_t op8 = OP_INSERT;
            d_op_col->push_back(op8);
            ++store_idx;
        }
    }

    flattened->set_size(store_idx);
    t_uindex ndata_cols = d_columns.size();

    parallel_for(
        int(ndata_cols),
        [&s_columns, &sorted, &d_columns, &fltrecs, this](int colidx) {
            auto scol = s_columns[colidx];
            auto dcol = d_columns[colidx];

            switch (scol->get_dtype()) {
                case DTYPE_INT64: {
                    this->flatten_helper_2<std::int64_t, t_rpvec>(
                        sorted, fltrecs, scol, dcol
                    );
                } break;
                case DTYPE_INT32: {
                    this->flatten_helper_2<std::int32_t, t_rpvec>(
                        sorted, fltrecs, scol, dcol
                    );
                } break;
                case DTYPE_INT16: {
                    this->flatten_helper_2<std::int16_t, t_rpvec>(
                        sorted, fltrecs, scol, dcol
                    );
                } break;
                case DTYPE_INT8: {
                    this->flatten_helper_2<std::int8_t, t_rpvec>(
                        sorted, fltrecs, scol, dcol
                    );
                } break;
                case DTYPE_UINT64: {
                    this->flatten_helper_2<std::uint64_t, t_rpvec>(
                        sorted, fltrecs, scol, dcol
                    );
                } break;
                case DTYPE_UINT32: {
                    this->flatten_helper_2<std::uint32_t, t_rpvec>(
                        sorted, fltrecs, scol, dcol
                    );
                } break;
                case DTYPE_UINT16: {
                    this->flatten_helper_2<std::uint16_t, t_rpvec>(
                        sorted, fltrecs, scol, dcol
                    );
                } break;
                case DTYPE_UINT8: {
                    this->flatten_helper_2<std::uint8_t, t_rpvec>(
                        sorted, fltrecs, scol, dcol
                    );
                } break;
                case DTYPE_FLOAT64: {
                    this->flatten_helper_2<double, t_rpvec>(
                        sorted, fltrecs, scol, dcol
                    );
                } break;
                case DTYPE_FLOAT32: {
                    this->flatten_helper_2<float, t_rpvec>(
                        sorted, fltrecs, scol, dcol
                    );
                } break;
                case DTYPE_BOOL: {
                    this->flatten_helper_2<std::uint8_t, t_rpvec>(
                        sorted, fltrecs, scol, dcol
                    );
                } break;
                case DTYPE_TIME: {
                    this->flatten_helper_2<std::int64_t, t_rpvec>(
                        sorted, fltrecs, scol, dcol
                    );
                } break;
                case DTYPE_DATE: {
                    this->flatten_helper_2<std::uint32_t, t_rpvec>(
                        sorted, fltrecs, scol, dcol
                    );
                } break;
                case DTYPE_STR: {
                    this->flatten_helper_2<t_uindex, t_rpvec>(
                        sorted, fltrecs, scol, dcol
                    );
                } break;
                case DTYPE_OBJECT:
                default: {
                    PSP_COMPLAIN_AND_ABORT("Unsupported column dtype");
                }
            }
        }
    );

    parallel_for(
        int(m_schema.get_num_columns()),
        [&flattened, this](int colidx) {
            const auto& colname = this->m_schema.m_columns[colidx];
            auto col = get_const_column(colname).get();
            if (col->get_dtype() == DTYPE_STR) {
                flattened->get_column(colname)->copy_vocabulary(col);
            }
        }
    );

    d_op_col->valid_raw_fill();
}

} // end namespace perspective
