import { SCORING } from '../config';
import type { Achievement } from '../progress/Achievements';
import type { UpgradeId } from '../progress/Progress';
import type { Skin } from '../progress/Skins';
import { t } from './I18n';

/** Localized names for data that lives in plain TypeScript tables (achievements, upgrades, paint). */
export const achievementName = (a: Pick<Achievement, 'id'>): string => t(`ach.${a.id}.name`);
export const achievementText = (a: Pick<Achievement, 'id'>): string => t(`ach.${a.id}.desc`, { n: SCORING.maxCombo });
export const upgradeName = (id: UpgradeId): string => t(`upgrade.${id}.name`);
export const upgradeBlurb = (id: UpgradeId): string => t(`upgrade.${id}.blurb`);
export const skinName = (s: Pick<Skin, 'id'>): string => t(`skin.${s.id}`);

