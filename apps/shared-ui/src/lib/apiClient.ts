import axios, { type AxiosInstance } from 'axios';

export interface ApiClientOptions {
  /** localStorage key to read the JWT from. */
  tokenKey?: string;
  /** Path to redirect to on 401. Defaults to '/login'. */
  loginPath?: string;
}

export function createApiClient(
  baseURL: string,
  options: ApiClientOptions = {}
): AxiosInstance {
  const { tokenKey = 'airlock_token', loginPath = '/login' } = options;

  const client = axios.create({
    baseURL,
    timeout: 15000,
    headers: { 'Content-Type': 'application/json' },
  });

  client.interceptors.request.use((config) => {
    const token = localStorage.getItem(tokenKey);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    config.headers['X-Request-ID'] = crypto.randomUUID();
    return config;
  });

  client.interceptors.response.use(
    (res) => res,
    (err) => {
      if (err.response?.status === 401) {
        localStorage.removeItem(tokenKey);
        window.location.href = loginPath;
      }
      return Promise.reject(err);
    }
  );

  return client;
}

/** Governance platform API — redirects to /login on session expiry. */
export const governanceApi = createApiClient(
  (import.meta as any).env?.VITE_GOVERNANCE_API_URL || '/api/governance',
  { tokenKey: 'airlock_token', loginPath: '/login' }
);

/** Demo/Lab API — redirects to /lab-login on session expiry. */
export const demoApi = createApiClient(
  (import.meta as any).env?.VITE_DEMO_API_URL || '/api/demo',
  { tokenKey: 'airlock_lab_token', loginPath: '/lab-login' }
);

/** Proxy/Gateway API — uses governance token, redirects to /login. */
export const gatewayApi = createApiClient(
  (import.meta as any).env?.VITE_GATEWAY_URL || '/api',
  { tokenKey: 'airlock_token', loginPath: '/login' }
);
