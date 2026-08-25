# ForgeRoom in-chat generative UI specification

| Field | Value |
| --- | --- |
| Status | Canonical implementation contract |
| Decision | ADR-007 |
| Runtime carriage | Standard AG-UI tool, state and activity events inside the durable channel envelope |
| P0 rail | Controlled React component registry only |
| P1 experimental rail | Per-response declarative generated document in an opaque-origin iframe with a fixed application bootstrap |

Release boundary: P0 implements only `registry_v1`. It must not advertise `generate_open_ui`, accept `iframe_v1`, persist iframe source/revisions, issue render capabilities, deploy the generated origin or require iframe preflight. The detailed iframe contract remains canonical for the separately gated P1 implementation.

## Purpose

ForgeRoom may turn a coworker result into an interactive surface inside the channel. The surface can be a table, chart, relationship graph, image gallery, bounded form, trusted human-in-the-loop card, or a purpose-built mini-interface generated progressively during a run.

This document defines the application-owned render schemas, state model, grants, interaction gateway, sandbox, replay behavior, limits, and acceptance tests. AG-UI carries runtime events. AG-UI is not the generative-UI schema, authorization model, persistent state store, or browser security boundary.

Normative terms such as MUST, MUST NOT, SHOULD, and MAY have their usual requirements meaning.

## Core invariants

1. Model output, generated props/documents, external data, and iframe messages are untrusted.
2. The application API remains the authorization boundary. The browser and AG-UI stream never grant authority.
3. A render grant, data grant, and action grant are separate objects. Possession of one never implies either of the others.
4. The registry rail renders only versioned, schema-valid application components. It never evaluates model-authored HTML, JavaScript, CSS, template expressions, URLs, or React component names.
5. The P1 iframe rail runs only complete, validated, immutable HTML/CSS plus a declarative behavior manifest. Model-authored JavaScript is rejected; only a versioned, hash-pinned application bootstrap executes.
6. An iframe cannot call application or provider APIs. It can emit typed interaction intents to the parent; the server interaction gateway decides what, if anything, may happen.
7. Consequential actions always leave the generated surface and enter trusted host UI. Generated pixels may imitate a control, but they have no authority to approve, deny, answer, or replace a canonical control.
8. Canonical UI state and revision history live in application storage. Reconnecting or replaying never depends on the model rerunning.
9. P1 iframe_v1 is disabled unless the producing session's complete context/tool-output envelope is synthetic or explicitly public under ADR-005. Inline private/tool data is not accepted merely because a model copied it into source.
10. Failure falls back to the last known-good revision or a noninteractive registry/Markdown representation. A broken generated surface does not break the channel timeline.

## Two-rail architecture

~~~text
TrueForge run / coworker output
           |
           | AG-UI tool calls + typed activity snapshots/deltas
           v
Application UI event adapter
  - authenticates producer/run/channel
  - validates grants and schema
  - persists canonical revisions
  - appends monotonic channel events
           |
           v
Trusted channel host
  +------------------------------+------------------------------+
  | Registry rail                | Generated-document rail       |
  | allowlisted React components | revisioned HTML/CSS/manifest  |
  | host-owned DOM and handlers  | opaque origin, fixed bootstrap |
  +------------------------------+------------------------------+
           |                                   |
           +---------- interaction intent -----+
                              |
                              v
                    Interaction gateway
                    - authn/authz/CSRF
                    - grant intersection
                    - input validation
                    - idempotency/rate limit
                    - trusted host continuation/HITL
~~~

### Rail choice

| Condition | Required rail |
| --- | --- |
| A supported table, chart, graph, image, metric, layout, form, or HITL card can express the result | registry_v1 |
| P0 receives any iframe/open-generated request | Reject as `unsupported_rail` and render a controlled/text fallback |
| P1 needs a domain-specific layout that the registry cannot express | iframe_v1 through the fixed Open Generative UI tool, only when its separate release/security gate permits it |
| The result requires model-authored browser JavaScript, an arbitrary simulation runtime, remote packages, or network access | Unsupported; use a reviewed controlled component |
| The output implies consequential work | Either rail may request a trusted host continuation; any later tool proposal/approval uses the canonical RequiredAction flow |
| Data is private, credential-like, secret, or outside a reviewed classification | registry_v1 only, or no generated surface |
| The requested component, data, or action lacks a grant | Refuse that part and render an explanatory fallback |

The registry rail is the default. The server, not the model, selects the allowed rail from workspace policy, channel policy, data classification, and feature readiness. A surface has one rail for its lifetime; changing rail creates a new surface linked by replaces_surface_id. Trusted channel chrome may surround either rail.

## Trust tiers

| Tier | Content | Trust |
| --- | --- | --- |
| Host | Surface title, creator, source, status, grants disclosure, approval controls, error and fallback UI | Trusted application code |
| Registry | Versioned component tree and bounded data bindings | Untrusted data interpreted by trusted code |
| Iframe | Generated HTML/CSS plus a declarative manifest | Untrusted document interpreted by a fixed application bootstrap |

No lower tier is authoritative host chrome. The host keeps a visible boundary around iframe content, caps its dimensions, and labels it Generated interactive view; the product does not claim that arbitrary pixels cannot visually imitate a control.

## Canonical records and schemas

The following TypeScript shapes are normative logical contracts. The implementation MUST validate JSON values with generated JSON Schema and a runtime validator. The one structured-clone `Uint8Array` raster field additionally requires an exact runtime brand/length/hash/MIME check and has no JSON coercion. Every identifier is an opaque server-issued ID. Every timestamp is RFC 3339 UTC.

### Surface

~~~ts
type UiRail = "registry_v1" | "iframe_v1";

type GeneratedSurface = {
  schema_version: 1;
  surface_id: string;
  workspace_id: string;
  channel_id: string;
  source_event_id: string;
  run_id: string;
  run_step_id: string;
  agent_turn_id: string;
  creator_agent_id: string;
  rail: UiRail;
  title: string;
  status:
    | "building"
    | "ready"
    | "degraded"
    | "failed"
    | "revoked"
    | "closed";
  render_grant_id: string;
  data_grant_ids: string[];
  action_grant_ids: string[];
  current_render_revision: number | null;
  last_good_render_revision: number | null;
  current_state_revision: number | null;
  replaces_surface_id?: string;
  created_at: string;
  updated_at: string;
};
~~~

`GeneratedSurface` is the detailed generative-UI view of the `UIInstance` entity used in the data and API contracts; `surface_id` and `instanceId` identify the same record. API payloads use camelCase through shared schemas even where this document shows storage-oriented snake_case fields.

The server derives workspace_id, channel_id, source lineage, creator identity, grant IDs, and status. A producer payload cannot override them.

### Independent grants

~~~ts
type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

type RegistryComponentType =
  | "stack" | "grid" | "card" | "section" | "tabs"
  | "text" | "heading" | "badge" | "metric" | "callout" | "divider"
  | "table" | "chart" | "graph" | "image" | "image_gallery"
  | "form" | "button" | "choice" | "filter" | "pagination"
  | "artifact_link" | "source_list"
  | "approval_card" | "question_card" | "connection_card";

type UiLimits = {
  max_render_revisions: number;
  min_promotion_interval_ms: number;
  max_serialized_bytes: number;
  max_nodes?: number;
  max_depth?: number;
  max_text_bytes: number;
  max_table_rows: number;
  max_table_columns: number;
  max_chart_series: number;
  max_chart_points: number;
  max_graph_nodes: number;
  max_graph_edges: number;
  max_images: number;
  max_image_pixels: number;
  max_form_fields: number;
  max_field_characters: number;
  max_data_snapshots: number;
  max_data_bytes: number;
  max_bundle_files?: number;
  max_bundle_bytes?: number;
  max_single_file_bytes?: number;
  max_frame_to_host_message_bytes?: number;
  max_init_bytes?: number;
};

type GrantBase = {
  schema_version: 1;
  grant_id: string;
  workspace_id: string;
  channel_id: string;
  surface_id: string;
  policy_revision: number;
  issued_by: "application_policy";
  expires_at: string;
  revoked_at?: string;
};

type RenderGrant = GrantBase & (
  | {
      kind: "render";
      rail: "registry_v1";
      registry_version: "registry-1";
      allowed_component_types: RegistryComponentType[];
      limits: UiLimits;
    }
  | {
      kind: "render";
      rail: "iframe_v1";
      allowed_build_profile: "open-declarative-ui-1";
      limits: UiLimits;
    }
);

type DataGrant = GrantBase & {
  kind: "data";
  bound_render_revision: number;
  bound_manifest_hash: string;
  data_ref: string;
  source:
    | { kind: "artifact_revision"; artifact_id: string; revision: number }
    | { kind: "query_snapshot"; query_key: string; snapshot_id: string }
    | { kind: "run_output"; run_event_id: string };
  classification: "synthetic" | "public" | "workspace_safe";
  classification_provenance: string;
  snapshot_schema_hash: string;
  allowed_field_paths: string[][];
  max_rows: number;
  max_bytes: number;
  redaction_policy_key: string;
  retained_snapshot_blob_key: string; // server-only
  immutable_snapshot_hash: string;
};

type ActionGrantCommon = GrantBase & {
  kind: "action";
  bound_render_revision: number;
  bound_manifest_hash: string;
  action_ref: string;
  handler_key: string;
  input_schema_hash: string;
  allowed_render_node_ids: string[];
  requires_recent_auth: boolean;
  requires_trusted_confirmation: boolean;
  max_uses: number;
};

type ActionGrant = ActionGrantCommon & (
  | { mode: "local_state" }
  | {
      mode: "server_read";
      data_grant_id: string;
      data_ref: string;
      allowed_selection_paths: string[][];
    }
  | {
      mode: "complete_component_interrupt";
      component_interrupt_id: string;
    }
  | {
      mode: "request_agent_turn";
      target_coworker_id: string;
      intent_template_hash: string;
    }
  | { mode: "open_existing_hitl"; required_action_id: string }
);
~~~

This is the forward union. P0 accepts only `local_state`, `server_read`, and `complete_component_interrupt`. `request_agent_turn` and `open_existing_hitl` are P1-only and must parse as unsupported in P0.

Rules:

