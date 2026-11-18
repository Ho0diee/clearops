import { handleCallback } from '@vercel/queue';
import { dispatchQueuedAlert, type PushQueueMessage } from '../_lib/pushServer.js';

export const POST = handleCallback<PushQueueMessage>(
  async (message) => {
    await dispatchQueuedAlert(message);
  },
  {
    retry: (_error, metadata) => {
      if (metadata.deliveryCount >= 4) {
        return { acknowledge: true };
      }
      return { afterSeconds: Math.min(120, 10 * metadata.deliveryCount) };
    },
  }
);
