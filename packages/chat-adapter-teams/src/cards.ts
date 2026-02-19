import type { MessageBlock } from "@revualy/chat-core";

interface AdaptiveCardElement {
  type: string;
  [key: string]: unknown;
}

interface AdaptiveCard {
  type: "AdaptiveCard";
  $schema: string;
  version: string;
  body: AdaptiveCardElement[];
}

/**
 * Convert canonical MessageBlocks to a Microsoft Adaptive Card v1.4 structure.
 * Returns the full card object ready to be used as an attachment content.
 */
export function buildAdaptiveCard(blocks: MessageBlock[]): AdaptiveCard {
  const body: AdaptiveCardElement[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case "text":
        body.push({
          type: "TextBlock",
          text: block.text,
          wrap: true,
          ...(block.style === "markdown" ? {} : { markdown: false }),
        });
        break;

      case "section": {
        const items: AdaptiveCardElement[] = [
          { type: "TextBlock", text: block.text, wrap: true },
        ];
        if (block.accessory) {
          items.push({
            type: "ActionSet",
            actions: [
              {
                type: "Action.Submit",
                title: block.accessory.text,
                data: {
                  actionId: block.accessory.actionId,
                  ...(block.accessory.value
                    ? { value: block.accessory.value }
                    : {}),
                },
              },
            ],
          });
        }
        body.push({ type: "Container", items });
        break;
      }

      case "actions":
        body.push({
          type: "ActionSet",
          actions: block.elements.map((btn) => ({
            type: "Action.Submit",
            title: btn.text,
            ...(btn.style === "primary"
              ? { style: "positive" }
              : btn.style === "danger"
                ? { style: "destructive" }
                : {}),
            data: {
              actionId: btn.actionId,
              ...(btn.value ? { value: btn.value } : {}),
            },
          })),
        });
        break;

      case "divider":
        body.push({
          type: "TextBlock",
          text: " ",
          separator: true,
          spacing: "medium",
        });
        break;
    }
  }

  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body,
  };
}
