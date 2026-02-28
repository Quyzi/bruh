/**
 * Runtime documentation content for the Help view.
 * Each major component has a description and examples where applicable.
 */

export interface DocSection {
  id: string;
  title: string;
  content: DocBlock[];
}

export type DocBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "list"; items: string[]; ordered?: boolean }
  | { type: "code"; language: string; code: string; caption?: string }
  | { type: "note"; text: string }
  | { type: "example"; title: string; description: string; code?: string };

export interface ViewDoc {
  id: string;
  name: string;
  description: string;
  firstSteps?: string[];
}

export interface NodeDoc {
  id: string;
  title: string;
  category: string;
  description: string;
  inputs: { name: string; type: string; description: string }[];
  outputs: { name: string; type: string; description: string }[];
  properties?: { name: string; description: string }[];
  example?: string;
}

const VIEWS: ViewDoc[] = [
  {
    id: "dashboard",
    name: "Dashboard",
    description:
      "The Dashboard shows the live chat log from your configured channels. Messages are streamed here when the runtime is running and EventSub is connected. Use it to monitor chat activity and debug workflows.",
    firstSteps: [
      "Complete Setup (Twitch OAuth and scopes).",
      "Add at least one channel in the Channels tab.",
      "Start the runtime from the toolbar.",
    ],
  },
  {
    id: "channels",
    name: "Channels",
    description:
      "Manage the list of Twitch channels the app joins and listens to. Workflows that use chat events will receive messages from these channels. You can add channels by login name; the app validates them and shows required scopes.",
    firstSteps: [
      "Click Add Channel and enter a Twitch channel login (e.g. your username).",
      "Ensure Setup includes the scopes required for the channel (e.g. chat:read, channel:bot).",
      "Save; the channel list is used by the runtime when it starts.",
    ],
  },
  {
    id: "workflow",
    name: "Workflow Editor",
    description:
      "Visual editor for building event-driven workflows. Add nodes from the palette (right-click or Add Node), connect event sources (e.g. Chat Message) to actions (e.g. Send Chat, Rhai Script). Workflows are saved and loaded from disk; the runtime executes them when started.",
    firstSteps: [
      "Right-click on the canvas or use the Add Node button to open the node menu.",
      "Add an event source (e.g. Twitch → Chat Message or Chat Message With Prefix).",
      "Connect its outputs to action nodes (Send Chat, Rhai Script, DB Query, Get Secret).",
      "Use Save in the toolbar to persist the workflow.",
    ],
  },
  {
    id: "scripts",
    name: "Scripts",
    description:
      "Create and edit Rhai scripts that can be invoked from the Workflow Editor via the Rhai Script node. Scripts receive input (e.g. from upstream nodes) and return values that are passed to the next node. Use the Test button to run a script with sample JSON input.",
    firstSteps: [
      "Create a new script or open an existing one from the list.",
      "Write Rhai code; the last expression is the return value (e.g. a string or object with output1, output2, …).",
      "In the Workflow Editor, add a Rhai Script node and select this script.",
    ],
  },
  {
    id: "secrets",
    name: "Secrets",
    description:
      "Store sensitive values (API keys, tokens, etc.) that workflows can access via the Get Secret node. Secrets are stored locally and are not sent to Twitch or other external services except when you use them in a workflow.",
    firstSteps: [
      "Add a secret with a key (e.g. my_api_key) and value.",
      "In a workflow, use the Get Secret node with the same key to output the value to the next node.",
    ],
  },
  {
    id: "database",
    name: "Database",
    description:
      "Edit and run startup SQL for the embedded DuckDB instance. The startup script runs when the runtime starts and can create tables and load data. Workflows can run queries via the DB Query node. The Open DuckDB button opens the DuckDB CLI in your browser.",
    firstSteps: [
      "Edit startup.sql (e.g. CREATE TABLE events (...)); then Save.",
      "Run the script with Run Startup SQL to apply it (e.g. after changing schema).",
      "In workflows, use the DB Query node to execute SELECT/INSERT/etc.",
    ],
  },
  {
    id: "setup",
    name: "Setup",
    description:
      "Configure Twitch OAuth: Client ID and Secret, authorize with Twitch, paste the callback URL, and select scopes. Required for chat and moderation features. Scopes are grouped by category (Chat, Moderation, Channel, etc.); enable what your workflows need.",
    firstSteps: [
      "Enter your Twitch app Client ID and Client Secret (from the Twitch Developer Console).",
      "Click Get Auth URL and complete authorization in the browser.",
      "Copy the full callback URL from the browser and paste it in the app, then Exchange Code.",
      "Select the scopes you need (e.g. chat:read, chat:edit, channel:bot) and Save Scopes.",
    ],
  },
];

