import { ensureCatalog, getNodeDef, menuNodeDefs } from "./catalog";
import { loadLiteGraph, saveLiteGraph } from "./litegraphDoc";

ensureCatalog();

const original = {
  version: 0.4,
  extra: { keep: true },
  config: { align_to_grid: true },
  groups: [{ title: "Night", bounding: [0, 0, 400, 300], color: "#333" }],
  last_node_id: 9,
  last_link_id: 7,
  nodes: [
    {
      id: 1,
      type: "ai/prompt",
      pos: { 0: 10, 1: 20 },
      size: [300, 280],
      title: "AI Prompt",
      color: "#abc",
      properties: { agentName: "Ann", prompt: "Hi ?1" },
      inputs: [
        { name: "input1", type: "string", link: null },
        { name: "input2", type: "string", link: null },
        { name: "input3", type: "string", link: null },
        { name: "input4", type: "string", link: null },
        { name: "input5", type: "string", link: null },
      ],
      outputs: [{ name: "response", type: "string", links: [7, 5] }],
    },
    {
      id: 2,
      type: "twitch/send_chat",
      pos: [400, 20],
      size: [220, 88],
      properties: {},
      inputs: [
        { name: "channel", type: "string", link: null },
        { name: "message", type: "string", link: 7, shape: 1 },
      ],
      outputs: [],
    },
    {
      id: 3,
      type: "twitch/broadcast_chat",
      pos: { x: 0, y: 4 },
      size: [220, 72],
      inputs: [{ name: "message", type: "string", link: 5 }],
      outputs: [],
    },
    {
      id: 4,
      type: "twitch/chat_message",
      pos: [0, 200],
      size: [220, 110],
      properties: { eventType: "channel.chat.message" },
      outputs: [
        { name: "channel", type: "string", links: null },
        { name: "message", type: "string", links: null },
        { name: "user", type: "string", links: null },
      ],
      note: "kept",
      order: 0,
      mode: 0,
      flags: { collapsed: false },
    },
    {
      id: 5,
      type: "secrets/get",
      pos: [10, 400],
      size: [220, 96],
      widgets_values: ["api_key"],
    },
    {
      id: 6,
      type: "primitives/Constant",
      pos: { x: 15, y: 25 },
      size: [220, 80],
      properties: { value: "kept", custom: "yes" },
      widgets_values: ["from-widget"],
    },
    {
      id: 8,
      type: "twitch/chat_message_prefix",
      pos: [30, 30],
      properties: { prefix: "!keep" },
      widgets_values: ["!drop"],
    },
    {
      id: 9,
      type: "twitch/channel/follow",
      pos: [1, 2],
    },
  ],
  links: [
    [7, 1, 0, 2, 1, "string"],
    [5, 1, 0, 3, 0, "string"],
    [6, 4, 2, 2, 0, "string", 1],
  ],
};

const loaded = loadLiteGraph(original);
const secret = loaded.nodes.find((node) => node.id === "5");
const constant = loaded.nodes.find((node) => node.id === "6");
const prefix = loaded.nodes.find((node) => node.id === "8");
const follow = loaded.nodes.find((node) => node.id === "9");
const broadcast = loaded.nodes.find((node) => node.id === "3");
assert(secret?.data.properties.key === "api_key", "widgets_values fill a missing property");
assert(constant?.data.properties.value === "kept", "widgets_values do not overwrite a present property");
assert(constant?.data.properties.custom === "yes", "extra property keys are kept");
assert(prefix?.data.properties.prefix === "!keep", "prefix property wins over widgets_values");
assert(prefix?.data.properties.eventType === "channel.chat.message", "prefix node keeps eventType");
assert(follow?.data.properties.eventType === "channel.follow", "follow eventType comes from the catalog");
assert(
  JSON.stringify(follow?.data.outputs.map((port) => port.name)) === JSON.stringify(["channel", "user"]),
  "follow outputs follow catalog order when the file omits them"
);
assert(broadcast?.position.x === 0 && broadcast.position.y === 4, "object pos {x,y} loads, including 0");
assert(constant?.position.x === 15 && constant.position.y === 25, "object pos {x,y} loads");
assert(loaded.shell.extra && (loaded.shell.extra as { keep: boolean }).keep === true, "unknown graph key kept");
assert(
  loaded.shell.config &&
    (loaded.shell.config as { align_to_grid: boolean }).align_to_grid === true,
  "config stays on the shell"
);
assert(Array.isArray(loaded.shell.groups), "groups stay on the shell");
assert(loaded.lastNodeId === 9, "last_node_id is retained when higher than live ids");

