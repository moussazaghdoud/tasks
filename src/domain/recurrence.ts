import { addDaysKey, addMonthsKey, fromKey, dueLabel } from '@/lib/dates';
import type { DateKey, RecurrenceRule } from './types';

export function nextOccurrence(rule: RecurrenceRule, from: DateKey): DateKey {
  const n = Math.max(1, rule.interval);
  switch (rule.freq) {
    case 'daily':
      return addDaysKey(from, n);
    case 'weekdays': {
      let next = addDaysKey(from, 1);
      while ([0, 6].includes(fromKey(next).getDay())) next = addDaysKey(next, 1);
      return next;
    }
    case 'weekly':
      return addDaysKey(from, 7 * n);
    case 'monthly':
      return addMonthsKey(from, n);
    case 'yearly':
      return addMonthsKey(from, 12 * n);
  }
}

export function recurrenceLabel(rule: RecurrenceRule, anchor?: DateKey | null): string {
  const n = rule.interval;
  switch (rule.freq) {
    case 'daily':
      return n === 1 ? 'Every day' : `Every ${n} days`;
    case 'weekdays':
      return 'Every weekday';
    case 'weekly': {
      const day = anchor ? fromKey(anchor).toLocaleDateString('en-US', { weekday: 'long' }) : null;
      if (n === 1) return day ? `Every ${day}` : 'Every week';
      return `Every ${n} weeks`;
    }
    case 'monthly':
      return n === 1 ? 'Every month' : `Every ${n} months`;
    case 'yearly':
      return 'Every year';
  }
}

export function describeNext(rule: RecurrenceRule, from: DateKey): string {
  return dueLabel(nextOccurrence(rule, from));
}
