/**
 * Maps driver codes to their respective team logo filenames
 * Based on 2024 F1 season driver lineup
 */

const DRIVER_TO_TEAM: { [driverCode: string]: string } = {
  // Red Bull Racing
  VER: 'Redbull.svg',
  PER: 'Redbull.svg',

  // Mercedes-AMG Petronas
  HAM: 'Mercedes.svg',
  RUS: 'Mercedes.svg',
  ANT: 'Mercedes.svg', // Antonelli

  // Scuderia Ferrari
  LEC: 'Ferrari.svg',
  SAI: 'Ferrari.svg',

  // McLaren F1 Team
  NOR: 'McLaren.svg',
  PIA: 'McLaren.svg',

  // Aston Martin Aramco
  ALO: 'AstonMartin.svg',
  STR: 'AstonMartin.svg',

  // BWT Alpine F1 Team
  GAS: 'Alpine.svg',
  OCO: 'Alpine.svg',

  // Williams Racing
  ALB: 'Williams.svg',
  SAR: 'Williams.svg',
  COL: 'Williams.svg', // Colapinto

  // Visa Cash App RB F1 Team (Racing Bulls)
  TSU: 'RacingBulls.svg',
  RIC: 'RacingBulls.svg',
  LAW: 'RacingBulls.svg', // Lawson
  HAD: 'RacingBulls.svg', // Hadjar

  // Stake F1 Team Kick Sauber
  BOT: 'KickSauber.svg',
  ZHO: 'KickSauber.svg',
  BOR: 'KickSauber.svg', // Bortoleto

  // MoneyGram Haas F1 Team
  MAG: 'Haas.svg',
  HUL: 'Haas.svg',
  BEA: 'Haas.svg', // Bearman
};

/**
 * Get the team logo filename for a given driver code
 * @param driverCode - Three-letter driver code (e.g., 'VER', 'HAM')
 * @returns The team logo filename or null if not found
 */
export function getTeamLogo(driverCode: string): string | null {
  return DRIVER_TO_TEAM[driverCode.toUpperCase()] || null;
}

/**
 * Get the full path to the team logo for a given driver code
 * @param driverCode - Three-letter driver code (e.g., 'VER', 'HAM')
 * @returns The full path to the team logo or null if not found
 */
export function getTeamLogoPath(driverCode: string): string | null {
  const logo = getTeamLogo(driverCode);
  return logo ? `/images/teams/${logo}` : null;
}

/**
 * Get the team color CSS class for a given driver code
 * @param driverCode - Three-letter driver code (e.g., 'VER', 'HAM')
 * @returns The team color CSS class or 'team-color-default' if not found
 */
export function getTeamColorClass(driverCode: string): string {
  const logo = getTeamLogo(driverCode);
  if (!logo) return 'team-color-default';
  
  const teamName = logo.replace('.svg', '').toLowerCase();
  return `team-color-${teamName}`;
}
