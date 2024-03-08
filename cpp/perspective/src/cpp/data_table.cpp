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

#include <perspective/first.h>
#include <perspective/base.h>
#include <perspective/raw_types.h>
#include <perspective/data_table.h>
#include <perspective/column.h>
#include <perspective/storage.h>
#include <perspective/scalar.h>
#include <perspective/tracing.h>
#include <perspective/utils.h>

#include <sstream>
#include <utility>
namespace perspective {

void
t_data_table::set_capacity(t_uindex idx) {
    m_capacity = idx;
#ifdef PSP_TABLE_VERIFY
    if (m_init) {
        for (auto c : m_columns) {
            c->verify_size();
            c->verify_size(m_capacity);
        }
    }

#endif
}

t_data_table::t_data_table(t_schema s, t_uindex init_cap) :
    m_schema(std::move(s)),
    m_size(0),
    m_backing_store(BACKING_STORE_MEMORY),
    m_init(false) {
    PSP_TRACE_SENTINEL();
    LOG_CONSTRUCTOR("t_data_table");
    set_capacity(init_cap);
}

t_data_table::t_data_table(
    std::string name,
    std::string dirname,
    t_schema s,
    t_uindex init_cap,
    t_backing_store backing_store
) :
    m_name(std::move(name)),
    m_dirname(std::move(dirname)),
    m_schema(std::move(s)),
    m_size(0),
    m_backing_store(backing_store),
    m_init(false) {
    PSP_TRACE_SENTINEL();
    LOG_CONSTRUCTOR("t_data_table");
    set_capacity(init_cap);
}

// THIS CONSTRUCTOR INITS. Do not use in production.
t_data_table::t_data_table(
    const t_schema& s, const std::vector<std::vector<t_tscalar>>& v
) :
    m_schema(s),
    m_size(0),
    m_backing_store(BACKING_STORE_MEMORY),
    m_init(false) {
    PSP_TRACE_SENTINEL();
    LOG_CONSTRUCTOR("t_data_table");
    auto ncols = s.size();
    PSP_VERBOSE_ASSERT(
        std::all_of(
            v.begin(),
            v.end(),
            [ncols](const std::vector<t_tscalar>& vec) {
                return vec.size() == ncols;
            }
        ),
        "Mismatched row size found"
    );
    set_capacity(v.size());
    init();
    extend(v.size());
    std::vector<t_column*> cols = get_columns();
    for (t_uindex cidx = 0; cidx < ncols; ++cidx) {
        auto* col = cols[cidx];
        for (t_uindex ridx = 0, loop_end = v.size(); ridx < loop_end; ++ridx) {
            col->set_scalar(ridx, v[ridx][cidx]);
        }
    }
}

t_data_table::~t_data_table() {
    PSP_TRACE_SENTINEL();
    LOG_DESTRUCTOR("t_data_table");
}

const std::string&
t_data_table::name() const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return m_name;
}

void
t_data_table::init(bool make_columns) {
    PSP_TRACE_SENTINEL();
    LOG_INIT("t_data_table");
    m_columns = std::vector<std::shared_ptr<t_column>>(m_schema.size());

    if (make_columns) {
        for (t_uindex idx = 0; idx < int(m_schema.size()); ++idx) {
            const std::string& colname = m_schema.m_columns[idx];
            t_dtype dtype = m_schema.m_types[idx];
            m_columns[idx] =
                make_column(colname, dtype, m_schema.m_status_enabled[idx]);
            m_columns[idx]->init();
        }
    }

    m_init = true;
}

std::shared_ptr<t_column>
t_data_table::make_column(
    const std::string& colname, t_dtype dtype, bool status_enabled
) {
    t_lstore_recipe a(
        m_dirname,
        m_name + std::string("_") + colname,
        m_capacity * get_dtype_size(dtype),
        m_backing_store
    );
    return std::make_shared<t_column>(dtype, status_enabled, a, m_capacity);
}

t_uindex
t_data_table::num_columns() const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return m_schema.size();
}

