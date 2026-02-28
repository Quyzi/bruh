import { LiteGraph } from "litegraph.js";

export function BroadcastChatNode(this: any) {
  this.addInput("message", "string");
}

BroadcastChatNode.title = "Broadcast Chat";
BroadcastChatNode.desc = "Send a message to all connected channels";

export function register() {
  LiteGraph.registerNodeType("twitch/broadcast_chat", BroadcastChatNode as any);
}
