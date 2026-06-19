import { DEFAULT_PREBLOCKED_DORM } from '../core/config';

export function getPreBlockedDormBeds(session, product) {
  if (session && session.preBlockedDormBeds != null && session.preBlockedDormBeds !== '') {
    return Number(session.preBlockedDormBeds);
  }
  if (product && product.preBlockedDormBeds != null && product.preBlockedDormBeds !== '') {
    return Number(product.preBlockedDormBeds);
  }
  if (session && session.packageKey) {
    const d = DEFAULT_PREBLOCKED_DORM[session.packageKey];
    if (d != null) return d;
  }
  return 0;
}
