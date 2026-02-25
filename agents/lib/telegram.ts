/**
 * Telegram Bot API helper — sends notifications to War Room group
 */

import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../../.env.agents') });

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const WARROOM_CHAT_ID = process.env.TELEGRAM_WARROOM_CHAT_ID || '-1003766720695';

if (!BOT_TOKEN) {
  console.warn('⚠️ TELEGRAM_BOT_TOKEN not set — notifications disabled');
}

export async function sendWarRoomMessage(text: string, parseMode: 'HTML' | 'Markdown' = 'HTML'): Promise<boolean> {
  if (!BOT_TOKEN) return false;

  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: WARROOM_CHAT_ID,
        text,
        parse_mode: parseMode,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Telegram send failed:', err);
      return false;
    }
    return true;
  } catch (err: any) {
    console.error('Telegram send error:', err.message);
    return false;
  }
}