t_uindex
t_data_table::num_rows() const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return m_size;
}

t_uindex
t_data_table::size() const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return num_rows();
}

t_dtype
t_data_table::get_dtype(const std::string& colname) const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return m_schema.get_dtype(colname);
}

std::shared_ptr<t_column>
t_data_table::get_column_safe(std::string_view colname) {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    t_uindex idx = m_schema.get_colidx_safe(colname.data());
    if (idx == -1) {
        return nullptr;
    }
    return m_columns[idx];
}

std::shared_ptr<t_column>
t_data_table::get_column(std::string_view colname) {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    t_uindex idx = m_schema.get_colidx(colname.data());
    return m_columns[idx];
}

std::shared_ptr<t_column>
t_data_table::get_column(std::string_view colname) const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    t_uindex idx = m_schema.get_colidx(colname.data());
    return m_columns[idx];
}

std::shared_ptr<t_column>
t_data_table::get_column_safe(std::string_view colname) const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    t_uindex idx = m_schema.get_colidx_safe(colname.data());
    if (idx == -1) {
        return nullptr;
    }
    return m_columns[idx];
}

std::shared_ptr<const t_column>
t_data_table::get_const_column(std::string_view colname) const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    t_uindex idx = m_schema.get_colidx(colname.data());
    return m_columns[idx];
}

std::shared_ptr<const t_column>
t_data_table::get_const_column_safe(std::string_view colname) const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    t_uindex idx = m_schema.get_colidx_safe(colname.data());
    if (idx == -1) {
        return nullptr;
    }
    return m_columns[idx];
}

std::shared_ptr<const t_column>
t_data_table::get_const_column(t_uindex idx) const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return m_columns[idx];
}

std::shared_ptr<const t_column>
t_data_table::get_const_column_safe(t_uindex idx) const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    if (idx == -1) {
        return nullptr;
    }
    return m_columns[idx];
}

std::vector<t_column*>
t_data_table::get_columns() {
    std::vector<t_column*> rval(m_columns.size());
    t_uindex idx = 0;
    for (const auto& c : m_columns) {
        rval[idx] = c.get();
        ++idx;
    }
    return rval;
}

std::vector<const t_column*>
t_data_table::get_const_columns() const {
    std::vector<const t_column*> rval(m_columns.size());
    t_uindex idx = 0;
    for (const auto& c : m_columns) {
        rval[idx] = c.get();
        ++idx;
    }
    return rval;
}

void
t_data_table::extend(t_uindex nelems) {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    PSP_VERBOSE_ASSERT(m_init, "Table not inited");
    for (t_uindex idx = 0, loop_end = m_schema.size(); idx < loop_end; ++idx) {
        m_columns[idx]->extend_dtype(nelems);
    }
    m_size = std::max(nelems, m_size);
    set_capacity(std::max(nelems, m_capacity));
}

void
t_data_table::set_size(t_uindex size) {
    PSP_TRACE_SENTINEL();
    for (t_uindex idx = 0, loop_end = m_schema.size(); idx < loop_end; ++idx) {
        m_columns[idx]->set_size(size);
    }
    m_size = size;
}

void
t_data_table::set_table_size(t_uindex size) {
    m_size = size;
}

void
t_data_table::reserve(t_uindex capacity) {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    for (t_uindex idx = 0, loop_end = m_schema.size(); idx < loop_end; ++idx) {
        m_columns[idx]->reserve(capacity);
    }
    set_capacity(std::max(capacity, m_capacity));
}

t_column*
t_data_table::_get_column(std::string_view colname) {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    t_uindex idx = m_schema.get_colidx(colname.data());
    return m_columns[idx].get();
}

const t_schema&
t_data_table::get_schema() const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return m_schema;
}

