import { P0_AGENT_TOOL_COMPONENT_NAMES } from "../index";
import { MAX_STRING_LENGTH } from "./limits";
import { PARAMETER_SCHEMAS } from "./schemas";

type P0AgentToolComponentName = (typeof P0_AGENT_TOOL_COMPONENT_NAMES)[number];

const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export type PropValidationResult =
  { ok: true; value: Record<string, unknown> } | { ok: false; reason: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateValue(
  schema: Record<string, unknown>,
  value: unknown,
  path: string,
): string | null {
  const type = schema.type;
  if (type === "string") {
    if (typeof value !== "string") return `${path} must be a string`;
    if (value.length > MAX_STRING_LENGTH) return `${path} exceeds max length`;
    if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
      return `${path} is not an allowed value`;
    }
    return null;
  }
  if (type === "boolean") {
    return typeof value === "boolean" ? null : `${path} must be a boolean`;
  }
  if (type === "array") {
    if (!Array.isArray(value)) {
      return `${path} must be an array`;
    }
    const maxItems = schema.maxItems;
    if (typeof maxItems === "number" && value.length > maxItems) {
      return `${path} exceeds max items`;
    }
    const items = schema.items;
    if (items && typeof items === "object") {
      for (let index = 0; index < value.length; index += 1) {
        const itemError = validateValue(
          items as Record<string, unknown>,
          value[index],
          `${path}[${index}]`,
        );
        if (itemError) {
          return itemError;
        }
      }
    }
    return null;
  }
  if (Array.isArray(type)) {
    const allowed = type
      .map((entry) => validateValue({ type: entry }, value, path))
      .some((error) => error === null);
    return allowed ? null : `${path} has an invalid type`;
  }
  if (type === "object" || type === undefined) {
    if (!isPlainObject(value)) {
      return `${path} must be an object`;
    }
    const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
    if (!properties) {
      return null;
    }
    const required = (schema.required ?? []) as string[];
    const additionalProperties = schema.additionalProperties === false;
    for (const key of required) {
      if (!(key in value)) {
        return `${path}.${key} is required`;
      }
    }
    for (const [key, fieldValue] of Object.entries(value)) {
      if (!(key in properties)) {
        if (additionalProperties) {
          return `${path}.${key} is not allowed`;
        }
        continue;
      }
      const error = validateValue(properties[key]!, fieldValue, `${path}.${key}`);
      if (error) {
        return error;
      }
    }
    return null;
  }
  if (type === "null") {
    return value === null ? null : `${path} must be null`;
  }
  return null;
}

export function validateControlledProps(
  componentName: string,
  props: unknown,
): PropValidationResult {
  if (!P0_AGENT_TOOL_COMPONENT_NAMES.includes(componentName as P0AgentToolComponentName)) {
    return { ok: false, reason: "Unknown controlled component." };
  }
  if (!isPlainObject(props)) {
    return { ok: false, reason: "Props must be a plain object." };
  }
  for (const key of Reflect.ownKeys(props)) {
    if (typeof key === "string" && FORBIDDEN_KEYS.has(key)) {
      return { ok: false, reason: `Forbidden key: ${key}` };
    }
  }

  const schema = PARAMETER_SCHEMAS[componentName as P0AgentToolComponentName];
  if (!schema) {
    return { ok: false, reason: "Unknown controlled component." };
  }
  const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
  const required = (schema.required ?? []) as string[];
  const additionalProperties = schema.additionalProperties === false;

  for (const key of required) {
    if (!(key in props)) {
      return { ok: false, reason: `Missing required prop: ${key}` };
    }
  }

  for (const [key, value] of Object.entries(props)) {
    if (!(key in properties)) {
      if (additionalProperties) {
        return { ok: false, reason: `Unknown prop: ${key}` };
      }
      continue;
    }
    const fieldSchema = properties[key] ?? {};
    const error = validateValue(fieldSchema, value, key);
    if (error) return { ok: false, reason: error };
  }

  return { ok: true, value: props };
}