const NODES: NodeDoc[] = [
  {
    id: "twitch/chat_message",
    title: "Chat Message",
    category: "Twitch",
    description: "Fires when any chat message is received in a connected channel. Use it as the entry point for chat-based workflows.",
    inputs: [],
    outputs: [
      { name: "channel", type: "string", description: "Channel login where the message was sent" },
      { name: "message", type: "string", description: "The chat message text" },
      { name: "user", type: "string", description: "Username of the sender" },
    ],
    example: "Connect channel → Send Chat to echo messages, or message → Rhai Script for custom logic.",
  },
  {
    id: "twitch/chat_message_prefix",
    title: "Chat Message With Prefix",
    category: "Twitch",
    description: "Fires only when a chat message starts with the given prefix (e.g. !command). Use the Prefix widget or an input to set the prefix.",
    inputs: [],
    outputs: [
      { name: "channel", type: "string", description: "Channel login" },
      { name: "message", type: "string", description: "Full message text" },
      { name: "user", type: "string", description: "Username of the sender" },
    ],
    properties: [{ name: "Prefix", description: "Command prefix (e.g. !hello); messages must start with this to trigger" }],
    example: "Set prefix to !hello. Connect message → Rhai Script that parses the rest of the message.",
  },
  {
    id: "twitch/send_chat",
    title: "Send Chat",
    category: "Twitch",
    description: "Sends a message to a Twitch channel. Connect channel and message from upstream nodes (e.g. from Chat Message or a script).",
    inputs: [
      { name: "channel", type: "string", description: "Channel login to send to" },
      { name: "message", type: "string", description: "Message text to send" },
    ],
    outputs: [],
    example: "Chat Message (channel, message) → Send Chat to echo; or Rhai Script (output1) → Send Chat for formatted replies.",
  },
  {
    id: "script/rhai",
    title: "Rhai Script",
    category: "Script",
    description: "Runs a Rhai script from the Scripts list. Passes the first input as the script input; script return value is exposed on output 1–5 (array or object with output1…output5).",
    inputs: [
      { name: "input 1", type: "string", description: "Primary input (e.g. message or JSON)" },
      { name: "input 2–5", type: "string", description: "Optional additional inputs" },
    ],
    outputs: [
      { name: "output 1", type: "string", description: "First return value" },
      { name: "output 2–5", type: "string", description: "Additional return values" },
    ],
    properties: [{ name: "Script", description: "Select which script to run from the dropdown" }],
    example: "Chat Message (message) → Rhai Script (greet.rhai) → Send Chat (channel, output1).",
  },
  {
    id: "database/query",
    title: "DB Query",
    category: "Database",
    description: "Executes a DuckDB query. Use the Query widget for the SQL; you can parameterize with inputs. Results are passed to the output.",
    inputs: [
      { name: "input1", type: "string", description: "Optional query parameter" },
      { name: "input2–5", type: "string", description: "Optional query parameters" },
    ],
    outputs: [{ name: "results", type: "string", description: "Query result (e.g. JSON or rows)" }],
    properties: [{ name: "Query", description: "SQL query (e.g. SELECT * FROM events LIMIT 10)" }],
    example: "Chat Message → DB Query (INSERT INTO events ...) or a SELECT with inputs for filtering.",
  },
  {
    id: "secrets/get",
    title: "Get Secret",
    category: "Secrets",
    description: "Retrieves a secret value by key from the Secrets store. Output the value to the next node (e.g. for API calls in a script).",
    inputs: [],
    outputs: [{ name: "value", type: "string", description: "The secret value, or empty if not found" }],
    properties: [{ name: "Key", description: "Secret key (must match a key in the Secrets view)" }],
    example: "Get Secret (api_key) → Rhai Script that uses the value in a request.",
  },
];

const GETTING_STARTED: DocSection = {
  id: "getting-started",
  title: "Getting Started",
  content: [
    { type: "paragraph", text: "Bruh is a Twitch-focused automation app. You build workflows in the Workflow Editor that react to chat (and other events) and perform actions like sending messages, running scripts, or querying a database." },
    { type: "heading", level: 2, text: "Quick setup" },
    { type: "list", items: [
      "Setup: Add your Twitch app Client ID and Secret, then authorize and select scopes (e.g. chat:read, channel:bot).",
      "Channels: Add the Twitch channels you want to listen to.",
      "Workflow Editor: Build a graph (e.g. Chat Message → Send Chat to echo, or Chat Message With Prefix → Rhai Script → Send Chat for commands).",
      "Start: Click Start in the toolbar; the runtime loads your workflow and connects to Twitch.",
    ], ordered: true },
    { type: "heading", level: 2, text: "Example: Rhai script for a greeting" },
    { type: "paragraph", text: "In Scripts, create a script that takes input (e.g. from the Chat Message node) and returns a reply. The last expression is the return value. For multiple outputs, return an object with output1, output2, …." },
    { type: "code", language: "rhai", code: `// greet.rhai - input is the incoming message or data from the previous node
let name = input;
if name == "" {
  "Hello, chatter!"
} else {
  "Hello, " + name + "!"
}`, caption: "Return value is passed to the next node (e.g. output 1 of the Rhai Script node)." },
    { type: "heading", level: 2, text: "Where to find help" },
    { type: "paragraph", text: "Use the sections in this Help tab: Views (each app tab), Workflow & Nodes (each node type), Setup (Twitch OAuth flow), and Runtime (how execution works)." },
  ],
};

