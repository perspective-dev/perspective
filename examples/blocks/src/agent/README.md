# Agent

The `<perspective-viewer>` chat sidebar, configured through a simple provider
form. The viewer's embedded agent (`viewer.agentConfig({...})`) drives the view
through its tool surface — schema inspection, view configuration, plugin
selection and ExprTK expression authoring — against any of these providers:

- **OpenAI-compatible** — any local or remote server speaking
  `/chat/completions`, e.g. [LM Studio](https://lmstudio.ai)'s developer server
  (`http://localhost:1234/v1`, **enable CORS** in its server settings), Ollama
  (`http://localhost:11434/v1`, set `OLLAMA_ORIGINS`), llama.cpp or vLLM.
  Tool-calling quality is model-dependent — Qwen and Llama 3.1+ instruct models
  work well.
- **Anthropic** — `claude-opus-5` by default; requires an API key, which is sent
  directly from the browser (Anthropic's CORS opt-in) — suitable for local
  development; use a `baseUrl` proxy for anything shared.
- **Gemini** — `gemini-2.5-flash` by default; requires an API key, sent directly
  from the browser (the Gemini API is CORS-enabled) — same local-development
  caveat.
- **WebLLM** — runs the model in this tab on WebGPU, so no prompt or data leaves
  the machine and no key is needed. Selecting it lazily imports
  [`@mlc-ai/web-llm`](https://github.com/mlc-ai/web-llm) and downloads model
  weights (gigabytes on a cold cache; the browser caches them afterwards). Only
  the **Hermes** family is offered — see the caveat below.

CORS-friendly hosted services that speak the OpenAI wire format (e.g.
[Groq](https://groq.com) at `https://api.groq.com/openai/v1`, or
[OpenRouter](https://openrouter.ai) at `https://openrouter.ai/api/v1`) work
through the **OpenAI-compatible** provider — just set the base URL and key.