const saved = saveLiteGraph(loaded);
const nodes = saved.nodes as Array<Record<string, unknown>>;
const links = saved.links as unknown[][];
const ai = nodes.find((node) => node.id === 1);
const send = nodes.find((node) => node.id === 2);
const gotBroadcast = nodes.find((node) => node.id === 3);
const chat = nodes.find((node) => node.id === 4);
const gotSecret = nodes.find((node) => node.id === 5);
const gotConstant = nodes.find((node) => node.id === 6);
const gotPrefix = nodes.find((node) => node.id === 8);
const gotFollow = nodes.find((node) => node.id === 9);

assert(JSON.stringify(ai?.pos) === JSON.stringify([10, 20]), "object pos {0,1} becomes an array");
assert(JSON.stringify(gotBroadcast?.pos) === JSON.stringify([0, 4]), "object pos {x,y} becomes an array");
assert(JSON.stringify(gotConstant?.pos) === JSON.stringify([15, 25]), "constant pos {x,y} becomes an array");
assert(JSON.stringify(ai?.widgets_values) === JSON.stringify(["Ann", "Hi ?1"]), "ai widgets_values order");
assert(ai?.color === "#abc", "unknown node key round-trips");
assert(
  JSON.stringify(links) ===
    JSON.stringify([
      [7, 1, 0, 2, 1, "string"],
      [5, 1, 0, 3, 0, "string"],
      [6, 4, 2, 2, 0, "string", 1],
    ]),
  "link slots round-trip"
);

const sendInputs = send?.inputs as Array<{ link: number | null; shape?: number }>;
assert(sendInputs[0]?.link === 6, "target slot 0 stores its link id");
assert(sendInputs[1]?.link === 7, "target slot stores the link id");
assert(sendInputs[1]?.shape === 1, "unknown input key round-trips");
const aiOutputs = ai?.outputs as Array<{ links: number[] | null }>;
assert(JSON.stringify(aiOutputs[0]?.links) === JSON.stringify([7, 5]), "origin slot stores every link id");
const chatOutputs = chat?.outputs as Array<{ links: number[] | null }>;
assert(JSON.stringify(chatOutputs[2]?.links) === JSON.stringify([6]), "output slot 2 stores its link id");

assert((chat?.properties as { eventType: string }).eventType === "channel.chat.message", "eventType kept");
assert(chat?.widgets_values === undefined, "event nodes do not grow widgets_values");
assert(chat?.note === "kept", "node note kept");
assert(chat?.order === 0, "order 0 is kept");
assert(chat?.mode === 0, "mode 0 is kept");
assert(JSON.stringify(chat?.flags) === JSON.stringify({ collapsed: false }), "flags round-trip");
assert((gotSecret?.properties as { key: string }).key === "api_key", "secret property written");
assert(JSON.stringify(gotSecret?.widgets_values) === JSON.stringify(["api_key"]), "secret widgets_values written");
assert((gotConstant?.properties as { value: string }).value === "kept", "present property is not replaced on save");
assert((gotConstant?.properties as { custom: string }).custom === "yes", "extra property is saved");
assert(JSON.stringify(gotConstant?.widgets_values) === JSON.stringify(["kept"]), "constant widgets_values follow the property");
assert((gotPrefix?.properties as { prefix: string }).prefix === "!keep", "prefix property saved");
assert(
  (gotPrefix?.properties as { eventType: string }).eventType === "channel.chat.message",
  "prefix eventType saved"
);
assert(JSON.stringify(gotPrefix?.widgets_values) === JSON.stringify(["!keep"]), "prefix widgets_values are field order only");
assert(gotFollow?.widgets_values === undefined, "follow node does not invent widgets_values");
assert(
  JSON.stringify((gotFollow?.outputs as Array<{ name: string }>).map((port) => port.name)) ===
    JSON.stringify(["channel", "user"]),
  "follow outputs saved in catalog order"
);
assert(gotBroadcast?.widgets_values === undefined, "nodes without fields do not invent widgets_values");
assert(JSON.stringify(saved.groups) === JSON.stringify(original.groups), "groups round-trip");
assert((saved.extra as { keep: boolean }).keep === true, "extra round-trips");
assert((saved.config as { align_to_grid: boolean }).align_to_grid === true, "config round-trips");
assert(saved.version === 0.4, "version round-trips");
assert(saved.last_node_id === 9, "last_node_id saved");
assert(saved.last_link_id === 7, "last_link_id saved");

