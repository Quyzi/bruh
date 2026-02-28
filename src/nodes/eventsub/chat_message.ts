import { LiteGraph } from "litegraph.js";

export function ChatMessage(this: any) {
  this.properties = { eventType: "channel.chat.message" };
  this.addOutput("channel", "string");
  this.addOutput("message", "string");
  this.addOutput("user", "string");
}

ChatMessage.title = "Chat Message";
ChatMessage.desc = "When a chat message is received in a channel";

export function ChatMessagePrefix(this: any) {
  this.properties = { eventType: "channel.chat.message", prefix: "!command" };
  this.addOutput("channel", "string");
  this.addOutput("message", "string");
  this.addOutput("user", "string");
  this.addWidget(
    "text",
    "Prefix",
    this.properties.prefix,
    (v: string) => {
      this.properties.prefix = v;
    },
    { property: "prefix" }
  );
  this.serialize_widgets = true;
}

ChatMessagePrefix.prototype.onAction = function(this: any) {
  const prefix = this.getInputData(1) || this.properties.prefix;
  console.log("Chat Prefix: ", prefix);
}

ChatMessagePrefix.title = "Chat Message With Prefix";
ChatMessagePrefix.desc = "When a chat message is received in a channel with a prefix";



export function register() {
  LiteGraph.registerNodeType("twitch/chat_message", ChatMessage as any);
  LiteGraph.registerNodeType("twitch/chat_message_prefix", ChatMessagePrefix as any);
}