- Grants are created, narrowed, expired, and revoked only by server policy.
- The model may request a capability but cannot issue a grant, choose its scope, extend expiry, or change a policy revision.
- Effective access is the intersection of workspace policy, channel membership, coworker/session grants, surface grant, current policy revision, source ownership, and action-specific policy.
- RenderGrant is a closed discriminated union. An omitted allowlist never means all.
- A DataGrant is read-only and names one retained, immutable, redacted snapshot or artifact revision with exact field paths, schema, byte cap, classification provenance, and hash. It is not a URL or arbitrary query.
- An ActionGrant names one registered server handler and exact input schema. Its closed mode variant also binds the exact retained DataGrant, component interrupt, target coworker, or existing RequiredAction needed by that mode. It is not a tool name, endpoint, provider URL, or generic execute capability.
- DataGrant and ActionGrant are unusable until bound to the exact promoted render revision and manifest hash.
- server_read requires both the ActionGrant and its exact still-current `data_grant_id`/`data_ref`; the action grant alone cannot select or resolve data.
- complete_component_interrupt resolves only the exact durable application-owned UI component interrupt named in the grant. It enqueues a structured same-RunStep continuation and never resumes a TrueForge PauseGroup.
- In P1, request_agent_turn always has `requires_trusted_confirmation: true`, opens trusted-host confirmation for the server-selected target/template and may enqueue an ordinary ForgeRoom turn. If that turn later proposes an external tool, only normal TrueForge RequiredAction/PauseGroup ingestion creates an ActionProposal.
- In P1, open_existing_hitl may open only the exact existing RequiredAction named by the server-issued grant; it cannot decide or answer it.
- The initial P1 iframe_v1 profile rejects workspace_safe DataGrants. The producing logical session must also remain iframe-eligible under the monotonic session-classification rule below; a newly narrow DataGrant cannot erase earlier restricted or unknown session context.
- Approval and question decisions use the existing RequiredAction/PauseGroup authorization rules; they are not delegated by ActionGrant.

### Registry document

~~~ts
type RegistryDocument = {
  schema_version: 1;
  registry_version: "registry-1";
  surface_id: string;
  render_revision: number;
  base_render_revision: number | null;
  root: RenderNode;
  data_bindings: DataBinding[];
  state_schema: StateField[];
  accessible_summary: string;
};

type RenderNode = {
  id: string;
  type: RegistryComponentType;
  props: Record<string, JsonValue>;
  bindings?: Record<string, BindingRef>;
  interactions?: Record<string, InteractionRef>;
  children?: RenderNode[];
};

type BindingRef = {
  binding_id: string;
  value_path: string[];
};

type DataBinding = {
  binding_id: string;
  data_grant_id: string;
  data_ref: string;
  shape: "scalar" | "record" | "rows" | "series" | "graph" | "images";
  fields: string[];
};

type InteractionRef = {
  action_grant_id: string;
  action_ref: string;
  input_map: Record<string, { source: "literal" | "state" | "selection"; path: string[] }>;
};

type StateField = {
  key: string;
  type: "string" | "number" | "boolean" | "string_array";
  scope: "shared" | "local";
  max_length?: number;
  default_value?: JsonValue;
};
~~~

JsonValue means null, boolean, finite number, string, array of JsonValue, or object with string keys and JsonValue values. Prototype keys, non-finite numbers, binary values, and cyclic values are invalid.

Binding paths are arrays of literal keys. They are not JavaScript, JSONPath, XPath, SQL, template expressions, or computed property syntax. A binding may expose only fields named by its DataGrant. The server materializes and redacts the bounded data snapshot before the browser receives it.

### Canonical render manifest

Every promoted render on either rail has one closed authorization-critical manifest. Hash fields below are lowercase hexadecimal SHA-256 values prefixed with `sha256:`. Fields that do not apply to a rail are present as explicit `null`; omission is invalid.

~~~ts
type RenderManifestV1 = {
  schemaVersion: 1;
  surfaceId: string;
  renderRevision: number;
  baseRenderRevision: number | null;
  rail: "registry_v1" | "iframe_v1";
  renderGrantScopeSha256: string;
  registryVersion: "registry-1" | null;
  buildProfile: "open-declarative-ui-1" | null;
  renderPayloadSha256: string;
  renderNodeSetSha256: string;
  stateSchemaSha256: string;
  behaviorManifestSha256: string;
  interactionManifestSha256: string;
  dataBindingManifestSha256: string;
  argumentSchemaSha256: string;
  validatedArgsSha256: string;
  dataSnapshotManifestSha256: string;
  componentDescriptorSha256: string | null;
  sourceSha256: string | null;
  rendererProfileSha256: string;
  sanitizerPolicySha256: string | null;
  bootstrapSha256: string | null;
  cspSha256: string | null;
  deliveryHeadersSha256: string | null;
};
~~~

The named JCS subhashes use these closed, versioned preimages; derived hash/signature fields are never members of their own preimage:

~~~ts
type CanonicalUiLimitsV1 = {
  maxRenderRevisions: number;
  minPromotionIntervalMs: number;
  maxSerializedBytes: number;
  maxNodes: number | null;
  maxDepth: number | null;
  maxTextBytes: number;
  maxTableRows: number;
  maxTableColumns: number;
  maxChartSeries: number;
  maxChartPoints: number;
  maxGraphNodes: number;
  maxGraphEdges: number;
  maxImages: number;
  maxImagePixels: number;
  maxFormFields: number;
  maxFieldCharacters: number;
  maxDataSnapshots: number;
  maxDataBytes: number;
  maxBundleFiles: number | null;
  maxBundleBytes: number | null;
  maxSingleFileBytes: number | null;
  maxFrameToHostMessageBytes: number | null;
  maxInitBytes: number | null;
};

type RenderGrantScopePreimageV1 = {
  schemaVersion: 1;
  grantId: string;
  workspaceId: string;
  channelId: string;
  surfaceId: string;
  policyRevision: number;
  issuedBy: "application_policy";
  rail: "registry_v1" | "iframe_v1";
  registryVersion: "registry-1" | null;
  buildProfile: "open-declarative-ui-1" | null;
  allowedComponentTypes: RegistryComponentType[];
  limits: CanonicalUiLimitsV1;
};

type CanonicalRegistryRenderNodeV1 = {
  nodeId: string;
  componentType: RegistryComponentType;
  props: Record<string, JsonValue>;
  children: CanonicalRegistryRenderNodeV1[];
};

type RenderPayloadPreimageV1 =
  | {
      schemaVersion: 1;
      rail: "registry_v1";
      surfaceId: string;
      renderRevision: number;
      baseRenderRevision: number | null;
      registryVersion: "registry-1";
      root: CanonicalRegistryRenderNodeV1;
      accessibleSummary: string;
    }
  | {
      schemaVersion: 1;
      rail: "iframe_v1";
      surfaceId: string;
      renderRevision: number;
      baseRenderRevision: number | null;
      buildProfile: "open-declarative-ui-1";
      initialHeight: number;
      css: string;
      html: string;
      accessibleSummary: string;
    };

type IframeElementNameV1 =
  | "div" | "section" | "article" | "header" | "footer" | "main" | "aside"
  | "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
  | "p" | "span" | "strong" | "em" | "small" | "br" | "hr"
  | "ul" | "ol" | "li" | "dl" | "dt" | "dd"
  | "table" | "caption" | "thead" | "tbody" | "tfoot"
  | "tr" | "th" | "td" | "figure" | "figcaption" | "button" | "img";

type RenderNodeSetPreimageV1 = {
  schemaVersion: 1;
  rail: "registry_v1" | "iframe_v1";
  nodes: Array<{
    nodeId: string;
    nodeKind: RegistryComponentType | `html:${IframeElementNameV1}`;
    parentNodeId: string | null;
    childIndex: number;
  }>;
};

type CanonicalStateFieldV1 = {
  rail: "registry_v1" | "iframe_v1";
  key: string;
  type:
    | "string" | "number" | "boolean" | "string_array"
    | "finite_number" | "string_enum" | "string_array_enum";
  scope: "local" | "shared";
  maxLength: number | null;
  enumValues: string[];
  minimum: number | null;
  maximum: number | null;
  maxItems: number | null;
  hasDefaultValue: boolean;
  defaultValue: JsonValue;
};

type StateSchemaPreimageV1 = {
  schemaVersion: 1;
  rail: "registry_v1" | "iframe_v1";
  fields: CanonicalStateFieldV1[];
};

type BehaviorManifestPreimageV1 = {
  schemaVersion: 1;
  behaviors: Array<{
    behaviorId: string;
    kind:
      | "tabs" | "toggle" | "filter" | "sort" | "select" | "resize"
      | "commit_state" | "server_read" | "complete_component_interrupt"
      | "request_agent_turn" | "open_existing_hitl";
    targetNodeIds: string[];
    actionGrantId: string | null;
    actionRef: string | null;
    allowedValueIds: string[];
  }>;
};

type InteractionManifestPreimageV1 = {
  schemaVersion: 1;
  interactions: Array<{
    behaviorId: string | null;
    renderNodeId: string;
    eventName: "activate" | "change" | "submit" | "select" | "filter" | "paginate";
    actionGrantId: string;
    actionRef: string;
    inputSchemaSha256: string;
    inputMap: Array<{
      inputKey: string;
      source: "literal" | "state" | "selection";
      path: string[];
    }>;
  }>;
};

type DataBindingManifestPreimageV1 = {
  schemaVersion: 1;
  bindings: Array<{
    bindingId: string;
    renderNodeId: string;
    target:
      | { kind: "registry_prop"; propName: string }
      | { kind: "text_content" }
      | { kind: "aria_label" }
      | { kind: "raster_image" };
    dataGrantId: string;
    dataRef: string;
    valuePath: string[];
    allowedFields: string[];
    formatterOrShape:
      | "plain_text" | "integer" | "decimal" | "percent" | "iso_date"
      | "sanitized_png" | "sanitized_webp"
      | "scalar" | "record" | "rows" | "series" | "graph" | "images";
    emptyText: string | null;
  }>;
};

type ArgumentSchemaPreimageV1 = {
  schemaVersion: 1;
  closedJsonSchema: JsonValue;
};

type ValidatedArgsPreimageV1 = {
  schemaVersion: 1;
  args: JsonValue;
};

type DataSnapshotManifestPreimageV1 = {
  schemaVersion: 1;
  snapshots: Array<{
    dataGrantId: string;
    dataRef: string;
    snapshotSchemaSha256: string;
    snapshotSha256: string;
    classification: "synthetic" | "public" | "workspace_safe";
    byteLength: number;
    rowCount: number | null;
  }>;
};

type ComponentDescriptorPreimageV1 = {
  schemaVersion: 1;
  name: string;
  version: string;
  exposure: "agent_tool" | "server_only";
  kind: "metric" | "table" | "chart" | "graph" | "timeline" |
    "image" | "report" | "form" | "hitl" | "composite";
  modelDescription: string;
  parameterSchema: JsonValue;
  rendererKey: string;
  previewProps: JsonValue;
  declaredDataFunctions: string[];
  declaredInteractionIntents: string[];
  confirmation: "none" | "trusted_host";
};

type JsonProfilePreimageV1 = {
  schemaVersion: 1;
  profileKind: "renderer" | "sanitizer";
  version: string;
  profile: JsonValue;
};

