import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../_lib/middleware.js';
import { storage } from '../_lib/storage.js';
import { insertInfluencerPreferencesSchema } from '../../shared/schema.js';
import { fromError } from 'zod-validation-error';

export default requireAuth(async (req: VercelRequest, res: VercelResponse) => {
  // @ts-ignore - user is added by requireAuth middleware
  const userId = req.user.id;

  if (req.method === 'GET') {
    try {
      const prefs = await storage.getInfluencerPreferences(userId);
      res.json(prefs || null);
    } catch (error) {
      console.error('Error fetching preferences:', error);
      res.status(500).json({ message: 'Failed to fetch preferences' });
    }
  } else if (req.method === 'POST') {
    try {
      const validation = insertInfluencerPreferencesSchema.safeParse({
        ...req.body,
        userId,
      });

      if (!validation.success) {
        return res.status(400).json({ message: fromError(validation.error).toString() });
      }

      const prefs = await storage.upsertInfluencerPreferences({
        ...validation.data,
        socialLinks:
          validation.data.socialLinks && typeof validation.data.socialLinks === 'object'
            ? Object.fromEntries(
                Object.entries(validation.data.socialLinks).filter(([, value]) => typeof value === 'string' && value.trim().length > 0),
              )
            : undefined,
      });
      res.json(prefs);
    } catch (error) {
      console.error('Error saving preferences:', error);
      res.status(500).json({ message: 'Failed to save preferences' });
    }
  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
});
