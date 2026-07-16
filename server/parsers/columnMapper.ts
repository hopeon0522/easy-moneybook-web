export type CanonicalColumn =
  | 'date'
  | 'asset'
  | 'counterAsset'
  | 'category'
  | 'subcategory'
  | 'merchant'
  | 'memo'
  | 'tag'
  | 'amount'
  | 'type'
  | 'currency'
  | 'balance';

const aliases: Record<CanonicalColumn, string[]> = {
  date: ['날짜', '일자', '기간', '거래일', '거래일시', 'date'],
  asset: ['자산', '계좌', '카드', 'account', 'asset'],
  counterAsset: ['자산.1', '상대자산', '상대 계좌', 'to asset', 'counter asset'],
  category: ['분류', '카테고리', 'category'],
  subcategory: ['소분류', '하위분류', 'subcategory', 'sub category'],
  merchant: ['내용', '거래처', '사용처', 'merchant', 'description'],
  memo: ['메모', '추가입력', 'memo', 'note'],
  tag: ['태그', 'tag', 'tags'],
  amount: ['금액', 'krw', 'amount', '거래금액'],
  type: ['수입/지출', '구분', 'type', 'transaction type'],
  currency: ['화폐', '통화', 'currency'],
  balance: ['잔액', 'balance']
};

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '').replace(/_/g, '');
}

/**
 * Maps EasyMoneyBook and localized Excel headers to canonical transaction fields.
 */
export function mapColumns(headers: string[]): Partial<Record<CanonicalColumn, string>> {
  const normalizedHeaders = new Map(headers.map((header) => [normalizeHeader(header), header]));
  const mapped: Partial<Record<CanonicalColumn, string>> = {};

  for (const [canonical, names] of Object.entries(aliases) as [CanonicalColumn, string[]][]) {
    for (const name of names) {
      const hit = normalizedHeaders.get(normalizeHeader(name));
      if (hit) {
        mapped[canonical] = hit;
        break;
      }
    }
  }

  return mapped;
}
