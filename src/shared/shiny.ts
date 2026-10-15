/**
 * 闪光宝可梦（异色）：和普通的是两只独立的宝可梦——分别拥有、分别培养（背包里的构筑）、分别设为伙伴。
 * 六项能力（HP、物攻、物防、特攻、特防、速度）各比普通的高 1%。
 * 每只宝可梦出现时有 1/1000 的几率是闪光的；研究所、训练家和闪耀护符可以提高几率，最高 1/200。
 */
export const SHINY_STAT = 1.01;
export const SHINY_BASE = 1 / 1000;
export const SHINY_MAX = 1 / 200;

/** bonus：闪光几率加成（%，研究所 + 训练家 + 道具） */
export function shinyRate(bonus: number): number {
  return Math.min(SHINY_MAX, SHINY_BASE * (1 + Math.max(0, bonus) / 100));
}

/** 「1/N」的写法 */
export function shinyOdds(bonus: number): string {
  return `1/${Math.round(1 / shinyRate(bonus))}`;
}

/** 闪光宝可梦的名字：闪光小火龙 */
export function shinyName(name: string, shiny?: boolean) {
  return shiny ? `闪光${name}` : name;
}
