// Empty string = same-origin (Caddy/nginx proxies /api/*).
// Falls back to localhost only when the env var is completely absent.
const API_BASE = import.meta.env.VITE_API_URL !== undefined
  ? import.meta.env.VITE_API_URL
  : 'http://localhost:8000';

interface SessionPayload {
  treatment_id: string;
  dose: string;
  intensity: number;
  before_image_url: string;
  after_image_url: string;
  metadata?: Record<string, unknown>;
}

interface SessionResult {
  id: string;
  status: string;
}

interface StoredSession {
  id: string;
  treatment_id: string;
  dose: string;
  intensity: number;
  before_image_url: string;
  after_image_url: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export async function saveSession(payload: SessionPayload): Promise<SessionResult | null> {
  try {
    const res = await fetch(`${API_BASE}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function getSessions(): Promise<StoredSession[]> {
  try {
    const res = await fetch(`${API_BASE}/api/sessions`);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function getTreatments() {
  try {
    const res = await fetch(`${API_BASE}/api/treatments`);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}
