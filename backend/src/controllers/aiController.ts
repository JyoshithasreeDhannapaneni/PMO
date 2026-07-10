import { Request, Response } from 'express';
import { runAiChat, ChatMessage } from '../services/chatService';
import { logger } from '../utils/logger';

export async function aiChat(req: Request, res: Response): Promise<void> {
  try {
    const { messages } = req.body as { messages: ChatMessage[] };
    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ success: false, error: 'messages array is required' });
      return;
    }
    if (messages.length > 40) {
      res.status(400).json({ success: false, error: 'Conversation too long (max 40 messages)' });
      return;
    }
    const reply = await runAiChat(messages);
    res.json({ success: true, data: { reply } });
  } catch (err) {
    logger.error('[AI Chat]', err);
    res.status(500).json({ success: false, error: 'AI service unavailable' });
  }
}
