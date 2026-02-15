import type { MessageBlock, ButtonElement } from "@revualy/chat-core";
import type { KnownBlock, Button } from "@slack/web-api";

/**
 * Converts canonical MessageBlocks into Slack Block Kit format.
 */
export const slackBlockBuilder = {
  toSlackBlocks(blocks: MessageBlock[]): KnownBlock[] {
    return blocks.map((block) => {
      switch (block.type) {
        case "text":
          return {
            type: "section" as const,
            text: {
              type: block.style === "plain" ? ("plain_text" as const) : ("mrkdwn" as const),
              text: block.text,
            },
          };
        case "section":
          return {
            type: "section" as const,
            text: { type: "mrkdwn" as const, text: block.text },
            ...(block.accessory
              ? { accessory: this.toSlackButton(block.accessory) }
              : {}),
          };
        case "actions":
          return {
            type: "actions" as const,
            elements: block.elements.map((el) => this.toSlackButton(el)),
          };
        case "divider":
          return { type: "divider" as const };
      }
    });
  },

  toSlackButton(button: ButtonElement): Button {
    return {
      type: "button" as const,
      text: { type: "plain_text" as const, text: button.text },
      action_id: button.actionId,
      ...(button.value ? { value: button.value } : {}),
      ...(button.style ? { style: button.style } : {}),
    };
  },
};
