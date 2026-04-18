export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "is_answered"
  | "is_not_answered";

export interface ConditionRule {
  fieldId: number;
  operator: ConditionOperator;
  value?: string;
}

export interface ConditionalLogic {
  enabled?: boolean;
  action?: "show" | "hide";
  match?: "all" | "any";
  rules?: ConditionRule[];
}

const isEmpty = (v: any): boolean => {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v).length === 0;
  return false;
};

const valueMatches = (answer: any, expected: string | undefined): boolean => {
  if (expected === undefined) return false;
  if (Array.isArray(answer)) return answer.map(String).includes(expected);
  if (typeof answer === "boolean") return String(answer) === expected;
  return String(answer ?? "").toLowerCase() === String(expected).toLowerCase();
};

const valueContains = (answer: any, expected: string | undefined): boolean => {
  if (expected === undefined) return false;
  if (Array.isArray(answer)) return answer.map(String).some(v => v.toLowerCase().includes(expected.toLowerCase()));
  return String(answer ?? "").toLowerCase().includes(expected.toLowerCase());
};

const evalRule = (rule: ConditionRule, getAnswer: (fieldId: number) => any): boolean => {
  const a = getAnswer(rule.fieldId);
  switch (rule.operator) {
    case "equals": return valueMatches(a, rule.value);
    case "not_equals": return !valueMatches(a, rule.value);
    case "contains": return valueContains(a, rule.value);
    case "is_answered": return !isEmpty(a);
    case "is_not_answered": return isEmpty(a);
    default: return true;
  }
};

export function isFieldVisible(
  logic: ConditionalLogic | null | undefined,
  getAnswer: (fieldId: number) => any,
): boolean {
  if (!logic || !logic.enabled || !logic.rules || logic.rules.length === 0) return true;
  const match = logic.match ?? "all";
  const action = logic.action ?? "show";
  const evals = logic.rules.map(r => evalRule(r, getAnswer));
  const conditionMet = match === "all" ? evals.every(Boolean) : evals.some(Boolean);
  return action === "show" ? conditionMet : !conditionMet;
}
