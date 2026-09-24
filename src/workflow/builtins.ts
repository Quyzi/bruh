import type { NodeDef, PortDef } from "./types";

function inputs(names: string[]): PortDef[] {
  return names.map((name) => ({ name, type: "string" }));
}

function outputs(names: string[]): PortDef[] {
  return names.map((name) => ({ name, type: "string" }));
}

const text = (key: string, label: string): NodeDef["fields"][number] => ({
  kind: "text",
  key,
  label,
});

const area = (key: string, label: string): NodeDef["fields"][number] => ({
  kind: "textarea",
  key,
  label,
  rows: 6,
});

const combo = (
  key: string,
  label: string,
  options: "scripts" | "agents" | "templates"
): NodeDef["fields"][number] => ({
  kind: "combo",
  key,
  label,
  options,
});

/** Title padding 6+6 plus 12px type at line-height 1.3. */
const TITLE_HEIGHT = 28;
/** `.bruh-node` border, inside the React Flow height. */
const NODE_BORDER = 2;
const PORT_ROW_HEIGHT = 22;
/** `.bruh-node__ports` padding 4+4. Omitted when a node has no ports. */
const PORTS_PADDING = 8;
/** `.bruh-node__body` padding 4+8. Omitted when a node has no fields. */
const BODY_PADDING = 12;
const FIELD_GAP = 6;
/** Label plus one text or combo control. */
const SINGLE_LINE_FIELD = 48;
/** Textarea `min-height: 72px` plus its label and the 3px field gap. */
const TEXTAREA_FIELD = 72 + 18;

export function fieldBlockHeight(kind: string): number {
  return kind === "textarea" ? TEXTAREA_FIELD : SINGLE_LINE_FIELD;
}

/** Body box that fits every field without shrinking the controls. */
export function nodeBodyMinHeight(fields: readonly { kind: string }[]): number {
  if (fields.length === 0) return 0;
  let stack = 0;
  for (const field of fields) stack += fieldBlockHeight(field.kind);
  return BODY_PADDING + stack + FIELD_GAP * (fields.length - 1);
}

/**
 * Smallest node height that shows the title, every port row, and every field.
 * Textareas use their CSS minimum; the resizer can still make those nodes taller.
 */
export function minNodeHeight(spec: {
  inputs: readonly unknown[];
  outputs: readonly unknown[];
  fields: readonly { kind: string }[];
}): number {
  const rows = Math.max(spec.inputs.length, spec.outputs.length);
  const ports = rows === 0 ? 0 : PORTS_PADDING + rows * PORT_ROW_HEIGHT;
  return TITLE_HEIGHT + NODE_BORDER + ports + nodeBodyMinHeight(spec.fields);
}

/**
 * Node types that are not generated from Twitch EventSub configs.
 * `type` strings match the Rust executor. Do not rename them.
 */