type DeliveryBodyIndexV1 = {
  schemaVersion: 1;
  publisherProfileVersion: "generated-ui-publisher-1";
  css: { byteOffset: number; byteLength: number };
  html: { byteOffset: number; byteLength: number };
  manifestBinding: { byteOffset: number; byteLength: number };
};
~~~

`manifestSha256 = sha256(JCS(RenderManifestV1))`, where JCS is RFC 8785 over UTF-8. Each `*Sha256` field hashes the corresponding `*PreimageV1` above, except the raw/profile hashes described next. `allowedComponentTypes`, component declared-function/intent arrays, behavior target/value arrays, state enum values, binding allowed-fields and schema `required` arrays are unique and lexicographically sorted; interaction input-map entries sort by `inputKey`. Top-level arrays sort by `nodeId`, field `key`, `behaviorId`, `(renderNodeId, eventName, behaviorId-or-empty, actionRef)`, `(renderNodeId, target.kind, propName-or-empty, bindingId)`, or `(dataGrantId, dataRef)` respectively. Registry RenderNode child order remains semantic and is not sorted; node entries retain `childIndex`, while final iframe HTML is one canonical serialized string rather than producer chunks. JSON Schema `enum` values sort by their own JCS bytes, external `$ref`, defaults with executable values and unknown schema keywords are rejected. All optional canonical values are represented as explicit `null`, `false` or empty arrays, never omitted; `hasDefaultValue: false` requires `defaultValue: null` and distinguishes absence from an explicit null default.

RenderGrant mutable validity fields (`expires_at`, `revoked_at`, current policy status) are deliberately outside `RenderGrantScopePreimageV1`; the immutable grant ID/scope/policy revision are hashed and validity is rechecked separately on every use. For registry_v1, registryVersion is non-null, buildProfile is null and allowedComponentTypes is the sorted positive allowlist. For iframe_v1, registryVersion is null, buildProfile is non-null and allowedComponentTypes is empty. Every UiLimits key is present; non-applicable limits are null, while rail-required limits must be finite nonnegative values within the workspace policy.

Normalization is exact: iframe interaction entries come one-for-one from `OpenGeneratedUiRevision.interaction_manifest`; each must match one non-local behavior and one member of that behavior's `target_node_ids`, and `inputMap` is empty because the closed input schema validates the direct intent payload. Registry interaction entries expand each `RenderNode.interactions[eventName]` with `behaviorId: null` and convert its `input_map` object into inputKey-sorted entries. Iframe data bindings map one-for-one with `target.kind` derived from `sink`, `allowedFields: []`, and their exact `empty_text`. Registry bindings expand every `RenderNode.bindings[propName]`, join its exact `DataBinding`, set `target` to `registry_prop/propName`, use its shape as `formatterOrShape`, copy its sorted unique `fields` to `allowedFields`, and set `emptyText: null`. Duplicate composite sort keys reject the revision.

The other source-to-preimage mappings are also normative:

- Registry render payload recursively copies each node's ID/type/validated props/ordered children and moves binding/interaction semantics into their separate manifests. Iframe render payload uses the final canonical CSS/HTML strings and the server-owned revision/setup/accessibility fields shown in the union.
- Registry node-set traversal emits every RenderNode with its parent and original child index. Iframe traversal emits every unique `data-ui-node-id` from canonical HTML, its allowlisted tag, nearest node-ID-bearing ancestor and index among that ancestor's node-ID-bearing children; every binding/behavior/interaction target must exist in this set.
- Registry StateField maps missing max length to null, enum/range/item slots to empty/null, and records default presence separately. IframeStateField maps enum/range/item slots directly, maxLength to null and always sets `hasDefaultValue: true`. Impossible type/slot combinations reject rather than normalize.
- Registry `BehaviorManifestPreimageV1.behaviors` is empty because local controlled behavior is immutable trusted renderer code hashed in rendererProfileSha256; model-selected server interactions live in InteractionManifestPreimageV1. Iframe behaviors map one-for-one, with missing allowed values normalized to `[]` and local-behavior action fields to null.
- Registry argument schema is the exact published component `parameterSchema`; iframe argument schema is the checked-in closed `open-declarative-ui-nonsource-args-1` schema. Registry validated args are the fully validated tool arguments. Iframe validated args contain only that schema's setup/reference values and exclude CSS, HTML, state, behavior, interaction and binding source. Both use their named JCS wrappers above.
- DataSnapshotManifestPreimageV1 maps every bound retained DataGrant snapshot once, using its immutable schema/content hash, classification and measured byte/row counts. ComponentDescriptorPreimageV1 maps the published ComponentDefinition field-for-field except its derived descriptorHash.

`componentDescriptorSha256` hashes `ComponentDescriptorPreimageV1`, explicitly excluding `descriptorHash`, so it is noncircular. `rendererProfileSha256` and `sanitizerPolicySha256` hash their `JsonProfilePreimageV1`; the renderer profile includes `generated-ui-publisher-1`, its fixed envelope/markers, canonical CSS/HTML serializers and extraction rules. `bootstrapSha256` hashes the exact reviewed bootstrap bytes, `cspSha256` the normalized UTF-8 CSP value, and `deliveryHeadersSha256` the JCS header profile defined below.

`sourceSha256` is binary SHA-256 over: ASCII `forgeroom-iframe-source-v1` followed by one NUL byte, unsigned 64-bit big-endian CSS byte length, canonical CSS UTF-8 bytes, unsigned 64-bit big-endian HTML byte length, then canonical HTML UTF-8 bytes. The serializers normalize line endings to LF and Unicode to NFC, remove comments, and emit deterministic escaping/attribute ordering; the CSS serializer escapes every `<` and the HTML sanitizer rejects comments, so publisher boundary markers cannot occur inside either region. `DeliveryBodyIndexV1` stores the exact zero-based byte ranges in the retained body; ranges must be ordered, in bounds, non-overlapping and adjacent to the fixed publisher markers. `deliveryBodyIndexSha256 = sha256(JCS(DeliveryBodyIndexV1))`. The server stores every canonical preimage or retained byte range needed for replay, both `RenderManifestV1` and its hash, and recomputes all hashes before promotion and replay.

DataGrant and ActionGrant binding, capability issuance/redemption, frame binding, state/interaction intents and verifier evidence compare the exact stored `manifestSha256`; none accepts a client-supplied reconstructed manifest. `registryVersion` and `componentDescriptorSha256` are non-null only for `registry_v1`. `buildProfile`, `sourceSha256`, `sanitizerPolicySha256`, `bootstrapSha256`, `cspSha256` and `deliveryHeadersSha256` are non-null only for `iframe_v1`.

For iframe_v1, `sourceSha256` uses the pre-binding CSS/HTML framing above before the server injects frame metadata containing `manifestSha256`; this avoids a circular hash. After the manifest is fixed, `generated-ui-publisher-1` injects that metadata, forms the exact HTTP body and records `deliveryBodySha256` plus the body index hash outside RenderManifestV1. Only that final content-addressed body is retained durably; pre-binding source remains staging data and is destroyed after publication. Verifier evidence and capability redemption bind all three hashes, and staged/member responses serve the retained body bytes and must match `deliveryBodySha256` exactly. Replay uses the persisted byte ranges solely to recompute `sourceSha256`; it never regenerates the response.

### Iframe revision

~~~ts
type IframeDataBinding = {
  binding_id: string;
  node_id: string;
  sink: "text_content" | "aria_label" | "raster_image";
  data_grant_id: string;
  data_ref: string;
  value_path: string[];
  formatter:
    | "plain_text" | "integer" | "decimal" | "percent" | "iso_date"
    | "sanitized_png" | "sanitized_webp";
  empty_text: string;
};

type IframeBehavior =
  | {
      behavior_id: string;
      kind: "tabs" | "toggle" | "filter" | "sort" | "select" | "resize";
      target_node_ids: string[];
      allowed_value_ids?: string[];
    }
  | {
      behavior_id: string;
      kind:
        | "commit_state" | "server_read" | "complete_component_interrupt"
        | "request_agent_turn" | "open_existing_hitl";
      target_node_ids: string[];
      action_grant_id: string;
      action_ref: string;
      allowed_value_ids?: string[];
    };

type IframeStateField = {
  key: string;
  type: "boolean" | "finite_number" | "string_enum" | "string_array_enum";
  scope: "local" | "shared";
  enum_values?: string[];
  minimum?: number;
  maximum?: number;
  max_items?: number;
  default_value: boolean | number | string | string[];
};

type OpenGeneratedUiRevision = {
  schema_version: 1;
  surface_id: string;
  render_revision: number;
  base_render_revision: number | null;
  build_profile: "open-declarative-ui-1";
  initial_height: number;
  css: string;
  html: string;
  data_bindings: IframeDataBinding[];
  state_schema: IframeStateField[];
  state_schema_sha256: string;
  behavior_manifest: IframeBehavior[];
  interaction_manifest: Array<{
    behavior_id: string;
    render_node_id: string;
    event_name: "activate" | "change" | "submit" | "select" | "filter" | "paginate";
    action_grant_id: string;
    action_ref: string;
    input_schema_sha256: string;
  }>;
  render_payload_sha256: string;
  render_node_set_sha256: string;
  behavior_manifest_sha256: string;
  interaction_manifest_sha256: string;
  argument_schema_sha256: string;
  validated_args_sha256: string;
  data_binding_manifest_sha256: string;
  data_snapshot_manifest_sha256: string;
  source_sha256: string;
  delivery_body_sha256: string;
  delivery_body_index: DeliveryBodyIndexV1;
  delivery_body_index_sha256: string;
  render_manifest: RenderManifestV1;
  manifest_sha256: string;
  sanitizer_policy_version: string;
  sanitizer_policy_sha256: string;
  bootstrap_version: string;
  bootstrap_sha256: string;
  csp: string;
  csp_sha256: string;
  permissions_policy_profile_version: "generated-ui-permissions-v1";
  delivery_headers: GeneratedUiDeliveryHeadersV1;
  delivery_headers_sha256: string;
  verifier_profile_version: string;
  verification_evidence_sha256: string;
  accessible_summary: string;
  renderer_version: string;
  renderer_profile_sha256: string;
  completed_at: string;
};
~~~

`OpenGeneratedUiRevision` is the logical validation/promotion contract, not a single JSON column. Its CSS/HTML fields exist only during assembly and inside the final delivery-body blob after promotion; the committed revision row stores the normalized non-source manifests, metadata, blob key, byte index and hashes described in `data-model.md`. Implementations must not persist this entire source-bearing object as JSON.

Private producer fragments carry bounded inert source fields to the server assembler. Browser AG-UI uses the complete closed source-free snapshot plus the exact phase/count/generating/status/finalProfile delta allowlist in `contracts/events.md`. The application persists the assembled immutable revision, retained redacted data snapshots, renderer/bootstrap/sanitizer/CSP versions and hashes before it becomes replay-authoritative. Source is never inserted into the host DOM, executed on the server, duplicated into channel JSON or treated as an artifact preview. Nonempty model-authored `jsFunctions` or `jsExpressions` fields are rejected in P1.