std::shared_ptr<t_data_table>
t_data_table::flatten() const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    PSP_VERBOSE_ASSERT(is_pkey_table(), "Not a pkeyed table");
    std::shared_ptr<t_data_table> flattened = std::make_shared<t_data_table>(
        "", "", m_schema, DEFAULT_EMPTY_CAPACITY, BACKING_STORE_MEMORY
    );
    flattened->init();
    flatten_body<std::shared_ptr<t_data_table>>(flattened);
    return flattened;
}

bool
t_data_table::is_pkey_table() const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return m_schema.is_pkey();
}

bool
t_data_table::is_same_shape(t_data_table& tbl) const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    return m_schema == tbl.m_schema;
}

void
t_data_table::pprint() const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    pprint(size(), &std::cout);
}

void
t_data_table::pprint(const std::string& fname) const {

    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    std::ofstream file;
    file.open(fname);
    pprint(size(), &file);
}

void
t_data_table::pprint(t_uindex nrows, std::ostream* os) const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");

    if (os == nullptr) {
        os = &std::cout;
    }

    t_uindex nrows_ = nrows != 0U ? nrows : num_rows();
    nrows_ = std::min(nrows_, num_rows());

    t_uindex ncols = num_columns();

    std::vector<const t_column*> columns(ncols);
    for (t_uindex idx = 0; idx < ncols; ++idx) {
        columns[idx] = m_columns[idx].get();
        (*os) << m_schema.m_columns[idx] << ", ";
    }

    (*os) << '\n';
    (*os) << "==========================" << '\n';

    for (t_uindex ridx = 0; ridx < nrows_; ++ridx) {
        for (t_uindex cidx = 0; cidx < ncols; ++cidx) {
            (*os) << columns[cidx]->get_scalar(ridx).to_string() << ", ";
        }
        (*os) << '\n';
    }
}

void
t_data_table::pprint(const std::vector<t_uindex>& vec) const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    t_uindex nrows = vec.size();
    t_uindex ncols = num_columns();

    std::vector<const t_column*> columns(ncols);
    for (t_uindex idx = 0; idx < ncols; ++idx) {
        columns[idx] = m_columns[idx].get();
        std::cout << m_schema.m_columns[idx] << ", ";
    }

    std::cout << '\n';
    std::cout << "==========================" << '\n';

    for (t_uindex ridx = 0; ridx < nrows; ++ridx) {
        for (t_uindex cidx = 0; cidx < ncols; ++cidx) {
            std::cout << columns[cidx]->get_scalar(vec[ridx]) << ", ";
        }
        std::cout << '\n';
    }
}

void
t_data_table::append(const t_data_table& other) {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");

    t_uindex cursize = size();

    std::vector<const t_column*> src_cols;
    std::vector<t_column*> dst_cols;

    src_cols.reserve(other.m_schema.m_columns.size());
    dst_cols.reserve(m_schema.m_columns.size());

    std::set<std::string> incoming;

    for (const auto& cname : other.m_schema.m_columns) {
        t_dtype col_dtype = get_column(cname)->get_dtype();
        t_dtype other_col_dtype = other.get_const_column(cname)->get_dtype();
        if (col_dtype != other_col_dtype) {
            std::stringstream ss;
            ss << "Mismatched dtypes for `" << cname
               << "`: attempted to append column of dtype `"
               << get_dtype_descr(other_col_dtype)
               << "` to existing column of dtype `"
               << get_dtype_descr(col_dtype) << "`" << '\n';
            std::cout << ss.str();
            PSP_COMPLAIN_AND_ABORT(ss.str())
        }
        src_cols.push_back(other.get_const_column(cname).get());
        dst_cols.push_back(get_column(cname).get());
        incoming.insert(cname);
    }
    t_uindex other_size = other.num_rows();

    for (const auto& cname : m_schema.m_columns) {
        if (incoming.find(cname) == incoming.end()) {
            get_column(cname)->extend_dtype(cursize + other_size);
        }
    }

    for (t_uindex colidx = 0; colidx < int(src_cols.size()); ++colidx) {
        dst_cols[colidx]->append(*(src_cols[colidx]));
    }

    set_capacity(std::max(m_capacity, m_size + other.num_rows()));
    set_size(m_size + other.num_rows());
}