const reloaded = loadLiteGraph(saved);
const edge7 = reloaded.edges.find((edge) => edge.id === "7");
const edge5 = reloaded.edges.find((edge) => edge.id === "5");
const edge6 = reloaded.edges.find((edge) => edge.id === "6");
assert(edge7?.sourceHandle === "out-0" && edge7.targetHandle === "in-1", "second load keeps slot handles");
assert(edge5?.source === "1" && edge5.sourceHandle === "out-0" && edge5.targetHandle === "in-0", "second load keeps the second edge");
assert(edge6?.sourceHandle === "out-2" && edge6.targetHandle === "in-0", "second load keeps slot 2");
assert(JSON.stringify((edge6?.data as { tail: unknown[] }).tail) === JSON.stringify([1]), "link tail survives a second load");

const again = saveLiteGraph(reloaded);
assert(JSON.stringify(again.links) === JSON.stringify(saved.links), "second save keeps links");
assert(JSON.stringify(again.groups) === JSON.stringify(saved.groups), "second save keeps groups");
const againSend = (again.nodes as Array<Record<string, unknown>>).find((node) => node.id === 2);
const againAi = (again.nodes as Array<Record<string, unknown>>).find((node) => node.id === 1);
const againSendInputs = againSend?.inputs as Array<{ link: number | null }>;
const againAiOutputs = againAi?.outputs as Array<{ links: number[] | null }>;
assert(againSendInputs[0]?.link === 6 && againSendInputs[1]?.link === 7, "second save rewrites input.link");
assert(JSON.stringify(againAiOutputs[0]?.links) === JSON.stringify([7, 5]), "second save rewrites output.links");

const indexed = loadLiteGraph(
  JSON.parse('{"nodes":[{"id":1,"type":"primitives/Constant","pos":{"0":3,"1":5}}],"links":[]}')
);
assert(indexed.nodes[0]?.position.x === 3 && indexed.nodes[0]?.position.y === 5, "JSON object pos {0,1} loads");
const named = loadLiteGraph(
  JSON.parse('{"nodes":[{"id":2,"type":"primitives/Constant","pos":{"x":0,"y":8}}],"links":[]}')
);
assert(named.nodes[0]?.position.x === 0 && named.nodes[0]?.position.y === 8, "JSON object pos {x,y} loads");

assertCatalog();

console.log("litegraph document round-trip ok");

