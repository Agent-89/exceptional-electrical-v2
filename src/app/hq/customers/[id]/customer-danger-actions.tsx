'use client';

import { formatEmptyDeleteBlockers } from '@/lib/hq-empty-delete';
import { deleteEmptyCustomer } from '../../customer-actions';
import RecordDangerActions from '../../record-danger-actions';

export default function CustomerDangerActions({
  customerId,
  canDelete,
  deleteEligible,
  deleteBlockers,
}: {
  customerId: string;
  canDelete: boolean;
  deleteEligible: boolean;
  deleteBlockers: string[];
}) {
  if (!canDelete) return null;
  return (
    <RecordDangerActions
      label="Customer actions"
      actions={[
        {
          id: 'delete',
          label: 'Delete customer',
          confirm: 'Permanently delete this empty customer profile? This cannot be undone.',
          disabled: !deleteEligible,
          title: deleteEligible
            ? 'Permanently delete this empty customer'
            : formatEmptyDeleteBlockers(deleteBlockers),
          redirectTo: '/hq/customers',
          run: () => deleteEmptyCustomer(customerId),
        },
      ]}
    />
  );
}
