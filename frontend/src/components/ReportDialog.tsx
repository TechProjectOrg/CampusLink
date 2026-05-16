import { useEffect, useMemo, useState } from 'react';
import { Flag, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from './ui/modal';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { apiCreateModerationReport, REPORT_REASON_OPTIONS, type ReportReasonValue, type ReportTargetTypeValue } from '../lib/moderationApi';

export interface ReportTargetDescriptor {
  targetType: ReportTargetTypeValue;
  targetId: string;
  label: string;
  preview?: string | null;
}

interface ReportDialogProps {
  open: boolean;
  onClose: () => void;
  token?: string;
  target: ReportTargetDescriptor | null;
}

export function ReportDialog({ open, onClose, token, target }: ReportDialogProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [reason, setReason] = useState<ReportReasonValue>('spam');
  const [details, setDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep(1);
      setReason('spam');
      setDetails('');
      setIsSubmitting(false);
    }
  }, [open]);

  const selectedReason = useMemo(
    () => REPORT_REASON_OPTIONS.find((option) => option.value === reason) ?? REPORT_REASON_OPTIONS[0],
    [reason],
  );

  const title = target ? `Report ${target.label}` : 'Report';

  const submit = async () => {
    if (!target || !token) return;
    setIsSubmitting(true);
    try {
      await apiCreateModerationReport(
        {
          targetType: target.targetType,
          targetId: target.targetId,
          reason,
          description: details.trim() || undefined,
        },
        token,
      );
      toast.success('Thanks for helping keep the community safe.');
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to submit report');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose} title={title} className="min-w-0 w-[min(42rem,calc(100vw-1.5rem))]">
      {!target ? null : (
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-white p-2 text-slate-600 shadow-sm">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-slate-900">{target.label}</p>
                  <Badge variant="outline" className="capitalize">{target.targetType}</Badge>
                </div>
                {target.preview ? (
                  <p className="mt-2 text-sm leading-6 text-slate-600">{target.preview}</p>
                ) : (
                  <p className="mt-2 text-sm leading-6 text-slate-600">Your report is private and reviewed only by the moderation team.</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-slate-500">
            <span className={step === 1 ? 'text-slate-900' : ''}>Reason</span>
            <span>/</span>
            <span className={step === 2 ? 'text-slate-900' : ''}>Details</span>
            <span>/</span>
            <span className={step === 3 ? 'text-slate-900' : ''}>Submit</span>
          </div>

          {step === 1 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {REPORT_REASON_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setReason(option.value)}
                  className={`rounded-2xl border px-4 py-3 text-left transition ${
                    reason === option.value
                      ? 'border-red-200 bg-red-50 text-red-700'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <p className="text-sm font-medium">{option.label}</p>
                </button>
              ))}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Selected reason</p>
                <p className="mt-2 text-sm font-medium text-slate-800">{selectedReason.label}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-800">Tell us more</label>
                <Textarea
                  rows={5}
                  value={details}
                  maxLength={500}
                  onChange={(event) => setDetails(event.target.value.slice(0, 500))}
                  placeholder="Add any context that will help the moderation team review this report."
                  className="mt-2"
                />
                <p className="mt-2 text-right text-xs text-slate-500">{details.length}/500</p>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <div className="flex items-center gap-2 text-slate-800">
                  <Flag className="h-4 w-4 text-red-600" />
                  <p className="text-sm font-medium">{selectedReason.label}</p>
                </div>
                {details.trim() ? (
                  <p className="mt-3 text-sm leading-6 text-slate-600">{details.trim()}</p>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-slate-500">No extra details added.</p>
                )}
              </div>
              <p className="text-sm leading-6 text-slate-600">
                Reports are reviewed privately. We do not share specific enforcement outcomes with reporters or the reported account.
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <Button type="button" variant="outline" onClick={step === 1 ? onClose : () => setStep((current) => (current - 1) as 1 | 2 | 3)}>
              {step === 1 ? 'Cancel' : 'Back'}
            </Button>
            {step < 3 ? (
              <Button type="button" onClick={() => setStep((current) => (current + 1) as 1 | 2 | 3)}>
                Continue
              </Button>
            ) : (
              <Button type="button" disabled={isSubmitting} onClick={() => void submit()}>
                {isSubmitting ? 'Submitting...' : 'Submit Report'}
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