Iframe HTML contains placeholders only: each bound element has one validated `data-ui-node-id` and `data-ui-bind-id`, and the binding manifest names the exact node, safe sink, DataGrant, data_ref, literal value path and formatter. The fixed bootstrap alone applies strings through `textContent`, safe ARIA text through `setAttribute("aria-label", ...)`, or server-decoded/re-encoded PNG/WebP bytes through a bootstrap-created object URL. Model-authored `src`, `srcset`, `href`, `data:` and `blob:` values are rejected. Object URLs are created only from the exact bounded raster bytes delivered in `INIT` and are revoked on unmount.

The behavior manifest is also discriminated. Purely local tabs/toggle/filter/sort/select/resize entries cannot carry an ActionGrant. Every host/server intent requires both `action_grant_id` and `action_ref`, and the kind must equal that grant's closed mode (`commit_state` maps to local_state). Unknown combinations or optional-looking authority fields reject the whole revision.

The iframe state schema is closed and hash-bound. Enum values, numeric ranges and array lengths are finite and covered by UiLimits. Local fields never leave the browser. A `STATE_INTENT` may target only a declared shared key through a `commit_state` behavior and matching local_state ActionGrant; the server validates the declared type/range and compare-and-swaps `current_state_revision`. Arbitrary strings, unknown keys, prototype paths and schema mutation are rejected. A later render preserves shared state only when the field's key/type/domain remains compatible under the new schema hash.

### State

~~~ts
type SurfaceState = {
  schema_version: 1;
  surface_id: string;
  state_revision: number;
  base_state_revision: number | null;
  shared: Record<string, JsonValue>;
  data_snapshot_refs: Array<{
    data_grant_id: string;
    data_ref: string;
    snapshot_hash: string;
  }>;
  interaction_status: Record<
    string,
    "pending" | "accepted" | "awaiting_confirmation" | "awaiting_approval" |
    "succeeded" | "failed" | "denied" | "stale"
  >;
};
~~~

Shared state is server-authoritative and replayable. Local state, such as hover, focus, open tabs, chart zoom, and unsubmitted form text, remains in the browser and MAY be lost on refresh. Secrets, credentials, raw tool results, reasoning, approval response payloads, and unrestricted HTML never enter either state namespace.

Stored `ui_interactions.state` projects into `SurfaceState.interaction_status` as follows: `prepared|token_issued → pending`, `awaiting_confirmation → awaiting_confirmation`, `confirmed|dispatching → accepted`, and terminal states map to the same-named `succeeded|failed|denied|stale`. `awaiting_approval` is derived only from a separately existing canonical ActionProposal/RequiredAction and is never set by a generic UI interaction. This projection is persisted/replayed; token material is not.

`SurfaceState` is the per-UIInstance subprojection referenced from `ChannelUIStateV1`; it does not create a second authority store. Server updates persist the UIInstance revision first, then emit the corresponding AG-UI state/activity delta with the same revision/hash.

## Controlled React registry

Each controlled renderer is exposed as a stable frontend component tool:

~~~ts
type ComponentDefinition = {
  name: string;
  version: string;
  exposure: "agent_tool" | "server_only";
  kind: "metric" | "table" | "chart" | "graph" | "timeline" |
    "image" | "report" | "form" | "hitl" | "composite";
  modelDescription: string;
  parameterSchema: Record<string, JsonValue>;
  rendererKey: string;
  previewProps: Record<string, JsonValue>;
  declaredDataFunctions: string[];
  declaredInteractionIntents: string[];
  confirmation: "none" | "trusted_host";
  descriptorHash: string;
};
~~~

Names and versions are immutable. The build eagerly loads and sorts the manifest so React hook order remains stable; availability changes through grant state, not conditional hook mounting. Only `exposure: "agent_tool"` definitions are offered to a coworker. Privileged approval, RequiredQuestion and connection renderers are always `server_only`. The server rechecks publication, exact version, descriptor hash, render grant and data-function grants at every call because a tool list offered at run start may already be stale.

The application-owned component tool bridge creates and persists UIInstances server-side so multi-recipient or detached work never depends on a live browser handler. The required browser renderer is the application registry driven by the official AG-UI client. When P0-210 separately enables a coherent CopilotKit graph, equivalent `useRenderTool`/`useDefaultRenderTool` hooks may wrap the same registry without changing persistence or authority.

`useFrontendTool`/`useComponent` may be enabled for a connected, explicitly interactive component only after P0-210 proves that the server persists the call/interrupt before browser handling and can recover after disconnect. `useHumanInTheLoop` may render bounded questions/choices, but it never constitutes authorization for a real external action; canonical ActionProposal/PauseGroup endpoints remain authoritative.

The complete P0 agent-tool set is `DataTable`, `BarOrLineChart`, `TaskCard`, `ArtifactCard` and `ChoiceForm`. `RequiredQuestionCard`, approval and connection cards are separate server-only definitions. P0 has no agent-authored `MetricCard`, `CompositeView`, graph, arbitrary report/gallery/timeline or runtime component catalogue.

### P1 registry expansion catalogue

The table below is retained for P1 controlled-component expansion. P0 may use layout/text primitives internally inside its five reviewed renderers, but it does not expose this general RegistryDocument node catalogue to the model.

| Component | Purpose | Required safety behavior |
| --- | --- | --- |
| stack, grid, card, section, tabs | Layout | Tokenized spacing and breakpoints only; no CSS or absolute/fixed positioning |
| text, heading, badge, metric, callout, divider | Narrative and status | Plain text only; safe link component accepts an application-resolved source reference only |
| table | Sortable/filterable bounded rows | Explicit columns and field keys; plain-text cells by default; no cell HTML or executable formatter |
| chart | bar, line, area, scatter, and pie | Bounded series/points; tokenized colors; accessible data-table fallback |
| graph | Directed or undirected node-link view | Bounded nodes/edges; safe labels; keyboard/list fallback; no HTML labels |
| image, image_gallery | Source-linked images | Authorized artifact revision only; decode with byte/pixel limits, strip metadata, re-encode PNG/WebP, require alt text, and reject SVG/HTML/polyglots |
| form | Bounded data collection | Allowlisted field controls, JSON-schema validation, no password/secret/file/HTML field, no arbitrary submit URL |
| button, choice, filter, pagination | Interaction | Must reference an ActionGrant or operate on local state; no inline handler |
| artifact_link, source_list | Provenance | Server-resolved, channel-authorized references only |
| approval_card, question_card, connection_card | HITL | Privileged server-only components populated from canonical normalized records |

The registry implementation maps the closed RegistryComponentType enum to locally imported React components. Dynamic import strings are prohibited.

### Privileged HITL components

approval_card, required_question_card, and connection_card are part of the controlled registry but are `server_only`, never frontend tools or model-authorable nodes. The server inserts them in a trusted slot after resolving a current RequiredAction, ActionProposal, Question, or connector record for the same channel and surface lineage. Their displayed account, target, arguments, hashes, expiry, and buttons come from reviewed server adapters.

An agent-authored node using a privileged type is rejected. When P1-317/P1-506 are enabled, an iframe may request `open_existing_hitl` for the exact server-bound record named by its ActionGrant; the host opens the canonical card outside the iframe. P0 has no such iframe intent.

### Form rules

- Maximum field count and lengths come from UiLimits.
- Model-authorable `ChoiceForm` fields are finite number, date, single choice, multiple choice, checkbox, and read-only display. Free text belongs only to the trusted channel composer or a canonical server-owned RequiredQuestionCard.
- Labels are mandatory. Placeholder text is not a label.
- password, hidden, file, rich-text HTML, credential, OAuth, payment, signature, and arbitrary URL fields are prohibited.
- Submit always creates an InteractionIntent. It never performs native form submission.
- P0 ChoiceForm may resolve only its exact component interrupt or bounded local/shared filter state. P1 may add host-confirmed `request_agent_turn` only through its separately reviewed challenge flow.
- Optimistic UI is permitted for local_state only. External effects never display succeeded before a verified normalized result.

### Registry validation

Before persistence and again before render, the validator MUST:

1. Authenticate the producing run and bind the server-derived surface lineage.
2. Check schema_version, registry_version, render revision, grant status, policy revision, expiry, and rail.
3. Reject unknown keys where the component schema is closed.
4. Reject unknown or server-only component types.
5. Enforce tree depth, node, text, data, series, graph, image, and form limits.
6. Validate each prop against that component's discriminated schema.
7. Resolve every binding through a current DataGrant and every interaction through a current ActionGrant.
8. Reject duplicate node, binding, and interaction IDs.
9. Reject prototype keys, HTML, CSS, script, event-handler names, expressions, unapproved URLs, data URLs, and SVG input.
10. Validate required accessibility fields.
11. Construct a fresh plain object tree and deep-freeze it. Do not merge untrusted objects into defaults.
12. Render text through React escaping and never use dangerouslySetInnerHTML.

Component props may contain presentation labels and bounded model-authored narrative only. Metrics, rows, series, graph data, image bytes/references, and other source-derived values must use server-materialized DataGrant bindings; copying data into props is rejected.

Invalid patches are not partially applied. The application records a safe error, preserves the last good revision, and may ask the coworker for one bounded repair.

## P1 progressively generated document rail

iframe_v1 is a generated-document rail, not an arbitrary-JavaScript sandbox. One fixed granted tool streams bounded `initialHeight`, placeholder messages, CSS, HTML, a declarative behavior/interaction manifest and a text alternative to a private server assembler. Raw source never enters browser AG-UI events. The server parses CSS/HTML with fixed allowlists, persists source only in access-controlled immutable blobs, and projects source-free AG-UI progress/revision activities. This is per-response UI; it does not publish a reusable component.

The inspected CopilotKit Open Generative UI middleware/renderer permits JavaScript and partial preview behavior that does not satisfy this profile. P1 therefore uses the application-owned buffer/normalizer and renderer. Any optional future CopilotKit wrapper must prove it cannot re-enable generated JavaScript, unsafe evaluation, remote dependencies, same-origin behavior or privileged host bridges; otherwise that wrapper stays disabled.

### AG-UI activity lifecycle

The first canonical browser `ACTIVITY_SNAPSHOT` uses `activityType: "open-generative-ui"`, explicit `replace: true` and `activityRevision: 0`. Every resync snapshot also sets `replace: true` and carries the current monotonic activityRevision; it never resets to 0. Content also includes schema/surface ID, candidate/base render revisions, initial height, bounded placeholders, phase, bounded received-byte/count progress, generating status and required text alternative. It contains no source, blob key, capability URL or interaction token.

The private producer assembler progresses in this order:

