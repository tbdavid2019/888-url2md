import type { Category, Retention, Split } from './types';
import { CITIES, COMPOUND_SURNAMES, COMPANY_SUFFIX } from './patterns';
import { birthYearSplit, phonePrefixLength } from './intl';

const NONE: Split = { head: 0, tail: 0 };
const CITY_RE = new RegExp(`^${CITIES}`, 'u');
const DISTRICT_RE = /^[一-龥]{1,4}?[鄉鎮市區]/u;
const COMPANY_MASK_RE = new RegExp(`${COMPANY_SUFFIX}$`, 'u');

function afterDigit(value: string, n: number): number {
  let seen = 0;
  for (let i = 0; i < value.length; i++) {
    if (/\d/.test(value[i]) && ++seen === n) {
      let j = i + 1;
      while (j < value.length && !/\d/.test(value[j])) j++;
      return j;
    }
  }
  return value.length;
}

/**
 * Standard 部分保留:
 * - 姓名: surname (head 1 or 2)
 * - 身分證: first 2 chars
 * - 手機: first 4 digits
 * - 市話: area code
 * - 地址: city + district
 * - 公司: keep suffix (e.g. 股份有限公司)
 * - 信用卡: last 4 digits
 * - 電子郵件: keep domain
 * - 生日: year
 */
export function standardSplit(category: Category, value: string): Split {
  switch (category) {
    case '姓名': {
      const compoundList = COMPOUND_SURNAMES.split('|');
      const isCompound = compoundList.some((s) => value.startsWith(s));
      return { head: isCompound ? 2 : 1, tail: 0 };
    }
    case '身分證':
      return { head: 2, tail: 0 };
    case '手機':
      return { head: afterDigit(value, 4), tail: 0 };
    case '市話': {
      const area = value.match(/^(?:\(0\d{1,3}\)|0\d{1,3}[-\s])/)?.[0];
      return { head: area ? area.length : afterDigit(value, 2), tail: 0 };
    }
    case '地址': {
      const city = value.match(CITY_RE)?.[0] ?? '';
      const rest = value.slice(city.length);
      const district = rest.match(DISTRICT_RE)?.[0] ?? '';
      const head = (city + district).length;
      return head > 0 ? { head, tail: 0 } : NONE;
    }
    case '公司': {
      const m = value.match(COMPANY_MASK_RE);
      return m && m.index !== undefined && m.index > 0 ? { head: 0, tail: m[0].length } : NONE;
    }
    case '電子郵件': {
      const at = value.indexOf('@');
      return at > 0 ? { head: 0, tail: value.length - at } : NONE;
    }
    case '信用卡': {
      const tail = value.match(/[\d]{4}$/)?.[0]?.length ?? 4;
      return { head: 0, tail };
    }
    case '國際電話':
      return { head: phonePrefixLength(value), tail: 0 };
    case 'IBAN':
      return { head: 2, tail: 0 };
    case 'IP': {
      if (value.includes('.')) {
        const parts = value.split('.');
        const head = parts.slice(0, 2).join('.').length + 1;
        return { head, tail: 0 };
      }
      return NONE;
    }
    case '生日':
      return birthYearSplit(value);
    case '統編':
    case 'SSN':
    default:
      return NONE;
  }
}

export function splitFor(value: string, r: Retention | undefined, category: Category): Split {
  if (!r || r.mode === 'none') return NONE;
  if (r.mode === 'preview') return standardSplit(category, value);
  if (r.mode === 'surname') return standardSplit('姓名', value);
  if (r.mode === 'city') {
    const city = value.match(CITY_RE)?.[0] ?? '';
    return city ? { head: city.length, tail: 0 } : NONE;
  }
  if (r.mode === 'district') return standardSplit('地址', value);
  if (r.mode === 'ends') {
    const head = Math.min(value.length, Math.max(0, r.head ?? 0));
    const tail = Math.min(value.length - head, Math.max(0, r.tail ?? 0));
    return { head, tail };
  }
  if (r.mode === 'delim' && r.delimiter) {
    const idx = value.indexOf(r.delimiter);
    if (idx === -1) return NONE;
    return r.side === 'after'
      ? { head: 0, tail: value.length - idx }
      : { head: idx + r.delimiter.length, tail: 0 };
  }
  return NONE;
}
