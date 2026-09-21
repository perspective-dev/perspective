# LLM and agent-driven analytics

<!-- description: Perspective's perspective-viewer includes an opt-in LLM agent which turns plain-language questions into pivots, filters, expressions and charts by driving the viewer's public API. It works with Anthropic, OpenAI, Gemini, OpenRouter and local models such as Ollama, LM Studio and WebLLM. -->

`<perspective-viewer>` ships with an embedded LLM agent. A user types "show me
monthly revenue by region as a stacked bar, top five only", and the agent
reads the table's schema, writes the view configuration, authors any computed
columns it needs, picks the chart, and applies it — through the same public
API your own code would use.

It is **opt-in**. The Chat tab stays hidden and no network request is made
until you configure a model:

```javascript
import { providers } from "@perspective-dev/viewer";

const viewer = document.querySelector("perspective-viewer");
viewer.agentConfig({
    ...providers.anthropic,
    apiKey: "sk-ant-...",
});
```

## Why an agent fits Perspective

An LLM is good at translating intent into a small, structured configuration,
and unreliable at arithmetic over data it has to read. Perspective's
configuration is exactly that kind of target: a complete analysis — grouping,
column splits, aggregates, filters, sorts, expressions, chart type — is a few
lines of JSON, and the numbers are computed by the engine, not the model.

- The agent's tools read the table's schema and the viewer's configuration —
  none of them read rows, so your data is not sent to the model.
- Every answer is an ordinary, inspectable viewer configuration. The user can
  see exactly what was grouped and filtered, adjust it by hand, and save it.
- Because the engine is incremental, an agent-built view over streaming data
  keeps updating after the conversation ends.

## Any model, including local ones

The agent speaks the OpenAI chat-completions convention, so it works with
Anthropic, OpenAI, Gemini and OpenRouter endpoints, with local servers such as
[Ollama](https://ollama.com/), [LM Studio](https://lmstudio.ai/), llama.cpp and
vLLM, and with in-page engines such as
[WebLLM](https://github.com/mlc-ai/web-llm) — in which case the data, the
query engine and the model all run inside the browser tab.

## Keys and production use

A key passed to `agentConfig` is a key in the browser. That is fine for local
development and internal tools; for anything shared, point `url` at a proxy
you control and keep the credential on the server. See
[Configuring the LLM agent](../how_to/javascript/agent.md) for the full
connection options.

## Driving Perspective from your own agent

The agent uses no private hooks. `restore()`, `save()`, `Table.schema()` and
`View` are the complete surface, and a view configuration is plain JSON — so
an external agent, a notebook assistant or an MCP tool can produce the same
results by emitting a `ViewerConfig`. The guide is published for that purpose
as Markdown at [`/llms.txt`](https://perspective-dev.github.io/llms.txt) and
[`/llms-full.txt`](https://perspective-dev.github.io/llms-full.txt).