1. Fix bounded `initialHeight`, `placeholderMessages`, scanned `textAlternative` and `textAlternativeHash` before emitting revision 0; they are immutable for that candidate.
2. Assemble CSS, then cssComplete.
3. Assemble HTML chunks, then htmlComplete.
4. Assemble the closed behavior manifest, then behaviorManifestComplete.
5. Add validated argument/data/source, sanitizer, bootstrap, CSP, manifest and renderer hashes.
6. Set `generating: false` only after the complete candidate validates, its immutable blobs are published, the trusted verifier passes the exact staged response, and one transaction commits the revision, current pointers, final source reference and channel event.

Canonical browser `ACTIVITY_DELTA` follows the exact path/order allowlist in `contracts/events.md`; it cannot patch setup, revision, text-alternative, source or a child of finalProfile. Nonempty private `jsFunctions`, `jsExpressions`, `script`, or equivalent producer fields fail the candidate. A complete source-free snapshot precedes every browser delta sequence. A missing/wrong activity base, forbidden path, decreasing count, out-of-order phase, duplicate conflict, oversize source or incompatible renderer profile quarantines the candidate and requests a source-free replacement snapshot. Progressive rendering means successive complete server-promoted revisions; partial source displays only trusted skeleton/text progress and never reaches browser JSON or active DOM.

### Source and data policy

- Parse HTML into a fresh document and allow only `IframeElementNameV1` plus the checked-in closed attribute profile; force every button to `type="button"`. Reject script, event handlers, style attributes, base, meta refresh, links/navigation, forms, input, textarea, select, contenteditable, frames, object/embed, external resources, SVG and custom elements.
- Parse CSS with an AST allowlist. Reject import, URL/fetch sources, behavior/expression features, fixed overlays above host limits and unreviewed at-rules/properties. Generated CSS is hashed for the response CSP; it is never concatenated into `srcdoc`.
- Model-authored JavaScript, npm/CDN packages, import maps and inline handlers are prohibited. Only the exact application bootstrap hash executes.
- Partial producer drafts remain in bounded memory when possible. Spill storage is per-assembly encrypted, excluded from backups/replication and hard-TTL-deleted within 15 minutes; failure, cancellation or timeout destroys its body/key immediately, and successful promotion deletes the staging duplicate after immutable publication. Durable failure history retains only safe counts, hashes and reason codes.
- The fixed bootstrap implements only operation-budgeted tabs, toggle, filter, sort, select, resize and typed intent behaviors declared in the validated manifest. It has no arbitrary expression, network, storage, navigation, DOM-code, API or provider helper.
- iframe_v1 is available only while the producing logical session's classification high-water mark remains synthetic/public. Classification covers all retained or compacted history, system/context envelopes, tool outputs and native-subagent inputs—not just the current producer call. Once restricted or unknown content enters that logical session, iframe_v1 is permanently disabled for it; TrueForge session rotation carries the ineligible state forward and cannot lower the high-water mark. Registry data-bearing props and iframe data/text must resolve from retained DataGrant snapshots; credential-canary and classification scans run before persistence and delivery.
- Generated HTML may contain only validated binding placeholders. It cannot inline bound values or author any `src`, `srcset`, `href`, `data:` or `blob:` URL. The fixed bootstrap fills text/ARIA sinks and creates short-lived object URLs only for server-decoded, metadata-stripped, re-encoded PNG/WebP bytes delivered under the exact DataGrant and revision manifest.
- Registry images reference authorized artifact revisions only. The server decodes without outbound fetch, enforces bytes/pixels/decompression, strips metadata and re-encodes PNG/WebP; original SVG/HTML/polyglots are rejected. Iframe images receive only bounded sanitized raster bytes under a public/synthetic DataGrant.

### Delivery origin, containment and bridge

A server-promoted revision is served as a complete immutable response from a dedicated cookieless generated-UI origin, never `srcdoc` or the application origin. The short-lived, one-use opaque source capability authorizes only that exact revision document; it is not an API or interaction credential. Its signed claims bind the authenticated user and current channel membership, surface ID, render revision, canonical manifest hash, delivery-body/body-index/header hashes, current `deliverySecurityEpoch`, expiry and random capability ID. Redemption atomically consumes the capability and rechecks current membership, instance/revision status, historical-replay eligibility, security epoch, retained body existence, body hash, body-index hash/ranges, extracted source hash and every manifest/header hash before response bytes begin. A quarantine, integrity/canary failure or source/legal-deletion tombstone increments the epoch and blocks every stale capability even if unexpired. A tombstone cannot retract bytes whose response already began, but no new redemption or retry may send additional bytes.

Raw member and verifier capabilities are excluded/redacted from application, generated-origin, proxy/CDN/access, exception, analytics and test-trace logs; only route template, outcome and a nonreversible correlation hash may appear. Because its URL carries a capability, the response uses this exact canonical application-owned security-header profile:

~~~ts
type GeneratedUiDeliveryHeadersV1 = {
  schemaVersion: 1;
  headers: {
    "cache-control": "no-store";
    "content-security-policy": string;
    "content-type": "text/html; charset=utf-8";
    "permissions-policy": string;
    "referrer-policy": "no-referrer";
    "x-content-type-options": "nosniff";
  };
  absentHeaders: [
    "access-control-allow-credentials",
    "access-control-allow-origin",
    "content-encoding",
    "set-cookie"
  ];
};
~~~

Header names are lowercase, the `headers` object and `absentHeaders` tuple are closed, duplicate fields are invalid, and every optional-whitespace run in a field value is normalized to one ASCII space with no leading/trailing whitespace. The CSP value is the exact normalized directive sequence specified below with the revision's bootstrap/style hashes and exact application origin. The Permissions-Policy value is the exact `generated-ui-permissions-v1` string below. `deliveryHeadersSha256 = sha256(JCS(GeneratedUiDeliveryHeadersV1))`; `cspSha256` separately hashes the normalized UTF-8 CSP value. Staging verifier and member delivery must reproduce these named values and required absences exactly.

This object is not the complete HTTP wire-header set. Transport-managed fields such as `date`, `content-length`, `transfer-encoding`, `connection`, intermediary tracing and `server` are excluded from this hash and may differ between staging/member hops. They may not override a named profile field or introduce content encoding, `set-cookie` or permissive CORS. The generated route disables response compression, so `deliveryBodySha256` covers the exact unencoded HTTP entity bytes before transport framing. Verification hashes the canonical profile reconstructed from the received named values/absences, not HTTP field order or transport framing.

The iframe uses `sandbox="allow-scripts"` only, no same-origin/forms/popups/modals/downloads/top-navigation/presentation/storage tokens, `referrerpolicy="no-referrer"`, and `allow=""`. The versioned `generated-ui-permissions-v1` response profile is exactly `camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=(), clipboard-read=(), clipboard-write=(), display-capture=(), fullscreen=(), autoplay=(), encrypted-media=(), publickey-credentials-get=(), screen-wake-lock=(), storage-access=(), web-share=(), xr-spatial-tracking=()`. The normalized CSP value is exactly `default-src 'none'; connect-src 'none'; img-src blob:; media-src 'none'; font-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; object-src 'none'; manifest-src 'none'; form-action 'none'; base-uri 'none'; script-src <exact-bootstrap-hash>; script-src-attr 'none'; style-src <exact-generated-style-hash>; style-src-attr 'none'; frame-ancestors <exact-app-origin>`, with each placeholder replaced by one validated CSP source expression and no trailing semicolon. If this origin/profile is unavailable, iframe_v1 is disabled.

Server promotion is browser-independent: after parsing, classification and hash validation, the server publishes the immutable but not-yet-current blobs, runs the trusted headless accessibility/smoke gate against that exact response, then atomically commits the render revision, current/last-good pointers, final source-free event reference and status. The verifier loads a service-authenticated, one-use staging URL bound directly to those unpromoted source/delivery-body/manifest/profile/header hashes; it does not use the member `/render-capabilities` endpoint or require a committed current revision. The staged response bytes and security headers are hash-identical to the eventual member response. A detached run may finish after the commit. No browser mount, `BOOT`, `INIT`, `READY` or timeout mutates those durable pointers.

Mount protocol is `BOOT -> parent INIT -> frame READY`:

1. The fixed bootstrap posts `BOOT` after load; no nonce is required yet.
2. After exact source-window/revision checks, the parent sends `INIT` with protocol version, per-mount nonce, exact manifest/revision hashes and bounded public state/assets.
3. The frame echoes those bindings in `READY`; only then may the host replace its locally mounted prior revision. This is local activation, not server promotion.

The P1 iframe bridge accepts exactly these direction-aware wire records:

~~~ts
type FrameBindingV1 = {
  protocolVersion: 1;
  surfaceId: string;
  renderRevision: number;
  manifestSha256: string;
};

type FrameStateValueV1 = boolean | number | string | string[];

type FrameInitStringBindingCommonV1 = {
  bindingId: string;
  nodeId: string;
  dataGrantId: string;
  dataRef: string;
  snapshotSha256: string;
  valuePath: string[];
  value: string;
};

type FrameInitTextBindingV1 = FrameInitStringBindingCommonV1 & (
  | {
      kind: "text";
      sink: "text_content";
      formatter: "plain_text" | "integer" | "decimal" | "percent" | "iso_date";
    }
  | {
      kind: "aria";
      sink: "aria_label";
      formatter: "plain_text";
    }
);

type FrameInitRasterBindingV1 = {
  kind: "raster";
  bindingId: string;
  nodeId: string;
  sink: "raster_image";
  dataGrantId: string;
  dataRef: string;
  snapshotSha256: string;
  valuePath: string[];
  formatter: "sanitized_png" | "sanitized_webp";
  mimeType: "image/png" | "image/webp";
  byteLength: number;
  rasterSha256: string;
  bytes: Uint8Array;
};

type FrameBootV1 = FrameBindingV1 & {
  type: "BOOT";
};

type FrameInitV1 = FrameBindingV1 & {
  type: "INIT";
  mountNonce: string;
  initialFrameSequence: 0;
  stateRevision: number | null;
  sharedState: Record<string, FrameStateValueV1>;
  bindings: Array<FrameInitTextBindingV1 | FrameInitRasterBindingV1>;
};

type FrameReplyBaseV1 = FrameBindingV1 & {
  mountNonce: string;
  messageSequence: number;
};

type FrameReadyV1 = FrameReplyBaseV1 & {
  type: "READY";
  stateRevision: number | null;
};

type FrameResizeV1 = FrameReplyBaseV1 & {
  type: "RESIZE";
  requestedHeightPx: number;
};

type FrameStateIntentV1 = FrameReplyBaseV1 & {
  type: "STATE_INTENT";
  renderNodeId: string;
  behaviorId: string;
  actionGrantId: string;
  actionRef: string;
  expectedStateRevision: number | null;
  input: { key: string; value: FrameStateValueV1 };
};

