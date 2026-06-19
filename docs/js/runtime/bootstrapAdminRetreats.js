import { initDemoStore } from './store/demoStore.js';
import '../custom-elements/retreat-session-manager-ce.js';

await initDemoStore('./fixtures/');
await import('./bridges/adminRetreatsHost.js');
