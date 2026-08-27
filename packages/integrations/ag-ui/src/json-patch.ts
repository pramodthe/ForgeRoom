/**
 * Restricted RFC 6902 apply for ForgeRoom UI-state deltas.
 * Only add/remove/replace/test; rejects unsafe pointer segments.
 */

export type JsonPatchOp =
  | { op: "add"; path: string; value: unknown }
  | { op: "remove"; path: string }
  | { op: "replace"; path: string; value: unknown }
  | { op: "test"; path: string; value: unknown };

const FORBIDDEN_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);

export function parseJsonPointer(path: string): string[] | null {
  if (path === "") return [];
  if (!path.startsWith("/")) return null;
  const segments = path
    .slice(1)
    .split("/")
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
  if (segments.some((segment) => FORBIDDEN_SEGMENTS.has(segment))) {
    return null;
  }
  return segments;
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right) return false;
  if (left === null || right === null) return left === right;
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;
    return left.every((entry, index) => deepEqual(entry, right[index]));
  }
  if (typeof left === "object" && typeof right === "object") {
    const leftKeys = Object.keys(left as object).sort();
    const rightKeys = Object.keys(right as object).sort();
    if (leftKeys.length !== rightKeys.length) return false;
    if (!leftKeys.every((key, index) => key === rightKeys[index])) return false;
    return leftKeys.every((key) =>
      deepEqual(
        (left as Record<string, unknown>)[key],
        (right as Record<string, unknown>)[key],
      ),
    );
  }
  return false;
}

function cloneJson<T>(value: T): T {
  return structuredClone(value);
}

type ParentRef =
  | { kind: "object"; parent: Record<string, unknown>; key: string }
  | { kind: "array"; parent: unknown[]; key: number | "-" };

function resolveParent(root: unknown, segments: string[]): ParentRef | null {
  if (segments.length === 0) return null;
  let current: unknown = root;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (segment === undefined) return null;
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9][0-9]*)$/u.test(segment)) return null;
      const next = current[Number(segment)];
      if (next === undefined) return null;
      current = next;
      continue;
    }
    if (!current || typeof current !== "object") return null;
    const record = current as Record<string, unknown>;
    if (!(segment in record)) return null;
    current = record[segment];
  }

  const last = segments[segments.length - 1];
  if (last === undefined) return null;
  if (Array.isArray(current)) {
    if (last === "-") return { kind: "array", parent: current, key: "-" };
    if (!/^(?:0|[1-9][0-9]*)$/u.test(last)) return null;
    return { kind: "array", parent: current, key: Number(last) };
  }
  if (!current || typeof current !== "object") return null;
  return { kind: "object", parent: current as Record<string, unknown>, key: last };
}

function readValue(root: unknown, segments: string[]): { ok: true; value: unknown } | { ok: false } {
  if (segments.length === 0) return { ok: true, value: root };
  const parent = resolveParent(root, segments);
  if (!parent) return { ok: false };
  if (parent.kind === "array") {
    if (parent.key === "-") return { ok: false };
    if (parent.key < 0 || parent.key >= parent.parent.length) return { ok: false };
    return { ok: true, value: parent.parent[parent.key] };
  }
  if (!(parent.key in parent.parent)) return { ok: false };
  return { ok: true, value: parent.parent[parent.key] };
}

function applyOne(root: unknown, operation: JsonPatchOp): unknown | null {
  const segments = parseJsonPointer(operation.path);
  if (segments === null) return null;

  if (operation.op === "test") {
    const current = readValue(root, segments);
    if (!current.ok || !deepEqual(current.value, operation.value)) return null;
    return root;
  }

  if (segments.length === 0) {
    if (operation.op === "remove") return null;
    return cloneJson(operation.value);
  }

  const parent = resolveParent(root, segments);
  if (!parent) return null;

  if (operation.op === "remove") {
    if (parent.kind === "array") {
      if (parent.key === "-" || parent.key < 0 || parent.key >= parent.parent.length) return null;
      parent.parent.splice(parent.key, 1);
      return root;
    }
    if (!(parent.key in parent.parent)) return null;
    delete parent.parent[parent.key];
    return root;
  }

  if (operation.op === "add") {
    if (parent.kind === "array") {
      if (parent.key === "-") {
        parent.parent.push(cloneJson(operation.value));
        return root;
      }
      if (parent.key < 0 || parent.key > parent.parent.length) return null;
      parent.parent.splice(parent.key, 0, cloneJson(operation.value));
      return root;
    }
    parent.parent[parent.key] = cloneJson(operation.value);
    return root;
  }

  // replace
  if (parent.kind === "array") {
    if (parent.key === "-" || parent.key < 0 || parent.key >= parent.parent.length) return null;
    parent.parent[parent.key] = cloneJson(operation.value);
    return root;
  }
  if (!(parent.key in parent.parent)) return null;
  parent.parent[parent.key] = cloneJson(operation.value);
  return root;
}

export function applyJsonPatch(document: unknown, patch: JsonPatchOp[]): unknown | null {
  let current = cloneJson(document);
  for (const operation of patch) {
    const next = applyOne(current, operation);
    if (next === null) return null;
    current = next;
  }
  return current;
}