type FrameInteractionIntentV1 = FrameReplyBaseV1 & {
  type: "INTERACTION_INTENT";
  renderNodeId: string;
  behaviorId: string;
  actionGrantId: string;
  actionRef: string;
  input: JsonValue;
};

type FrameClientErrorV1 = FrameReplyBaseV1 & {
  type: "CLIENT_ERROR";
  code:
    | "BINDING_REJECTED"
    | "STATE_REJECTED"
    | "BEHAVIOR_REJECTED"
    | "RENDER_LIMIT_EXCEEDED"
    | "BOOTSTRAP_FAILURE";
};

type FrameToHostV1 =
  | FrameBootV1 | FrameReadyV1 | FrameResizeV1
  | FrameStateIntentV1 | FrameInteractionIntentV1 | FrameClientErrorV1;

type HostToFrameV1 = FrameInitV1;
~~~

All objects above are closed (`additionalProperties: false`) at every level. `BOOT` is the only pre-INIT frame message and has no nonce or sequence. The host accepts it only from the exact `contentWindow` with `event.origin === "null"`. `INIT` is the only host→frame P1 message. Its text/ARIA values are strings already selected through the exact listed DataGrant/dataRef/path/snapshot; raster values are only server-decoded, metadata-stripped and re-encoded PNG/WebP `Uint8Array` bytes whose declared length/hash are rechecked by the bootstrap. INIT is at most 1.25 MiB decoded, of which retained data and raster bytes are at most 1 MiB.

After INIT, `READY` must be sequence 1, occur exactly once and echo INIT's `stateRevision`; before it succeeds, every other frame message is rejected and no intent can be prepared. Only then may the frame send `RESIZE`, `STATE_INTENT`, `INTERACTION_INTENT` or `CLIENT_ERROR`, each at most 64 KiB and with `messageSequence` beginning at 2 and equal to the previously accepted value plus 1. `CLIENT_ERROR` has no model-authored text, stack, URL or source excerpt. `renderNodeId` must occur in the selected behavior's `target_node_ids` and the ActionGrant's allowed node set. State keys/values must match the exact closed state schema; interaction input must match the exact ActionGrant input schema and manifest node/behavior binding. Unknown keys, missing discriminants, non-finite numbers, prototype keys, oversized arrays, stale state revisions and mismatched bindings reject the whole message. A committed shared-state change causes a fresh mount/INIT with a new nonce; P1 has no incremental host→frame state-sync message.

The nonce is invalidated on unmount, never persisted, and never authority. Trusted parent code—not the frame—obtains and attaches a separate one-use server interaction token bound to user, channel, instance, revision, render node, ActionGrant, input hash and expiry.

The host permanently labels the frame AI-generated, owns title/provenance/error chrome, caps dimensions and keeps a text alternative. Generated pixels are untrusted and may imitate controls; only host chrome is authoritative.

## P1 optional compiled iframe profile

The static Daytona build-and-publish profile below is a possible future option for reusable mini-apps that require authored browser code. It is not required for P1 and does not replace the P1 declarative generated-document activity above; it remains disabled until a separate security decision addresses navigation/egress and resource isolation for arbitrary script.

In this optional profile, progressive generation means publishing a sequence of complete immutable revisions: for example, shell, data view, then richer interaction. It does not mean injecting unvalidated token deltas into a live document.

### Build and publication pipeline

1. A future task extends RenderGrant with the P1 build profile `static-ui-1`.
2. TrueForge creates a Daytona workspace containing a fixed, application-owned UI starter and locked build toolchain.
3. The coworker writes source under one normalized surface directory. Only synthetic or explicitly public data may enter this workspace under ADR-005.
4. The build runs without application, TrueForge, Composio, model-provider, artifact-store, or user credentials. Generated package manifests, dependency changes, install scripts, and arbitrary package installation are rejected. The base image supplies the reviewed dependency set.
5. The application extracts only the build output directory. Paths, MIME types, per-file size, total size, symlinks, archives, and content hashes are validated.
6. A scanner rejects remote imports/assets, inline event attributes, base tags, forms, frames, objects, embeds, SVG, WebAssembly, eval, new Function, service workers, shared workers, WebRTC, credential APIs, and known navigation or popup primitives. Static scanning is defense in depth, not the security boundary.
7. The publisher creates a content-addressed immutable revision on a dedicated cookieless generated-UI origin. It never serves generated output from the application origin.
8. Automated accessibility and smoke tests run. A failing revision is not promoted.
9. The host mounts the already server-promoted candidate invisibly, completes a nonce-bound READY handshake, then atomically replaces the previous local mount. Failure keeps the previous local mount and records client telemetry without rolling back durable server state.
10. Each promoted revision is persisted and emitted as one ui.iframe.revision_published event.

Build output is a generated UI package, not a generic artifact preview. Generic HTML artifacts remain script-disabled under the artifact security contract.

### Browser containment

The iframe MUST use:

~~~html
<iframe
  sandbox="allow-scripts"
  referrerpolicy="no-referrer"
  title="Generated interactive view: [server title]"
  allow=""
></iframe>
~~~

It MUST NOT include allow-same-origin, allow-forms, allow-popups, allow-modals, allow-downloads, allow-top-navigation, allow-pointer-lock, allow-presentation, or storage-access tokens. credentialless SHOULD be enabled where supported, but is not a substitute for the cookieless origin or other controls.

Every generated response uses a CSP at least as restrictive as:

~~~text
default-src 'none';
script-src 'self' <publisher-generated script hashes>;
style-src 'self' <publisher-generated style hashes>;
style-src-attr 'none';
script-src-attr 'none';
img-src 'self' blob:;
font-src 'self';
connect-src 'none';
media-src 'none';
object-src 'none';
frame-src 'none';
worker-src 'none';
manifest-src 'none';
form-action 'none';
base-uri 'none';
frame-ancestors <exact application origin>;
~~~

It also sends `Cache-Control: no-store`, X-Content-Type-Options: nosniff, Referrer-Policy: no-referrer, the exact versioned Permissions-Policy deny list defined for P1, no permissive CORS headers, and no Set-Cookie. Assets are relative, content-addressed, correctly typed, and immutable. User-controlled filenames never become response headers without encoding.

The host does not expose DOM handles, globals, cookies, storage, auth headers, API base URLs, connector IDs, or service secrets to the frame. Runtime data arrives only in a bounded INIT message after grant checks. The frame cannot read or modify parent DOM because it has an opaque origin.

Important limitation: iframe sandboxing and CSP do not prove zero egress for arbitrary JavaScript; a script may navigate its own frame and trigger blind requests. This is why the arbitrary-script profile is P1-disabled rather than treated as a stronger form of P0. It requires a separately accepted architecture and verified browser/network controls.

Any future P1 frame still receives only synthetic/public data. Free-text entry, uploads, credentials, private answers, approval decisions, and other sensitive inputs remain trusted-host UI. The host boundary and user-facing label must never suggest that typing sensitive information into generated content is safe.

### Progressive revision behavior

- A revision is accepted only when base_render_revision equals the current accepted revision, except the first snapshot.
- Source and bundle files are immutable by hash. A revision never overwrites another revision's URL.
- At most one candidate builds per surface. A later candidate supersedes an unstarted candidate but never mutates a promoted revision.
- The host remains on its local last-mounted revision until the candidate sends READY with the expected surface, revision, manifest hash, mount nonce, and protocol version. Durable `last_good_render_revision` already points to the latest server-validated promotion.
- The host sends the latest bounded public SurfaceState in INIT. A frame may not fetch it.
- A candidate that crashes, misses READY, violates CSP, sends invalid messages, or exceeds a watchdog threshold is unmounted locally and reported through bounded client telemetry. A mount-specific failure does not globally mark or roll back an otherwise valid immutable revision.
- Progressive updates preserve server shared state only when the new revision declares the same state field names and compatible types. Incompatible fields reset with a visible note.
- The UI always offers View accessible summary and Report generated view.

### Parent-frame message protocol

Because an iframe without allow-same-origin has an opaque origin, its `MessageEvent.origin` is the literal string `"null"` (never JavaScript `null`). The host MUST NOT pretend it can authenticate the generated origin through event.origin alone.

For every mount, the host creates a random 128-bit mount_nonce and keeps it in memory. The fixed bootstrap first posts the closed BOOT payload with protocol/surface/revision/manifest fields but no nonce or sequence. After exact source-window, literal-`"null"` origin, profile, schema, byte and rate checks, the parent sends INIT with the nonce, initial sequence binding, exact revision/manifest and bounded public state/assets; the frame then answers READY. Generated code learns the nonce, so it prevents sibling-frame confusion rather than authorizing a request.

The host accepts BOOT only under the pre-INIT rule above. It accepts every post-INIT frame message only when:

- event.source is exactly the mounted iframe contentWindow;
- `event.origin === "null"` for the opaque sandbox;
- `protocolVersion`, `surfaceId`, `renderRevision`, `manifestSha256`, `mountNonce` and monotonically increasing `messageSequence` match;
- READY is exactly sequence 1, occurs once and echoes INIT stateRevision; every other allowed message occurs only afterward starting at sequence 2;
- the message is one of READY, RESIZE, STATE_INTENT, INTERACTION_INTENT, or CLIENT_ERROR, and every intent's render node matches its behavior and ActionGrant;
- the decoded payload passes a closed schema and byte limit.

On remount, the old nonce is invalid immediately. The host uses targetOrigin "*" only because an opaque-origin frame cannot be targeted by a normal origin string; source-window, nonce, revision, schema, and server authorization provide the binding. No iframe message is itself authorization.

RESIZE is clamped by the host. The iframe cannot cover host chrome, approval cards, or the composer. Repeated invalid messages unmount the frame.

## AG-UI carriage and application events

### Division of responsibility

| Concern | Owner |
| --- | --- |
| Run/event streaming between the runtime adapter and application | AG-UI |
| Generative UI document, component, revision, state, and interaction schemas | ForgeRoom |
| Authorization and grants | ForgeRoom API |
| Durable order and replay | Application channel event log |
| Browser execution boundary | Trusted registry renderer or sandboxed iframe |

The adapter uses standard AG-UI event families:

- Controlled component selection and arguments use `TOOL_CALL_START/ARGS/END`; a typed `forgeroom.controlled_ui.v1` activity carries the validated, replayable instance projection.
- Open UI uses source-free `ACTIVITY_SNAPSHOT/DELTA` with `activityType: "open-generative-ui"`; the private producer stream materializes into the exact closed snapshot/delta projections in `contracts/events.md`, and the host requests the exact iframe URL separately.
- Shared presentation state uses `STATE_SNAPSHOT/DELTA` with RFC 6902 and the safe `ChannelUIStateV1` projection.
- Ordinary tool completion may project `TOOL_CALL_RESULT`. Interactive component input resolves an application-owned UIComponentInterrupt and starts a structured continuation wire run; only canonical RequiredAction handling may use an authorized PauseGroup resume.

