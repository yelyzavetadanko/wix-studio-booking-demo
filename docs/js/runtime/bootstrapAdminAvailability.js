import { initDemoStore } from './store/demoStore.js';
import '../custom-elements/availability-manager-ce.js';

await initDemoStore('./fixtures/');
await import('./bridges/adminAvailabilityHost.js');
