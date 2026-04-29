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
#include <perspective/vocab.h>

namespace perspective {
class PERSPECTIVE_EXPORT t_expression_vocab {
public:
    PSP_NON_COPYABLE(t_expression_vocab);

    t_expression_vocab();

    /**
     * @brief Given a const char* to a string, intern it into the current
     * vocab page, and return the pointer to the string that has been
     * interned into the vocab. The returned pointer is guaranteed to be
     * valid for the lifetime of the `t_expression_vocab` instance.
     *
     * @param str
     * @return const char*
     */
    const char* intern(const char* str);
    const char* intern(const std::string& str);

    void clear();

    /**
     * @brief Returns the empty string owned by the vocab, which will be valid
     * as long as the vocab is alive.
     *
     * @return const char*
     */
    const char* get_empty_string() const;

    void pprint() const;

private:
    void allocate_new_vocab();

    std::vector<t_vocab> m_vocabs;

    // The number of strings to store in each page of the vocab.
    // t_vocab::reserve(byte_length, num_strings) takes both the bytelength
    // of all strings to be reserved, as well as the # of strings to reserve.
    // Assume that strings are up to 64 bytes, and whenever we reach
    // EXPRESSION_VOCAB_CAPACITY strings OR go over
    // EXPRESSION_VOCAB_CAPACITY * 64 bytes, allocate a new page.
    // TODO: this leaves edge cases where we allocate new pages too eagerly,
    // or we aren't using the allocated space as efficiently as possible.
    std::size_t m_initial_vocab_size;
    std::size_t m_max_vocab_size;

    std::size_t m_current_vocab_size;

    // An empty string for validation functions to use.
    std::string m_empty_string;
};

} // end namespace perspective