`CUSTOM` is not the primary generative-UI transport. It may carry only a separately registered compatibility signal when the pinned stable SDK lacks a standard event, and the UI must still reduce it into one of the typed application activities before rendering.

AG-UI lifecycle, text, tool, state and activity events do not implicitly authorize a UI surface. The adapter accepts a UI event only from the bound active run and logical coworker thread, validates it, persists the resulting UIInstance/revision plus channel-sequenced envelope, then broadcasts it. The browser renders only official AG-UI fields and registered activity/component payloads, never raw TrueForge/provider events.

Normalized application event types are:

~~~text
ui.surface.created
ui.render.snapshot
ui.render.patch
ui.iframe.revision_published
ui.state.snapshot
ui.state.patch
ui.surface.ready
ui.surface.degraded
ui.surface.failed
ui.surface.revoked
ui.interaction.accepted
ui.interaction.rejected
ui.interaction.result
ui.surface.closed
~~~

`ui.render.patch` is allowed only for registry_v1 and uses a restricted RFC 6902 subset: add, remove, and replace. Paths may address the component document only, never identity, grants, lineage, rail, or revision fields. The server applies the patch to a copy, validates the complete resulting RegistryDocument, and commits it atomically. P1 iframe producer fragments assemble only in the private server path; browser activity deltas carry source-free progress. Only a complete validated source revision becomes replay-authoritative or renderable.

Binary assets, credentials, raw external data, generated HTML/CSS/behavior source and unrestricted provider payloads never travel in browser/durable AG-UI JSON. The generated origin serves the exact authorized immutable document directly.

### Ordering, deduplication, and gaps

- Private producer fragments deduplicate by agent_turn_id plus producer stream sequence; multiple fragments for one surface/message are never deduplicated by activity ID alone.
- Canonical UI events receive the existing monotonic channel sequence in the same transaction as the state/revision update.
- An update is accepted only when its base revision equals the current server revision. Duplicate hashes are idempotent; conflicting duplicates fail.
- The browser deduplicates by `(channelId, channelSequence)` and reduces agent events by logical thread.
- A channel sequence gap triggers normal SSE replay.
- A render or state revision gap triggers GET of the current full surface snapshot; the client never guesses or applies a future patch.
- AG-UI reconnect or duplicate delivery cannot publish the same UI revision twice.

## Persistence and replay

The logical storage model is:

~~~text
generated_surfaces
  identity, lineage, rail, status, grant IDs,
  current and last-good render revisions, current state revision

ui_render_revisions
  surface ID, revision, base revision, document or iframe manifest,
  payload hash, validation result, creator turn, created time

ui_state_revisions
  surface ID, revision, base revision, bounded state snapshot or patch,
  payload hash, actor, created time

ui_interactions
  interaction ID, surface and revisions, user, action grant,
  redacted input, input hash, idempotency key, state, result reference

ui_grants
  immutable render/data/action grant payload, policy revision,
  expiry and revocation
~~~

Full state snapshots are persisted at surface creation, after every 20 accepted patches, and before closing a surface. The server MAY compact older patches after verifying the snapshot hash, but retains revision hashes and audit lineage.

On initial load or a revision gap:

~~~text
GET /api/ui-instances/:instanceId
~~~

returns the current surface, current validated registry snapshot or source-free iframe manifest/hash projection, current shared state snapshot, grant disclosures safe for the browser, and last channel sequence. It verifies authentication and channel membership; iframe source remains available only through the separately redeemed render capability.

Replay behavior:

1. Restore trusted surface chrome and the last known-good render revision.
2. Restore the latest shared state snapshot.
3. Apply contiguous validated state updates.
4. Remount iframe_v1 with a new nonce and complete `BOOT -> INIT -> READY` before local activation; the replayed server promotion is already authoritative.
5. Render pending/approved/completed action state from canonical server records, never cached iframe claims.
6. If a referenced generated delivery-body blob, future bundle or data snapshot is missing or hash-invalid, show a noninteractive accessible summary and mark degraded.

## Interaction gateway

Both rails use the same trusted-host gateway. The iframe emits only an untrusted closed-schema intent; it never receives the server token. After validating that intent, trusted parent code requests a one-use interaction record:

P0 implements only registry-client requests for `local_state`, `server_read`, and `complete_component_interrupt`, plus the token/commit endpoints. The iframe client kind, `/confirm`, `request_agent_turn`, and `open_existing_hitl` portions below are P1-only.

~~~ts
type InteractionTokenRequest = {
  schemaVersion: 1;
  surfaceId: string;
  renderNodeId: string;
  renderRevision: number;
  expectedStateRevision: number | null;
  actionGrantId: string;
  actionRef: string;
  input: JsonValue;
  clientKind: "registry" | "iframe";
};
~~~

~~~text
POST /api/ui-instances/:instanceId/interaction-tokens
→ ordinary modes: { interactionId, state: "token_issued", interactionToken, expiresAt }
→ trusted-confirmation mode: { interactionId, state: "awaiting_confirmation", confirmationChallenge, normalizedSummary }

POST /api/ui-instances/:instanceId/interactions
Body: { interactionId, interactionToken }

POST /api/ui-instances/:instanceId/interactions/:interactionId/confirm
Body: { confirmationChallenge, confirmed: true }
~~~

All three endpoints require authenticated channel membership, expected Origin, CSRF protection, and the current workspace role. The token request stores the validated redacted input/hash and binds the record to the user, channel, surface, render/state revisions, render node, ActionGrant and expiry. For ordinary modes it returns a random one-use token; commit consumes it atomically and a retry returns the first recorded result.

`request_agent_turn` and every ActionGrant with `requires_trusted_confirmation` use a two-stage trusted-host flow. The token request creates an immutable `awaiting_confirmation` preparation containing the normalized target/message summary and a session-bound challenge, but returns no dispatch token and performs no enqueue. A separate explicit click in application-owned host chrome posts the challenge to `/confirm`; that endpoint requires expected Origin, CSRF, recent authentication when configured, the same user/session and an unexpired unchanged grant/revision. The server records `confirmed_by`/`confirmed_at`, internally mints and consumes a confirmation-bound token, increments the grant use count and enqueues exactly once in one idempotent transition. The token is never returned to the iframe or browser JavaScript. Cancel/expiry marks the preparation stale without dispatch.

For every intent the server:

1. Loads the surface from the route, never from client-supplied ownership fields.
2. Confirms ready status, channel, creator lineage, current render revision, current policy revision, and non-revoked grants.
3. Confirms the render node and action_ref are bound to the ActionGrant and that the grant is valid for this surface.
4. Validates input against the registered handler schema and rejects unknown fields, prototype keys, oversized values, credentials, and unsupported types.
5. Enforces recent authentication where required, per-user and per-surface rate limits, an atomic ActionGrant use counter, and one result per server-issued idempotency key.
6. Applies expected_state_revision with compare-and-swap for shared-state changes.
7. Records redacted input plus its hash and appends a normalized channel event.
8. Dispatches only the registered handler_key.

Handler behavior:

| Mode | Result |
| --- | --- |
| local_state | Validate and atomically update bounded shared state |
| server_read | Recheck both grants and read/filter only the exact retained `data_grant_id`/`data_ref` and selection paths named by the ActionGrant; never issue a fresh query |
| complete_component_interrupt | CAS-resolve the exact durable UI component interrupt, persist its bounded result and enqueue one structured same-RunStep continuation; never touch a PauseGroup |
| request_agent_turn (P1 only) | Prepare immutable normalized intent, require an explicit trusted-host `/confirm` click, then enqueue one normal attributed agent turn; any later external tool proposal enters the canonical RequiredAction/PauseGroup path |
| open_existing_hitl (P1 only) | Resolve the exact existing current RequiredAction in the grant and open its canonical host card; decision/answer remains on the dedicated endpoint |

The gateway never accepts an arbitrary endpoint, SQL/query string, tool name, Composio slug, connector/account selector, shell command, URL, or provider arguments from the UI. An action grant cannot bypass the existing ToolPolicyDefinition, exact account binding, descriptor check, approval policy, or session generation.

Iframe intents are requests from untrusted content, not proof of a human gesture. The host confirms any agent continuation separately. Generic UI endpoints cannot create an ActionProposal, approve/deny an action, answer a canonical Question, or resume a PauseGroup; those operations remain on dedicated endpoints with existing CSRF, recent-auth, immutable payload and atomic resume rules.

## Revocation and lifecycle

- Grant expiry or non-security administrative revocation immediately disables new data resolution and interaction acceptance. A still-authorized channel member may receive the exact already-committed public/synthetic snapshot and immutable document hashes again for read-only historical replay after either condition; this path performs no query/tool resolution, issues no interaction token and exposes `interactionEnabled: false`.
- A security quarantine, source/data integrity failure, legal deletion or credential-canary hit tombstones historical document/data delivery and replaces it with the accessible summary plus an audit marker.
- A policy tightening, channel removal, surface closure, or source deletion emits ui.surface.revoked or ui.surface.closed and invalidates mount nonces.
- Already displayed public/synthetic iframe data cannot be retracted from browser memory; the product does not claim otherwise.
- A stale render revision may remain visible as read-only with a clear label, but it cannot submit intents.
- Archiving a channel prevents new builds and interactions.
- A surface may be retained with the channel audit record or deleted under workspace retention policy. Deletion removes generated delivery-body blobs and any future compiled bundles while preserving only required redacted audit hashes.

## Accessibility

### Registry rail

- Components target WCAG 2.2 AA and use semantic HTML.
- Every interactive element is keyboard reachable and has a visible focus state.
- Headings preserve a valid hierarchy within the host document.
- Forms require programmatic labels, inline error association, and an error summary.
- Images require nonempty alt text unless explicitly decorative.
- Charts include a title, units, series labels, non-color cues, and a synchronized data-table fallback.
- Graphs include a searchable node/edge list and keyboard selection fallback.
- Streaming updates preserve focus. Significant completed updates use one polite live-region announcement; token updates are not announced.
- Motion honors prefers-reduced-motion.

### Iframe rail

- The host supplies a descriptive iframe title and accessible summary.
- When accessibility automation is a promotion gate, a separate trusted headless verifier loads the exact immutable response and records its hash-bound result; the opaque host page does not claim it can inspect the frame DOM. Zero critical/serious axe findings are a minimum, not complete WCAG conformance.
- Keyboard traversal, focus visibility, landmarks, labels, contrast, reduced motion, and 200 percent zoom are exercised by fixtures.
- A table/text alternative is mandatory for chart or graph results.
- If the candidate fails accessibility gates, the last good revision remains active and the accessible summary is shown.

## Rail limits

Only the `registry_v1` column applies to P0. The `iframe_v1` column becomes normative only when P1-317 and P1-506 pass and the experimental feature flag is enabled.

