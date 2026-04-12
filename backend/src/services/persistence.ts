import fs from 'fs';
import path from 'path';

const CONFIG_PATH = path.join(process.cwd(), 'data', 'runtime-config.json');

interface PersistedConfig {
  telegramBotToken?: string;
  telegramChatId?: string;
}

function ensureDir() {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function loadPersistedConfig(): PersistedConfig {
  try {
    ensureDir();
    if (!fs.existsSync(CONFIG_PATH)) return {};
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw) as PersistedConfig;
  } catch {
    return {};
  }
}

export function savePersistedConfig(updates: Partial<PersistedConfig>) {
  try {
    ensureDir();
    const existing = loadPersistedConfig();
    const merged = { ...existing, ...updates };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf-8');
  } catch (err: any) {
    console.error('[Persistence] Failed to save config:', err.message);
  }
}
