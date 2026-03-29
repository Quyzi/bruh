import { LiteGraph } from "litegraph.js";

// AI nodes
import { register as registerAiPrompt } from "./ai/AiPromptNode";

// Eventsub nodes
import { register as registerChatMessage } from "./eventsub/chat_message";

// Twitch nodes
import { register as registerSendChat } from "./twitch/SendChatNode";
import { register as registerBroadcastChat } from "./twitch/BroadcastChatNode";
import { register as registerSendChatFormatted } from "./twitch/SendChatFormattedNode";
import { register as registerBroadcastChatFormatted } from "./twitch/BroadcastChatFormattedNode";
import { registerAllTwitchEvents } from "./twitch/events";

// Script nodes
import { register as registerRhaiScript } from "./script/RhaiScriptNode";

// Database nodes
import { register as registerDatabaseQuery } from "./database/DatabaseQueryNode";
import { register as registerDatabaseQueryDynamic } from "./database/DatabaseQueryDynamicNode";

// Secret nodes
import { register as registerGetSecret } from "./secrets/GetSecretNode";
import { register as registerSetSecret } from "./secrets/SetSecretNode";
import { register as registerListSecrets } from "./secrets/ListSecretsNode";
import { register as registerDeleteSecret } from "./secrets/DeleteSecretNode";

// Utilities nodes
import { register as registerTimer } from "./utilities/TimerNode";

// Primitives nodes
import { register as registerConstant } from "./primitives/ConstantNode";

/**
 * Configure LiteGraph styling to match our dark theme
 */
export function configureLiteGraphTheme() {
  LiteGraph.NODE_DEFAULT_COLOR = "#2f2f2f";
  LiteGraph.NODE_DEFAULT_BGCOLOR = "#252525";
  LiteGraph.NODE_DEFAULT_BOXCOLOR = "#646cff";
  LiteGraph.NODE_TITLE_COLOR = "#e0e0e0";
  LiteGraph.NODE_TEXT_COLOR = "#a0a0a0";
  LiteGraph.LINK_COLOR = "#646cff";
  LiteGraph.EVENT_LINK_COLOR = "#ff9800";
  LiteGraph.CONNECTING_LINK_COLOR = "#7c82ff";
  LiteGraph.DEFAULT_SHADOW_COLOR = "rgba(0,0,0,0.5)";
}

/** Allowed node categories in the Add Node menu. Only these are shown. */
const ALLOWED_NODE_CATEGORIES = new Set([
  "ai",
  "database",
  "twitch",
  "script",
  "secrets",
  "utilities",
  "primitives",
]);

/**
 * Restricts the Add Node menu to only show database, twitch, script, and secrets
 * by overriding getNodeTypesCategories. All node types remain registered for loading workflows.
 */
function restrictNodeCategories() {
  const original = LiteGraph.getNodeTypesCategories.bind(LiteGraph);
  LiteGraph.getNodeTypesCategories = function (filter: unknown) {
    const categories = original(filter);
    return categories.filter((category: string) =>
      ALLOWED_NODE_CATEGORIES.has(category) ||
      [...ALLOWED_NODE_CATEGORIES].some((allowed) =>
        category.startsWith(allowed + "/")
      )
    );
  };
}

/**
 * Register all custom nodes with LiteGraph and restrict the Add Node menu to
 * database, twitch, script, and secrets only.
 */
export function registerAllNodes() {
  // AI
  registerAiPrompt();

  // Eventsub
  registerChatMessage();

  // Twitch Actions
  registerSendChat();
  registerBroadcastChat();
  registerSendChatFormatted();
  registerBroadcastChatFormatted();

  // Twitch EventSub events (Channel Follow, Subscribe, Gift, etc.)
  registerAllTwitchEvents();

  // Script
  registerRhaiScript();

  // Database
  registerDatabaseQuery();
  registerDatabaseQueryDynamic();

  // Secrets
  registerGetSecret();
  registerSetSecret();
  registerListSecrets();
  registerDeleteSecret();

  // Utilities
  registerTimer();

  // Primitives
  registerConstant();

  restrictNodeCategories();
}
