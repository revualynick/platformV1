import type { ChatAdapter } from "./adapter.js";
import type { ChatPlatform } from "@revualy/shared";
import type { OutboundMessage } from "./types.js";

/**
 * AdapterRegistry manages all registered chat adapters.
 * Routes outbound messages to the correct platform adapter.
 */
export class AdapterRegistry {
  private adapters = new Map<ChatPlatform, ChatAdapter>();

  register(adapter: ChatAdapter): void {
    if (this.adapters.has(adapter.platform)) {
      console.warn(`[AdapterRegistry] Overriding existing adapter for platform: ${adapter.platform}`);
    }
    this.adapters.set(adapter.platform, adapter);
  }

  get(platform: ChatPlatform): ChatAdapter {
    const adapter = this.adapters.get(platform);
    if (!adapter) {
      throw new Error(`No adapter registered for platform: ${platform}`);
    }
    return adapter;
  }

  has(platform: ChatPlatform): boolean {
    return this.adapters.has(platform);
  }

  async sendMessage(message: OutboundMessage): Promise<string> {
    const adapter = this.get(message.platform);
    return adapter.sendMessage(message);
  }

  getRegisteredPlatforms(): ChatPlatform[] {
    return [...this.adapters.keys()];
  }
}
