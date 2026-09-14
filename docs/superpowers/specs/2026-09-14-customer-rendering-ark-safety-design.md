# Customer rendering: use Ark's image safety gate

**Decision (2026-09-14):** Remove Tencent Cloud CI image moderation from the customer upload-to-generation path, for both input and generated output. Keep Tencent COS for private object storage. The user approved this direction after the Douyin experience build left a normalized room photo in `pending_review` with a manual COS verdict.

## Scope and invariant

The customer uploads a room photo and optional floor plan. The API verifies ownership, size, media type, and image decodability, normalizes the image, and stores it privately. A normalized image becomes `ready` for an Ark request; `ready` is not a claim that any content service approved the image. Task admission still checks tenant, channel, application/installation, subject, purpose, normalized object, style snapshot, quota, and idempotency. The generation worker sends the room image and published style reference to Ark with the account's standard safety guardrail enabled. It never invokes COS CI. The returned image is downloaded, validated, normalized, stored privately, and only then exposed through a short-lived signed URL. COS is storage only.

This changes the trust boundary: Ark's accepted generation response, rather than a second independent COS CI verdict, is the content decision for this feature. Before enabling production task admission, verify in the Ark console that the selected endpoint uses the standard guardrail and has not opted into a custom policy that disables it. Do not represent a successful response as a separate audit verdict. Preserve model code, provider request ID when supplied, and attempt/result facts for incident review.

## Input transition and existing records

Introduce `ready` into the input status constraint and API contract. The normalization write sets `ready` and no review due date or review decision. Input review polling and its CI gateway are retired. A forward migration converts existing normalized `pending_review` rows, including manual verdicts, and existing `approved` rows to `ready` only when normalized object metadata is complete. It preserves their historical review fields as evidence but clears the review queue; new admission does not interpret those fields as approval. Existing `rejected`, `failed`, and incomplete images stay ineligible and require a fresh upload. The migration must preserve previous decisions without calling a bypass an approval.

The Douyin client accepts `ready` for generation and labels it “图片已就绪，生成时由模型校验内容”. It no longer offers an image audit-status polling action. The upload/status responses carry `ready`; historical statuses remain parseable during rollout. The mini-program's platform audit banner is separate from this feature and remains unchanged.

## Job transition and accounting

The generation worker retains the one-attempt Ark submission rule: pre-submit failure can release the reservation; explicit upstream rejection ends the job and releases the reservation; timeout, transport ambiguity, post-response storage failure, or settlement uncertainty goes to `review_required` for operator reconciliation, with no automatic resubmission. Safety rejections should use provider code when identifiable and not be inferred from an arbitrary 4xx as a precise moderation verdict. A valid Ark image response with a stored, complete result can finalize `succeeded` and consume quota without an output CI record. The database success constraint, `finalize_customer_rendering_job` RPC, status repository, and signed-result service must agree on this invariant. Legacy successful jobs with COS review evidence remain readable.

The operator-only reconcile RPC must be able to approve a `review_required` attempt only when durable facts prove Ark returned an image and a complete private result exists; it still requires operator and evidence references. Unknown submissions cannot be approved. Historical COS review records remain immutable. No migration or application code manually settles production quota rows outside the existing RPCs.

## Rollout and verification

Deploy the additive migration before the new API and worker, while task admission and both workers are disabled. Stop and remove the input review worker from deployment selection, runtime configuration, and release checks. Deploy API and generation worker with admission still closed, verify input `ready` and a single bounded Ark generation in a test tenant, then enable admission. Upload the updated Douyin template and verify an existing normalized manual image becomes ready after status refresh, a new image becomes ready immediately, a provider rejection does not expose a result, and a successful job returns a signed private result. Keep the job worker disabled if Ark guardrail status cannot be verified.

Rollback is a forward migration and application rollback with admission disabled first. Preserve all jobs, result objects, old CI decisions, provider attempts, and quota reservations; reconcile uncertain attempts explicitly before reopening admission. Do not restore the old review worker against the new `ready` state without a compatible migration.