const RUNTIME_SECTION: DocSection = {
  id: "runtime",
  title: "Runtime",
  content: [
    { type: "paragraph", text: "When you click Start, the app loads your saved workflow, connects to Twitch EventSub for the channels you configured, and runs the embedded DuckDB startup SQL. As events arrive (e.g. chat messages), the runtime executes the graph: event nodes produce values, and connected action nodes run in order." },
    { type: "heading", level: 2, text: "Execution model" },
    { type: "paragraph", text: "Pipelines start from event sources (e.g. Chat Message, Chat Message With Prefix). The executor resolves input slots from connected upstream nodes and then runs action nodes such as Send Chat, Rhai Script, Get Secret, and DB Query. Scripts run in a Rhai engine; database queries run against the local DuckDB instance." },
    { type: "heading", level: 2, text: "Node types the backend runs" },
    { type: "paragraph", text: "The Rust backend executes: twitch/chat_message_prefix (with prefix filter), twitch/send_chat, script/rhai, secrets/get, and database/query. Other nodes (e.g. Delay, Log, Template) may run in the frontend or have limited backend support; check node docs for details." },
    { type: "note", text: "Save your workflow before starting the runtime; Start loads the last saved graph from disk." },
  ],
};

const SETUP_SECTION: DocSection = {
  id: "setup",
  title: "Setup (Twitch OAuth)",
  content: [
    { type: "paragraph", text: "Setup configures Twitch OAuth so the app can read chat and send messages (and use other Twitch APIs you enable)." },
    { type: "heading", level: 2, text: "Steps" },
    { type: "list", items: [
      "Create an application in the Twitch Developer Console and note the Client ID and Client Secret.",
      "In Bruh, open the Setup tab and enter the Client ID and Client Secret, then save.",
      "Click Get Auth URL; a browser opens. Log in to Twitch and authorize the app.",
      "After redirect, copy the full callback URL from the browser (it contains ?code=...).",
      "Paste the URL into the Paste Callback URL field in Bruh and click Exchange Code.",
      "Select the OAuth scopes you need (e.g. chat:read, chat:edit, channel:bot for basic chat). Save Scopes.",
    ], ordered: true },
    { type: "heading", level: 2, text: "Scopes" },
    { type: "paragraph", text: "Scopes are grouped by category (Chat, Moderation, Channel, User, etc.). Each scope has a description and lists the Twitch endpoints it unlocks. Enable only what your workflows need. For chat-only bots, chat:read, chat:edit, and channel:bot are typical." },
  ],
};

/** All doc sections for the Help view (getting started, runtime, setup, then views and nodes). */
export function getDocSections(): DocSection[] {
  const viewSection: DocSection = {
    id: "views",
    title: "Views",
    content: [
      { type: "paragraph", text: "Each tab in the app is a view. Below is a short description and first steps for each." },
      ...VIEWS.flatMap((view) => [
        { type: "heading", level: 2, text: view.name } as DocBlock,
        { type: "paragraph", text: view.description } as DocBlock,
        ...(view.firstSteps?.length
          ? [
            { type: "heading", level: 3, text: "First steps" } as DocBlock,
            { type: "list", items: view.firstSteps } as DocBlock,
          ]
          : []),
      ]),
    ],
  };

  const nodesSection: DocSection = {
    id: "nodes",
    title: "Workflow & Nodes",
    content: [
      { type: "paragraph", text: "Nodes are the building blocks of workflows. Event nodes (e.g. Chat Message) start pipelines; action nodes (Send Chat, Rhai Script, DB Query, Get Secret) do the work. Below: each node type, its inputs/outputs, and a short example." },
      ...NODES.flatMap((node) => [
        { type: "heading", level: 2, text: `${node.title} (${node.category})` } as DocBlock,
        { type: "paragraph", text: node.description } as DocBlock,
        { type: "heading", level: 3, text: "Inputs" } as DocBlock,
        { type: "list", items: node.inputs.map((i) => `${i.name} (${i.type}): ${i.description}`) } as DocBlock,
        { type: "heading", level: 3, text: "Outputs" } as DocBlock,
        { type: "list", items: node.outputs.map((o) => `${o.name} (${o.type}): ${o.description}`) } as DocBlock,
        ...(node.properties?.length
          ? [
            { type: "heading", level: 3, text: "Properties" } as DocBlock,
            { type: "list", items: node.properties.map((p) => `${p.name}: ${p.description}`) } as DocBlock,
          ]
          : []),
        ...(node.example ? [{ type: "paragraph", text: `Example: ${node.example}` } as DocBlock] : []),
      ]),
    ],
  };

  return [GETTING_STARTED, viewSection, nodesSection, SETUP_SECTION, RUNTIME_SECTION];
}

export { VIEWS, NODES };