void
t_data_table::clear() {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    for (const auto& m_column : m_columns) {
        m_column->clear();
    }
    m_size = 0;
}

t_mask
t_data_table::filter_cpp(
    t_filter_op combiner, const std::vector<t_fterm>& fterms_
) const {
    auto* self = const_cast<t_data_table*>(this);
    auto fterms = fterms_;

    t_mask mask(size());
    t_uindex fterm_size = fterms.size();
    std::vector<t_uindex> indices(fterm_size);
    std::vector<const t_column*> columns(fterm_size);

    for (t_uindex idx = 0; idx < fterm_size; ++idx) {
        indices[idx] = m_schema.get_colidx(fterms[idx].m_colname);
        columns[idx] = get_const_column(fterms[idx].m_colname).get();
        fterms[idx].coerce_numeric(columns[idx]->get_dtype());
        if (fterms[idx].m_use_interned) {
            t_tscalar& thr = fterms[idx].m_threshold;
            auto col = self->get_column(fterms[idx].m_colname);
            auto interned = col->get_interned(thr.get_char_ptr());
            thr.set(interned);
        }
    }

    switch (combiner) {
        case FILTER_OP_AND: {
            t_tscalar cell_val;

            for (t_uindex ridx = 0, rloop_end = size(); ridx < rloop_end;
                 ++ridx) {
                bool pass = true;

                for (t_uindex cidx = 0; cidx < fterm_size; ++cidx) {
                    if (!pass) {
                        break;
                    }

                    const auto& ft = fterms[cidx];
                    bool tval;

                    if (ft.m_use_interned) {
                        cell_val.set(*(columns[cidx]->get_nth<t_uindex>(ridx)));
                        cell_val.set_status(*(columns[cidx]->get_nth_status(ridx
                        )));
                    } else {
                        cell_val = columns[cidx]->get_scalar(ridx);
                    }

                    tval = ft(cell_val);
                    if (!tval) {
                        pass = false;
                        break;
                    }
                }

                mask.set(ridx, pass);
            }
        } break;
        case FILTER_OP_OR: {
            for (t_uindex ridx = 0, rloop_end = size(); ridx < rloop_end;
                 ++ridx) {
                bool pass = false;
                for (t_uindex cidx = 0; cidx < fterm_size; ++cidx) {
                    t_tscalar cell_val = columns[cidx]->get_scalar(ridx);
                    if (fterms[cidx](cell_val)) {
                        pass = true;
                        break;
                    }
                }
                mask.set(ridx, pass);
            }
        } break;
        default: {
            PSP_COMPLAIN_AND_ABORT("Unknown filter op");
        } break;
    }

    return mask;
}

t_uindex
t_data_table::get_capacity() const {
    return m_capacity;
}

t_data_table*
t_data_table::clone_(const t_mask& mask) const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    t_schema schema = m_schema;

    auto* rval = new t_data_table("", "", schema, 5, BACKING_STORE_MEMORY);
    rval->init();

    for (const auto& cname : schema.m_columns) {
        rval->set_column(cname, get_const_column(cname)->clone(mask));
    }

    rval->set_size(mask.count());
    return rval;
}

std::shared_ptr<t_data_table>
t_data_table::clone(const t_mask& mask) const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    auto* tbl = clone_(mask);
    return std::shared_ptr<t_data_table>(tbl);
}

std::shared_ptr<t_data_table>
t_data_table::clone() const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    t_schema schema = m_schema;
    auto rval =
        std::make_shared<t_data_table>("", "", schema, 5, BACKING_STORE_MEMORY);
    rval->init();

    for (const auto& cname : schema.m_columns) {
        rval->set_column(cname, get_const_column(cname)->clone());
    }
    rval->set_size(size());
    return rval;
}

