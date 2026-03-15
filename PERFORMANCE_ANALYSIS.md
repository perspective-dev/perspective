# C++ Engine Performance Analysis

Deep analysis of runtime performance optimization opportunities in
`rust/perspective-server/cpp/perspective/src`.

## High Priority

### 1. Sort comparator NaN check overhead
**Files**: `include/perspective/multi_sort.h:104-154`, `cpp/multi_sort.cpp:154-208`

`cmp_mselem` calls `nan_compare()` on every comparison, even for non-float
columns. `nan_compare()` calls `is_floating_point()` twice and `to_double()`
twice before determining NaN status is irrelevant. For integer/string/date
columns, this is pure overhead called O(n log n) times per sort.

**Fix**: Guard `nan_compare()` behind `first.is_floating_point() ||
second.is_floating_point()` check.

### 2. Repeated `to_double()` and ABS bug in sort paths
**Files**: `cpp/multi_sort.cpp:113-132`

In `get_minmax_idx`, the ABS cases use `as_bool()` instead of `to_double()`
for min/max tracking — this is a correctness bug. Additionally, the min/max
double values are recomputed from the tracked scalars inside each loop
iteration instead of being cached as doubles.

**Fix**: Track min/max as doubles directly, use `to_double()` instead of
`as_bool()`.

### 3. Cache-hostile `t_mselem` layout
**Files**: `include/perspective/multi_sort.h:23-38`, `cpp/multi_sort.cpp:23-76`

`t_mselem` contains `std::vector<t_tscalar> m_row`, causing a heap allocation
per element. During `std::sort`, these elements are moved frequently. Each move
requires pointer manipulation and the data is scattered across the heap,
destroying cache locality. Typical sort column counts are 1-4.

**Fix**: Replace `std::vector<t_tscalar>` with a fixed-capacity inline array
(`t_sortrow_vec`) that stores up to 8 elements without heap allocation.

### 4. Switch statement inside arg_sort comparator
**Files**: `cpp/arg_sort.cpp:39-64`, `include/perspective/arg_sort.h:26-35`

`t_argsort_comparator::operator()` contains a switch on `m_sort_type` that is
evaluated on every comparison during `std::sort`. The sort type is constant for
the lifetime of the sort.

**Fix**: Template-specialize the comparator on sort type and dispatch once at
call site.

## Medium Priority

### 5. `get_dominant()` uses O(n log n) sort for mode
**File**: `cpp/sparse_tree.cpp:47`

Full `std::sort` to find the most frequent value. An `unordered_map` frequency
count is O(n).

### 6. Buffer overallocation in aggregation
**File**: `cpp/aggregate.cpp:290`

Allocates buffer sized to entire column when only the leaf range is needed.

### 7. No batched column access
**File**: `include/perspective/column.h:107`

`get_nth()` does per-element bounds checking. Sequential access patterns should
use raw pointer arithmetic.

### 8. Scalar arithmetic always promotes to float64
**File**: `cpp/scalar.cpp:36-47`

`BINARY_OPERATOR_BODY` macro calls `to_double()` on both operands for every
arithmetic operation in expressions. Integer columns don't need this.

## Lower Priority

### 9. SIMD for numeric aggregates
**File**: `include/perspective/aggregate.h:48-50`

`std::accumulate` for SUM/COUNT is scalar. AVX2 or `#pragma omp simd` could
help on large columns.

### 10. Dense tree loop fusion
**File**: `cpp/dense_tree.cpp:185-315`

Multiple separate passes over the same data could be fused for cache locality.

## Summary

| # | Issue | Est. Impact | Status |
|---|-------|-------------|--------|
| 1 | NaN check in non-float sort | 10-20% sort speedup | DONE |
| 2 | ABS bug + redundant to_double | 15-25% ABS sort speedup | DONE |
| 3 | t_mselem heap allocation | 10-15% sort speedup | DONE |
| 4 | Switch in arg_sort comparator | 5-10% simple sort speedup | DONE |
| 5 | get_dominant O(n log n) | 50-70% for mode calc | DONE |
| 6 | Aggregate buffer overalloc | Memory improvement | DONE |
| 7 | No batched column access | 10-20% sequential reads | DONE |
| 8 | Scalar always float64 | 2-5% expression speedup | DONE |
| 9 | SIMD for numeric aggregates | Throughput improvement | DONE |
| 10 | Dense tree loop fusion | Cache improvement | DONE |
