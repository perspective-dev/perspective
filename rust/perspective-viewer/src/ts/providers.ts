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

/**
 * LLM provider presets for `viewer.agentConfig()`. These are plain data —
 * the agent core is provider-agnostic (one OpenAI-chat-completions protocol
 * over primitive `url`/`headers`/`apiKey` connection fields), so a
 * "provider" is just a spreadable collection of those fields:
 *
 * ```javascript
 * import { providers } from "@perspective-dev/viewer";
 * viewer.agentConfig({
 *     ...providers.anthropic,
 *     apiKey: "sk-ant-...",
 *     model: "claude-haiku-4-5",       // spread order = override order
 * });
 * ```
 *
 * Any OpenAI-compatible service works without a preset — pass its full
 * chat-completions `url` (and `apiKey`/`headers` as needed) directly.
 * Cloud presets call the provider from the browser tab; suitable for local
 * development, or route `url` through your own proxy for production.
 */

/**
 * A spreadable connection preset for `viewer.agentConfig()`.
 */
export interface AgentProviderPreset {
    name: string;
    url: string;
    headers?: Record<string, string>;
    model?: string;
}

export const providers = {
    /**
     * Anthropic's OpenAI-compatibility endpoint. `apiKey` required.
     */
    anthropic: {
        name: "anthropic",
        url: "https://api.anthropic.com/v1/chat/completions",
        headers: { "anthropic-dangerous-direct-browser-access": "true" },
        model: "claude-opus-5",
    },

    /**
     * Google Gemini's OpenAI-compatibility endpoint. `apiKey` required.
     */
    gemini: {
        name: "gemini",
        url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        model: "gemini-2.5-flash",
    },

    /**
     * LM Studio's local developer server (enable CORS in its settings).
     */
    lmstudio: {
        name: "lmstudio",
        url: "http://localhost:1234/v1/chat/completions",
    },

    /**
     *  Local Ollama (set `OLLAMA_ORIGINS` for CORS).
     */
    ollama: {
        name: "ollama",
        url: "http://localhost:11434/v1/chat/completions",
    },

    /**
     * OpenRouter. `apiKey` required.
     */
    openrouter: {
        name: "openrouter",
        url: "https://openrouter.ai/api/v1/chat/completions",
    },

    /**
     * OpenAI. `apiKey` required.
     */
    openai: {
        name: "openai",
        url: "https://api.openai.com/v1/chat/completions",
        model: "gpt-5.2",
    },
} as const satisfies Record<string, AgentProviderPreset>;
