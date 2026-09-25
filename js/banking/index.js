// Provider selection. Phase 1 is hard-wired to the simulation.
// Switching to PartnerProvider is a Phase-2 task (see docs/PHASE2_INTEGRATION.md).
import { SimulatedProvider } from './SimulatedProvider.js';
import { PartnerProvider } from './PartnerProvider.js';

export const provider = new SimulatedProvider();
export const partnerStub = new PartnerProvider(); // never used for money movement in Phase 1
