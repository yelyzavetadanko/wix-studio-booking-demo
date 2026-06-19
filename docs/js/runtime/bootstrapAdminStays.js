import { initDemoStore } from './store/demoStore.js';
import '../custom-elements/stay-manager-ce.js';

await initDemoStore('./fixtures/');
await import('./bridges/adminStayHost.js');
