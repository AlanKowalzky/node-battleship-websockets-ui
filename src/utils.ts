import { SafeParseResult } from './types/websocket.js';

export function safeJsonParse<T>(jsonString: string): SafeParseResult<T> {
  try {
    return { success: true, data: JSON.parse(jsonString) };
  } catch (error) {
    return { success: false, error };
  }
}
