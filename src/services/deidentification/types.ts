export type Category =
  | '姓名'
  | '身分證'
  | '手機'
  | '市話'
  | '地址'
  | '公司'
  | '統編'
  | '電子郵件'
  | '國際電話'
  | '信用卡'
  | 'SSN'
  | 'IBAN'
  | 'IP'
  | '生日'
  | '識別碼';

export type MarkerStyle = 'code' | 'category' | 'mask';

export interface Retention {
  mode: 'none' | 'ends' | 'delim' | 'surname' | 'city' | 'district' | 'preview';
  head?: number;
  tail?: number;
  delimiter?: string;
  side?: 'before' | 'after';
}

export interface Split {
  head: number;
  tail: number;
}

export interface Pattern {
  id: string;
  name: string;
  group: 'tw' | 'intl' | 'custom';
  note?: string;
  category: Category;
  source: 'builtin' | 'custom';
  regex: string;
  example?: string;
  enabled: boolean;
  retention?: Retention;
  validate?: (match: string, before?: string) => boolean | number;
}

export interface RedactionItem {
  id: string;
  category: Category;
  original: string;
  start: number;
  end: number;
  code: string;
  origin: 'auto' | 'manual';
  active: boolean;
  head?: number;
  tail?: number;
  retention?: Retention;
}

export interface TextEdit {
  start: number;
  end: number;
  replacement: string;
}

export interface MappingEntry {
  code: string;
  category: Category;
  original: string;
  prefix?: string;
  suffix?: string;
}

export interface RedactionResult {
  redactedText: string;
  edits: TextEdit[];
  mapping: MappingEntry[];
  itemsCount: number;
  csvMapping: string;
}
