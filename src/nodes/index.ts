import { LiteGraph } from "litegraph.js";

// Eventsub nodes
import { register as registerChatMessage } from "./eventsub/chat_message";

// Twitch nodes
import { register as registerSendChat } from "./twitch/SendChatNode";

// Script nodes
import { register as registerRhaiScript } from "./script/RhaiScriptNode";

// Database nodes
import { register as registerDatabaseQuery } from "./database/DatabaseQueryNode";

// Secret nodes
import { register as registerGetSecret } from "./secrets/GetSecretNode";

// Utility nodes
import { register as registerDelay } from "./utils/DelayNode";
import { register as registerLog } from "./utils/LogNode";

// String nodes
import { register as registerStringTemplate } from "./string/StringTemplateNode";

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

/**
 * Register all custom nodes with LiteGraph
 */
export function registerAllNodes() {
  // Eventsub
  registerChatMessage();

  // Twitch Actions
  registerSendChat();

  // Script
  registerRhaiScript();

  // Database
  registerDatabaseQuery();

  // Secrets
  registerGetSecret();

  // Utilities
  registerDelay();
  registerLog();

  // String
  registerStringTemplate();
}
