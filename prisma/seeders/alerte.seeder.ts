import { Prisma } from '../../generated/prisma/client';
import { syncAlerts } from '../../src/modules/alertes/alert-detection';

/** Actual alerts from the cases: no fictional counts or severities. */
export async function seedAlertes(tx: Prisma.TransactionClient) {
  const result = await syncAlerts(tx);
  console.log('Alertes de démonstration calculées :', result);
}
