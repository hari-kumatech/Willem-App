import 'server-only';
import { createAdminClient } from '@/lib/db/admin';
import { broadcast } from './events';
import { LEADS_COLLECTION, loadLeadDoc } from './leads';

// Lead changes made in the Sales Hub are pushed to open MEK Movers screens (one leads list, INC-008),
// the same way the MEK Movers apps push their own changes. Never throws: syncing must not break a save.

export async function notifyLeadChanged(leadId: string) {
  try {
    const lead = await loadLeadDoc(createAdminClient(), leadId);
    if (lead) broadcast({ op: 'set', col: LEADS_COLLECTION, id: lead.docId, data: lead.doc });
  } catch (error) {
    console.warn('[mek-movers] lead sync skipped:', error instanceof Error ? error.message : error);
  }
}

export function notifyLeadDeleted(docId: string) {
  broadcast({ op: 'delete', col: LEADS_COLLECTION, id: docId });
}

// After imports and restores: open screens reload everything
export function notifyLeadsReload() {
  broadcast({ op: 'reload' });
}
