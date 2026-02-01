import { LiteGraph } from "litegraph.js";

export function SendChatNode(this: any) {
  this.addInput("trigger", LiteGraph.ACTION);
  this.addInput("message", "string");
  this.addOutput("done", LiteGraph.EVENT);
  this.properties = { message: "Hello, chat!" };
  this.addWidget("text", "Message", this.properties.message, (v: string) => {
    this.properties.message = v;
  });
}

SendChatNode.prototype.onAction = function(this: any) {
  const msg = this.getInputData(1) || this.properties.message;
  console.log("Send chat:", msg);
  // TODO: Invoke Tauri command to send chat message
  this.triggerSlot(0);
};

SendChatNode.title = "Send Chat";
SendChatNode.desc = "Send a message to Twitch chat";

export function register() {
  LiteGraph.registerNodeType("twitch/send_chat", SendChatNode as any);
}
