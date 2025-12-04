import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../../_lib/middleware.js';
import { storage } from '../../_lib/storage.js';
import { sendInquiryStatusEmail } from '../../_lib/email.js';

export default requireAuth(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { id } = req.query;
    const { status, message } = req.body;

    console.log('📝 Status update request:', { id, status, message });

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ message: 'Inquiry ID is required' });
    }

    if (!['pending', 'approved', 'rejected', 'needs_info'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const inquiry = await storage.getInquiry(id);
    if (!inquiry) {
      return res.status(404).json({ message: 'Inquiry not found' });
    }

    // Update status in database
    const updatedInquiry = await storage.updateInquiryStatus(id, status, message);

    // If the inquiry originated from a campaign, reflect the decision on the campaign
    if (inquiry.campaignId) {
      try {
        if (status === 'approved') {
          await storage.updateCampaignStatus(inquiry.campaignId, 'deal');
        } else if (status === 'rejected') {
          await storage.updateCampaignStatus(inquiry.campaignId, 'denied');
        }
      } catch (campaignError) {
        console.error('⚠️ Failed to update campaign status from inquiry decision:', campaignError);
      }
    }

    // Send email notification (not for pending status)
    if (status !== 'pending') {
      // @ts-ignore
      const userId = req.user.id;
      const influencer = await storage.getUser(userId);

      if (influencer && inquiry.businessEmail) {
        const influencerName = influencer.firstName
          ? `${influencer.firstName}${influencer.lastName ? ` ${influencer.lastName}` : ''}`
          : influencer.username || 'The influencer';

        console.log('📧 About to send email...');

        try {
          // ✅ Create promise with timeout
          const emailPromise = sendInquiryStatusEmail(
            inquiry.businessEmail,
            influencerName,
            status as 'approved' | 'rejected' | 'needs_info',
            message || undefined
          );

          // Wait up to 5 seconds for email
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Email timeout')), 5000)
          );

          await Promise.race([emailPromise, timeoutPromise]);
          console.log('✅ Email completed!');
        } catch (emailError: any) {
          console.error('❌ Email error:', emailError?.message || emailError);
          // Don't fail the request - status was already updated
        }
      }
    }

    res.json(updatedInquiry);
  } catch (error: any) {
    console.error('❌ Error updating inquiry status:', error);
    res.status(500).json({ message: 'Failed to update inquiry status' });
  }
});