std::shared_ptr<t_data_table>
t_data_table::borrow(const std::vector<std::string>& columns) const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    std::vector<t_dtype> dtypes;
    dtypes.reserve(columns.size());

    for (const auto& col : columns) {
        dtypes.push_back(m_schema.get_dtype(col));
    }

    t_schema borrowed_schema = t_schema(columns, dtypes);
    auto rval = std::make_shared<t_data_table>(
        "", "", borrowed_schema, 5, BACKING_STORE_MEMORY
    );
    rval->init();

    for (const auto& cname : borrowed_schema.m_columns) {
        rval->set_column(cname, get_column(cname));
    }

    rval->set_size(size());
    return rval;
}

std::shared_ptr<t_data_table>
t_data_table::join(const std::shared_ptr<t_data_table>& other_table) const {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");

    if (size() != other_table->size()) {
        std::stringstream ss;
        ss << "[t_data_table::join] Cannot join two tables of unequal sizes! "
              "Current size: "
           << size() << ", size of other table: " << other_table->size()
           << '\n';
        PSP_COMPLAIN_AND_ABORT(ss.str());
    }

    // join both schemas
    t_schema schema = m_schema;
    const t_schema& other_schema = other_table->get_schema();
    std::vector<std::string> other_columns;

    for (const std::string& column : other_schema.m_columns) {
        // Only append unique columns
        if (!schema.has_column(column)) {
            schema.add_column(column, other_schema.get_dtype(column));
            other_columns.push_back(column);
        }
    }

    std::shared_ptr<t_data_table> rval = std::make_shared<t_data_table>(
        "", "", schema, DEFAULT_EMPTY_CAPACITY, BACKING_STORE_MEMORY
    );

    // init() without initializing the t_columns on the returned table, as
    // they will be immediately replaced by the columns from the tables
    // we are joining together.
    rval->init(false);

    // borrow columns from the current table
    for (const std::string& column : m_schema.m_columns) {
        rval->set_column(column, get_column(column));
    }

    // and the columns we need from the other table
    for (const std::string& column : other_columns) {
        rval->set_column(column, other_table->get_column(column));
    }

    // Set size and capacity on the table only - don't mutate any of the
    // columns.
    rval->set_table_size(size());
    rval->set_capacity(std::max(get_capacity(), other_table->get_capacity()));

    return rval;
}

std::shared_ptr<t_column>
t_data_table::add_column_sptr(
    const std::string& name, t_dtype dtype, bool status_enabled
) {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");

    if (m_schema.has_column(name)) {
        return m_columns.at(m_schema.get_colidx(name));
    }
    m_schema.add_column(name, dtype);
    m_columns.push_back(make_column(name, dtype, status_enabled));
    m_columns.back()->init();
    m_columns.back()->reserve(
        std::max(size(), std::max(static_cast<t_uindex>(8), m_capacity))
    );
    m_columns.back()->set_size(size());
    return m_columns.back();
}

t_column*
t_data_table::add_column(
    const std::string& name, t_dtype dtype, bool status_enabled
) {
    return add_column_sptr(name, dtype, status_enabled).get();
}

void
t_data_table::drop_column(const std::string& name) {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");

    if (m_schema.has_column(name)) {
        auto idx = m_schema.get_colidx(name);
        auto col = m_columns[idx];
        // FIXME: make sure that we can erase columns from m_schema eventually.
        m_columns[idx]->clear();
    }
}

