/**
 * Take Action options. All are PayPal SANDBOX demonstrations.
 *
 * The payee is a PayPal sandbox merchant account controlled by the project owner. It is NOT
 * a charity and receives no real money. Real organisations appear only as informational
 * links and are never presented as payment recipients.
 */
import type { ActionOption } from '../schemas';

const BENEFICIARY = {
  name: 'WorldLens Sandbox Relief Fund',
  kind: 'sandbox-demo-merchant' as const,
  disclosure:
    'A PayPal sandbox merchant account used for this hackathon demo. It is not a charity, it is not affiliated with any relief organisation, and no real money is transferred.',
};

const INFO_ONLY = 'Information only — WorldLens does not process donations to this organisation.';

export const ACTION_OPTIONS: ActionOption[] = [
  {
    id: 'act-quake-relief-sandbox',
    eventIds: ['demo-news-sulawesi-quake-relief'],
    appliesToLiveCategories: [],
    title: 'Emergency relief (sandbox demo)',
    description:
      'Simulates a contribution toward emergency shelter and clean water in the demo earthquake scenario.',
    purpose: 'Emergency relief — demo scenario',
    beneficiary: BENEFICIARY,
    currency: 'USD',
    suggestedAmounts: [5, 10, 20, 50],
    minAmount: 1,
    maxAmount: 500,
    informationalLinks: [
      { name: 'IFRC (International Federation of Red Cross and Red Crescent Societies)', url: 'https://www.ifrc.org/', note: INFO_ONLY },
      { name: 'ReliefWeb (UN OCHA)', url: 'https://reliefweb.int/', note: 'Humanitarian situation reports.' },
    ],
    sandbox: true,
  },
  {
    id: 'act-flood-relief-sandbox',
    eventIds: ['demo-news-sylhet-flood-relief'],
    appliesToLiveCategories: [],
    title: 'Flood relief kits (sandbox demo)',
    description: 'Simulates a contribution toward food, water and hygiene kits in the demo flood scenario.',
    purpose: 'Flood relief — demo scenario',
    beneficiary: BENEFICIARY,
    currency: 'USD',
    suggestedAmounts: [5, 10, 20, 50],
    minAmount: 1,
    maxAmount: 500,
    informationalLinks: [
      { name: 'UNICEF', url: 'https://www.unicef.org/', note: INFO_ONLY },
      { name: 'ReliefWeb (UN OCHA)', url: 'https://reliefweb.int/', note: 'Humanitarian situation reports.' },
    ],
    sandbox: true,
  },
  {
    id: 'act-wildfire-recovery-sandbox',
    eventIds: ['demo-news-attica-wildfire-recovery'],
    appliesToLiveCategories: [],
    title: 'Wildfire recovery (sandbox demo)',
    description: 'Simulates a contribution toward temporary housing and reforestation in the demo wildfire scenario.',
    purpose: 'Wildfire recovery — demo scenario',
    beneficiary: BENEFICIARY,
    currency: 'USD',
    suggestedAmounts: [10, 20, 50, 100],
    minAmount: 1,
    maxAmount: 500,
    informationalLinks: [
      { name: 'ReliefWeb (UN OCHA)', url: 'https://reliefweb.int/', note: 'Humanitarian situation reports.' },
    ],
    sandbox: true,
  },
  {
    id: 'act-live-disaster-sandbox',
    eventIds: [],
    appliesToLiveCategories: ['disaster', 'humanitarian'],
    title: 'Sandbox demo contribution (not a real donation)',
    description:
      'Demonstrates the Take Action flow on a live disaster story. This PayPal SANDBOX payment does NOT reach anyone affected by the event. To give for real, use the organisations linked below directly.',
    purpose: 'Sandbox demonstration — live disaster story',
    beneficiary: BENEFICIARY,
    currency: 'USD',
    suggestedAmounts: [5, 10, 20],
    minAmount: 1,
    maxAmount: 100,
    informationalLinks: [
      { name: 'ReliefWeb (UN OCHA)', url: 'https://reliefweb.int/', note: 'Find appeals and situation reports. ' + INFO_ONLY },
      { name: 'IFRC (International Federation of Red Cross and Red Crescent Societies)', url: 'https://www.ifrc.org/', note: INFO_ONLY },
    ],
    sandbox: true,
  },
];

/** Event categories for which a Take Action workflow can make sense. */
export const ACTIONABLE_CATEGORIES = new Set(['disaster', 'humanitarian', 'health']);
