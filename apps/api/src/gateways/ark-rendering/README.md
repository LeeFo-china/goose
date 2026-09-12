# Ark rendering gateway

`generateArkRendering(config, input, dependencies?)` performs one HTTP attempt to
`/images/generations`. References are positional: original room first, style image
second. It requests one watermarked image and accepts exactly one HTTPS image URL.
The request omits `sequential_image_generation`: the configured Seedream 5.0 Pro
endpoint rejected that parameter during the 2026-09-12 development smoke, while
the next request no longer returned that parameter rejection. The successful live
smoke needed 93.6 seconds, so callers must not assume a 60-second response window.

`requestArkVision(config, input, dependencies?)` submits the original room and the
actual generated result to `/chat/completions`. Returned text is **untrusted**.
The calling service must validate its advice schema and distinguish observations
from suggestions before persisting or displaying it. The gateway never assumes
physical dimensions, materials, or brand identity are established by an image.

Configuration must come from a trusted server-side provider resolver. This adapter
validates HTTPS and the `/api/v3` path, but provider host authorization and model
capabilities belong to the resolver. `2K` and `4K` are adapter-supported parameters;
the caller must verify the selected model supports its requested size and both
reference images. The adapter never loads secrets from storage or environment.

There is no automatic retry, task ID, or assumed provider idempotency. Timeout,
network failure, ambiguous HTTP status, invalid/truncated output, and oversized
responses produce `submission_unknown`. The caller must persist that distinction
and must not automatically re-submit an image generation. Known rejection statuses
are separately classified. Public errors contain only a fixed message, stable
code, outcome, and optional HTTP status; upstream messages and bodies are omitted.

Successful metadata contains only allowlisted nonnegative integer usage fields
and a safe `X-Request-Id` header when it actually exists. A request ID is for
correlation, not a recoverable provider task.

Limits: HTTPS URLs 8192 characters, prompt 32000 characters, response 1 MiB,
vision text 64000 characters, timeout 1–600000 ms. Deadlines cover both submission
and response reading; redirects are disabled and rejected bodies are canceled.

Protocol references (official sources checked 2026-09-11):

- [Images API documentation](https://www.volcengine.com/docs/82379/1541523)
- [SDK image request parameters](https://github.com/volcengine/volcengine-python-sdk/blob/master/volcenginesdkarkruntime/resources/images/images.py)
- [SDK image response and usage types](https://github.com/volcengine/volcengine-python-sdk/blob/master/volcenginesdkarkruntime/types/images/images.py)
- [SDK chat request parameters](https://github.com/volcengine/volcengine-python-sdk/blob/master/volcenginesdkarkruntime/resources/chat/completions.py)
- [SDK image message type](https://github.com/volcengine/volcengine-python-sdk/blob/master/volcenginesdkarkruntime/types/chat/chat_completion_content_part_image_param.py)
- [SDK base URL and correlation header constants](https://github.com/volcengine/volcengine-python-sdk/blob/master/volcenginesdkarkruntime/_constants.py)

Verification from `apps/api`: `bun test src/gateways/ark-rendering/client.test.ts`
and `bun run typecheck`. All tests inject local HTTP responses and use fabricated
credentials. They do not call paid generation or a remote database.
