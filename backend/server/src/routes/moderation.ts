import express, { Request, Response } from 'express';
import authenticateToken, { type AuthedRequest } from '../middleware/authenticateToken';
import {
  createReportCaseOrAttachSubmission,
  getModerationState,
  isValidReportReason,
  isValidReportTargetType,
} from '../lib/moderation';

const router = express.Router();

router.use(authenticateToken);

router.get('/me/state', async (req: Request, res: Response) => {
  const authed = req as AuthedRequest;
  const state = authed.moderationState ?? await getModerationState(authed.auth!.userId);
  return res.status(200).json(state);
});

router.post('/reports', async (req: Request, res: Response) => {
  const authed = req as AuthedRequest;
  const body = req.body as {
    targetType?: string;
    targetId?: string;
    reason?: string;
    description?: string;
  };

  const targetType = String(body.targetType ?? '').trim().toLowerCase();
  const targetId = String(body.targetId ?? '').trim();
  const reason = String(body.reason ?? '').trim().toLowerCase();

  if (!isValidReportTargetType(targetType) || !targetId) {
    return res.status(400).json({ message: 'A valid report target is required.' });
  }
  if (!isValidReportReason(reason)) {
    return res.status(400).json({ message: 'A valid report reason is required.' });
  }

  try {
    const result = await createReportCaseOrAttachSubmission({
      reporterUserId: authed.auth!.userId,
      targetType,
      targetId,
      reason,
      description: body.description,
    });

    return res.status(result.createdNewCase ? 201 : 200).json({
      success: true,
      reportId: result.reportId,
      message: 'Thanks for helping keep the community safe.',
    });
  } catch (error) {
    if (error instanceof Error && 'status' in error) {
      return res.status(Number((error as any).status) || 400).json({
        message: error.message,
        code: (error as any).code ?? 'REPORT_FAILED',
      });
    }

    console.error('Error creating moderation report:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
