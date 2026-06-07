import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

let csrfToken = '';

export async function fetchCsrfToken(): Promise<string> {
  const { data } = await api.get('/auth/csrf-token');
  csrfToken = data.csrfToken;
  return csrfToken;
}

api.interceptors.request.use(async (config) => {
  if (['post', 'put', 'patch', 'delete'].includes(config.method || '')) {
    if (!csrfToken) await fetchCsrfToken();
    config.headers['X-CSRF-Token'] = csrfToken;
  }
  return config;
});

export default api;

export async function pollJob(projectId: string, jobId: string, onUpdate?: (status: string) => void): Promise<import('@cbs/shared').GenerationJob> {
  for (let i = 0; i < 90; i++) {
    const { data } = await api.get(`/projects/${projectId}/jobs/${jobId}`);
    onUpdate?.(data.status);
    if (data.status === 'done' || data.status === 'failed') return data;
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error('Timeout bei Generierung');
}