void
t_data_table::promote_column(
    std::string_view col_name,
    t_dtype new_dtype,
    std::int32_t iter_limit,
    bool fill
) {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");
    const auto* name = col_name.data();

    if (!m_schema.has_column(name)) {
        std::cout << "Cannot promote a column that does not exist." << '\n';
        return;
    }

    t_dtype current_dtype = m_schema.get_dtype(name);
    if (current_dtype == new_dtype) {
        return;
    }

    t_uindex idx = m_schema.get_colidx(name);
    std::shared_ptr<t_column> current_col = m_columns[idx];

    // create the new column and copy data
    std::shared_ptr<t_column> promoted_col =
        make_column(name, new_dtype, current_col->is_status_enabled());
    promoted_col->init();
    promoted_col->reserve(
        std::max(size(), std::max(static_cast<t_uindex>(8), m_capacity))
    );
    promoted_col->set_size(size());

    if (fill) {
        for (auto i = 0; i < iter_limit; ++i) {
            switch (new_dtype) {
                case DTYPE_INT64: {
                    auto* val = current_col->get_nth<std::int32_t>(i);
                    auto fval = static_cast<std::int64_t>(*val);
                    promoted_col->set_nth(i, fval);
                } break;
                case DTYPE_FLOAT64: {
                    auto* val = current_col->get_nth<std::int32_t>(i);
                    auto fval = static_cast<double>(*val);
                    promoted_col->set_nth(i, fval);
                } break;
                case DTYPE_STR: {
                    auto* val = current_col->get_nth<std::int32_t>(i);
                    std::string fval = std::to_string(*val);
                    promoted_col->set_nth(i, fval);
                } break;
                default: {
                    PSP_COMPLAIN_AND_ABORT(
                        "Columns can only be promoted to "
                        "int64, float64, or string type."
                    );
                }
            }
        }
    }

    // finally, mutate schema and columns
    m_schema.retype_column(name, new_dtype);
    set_column(idx, promoted_col);
}

void
t_data_table::set_column(t_uindex idx, std::shared_ptr<t_column> col) {
    m_columns[idx] = std::move(col);
}

void
t_data_table::set_column(
    const std::string& name, std::shared_ptr<t_column> col
) {
    t_uindex idx = m_schema.get_colidx(name);
    set_column(idx, std::move(col));
}

t_column*
t_data_table::clone_column(
    const std::string& existing_col, const std::string& new_colname
) {
    PSP_TRACE_SENTINEL();
    PSP_VERBOSE_ASSERT(m_init, "touching uninited object");

    if (!m_schema.has_column(existing_col)) {
        std::cout << "Cannot clone non existing column: " << existing_col
                  << '\n';
        return nullptr;
    }

    t_uindex idx = m_schema.get_colidx(existing_col);

    m_schema.add_column(new_colname, m_columns[idx]->get_dtype());
    m_columns.push_back(m_columns[idx]->clone());
    m_columns.back()->reserve(
        std::max(size(), std::max(static_cast<t_uindex>(8), m_capacity))
    );
    m_columns.back()->set_size(size());
    return m_columns.back().get();
}

std::string
t_data_table::repr() const {
    std::stringstream ss;
    ss << "t_data_table<" << this << ">";
    return ss.str();
}

void
t_data_table::verify() const {
    for (const auto& c : m_columns) {
        c->verify_size(m_capacity);
        c->verify();
    }

    for (const auto& c : m_columns) {
        PSP_VERBOSE_ASSERT(
            c, || (size() == c->size()), "Ragged table encountered"
        );
    }
}

void
t_data_table::reset() {
    for (const auto& m_column : m_columns) {
        if (m_column->get_dtype() == DTYPE_OBJECT) {
            m_column->clear_objects();
        }
        m_column->clear();
    }
    m_size = 0;
    m_capacity = DEFAULT_EMPTY_CAPACITY;
    init();
}

std::vector<t_tscalar>
t_data_table::get_scalvec() const {
    auto nrows = size();
    auto cols = get_const_columns();
    auto ncols = cols.size();
    std::vector<t_tscalar> rv;
    for (t_uindex idx = 0; idx < nrows; ++idx) {
        for (t_uindex cidx = 0; cidx < ncols; ++cidx) {
            rv.push_back(cols[cidx]->get_scalar(idx));
        }
    }
    return rv;
}

std::shared_ptr<t_column>
t_data_table::operator[](const std::string& name) {
    if (!m_schema.has_column(name)) {
        return {nullptr};
    }
    return m_columns[m_schema.get_colidx(name)];
}

bool
operator==(const t_data_table& lhs, const t_data_table& rhs) {
    return lhs.get_scalvec() == rhs.get_scalvec();
}

} // end namespace perspective
