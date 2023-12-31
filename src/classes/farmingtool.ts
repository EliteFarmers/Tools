import { Crop } from '../constants/crops';
import { FARMING_ENCHANTS, TURBO_ENCHANTS, TURBO_ENCHANT_FORTUNE } from '../constants/enchants';
import { REFORGES, Rarity, Reforge, ReforgeTier, Stat } from '../constants/reforges';
import { FARMING_TOOLS, FarmingToolInfo, FarmingToolType } from '../constants/tools';
import { GetRarityFromLore, PreviousRarity } from '../util/itemstats';
import { ExtractNumberFromLine } from '../util/lore';
import { Item } from './item';
import { PlayerOptions } from './player';

export class FarmingTool {
	public declare item: Item;
	public declare crop: Crop;
	public declare tool: FarmingToolInfo;

	public declare rarity: Rarity;
	public declare counter: number | undefined;
	public declare cultivating: number;
	public declare reforge: Reforge | undefined;
	public declare reforgeStats: ReforgeTier | undefined;

	public declare farmingForDummies: number;
	public declare recombobulated: boolean;

	public declare fortune: number;
	public declare fortuneBreakdown: Record<string, number>;

	private declare options?: PlayerOptions;

	constructor(item: Item, options?: PlayerOptions) {
		this.rebuildTool(item, options);
	}

	rebuildTool(item: Item, options?: PlayerOptions) {
		this.options = options;
		this.item = item;

		const tool = FARMING_TOOLS[item.skyblockId as keyof typeof FARMING_TOOLS];

		if (!tool) {
			throw new Error(`Unknown farming tool: ${item.name} (${item.skyblockId})`);
		}

		this.tool = tool;
		this.crop = tool.crop;

		if (item.lore) {
			this.rarity = GetRarityFromLore(item.lore);
		}

		this.counter = this.getCounter();
		this.cultivating = this.getCultivating() ?? 0;
		this.setReforge(item.attributes?.modifier ?? '');

		this.farmingForDummies = +(this.item.attributes?.farming_for_dummies_count ?? 0);
		this.recombobulated = this.item.attributes?.rarity_upgrades === '1';

		this.fortune = this.sumFortune();
	}

	setReforge(reforgeId: string) {
		this.reforge = REFORGES[reforgeId] ?? undefined;
		this.reforgeStats = this.reforge?.tiers?.[this.rarity];
	}

	private sumFortune(): number {
		this.fortuneBreakdown = {};
		let sum = 0;

		// Base fortune
		const base = this.tool.baseStats?.[Stat.FarmingFortune] ?? 0;
		if (base > 0) {
			this.fortuneBreakdown['Tool Bonus'] = base;
			sum += base;
		}

		// Tool rarity stats
		const baseRarity = this.recombobulated ? PreviousRarity(this.rarity) : this.rarity;
		const rarityStats = this.tool.stats?.[baseRarity]?.[Stat.FarmingFortune] ?? 0;

		if (rarityStats > 0) {
			this.fortuneBreakdown['Tool Stats'] = rarityStats;
			sum += rarityStats;
		}

		// Reforge stats
		const reforge = this.reforgeStats?.stats?.[Stat.FarmingFortune] ?? 0;
		if (reforge > 0) {
			this.fortuneBreakdown[this.reforge?.name ?? 'Reforge'] = reforge;
			sum += reforge;
		}

		// Farming for Dummies
		if (this.farmingForDummies > 0) {
			this.fortuneBreakdown['Farming for Dummies'] = this.farmingForDummies;
			sum += this.farmingForDummies;
		}

		// Collection analysis and digit bonuses
		if (this.tool.type === FarmingToolType.MathematicalHoe) {
			const ability = this.getFarmingAbilityFortune(this);
			if (ability > 0) {
				this.fortuneBreakdown['Tool Ability'] = ability;
				sum += ability;
			}
		}

		// Enchantments
		const enchantments = Object.entries(this.item.enchantments ?? {});
		for (const [enchant, level] of enchantments) {
			if (!level) continue;

			if (enchant in TURBO_ENCHANTS) {
				const matchingCrop = TURBO_ENCHANTS[enchant];
				if (!matchingCrop || matchingCrop !== this.crop) continue;

				const gain = TURBO_ENCHANT_FORTUNE * level;
				this.fortuneBreakdown['Turbo'] = gain;
				sum += gain;

				continue;
			}

			const enchantment = FARMING_ENCHANTS[enchant];
			if (!enchantment || !level) continue;

			const fortune = enchantment.levels?.[level]?.[Stat.FarmingFortune] ?? 0;
			if (fortune > 0) {
				this.fortuneBreakdown[enchantment.name] = fortune;
				sum += fortune;
			}
		}

		const milestone = this.options?.milestones?.[this.crop] ?? 0;
		if (milestone && 'dedication' in (this.item.enchantments ?? {})) {
			const level = this.item.enchantments?.dedication;
			const enchantment = FARMING_ENCHANTS.dedication;

			if (level && enchantment) {
				const multiplier = enchantment.multipliedLevels?.[level]?.[Stat.FarmingFortune] ?? 0;
				if (multiplier > 0 && !isNaN(milestone)) {
					this.fortuneBreakdown[enchantment.name] = multiplier * milestone;
					sum += multiplier * milestone;
				}
			}
		}

		this.fortune = sum;
		return sum;
	}

	private getCounter(): number | undefined {
		const counter = +(this.item?.attributes?.mined_crops ?? 0);
		return counter && !isNaN(counter) ? counter : undefined;
	}

	private getCultivating(): number | undefined {
		const cultivating = +(this.item?.attributes?.farmed_cultivating ?? 0);
		return cultivating && !isNaN(cultivating) ? cultivating : undefined;
	}

	getCultivatingLevel(): number {
		return this.item.enchantments?.cultivating ?? 0;
	}

	get farmed(): number {
		return this.counter ?? this.cultivating ?? 0;
	}

	get isMissingDedication() {
		return this.item?.enchantments?.dedication && (this.options?.milestones?.[this.crop] ?? 0) > 0;
	}

	private getFarmingAbilityFortune(tool: FarmingTool) {
		let fortune = 0;
		const regex = /§7You have §6\+(\d+)☘/g;

		for (const line of tool.item.lore ?? []) {
			fortune += ExtractNumberFromLine(line, regex) ?? 0;
		}

		return fortune;
	}

	static isValid(item: Item): boolean {
		return IsValidFarmingTool(item);
	}
}

export function IsValidFarmingTool(item: Item): boolean {
	return FARMING_TOOLS[item.skyblockId as keyof typeof FARMING_TOOLS] !== undefined;
}
