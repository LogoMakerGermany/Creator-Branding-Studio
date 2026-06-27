export interface ClientFirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export interface RuntimeClientConfig {
  firebase: ClientFirebaseConfig | null;
  stripePublishableKey: string | null;
}

let runtimeConfig: RuntimeClientConfig | null = null;

function fromViteEnv(): RuntimeClientConfig | null {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  if (!apiKey || !projectId) return null;

  return {
    firebase: {
      apiKey,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
      projectId,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
      appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
    },
    stripePublishableKey: import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || null,
  };
}

export async function loadRuntimeConfig(): Promise<RuntimeClientConfig> {
  const baked = fromViteEnv();
  if (baked) {
    runtimeConfig = baked;
    return baked;
  }

  const base = import.meta.env.VITE_API_URL || '';
  const res = await fetch(`${base}/api/v1/config/client`);
  if (!res.ok) {
    runtimeConfig = { firebase: null, stripePublishableKey: null };
    return runtimeConfig;
  }

  const data = await res.json();
  runtimeConfig = data.data as RuntimeClientConfig;
  return runtimeConfig;
}

export function getRuntimeConfig(): RuntimeClientConfig | null {
  return runtimeConfig ?? fromViteEnv();
}

export function getFirebaseClientConfig(): ClientFirebaseConfig | null {
  return getRuntimeConfig()?.firebase ?? null;
}

export function isFirebaseConfigured(): boolean {
  return Boolean(getFirebaseClientConfig()?.apiKey && getFirebaseClientConfig()?.projectId);
}
