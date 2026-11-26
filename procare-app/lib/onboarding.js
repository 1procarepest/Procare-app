/**
 * Onboarding sections (John, 2026-11-26): Onboarding = required (read and sign, or pass the test); Training = optional,
 * there when people need it. Older sections map in: Training and Sales aids are Training; everything else (Handbook,
 * Contracts, Policies) is Onboarding.
 */
export const groupOf = (cat) => (['Training', 'Sales aids'].includes(cat) ? 'Training' : 'Onboarding');
