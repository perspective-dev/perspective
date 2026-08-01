# Configuring the LLM agent

`<perspective-viewer>` ships with an embedded LLM agent which drives the viewer
through its public API — reading the schema, writing the `ViewerConfig`,
choosing a plugin, authoring ExprTK expressions and managing panels. It is
**opt-in**: the **Chat** tab in the settings sidebar stays hidden, and no
network request is ever made, until you call
`HTMLPerspectiveViewerElement::agentConfig`.

```javascript
import { providers } from "@perspective-dev/viewer";

const viewer = document.querySelector("perspective-viewer");
viewer.agentConfig({
    ...providers.anthropic,
    apiKey: "sk-ant-...",
});
```

## Connecting to a model

The agent core connects via OpenAI chat-completions conventional API, over
primitive connection fields. Exactly one of `url` or `engine` is required:

- `url` — a full chat-completions endpoint. Any OpenAI-compatible service works:
  the Anthropic and Gemini compatibility endpoints, OpenRouter, LM Studio,
  Ollama, llama.cpp, vLLM, or your own proxy.
- `engine` — an in-page engine object exposing
  `chat.completions.create(request)`, e.g.
  [WebLLM](https://github.com/mlc-ai/web-llm)'s `MLCEngine`. Mutually exclusive
  with `url`.

The remaining connection fields are `headers`, `apiKey` (sugar for an
`Authorization: Bearer` header), `model`, and `name`. The `providers` export
supplies presets for the common ones — `anthropic`, `gemini`, `openai`,
`openrouter`, `lmstudio` and `ollama` — and spread order is override order:

```javascript
viewer.agentConfig({
    ...providers.anthropic,
    apiKey: "sk-ant-...",
    model: "claude-haiku-4-5", // overrides the preset's default
});
```

Local servers usually need their CORS opt-in enabled first:
[LM Studio](https://lmstudio.ai/) has a setting in its developer server panel,
and Ollama reads `OLLAMA_ORIGINS`.

> **A key in `agentConfig` is a key in the browser tab.** It is sent directly to
> the provider from the page, which is fine for local development and internal
> tools, but for anything shared you should point `url` at a proxy you control
> and keep the credential on the server.

Tool-calling quality varies more than general chat quality does. Frontier models
handle the viewer's tool surface reliably; among local models, recent Qwen and
Llama instruct builds are the ones to try first.

### In-page engines

An `engine` runs the model in the tab, so no prompt and no data leave the
machine and no key is involved. [WebLLM ](https://github.com/mlc-ai/web-llm) for
example:

```javascript
import * as webllm from "@mlc-ai/web-llm";

const engine = await webllm.CreateMLCEngine(
    "Hermes-3-Llama-3.1-8B-q4f16_1-MLC",
    { initProgressCallback: (x) => console.log(x.text) },
    { context_window_size: 16384 },
);

viewer.agentConfig({
    name: "webllm",
    engine,
    systemRole: "user",
});
```

## The documentation bundle

`<perspective-viewer>` publishes a metadata bundle at
`dist/docs/perspective-docs.json` containing a searchable corpus of the
Perspective documentation plus generated JSON schemas for the viewer's config
types. Passing it as `docs` is optional, but without it the agent will not be
very capable — it is what lets the agent look things up rather than guess:

```javascript
import docs from "@perspective-dev/viewer/dist/docs/perspective-docs.json" with { type: "json" };

viewer.agentConfig({ ...providers.anthropic, apiKey: "sk-ant-...", docs });

// ... or ...

viewer.agentConfig({
    ...providers.anthropic,
    apiKey: "sk-ant-...",
    docs: fetch(
        "node_modules/@perspective-dev/viewer/dist/docs/perspective-docs.json",
    ),
});
```

Without it the agent still works: `search_docs` searches an empty corpus and the
tool parameter schemas degrade to permissive objects. The practical difference
is how often a weaker model invents a field name that doesn't exist, or writes
an ExprTK expression against syntax Perspective doesn't have.

### Telling the agent about your data

The agent learns column names and types from `get_schema`, but not what they
_mean_ — that `Discount` is a ratio rather than a percent, or that a negative
`Profit` is a return rather than an error. Add those notes as extra corpus
entries:

```javascript
import bundle from "@perspective-dev/viewer/dist/docs/perspective-docs.json" with { type: "json" };

const DATASET_DOCS = [
    {
        title: "Superstore columns",
        text: "`Discount` is a ratio in [0, 1], not a percent. `Profit` is net of `Discount` and is negative for returns.",
    },
];

viewer.agentConfig({
    ...providers.anthropic,
    apiKey: "sk-ant-...",
    docs: { ...bundle, chunks: [...bundle.chunks, ...DATASET_DOCS] },
});
```

An inline `[{title?, text}]` array may also be passed as `docs` on its own, when
you have host notes but no packaged bundle.