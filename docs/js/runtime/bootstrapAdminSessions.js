import { initDemoStore } from './store/demoStore.js';
import '../custom-elements/session-manager-ce.js';

await initDemoStore('./fixtures/');
await import('./bridges/adminSessionsHost.js');