All limits are server constants copied into RenderGrant. A smaller workspace, channel, or grant limit wins.

| Limit | registry_v1 | iframe_v1 |
| --- | ---: | ---: |
| Accepted render revisions per run/surface | 20 | 12 |
| Minimum interval between persisted revisions | 500 ms | 500 ms |
| Serialized render/activity snapshot | 256 KiB | 256 KiB |
| Component nodes / maximum depth | 150 / 8 | Not applicable |
| Total rendered text | 64 KiB | 64 KiB accessible-text scan |
| Table rows / columns | 200 / 20 | 200 / 20 for injected datasets |
| Chart series / points total | 8 / 1,000 | 8 / 1,000 for injected datasets |
| Graph nodes / edges | Not applicable in P0 | 150 / 300 for injected datasets |
| Images / decoded pixels each | 1 artifact image / 16 megapixels | 12 / 16 megapixels |
| Form fields / text field length | 8 finite-choice/number fields / no free text | 0 free-text fields; bounded finite-number and enum controls only |
| Data snapshots per surface / total encoded size | 8 / 1 MiB | 8 / 1 MiB |
| CSS / HTML / behavior manifest | Not applicable | 64 KiB / 128 KiB / 32 KiB |
| Frame→host message / host→frame INIT | Not applicable | 64 KiB / 1.25 MiB total (including at most 1 MiB retained data/assets) |
| Interaction intents | 30 per user per minute, 10 pending | 30 per user per minute, 10 pending |
| READY deadline / resize height | Not applicable | 5 s / 240–1,200 px |

The host unmounts an iframe after repeated invalid messages, runaway resize requests, or an unresponsive fixed bootstrap. Browser CPU and memory observations are availability mitigations, not hard resource accounting guarantees.

## Failure and fallback matrix

| Failure | Required behavior |
| --- | --- |
| Unknown component or invalid props | Reject whole revision; keep last good; one bounded repair opportunity |
| Missing/revoked DataGrant | Replace affected data with explicit unavailable state; no silent empty chart |
| Missing/revoked ActionGrant | Disable control and explain that permission is unavailable |
| Patch base mismatch | Fetch full snapshot; do not apply patch |
| AG-UI duplicate | Deduplicate without a second revision or interaction |
| Source schema, ordering, CSP, or accessibility failure | Quarantine candidate; retain last good revision and accessible summary |
| Iframe crash or READY timeout | Keep the server-promoted revision; unmount only that local candidate, retain the prior local mount and record bounded client telemetry |
| Invalid/forged frame message | Reject, audit bounded metadata, and unmount after threshold |
| State compare-and-swap conflict | Return current state revision and require explicit retry |
| Action denied/stale/unknown | Show the canonical status; never claim success |
| Delivery-body/index/data hash mismatch on replay | Degrade to noninteractive summary and source links |
| No prior good revision | Render a trusted error card plus Markdown/structured fallback |

## Audit and observability

Record:

- Surface identity, channel/run/turn lineage, rail, creator, and replacement relationship.
- Grant IDs, policy revisions, expiry/revocation, and effective limit set.
- Every requested, accepted, rejected, promoted, failed, and closed render/state revision with hashes.
- Renderer profile/version, source/delivery-body/index/manifest/argument hashes, CSP/header profile, validation result, accessibility result, and UIInstance revision.
- Interaction ID, user, component, action grant, input hash, redacted safe fields, idempotency result, and canonical proposal/result reference.
- CSP violations, READY timeouts, invalid message counts, fallback activation, and replay recovery.

Do not record generated secrets, raw form bodies, unrestricted source code in application logs, channel/AG-UI JSON, audit exports, or browser telemetry; also exclude raw provider payloads, credentials, private reasoning, mount nonces and member/verifier capability URLs. Within application-controlled durable stores after promotion, generated source exists only inside the access-controlled immutable final delivery-body blob under the existing retention policy; pre-binding and failed/abandoned staging follows the deletion rule above. Source necessarily transits the configured model/TrueForge/MCP path before ingestion; provider-side retention is an explicit deployment disclosure and verification item, not something this application storage rule can eliminate.

Metrics include surface success rate by rail, time to first good revision, revision rejection reason, fallback rate, interaction rejection reason, iframe crash/timeout rate, patch-resync count, and accessibility-gate failures. Metrics must not label an approval decision as external execution success.

## Acceptance tests

| ID | Acceptance |
| --- | --- |
| GUIT-001 | A controlled component tool renders a table, bar/line chart, TaskCard, ArtifactCard and bounded ChoiceForm using only locally registered React components. |
| GUIT-002 | Unknown component names, extra props, HTML, event handlers, CSS, expressions, prototype keys, duplicate IDs, and arbitrary URLs reject the entire controlled revision. |
| GUIT-003 | A model-authored approval card is rejected; a server-bound privileged HITL card renders canonical data and acts through the existing endpoint. |
| GUIT-004 | A RenderGrant alone cannot resolve data or submit an interaction. A DataGrant alone cannot submit an interaction. An ActionGrant alone cannot fetch data. |
| GUIT-005 | Cross-channel, expired, revoked, wrong-instance, wrong-component, wrong-policy-revision, and over-limit grants fail closed. |
| GUIT-006 | A registry or state patch with the wrong base revision is not applied; full-snapshot recovery produces the same document hash as a clean load. |
| GUIT-007 | Duplicate AG-UI activity events create one canonical revision, and an invalid event or payload cannot reach a renderer. |
| GUIT-008 | Browser refresh and SSE replay restore the last good render, shared state, interaction status, and source lineage without rerunning the model. |
| GUIT-009 | Open UI progresses through CSS/HTML/behavior-manifest completeness, persists every complete safe progress reference before broadcast, rejects executable fields, contains no credentials/external resources, and binds final source/delivery-body/index/manifest/data/binding/state-schema/args/renderer/verifier/bootstrap/sanitizer/CSP/header hashes. |
| GUIT-010 | The capability document loads from the dedicated cookieless origin—not srcdoc/application origin—with allow-scripts only, `allow=""`, opaque origin, exact hash CSP, `Cache-Control: no-store`, the explicit Permissions-Policy deny list, no application cookies, and no permissive CORS. |
| GUIT-011 | Parser fixtures containing scripts, handlers, JavaScript/data/blob URLs, authored src/srcset/href, SVG/MathML/custom elements, forms/inputs/contenteditable, navigation, remote resources, CSS imports/URLs, workers/storage or host/API access fail before promotion; the fixed bootstrap exposes none of those helpers. |
| GUIT-012 | BOOT → INIT → READY succeeds with literal `event.origin === "null"`; READY is exactly sequence 1 before any intent, each intent binds a behavior/ActionGrant render node, and a sibling/wrong source window, revision, manifest, nonce or sequence fails; remount invalidates the old nonce; the iframe never receives a server interaction/dispatch token. |
| GUIT-013 | iframe_v1 is rejected after any restricted/unknown retained history, system/tool/subagent input or snapshot enters the stable logical session; compaction/rotation/public-next-call downgrade attempts, inline copied data and credential canaries fail. |
| GUIT-014 | Out-of-order/invalid private producer fragments or forbidden source-free activity patches quarantine the candidate; a complete valid source-free replacement snapshot recovers. Detached/no-browser promotion commits and terminates without READY, while READY timeout preserves server state and the prior local mount. |
| GUIT-015 | An iframe can resolve the exact component-input interrupt, open the exact existing HITL card or request a normal agent turn. Component completion creates one structured continuation; turn preparation returns no dispatch token and only an explicit CSRF/recent-auth same-session host confirmation enqueues once. No generic flow can create/decide a proposal, answer a Question, resume a PauseGroup or call an application/provider API. |
| GUIT-023 | Free-text, file, private answer, credential, and approval entry occur only in trusted host components; generated document fixtures attempting to create those controls are rejected. |
| GUIT-016 | Interaction replay with the same server idempotency key returns the first result and creates no second state change or agent continuation. |
| GUIT-017 | Concurrent state intents at one expected revision allow one compare-and-swap winner and return the new revision to the loser. |
| GUIT-018 | Registry chart/table fallbacks, trusted-form labeling/errors, keyboard order, focus preservation, contrast, reduced motion and zoom pass; P1 iframe promotion additionally persists trusted verifier evidence bound to its exact hash profile. |
| GUIT-019 | Every `registry_v1` P0 limit has boundary, one-over and aggregate-limit tests; oversize events are rejected before persistence or render. |
| GUIT-020 | Grant expiry/revocation disables interactions/new resolution; a current member may redeliver only the exact already-committed public/synthetic snapshot read-only, while security quarantine, integrity failure, canary or deletion tombstones all delivery. |
| GUIT-021 | CSP/source/accessibility/runtime failure yields a trusted accessible fallback and does not break channel messages, approvals, or the composer. |
| GUIT-022 | Audit export links surface, revision, grant, interaction, proposal, and result hashes while excluding fixture secrets, raw private inputs, reasoning, source bodies, and mount nonces. |

P0 release requires GUIT-001 through GUIT-008, GUIT-016 through GUIT-019, the controlled-rail clauses of GUIT-021/GUIT-022, and explicit absence/unsupported tests for every iframe capability. P1-506 owns GUIT-009 through GUIT-015, GUIT-020, GUIT-023 and every iframe-specific clause in GUIT-018/GUIT-021/GUIT-022, including the manual iframe isolation/CSP review. The interaction gateway remains reviewed in both releases.

## Implementation references

- [OpenBot architecture](https://github.com/CopilotKit/openbot/blob/d293f2331bd5ff9ba4ad17af6ac94570a157d26d/docs/architecture.md)
- [OpenBot compiled component registry](https://github.com/CopilotKit/openbot/blob/d293f2331bd5ff9ba4ad17af6ac94570a157d26d/app/src/lib/copilot/gallery-registry.ts)
- [OpenBot component call-time grant recheck](https://github.com/CopilotKit/openbot/blob/d293f2331bd5ff9ba4ad17af6ac94570a157d26d/app/src/lib/copilot/gallery-tools.tsx)
- [OpenBot sandboxed component renderer](https://github.com/CopilotKit/openbot/blob/d293f2331bd5ff9ba4ad17af6ac94570a157d26d/app/src/lib/copilot/sandboxed-tools.tsx)
- [CopilotKit Open Generative UI middleware](https://github.com/CopilotKit/CopilotKit/blob/bf2068734bcc42b9dc9999b183d0fd07a673f713/packages/runtime/src/v2/runtime/open-generative-ui-middleware.ts)
- [CopilotKit Open Generative UI renderer](https://github.com/CopilotKit/CopilotKit/blob/bf2068734bcc42b9dc9999b183d0fd07a673f713/packages/react-core/src/v2/components/OpenGenerativeUIRenderer.tsx)
