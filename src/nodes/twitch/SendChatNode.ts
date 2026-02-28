import { LiteGraph } from "litegraph.js";

export function SendChatNode(this: any) {
  this.addInput("channel", "string");
  this.addInput("message", "string");
}

SendChatNode.title = "Send Chat";
SendChatNode.desc = "Send a message to Twitch chat";

export function register() {
  LiteGraph.registerNodeType("twitch/send_chat", SendChatNode as any);
}