export function builtinNodeDefs(): NodeDef[] {
  const defs: NodeDef[] = [
    {
      type: "twitch/chat_message",
      title: "Chat Message",
      description: "When a chat message is received in a channel",
      inputs: [],
      outputs: outputs(["channel", "message", "user"]),
      fields: [],
      properties: { eventType: "channel.chat.message" },
      width: 220,
      height: 110,
    },
    {
      type: "twitch/chat_message_prefix",
      title: "Chat Message With Prefix",
      description: "When a chat message is received that starts with a prefix",
      inputs: [],
      outputs: outputs(["channel", "message", "user"]),
      fields: [text("prefix", "Prefix")],
      properties: { eventType: "channel.chat.message", prefix: "!command" },
      width: 240,
      height: 164,
    },
    {
      type: "twitch/send_chat",
      title: "Send Chat",
      description: "Send a message to Twitch chat",
      inputs: inputs(["channel", "message"]),
      outputs: [],
      fields: [],
      properties: {},
      width: 220,
      height: 88,
    },
    {
      type: "twitch/broadcast_chat",
      title: "Broadcast Chat",
      description: "Send a message to all connected channels",
      inputs: inputs(["message"]),
      outputs: [],
      fields: [],
      properties: {},
      width: 220,
      height: 72,
    },
    {
      type: "twitch/send_chat_formatted",
      title: "Send Chat Formatted",
      description: "Send a chat message from a template. Use ?1–?4 for inputs.",
      inputs: inputs(["channel", "param1 (?1)", "param2 (?2)", "param3 (?3)", "param4 (?4)"]),
      outputs: [],
      fields: [area("template", "Template")],
      properties: { template: "Hi ?1, thanks for the follow!" },
      width: 300,
      height: 250,
    },
    {
      type: "twitch/broadcast_chat_formatted",
      title: "Broadcast Chat Formatted",
      description: "Broadcast a templated message. Use ?1–?5 for inputs.",
      inputs: inputs(["param1 (?1)", "param2 (?2)", "param3 (?3)", "param4 (?4)", "param5 (?5)"]),
      outputs: [],
      fields: [area("template", "Template")],
      properties: { template: "Hi ?1, thanks for the follow!" },
      width: 300,
      height: 250,
    },
    {
      type: "script/rhai",
      title: "Rhai Script",
      description: "Execute a Rhai script from the scripts directory",
      inputs: inputs(["input 1", "input 2", "input 3", "input 4", "input 5"]),
      outputs: outputs(["output 1", "output 2", "output 3", "output 4", "output 5"]),
      fields: [combo("scriptName", "Script", "scripts")],
      properties: { scriptName: "" },
      width: 240,
      height: 210,
    },
    {
      type: "database/query",
      title: "DB Query",
      description: "Execute a database query",
      inputs: inputs(["input1", "input2", "input3", "input4", "input5"]),
      outputs: outputs(["results"]),
      fields: [area("query", "Query")],
      properties: { query: "SELECT * FROM events LIMIT 10" },
      width: 300,
      height: 260,
    },
    {
      type: "database/query_dynamic",
      title: "DB Query (Dynamic)",
      description: "Execute a database query provided as an input string",
      inputs: inputs(["query"]),
      outputs: outputs(["results"]),
      fields: [],
      properties: {},
      width: 220,
      height: 72,
    },
    {
      type: "secrets/get",
      title: "Get Secret",
      description: "Retrieve a secret value",
      inputs: [],
      outputs: outputs(["value"]),
      fields: [text("key", "Key")],
      properties: { key: "" },
      width: 220,
      height: 120,
    },
    {
      type: "secrets/set",
      title: "Set Secret",
      description: "Store a secret value",
      inputs: inputs(["key", "value"]),
      outputs: [],
      fields: [text("key", "Key")],
      properties: { key: "" },
      width: 220,
      height: 142,
    },
    {
      type: "secrets/list",
      title: "List Secrets",
      description: "List all secret names",
      inputs: [],
      outputs: outputs(["names"]),
      fields: [],
      properties: {},
      width: 200,
      height: 64,
    },
    {
      type: "secrets/delete",
      title: "Delete Secret",
      description: "Delete a secret by name",
      inputs: inputs(["key"]),
      outputs: [],
      fields: [text("key", "Key")],
      properties: { key: "" },
      width: 220,
      height: 120,
    },
    {
      type: "utilities/Timer",
      title: "Timer",
      description: "Fires on an interval",
      inputs: [],
      outputs: outputs(["interval_seconds"]),
      fields: [text("periodSeconds", "Period (seconds)")],
      properties: { periodSeconds: "60" },
      width: 220,
      height: 120,
    },
    {
      type: "primitives/Constant",
      title: "Constant",
      description: "Outputs a constant string value",
      inputs: [],
      outputs: outputs(["value"]),
      fields: [text("value", "Value")],
      properties: { value: "" },
      width: 220,
      height: 120,
    },
    {
      type: "overlay/display",
      title: "Overlay Display",
      description: "Display an overlay on the stream",
      inputs: inputs(["message", "duration (s)"]),
      outputs: [],
      fields: [combo("templateName", "Template", "templates")],
      properties: { templateName: "" },
      width: 220,
      height: 142,
    },
    {
      type: "ai/prompt",
      title: "AI Prompt",
      description: "Send a prompt to an AI provider. Use ?1–?5 or $1–$5 for inputs.",
      inputs: inputs(["input1", "input2", "input3", "input4", "input5"]),
      outputs: outputs(["response"]),
      fields: [combo("agentName", "Agent", "agents"), area("prompt", "Prompt")],
      properties: { agentName: "", prompt: "" },
      width: 300,
      height: 304,
    },
  ];
  return defs.map((def) => {
    const min = minNodeHeight(def);
    return def.height < min ? { ...def, height: min } : def;
  });
}
