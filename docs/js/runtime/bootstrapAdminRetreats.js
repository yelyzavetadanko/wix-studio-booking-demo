import { initDemoStore, resetDemoStore } from './store/demoStore.js';

const params = new URLSearchParams(window.location.search);
if (params.get('reset') === '1') resetDemoStore();

await initDemoStore('./fixtures/');
await import('./bridges/adminRetreatsHost.js');
await import('../custom-elements/retreat-session-manager-ce.js');
