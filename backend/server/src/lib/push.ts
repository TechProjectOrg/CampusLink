import webpush from 'web-push';
import prisma from '../prisma';

interface PushPayload {
  notificationId: string;
  type: string;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
}

let configured = false;
let configAttempted = false;

function configureWebPushIfAvailable(): boolean {
  if (configAttempted) return configured;
  configAttempted = true;

  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.WEB_PUSH_SUBJECT?.trim() ?? 'mailto:no-reply@campuslynk.local';

  if (!publicKey || !privateKey) {
    configured = false;
    return false;
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  } catch (err) {
    configured = false;
    console.error('Failed to configure web push:', err);
  }

  return configured;
}

export function getWebPushPublicKey(): string | null {
  return process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim() ?? null;
}

export async function sendPushNotificationToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!configureWebPushIfAvailable()) return;

  try {
    const subscriptions = await prisma.$queryRaw<
      { push_subscription_id: string; endpoint: string; p256dh_key: string; auth_key: string }[]
    >`
      SELECT push_subscription_id, endpoint, p256dh_key, auth_key
      FROM user_push_subscriptions
      WHERE user_id = ${userId}
        AND revoked_at IS NULL
    `;

    if (subscriptions.length === 0) return;

    await Promise.allSettled(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.p256dh_key,
                auth: subscription.auth_key,
              },
            },
            JSON.stringify(payload),
          );
        } catch (err) {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await prisma.$queryRaw`
              UPDATE user_push_subscriptions
              SET revoked_at = NOW(), updated_at = NOW()
              WHERE push_subscription_id = ${subscription.push_subscription_id}
            `;
            return;
          }
          console.error('Failed to send push notification:', err);
        }
      }),
    );
  } catch (err) {
    console.error('Failed to send push notifications:', err);
  }
}
