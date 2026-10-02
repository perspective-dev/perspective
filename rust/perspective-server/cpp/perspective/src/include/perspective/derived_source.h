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
#include <perspective/scalar.h>
#include <perspective/schema.h>
#include <perspective/table.h>
#include <perspective/view.h>
#include <perspective/context_zero.h>
#include <perspective/context_one.h>
#include <perspective/context_two.h>
#include <perspective/context_unit.h>
#include <tsl/hopscotch_map.h>
#include <functional>
#include <limits>
#include <memory>
#include <string>
#include <vector>

namespace perspective {

/**
 * @brief How one cell of a derived table's step is written.
 */
enum t_derived_cell_state : std::uint8_t {
    DERIVED_CELL_KEEP,
    DERIVED_CELL_CLEAR,
    DERIVED_CELL_SET
};

/**
 * @brief One row of a derived table touched by a step of its source.
 */
struct PERSPECTIVE_EXPORT t_derived_member {
    t_tscalar m_pkey;
    t_uindex m_row = 0;
    bool m_deleted = false;
    t_uindex m_handle = 0;
    t_uindex m_depth = 0;
    std::vector<t_tscalar> m_path;
    std::vector<std::pair<t_uindex, t_tscalar>> m_cells;
};

/**
 * @brief Feeds a read-only derived `Table` from the state of a `View`.
 */
class PERSPECTIVE_EXPORT t_derived_source {
public:
    virtual ~t_derived_source() = default;

    /**
     * @brief The schema a derived table has when none is supplied.
     */
    virtual t_schema infer_schema() const = 0;

    virtual t_dtype pkey_dtype() const = 0;

    virtual std::string index() const;

    virtual std::uint32_t limit() const;

    /**
     * @brief Bind `child` to this source and load every current member.
     */
    void attach(const std::shared_ptr<Table>& child);

    /**
     * @brief Propagate the parent's last step, returning whether the child
     * changed, notifying its contexts only when `notify` is set.
     */
    bool step(bool notify);

    const std::shared_ptr<Table>& child() const;

    /**
     * @brief Stop recording changes on the parent for this source.
     */
    virtual void detach();

protected:
    virtual void resolve(const t_schema& schema) = 0;

    /**
     * @brief The parent context's storage generation, which advances when
     * its storage is replaced.
     */
    virtual t_uindex storage_generation() const = 0;

    bool take_replaced();

    void init_pct_flags(const t_view_config& config);

    virtual void
    collect(bool full, std::vector<t_derived_member>& members) = 0;

    virtual void fill(
        const t_derived_member& member,
        t_uindex idx,
        const std::vector<t_column*>& columns
    ) const = 0;

    /**
     * @brief The parent column that child column `cidx` may read in place
     * of owning a copy, if any.
     */
    virtual std::shared_ptr<t_column> alias_column(t_uindex cidx) const;

    /**
     * @brief The value an aliased column held before this step, when the
     * source knows it differs from the current one.
     */
    virtual bool previous(
        const t_derived_member& member, t_uindex cidx, t_tscalar& out
    ) const;

    t_index bound_row(const t_tscalar& pkey) const;

    std::shared_ptr<Table> m_child;
    std::vector<std::string> m_columns;
    bool m_attached = false;
    t_uindex m_generation = 0;
    bool m_pct_parent = false;
    bool m_pct_grand = false;
};

/**
 * @brief Build the source for a view of the given context type.
 */
PERSPECTIVE_EXPORT std::shared_ptr<t_derived_source> make_derived_source(
    const std::shared_ptr<View<t_ctxunit>>& view,
    const std::shared_ptr<Table>& parent
);

PERSPECTIVE_EXPORT std::shared_ptr<t_derived_source> make_derived_source(
    const std::shared_ptr<View<t_ctx0>>& view,
    const std::shared_ptr<Table>& parent
);

PERSPECTIVE_EXPORT std::shared_ptr<t_derived_source> make_derived_source(
    const std::shared_ptr<View<t_ctx1>>& view,
    const std::shared_ptr<Table>& parent
);

PERSPECTIVE_EXPORT std::shared_ptr<t_derived_source> make_derived_source(
    const std::shared_ptr<View<t_ctx2>>& view,
    const std::shared_ptr<Table>& parent
);

} // namespace perspective
