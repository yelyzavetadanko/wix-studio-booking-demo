/**
 * Writes demo seed JSON into docs/fixtures/.
 * Run: npm run seed
 */
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'fixtures');

function write(name, data) {
  const path = join(root, `${name}.json`);
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(`wrote ${path}`);
}

write('package-sessions', [
  { _id: 'sess_BeachReset_jul', packageKey: 'BeachReset', sessionStartDate: '2026-07-10', sessionEndDate: '2026-07-13', status: 'open', preBlockedDormBeds: 3, minParticipantsSnapshot: 3, maxParticipantsSnapshot: 8 },
  { _id: 'sess_BeachReset_aug', packageKey: 'BeachReset', sessionStartDate: '2026-08-07', sessionEndDate: '2026-08-10', status: 'open', preBlockedDormBeds: 3, minParticipantsSnapshot: 3, maxParticipantsSnapshot: 8 },
  { _id: 'sess_RootsAndRitual_jul', packageKey: 'RootsAndRitual', sessionStartDate: '2026-07-06', sessionEndDate: '2026-07-11', status: 'open', preBlockedDormBeds: 4, minParticipantsSnapshot: 4, maxParticipantsSnapshot: 8 },
  { _id: 'sess_SurfAndSoul_jul', packageKey: 'SurfAndSoul', sessionStartDate: '2026-07-20', sessionEndDate: '2026-07-27', status: 'open', preBlockedDormBeds: 4, minParticipantsSnapshot: 4, maxParticipantsSnapshot: 8 },
]);

console.log('Seed complete. Re-run after editing this script to refresh demo fixtures.');
