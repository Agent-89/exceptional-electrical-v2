'use client';

import { formatEmptyDeleteBlockers } from '@/lib/hq-empty-delete';
import { deleteEmptyEnquiry } from '../../actions';
import RecordDangerActions from '../../record-danger-actions';

export default function EnquiryDangerActions({
  enquiryId,
  canDelete,
  deleteEligible,
  deleteBlockers,
}: {
  enquiryId: string;
  canDelete: boolean;
  deleteEligible: boolean;
  deleteBlockers: string[];
}) {
  if (!canDelete) return null;
  return (
    <RecordDangerActions
      label="Enquiry actions"
      actions={[
        {
          id: 'delete',
          label: 'Delete enquiry',
          confirm:
            'Permanently delete this unused enquiry? This cannot be undone. The enquiry number will not be reused.',
          disabled: !deleteEligible,
          title: deleteEligible
            ? 'Permanently delete this unused enquiry'
            : formatEmptyDeleteBlockers(deleteBlockers),
          redirectTo: '/hq/enquiries',
          run: () => deleteEmptyEnquiry(enquiryId),
        },
      ]}
    />
  );
}
