import { initDemoStore, resetDemoStore } from './store/demoStore.js';
import '../custom-elements/booking-wizard-packages.js';

const params = new URLSearchParams(window.location.search);
if (params.get('reset') === '1') {
  resetDemoStore();
}

await initDemoStore('./fixtures/');
await import('./bridges/bookingPage.js');
