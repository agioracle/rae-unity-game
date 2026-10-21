# Evidence Claims and Acceptance

Record evidence, implementation, and acceptance separately.

## Independent dimensions

### Evidence grade

- `A_direct_static`: Exact package, configuration, serialized or code bytes or fields have stable locators and hashes.
- `B_structural`: Multiple static relationships support a high-confidence conclusion with stated inference.
- `C_runtime_observation`: A named, authorized runtime case captures behavior in a recorded environment.
- `design_fill`: An authored substitute replaces unavailable evidence.
- `unknown`: Evidence is insufficient or conflicting.

### Evidence verdict

- `exact`: Current-version evidence directly reproduces the result.
- `derived`: A recorded deterministic transform produces the result from exact evidence.
- `inferred`: Evidence supports the conclusion without direct proof.
- `temporary_approximation`: The implementation remains explicitly provisional.
- `evidence_blocked`: Current evidence prevents exact implementation.
- `product_override`: The user authorizes behavior that differs from the original.

### Implementation status

Use ledger status independently:
`planned`, `evidence_ready`, `implementing`, `implemented_unverified`, `runtime_verified`, `user_verified`, `deferred`, `evidence_blocked`, `product_override`, or `reverted`.

Never infer one dimension from another.

## Canonical claim record

```yaml
schema_version: 1
claim_id:
module:
question:
claim:
evidence_grade: A_direct_static | B_structural | C_runtime_observation | design_fill | unknown
evidence_verdict: exact | derived | inferred | temporary_approximation | evidence_blocked | product_override
implementation_status:
package_identity:
  package_id:
  version_code:
  version_name:
  source_sha256: []
search_scope:
queries: []
exact_sources: []
source_locators:
  - domain: path_field | unity_guid_fileid | unity_pathid | managed_token | native_rva | capture_case
    value:
source_hashes: []
asset_or_code_chain: []
runtime_case_ids: []
implementation_paths: []
acceptance_markers: []
proves: []
does_not_prove: []
unresolved: []
filtered_or_sampled: false
truncated: false
next_narrow_query:
last_verified_at:
```

Preserve source nulls, duplicates, misspellings, sentinels, ordering, conflicting versions, and unknown fields.
Normalize only in a derived schema with a reversible mapping.
Apply `token-efficient-evidence-retrieval.md` for search scope and counts.

## Locator domains

Qualify every integer with its domain:

| Domain | Meaning |
|---|---|
| Path + field | Config or YAML field at an exact path. |
| Unity GUID + fileID | Project-asset reference. |
| Serialized file + PathID | Built-player object. |
| Assembly + metadata token | Managed type or method. |
| ABI binary + RVA or offset | Native IL2CPP function. |
| Runtime case + timestamp or frame | Observed state. |

ABI means application binary interface.
RVA means relative virtual address.
Record mappings between domains.
Do not equate built-player PathIDs with project fileIDs.
A metadata token needs an address map to identify a native body.

## Source precedence

Prefer this order when appropriate to the question:

1. Current package bytes, serialized fields, and configs.
2. Deterministic output from that package with recorded transforms and hashes.
3. Independent structural support across code, assets, and references.
4. Authorized observation of the same package and version.
5. Explicit design fill or product override.

Never silently substitute older packages, other ABIs or versions, community dumps, reconstructed projects, or plausible assets.

## Acceptance markers

Each validation artifact should state scope and proof boundaries:

```yaml
marker_id:
case_id:
package_hashes: []
replica_commit_or_build:
tool_versions: {}
command_or_steps:
environment:
started_at:
finished_at:
result: pass | fail | blocked | partial
observations: []
proves: []
does_not_prove: []
artifacts: []
```

Select validation layers for the claim.
These include identity, typed fields, import, compilation, core tests and serialization round trips.
Other layers cover interaction, persistence, GPU comparison, audio comparison, performance and paired cases.

| Evidence | Proves | Does not prove |
|---|---|---|
| Matching asset hashes | Byte identity. | Runtime selection. |
| Animation event timestamp | Serialized timing. | Receiver state changes or calculations. |
| Batch smoke test | Startup in that environment. | Shader or device visual parity. |
| Replica invariant test | Replica behavior. | The original algorithm. |
| One representative variant | That mapping. | The entire family. |

## Claim wording

State the subject and scope: “the current package contains,” “the derived index maps,” or “the replica passes.”
Qualify paired comparisons with the case and recorded tolerance.
Use “original source recovered,” “100%,” “fully identical,” or “1:1” only when scope, versions, evidence, and acceptance support the claim.