function assertCatalog(): void {
  const menu = new Set(menuNodeDefs().map((def) => def.type));
  const expect = (
    type: string,
    inputs: string[],
    outputs: string[],
    fields: string[],
    properties: Record<string, string>
  ) => {
    const def = getNodeDef(type);
    assert(def, `catalog has ${type}`);
    assert(menu.has(type), `${type} is in the add-node menu`);
    assert(JSON.stringify(def?.inputs.map((port) => port.name)) === JSON.stringify(inputs), `${type} inputs`);
    assert(JSON.stringify(def?.outputs.map((port) => port.name)) === JSON.stringify(outputs), `${type} outputs`);
    assert(JSON.stringify(def?.fields.map((field) => field.key)) === JSON.stringify(fields), `${type} fields`);
    for (const [key, value] of Object.entries(properties)) {
      assert(def?.properties[key] === value, `${type} property ${key}`);
    }
  };

  expect("primitives/Constant", [], ["value"], ["value"], { value: "" });
  expect(
    "script/rhai",
    ["input 1", "input 2", "input 3", "input 4", "input 5"],
    ["output 1", "output 2", "output 3", "output 4", "output 5"],
    ["scriptName"],
    { scriptName: "" }
  );
  expect("twitch/send_chat", ["channel", "message"], [], [], {});
  expect(
    "twitch/send_chat_formatted",
    ["channel", "param1 (?1)", "param2 (?2)", "param3 (?3)", "param4 (?4)"],
    [],
    ["template"],
    { template: "Hi ?1, thanks for the follow!" }
  );
  expect("twitch/broadcast_chat", ["message"], [], [], {});
  expect(
    "twitch/broadcast_chat_formatted",
    ["param1 (?1)", "param2 (?2)", "param3 (?3)", "param4 (?4)", "param5 (?5)"],
    [],
    ["template"],
    { template: "Hi ?1, thanks for the follow!" }
  );
  expect(
    "database/query",
    ["input1", "input2", "input3", "input4", "input5"],
    ["results"],
    ["query"],
    { query: "SELECT * FROM events LIMIT 10" }
  );
  expect("database/query_dynamic", ["query"], ["results"], [], {});
  expect("secrets/get", [], ["value"], ["key"], { key: "" });
  expect("secrets/set", ["key", "value"], [], ["key"], { key: "" });
  expect("secrets/list", [], ["names"], [], {});
  expect("secrets/delete", ["key"], [], ["key"], { key: "" });
  expect("ai/prompt", ["input1", "input2", "input3", "input4", "input5"], ["response"], ["agentName", "prompt"], {
    agentName: "",
    prompt: "",
  });
  expect("overlay/display", ["message", "duration (s)"], [], ["templateName"], { templateName: "" });
  expect(
    "twitch/chat_message",
    [],
    ["channel", "message", "user"],
    [],
    { eventType: "channel.chat.message" }
  );
  expect(
    "twitch/chat_message_prefix",
    [],
    ["channel", "message", "user"],
    ["prefix"],
    { eventType: "channel.chat.message", prefix: "!command" }
  );
  expect("utilities/Timer", [], ["interval_seconds"], ["periodSeconds"], { periodSeconds: "60" });

  const chatEvent = getNodeDef("twitch/chat/message");
  assert(chatEvent && chatEvent.type !== "twitch/chat_message", "twitch/chat/message is not twitch/chat_message");
  assert(chatEvent?.properties.eventType === "channel.chat.message", "chat/message eventType");
  assert(chatEvent?.outputs.length === 0, "chat/message keeps its configured outputs");

  const subscribe = getNodeDef("twitch/subscription/subscribe");
  assert(
    JSON.stringify(subscribe?.outputs.map((port) => `${port.name}:${port.type}`)) ===
      JSON.stringify(["channel:string", "user:string", "tier:string", "gift:boolean"]),
    "subscribe output order"
  );
  assert(subscribe?.properties.eventType === "channel.subscribe", "subscribe eventType");
  assert(subscribe?.fields.length === 0, "subscribe has no widgets");

  const gift = getNodeDef("twitch/subscription/gift");
  assert(
    JSON.stringify(gift?.outputs.map((port) => `${port.name}:${port.type}`)) ===
      JSON.stringify(["channel:string", "user:string", "tier:string", "total:number"]),
    "gift output order"
  );
  assert(gift?.properties.eventType === "channel.subscription.gift", "gift eventType");

  for (const def of menuNodeDefs()) {
    if (!def.type.startsWith("twitch/")) continue;
    if (def.type === "twitch/chat_message" || def.type === "twitch/chat_message_prefix") continue;
    if (
      def.type === "twitch/send_chat" ||
      def.type === "twitch/send_chat_formatted" ||
      def.type === "twitch/broadcast_chat" ||
      def.type === "twitch/broadcast_chat_formatted"
    ) {
      continue;
    }
    assert(def.fields.length === 0, `${def.type} event node has no fields`);
    assert(typeof def.properties.eventType === "string" && def.properties.eventType.length > 0, `${def.type} eventType`);
  }
}

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}
