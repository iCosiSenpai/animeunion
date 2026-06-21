// Helper per le notifiche push del browser (richiede contesto sicuro/HTTPS).

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

/** Push utilizzabile solo in contesto sicuro con SW + PushManager + Notification. */
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (
    typeof navigator === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !window.isSecureContext
  ) {
    return null;
  }
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch {
    return null;
  }
}

export async function getSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) {
    return null;
  }
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export async function subscribePush(publicKey: string): Promise<PushSubscription | null> {
  if (!isPushSupported()) {
    return null;
  }
  await registerServiceWorker();
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    // Cast: lo skew dei lib DOM tipizza Uint8Array<ArrayBufferLike> ma è un BufferSource valido.
    applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
  });
}
