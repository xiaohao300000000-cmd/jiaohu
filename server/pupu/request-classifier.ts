const PUPU_REQUEST_PATTERN =
  /(?:pupu|朴朴|采购|买.*(?:牛奶|鸡蛋|食材|水果|蔬菜)|火锅.*预算|预算.*火锅|低脂|三道菜|营养全面|晚餐|做.*菜)/i;

export function isPupuRequest(input: string): boolean {
  return PUPU_REQUEST_PATTERN.test(input);
}

export const PUPU_REQUEST_PATTERN_SOURCE = PUPU_REQUEST_PATTERN.source;
