import dayjs from 'dayjs';
import ExcelJS from 'exceljs';
import { Transaction, TransactionType } from '../types/domain';

type CanonicalColumn =
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
  balance: ['잔액', 'balance']
};

function formatExcelDate(value: Date): string {
  const pad = (number: number) => String(number).padStart(2, '0');
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())} ${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`;
}

function cellText(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return formatExcelDate(value);
  if (typeof value === 'object' && 'text' in value) return String((value as { text: unknown }).text ?? '');
  return String(value).trim();
}

function cellNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  const parsed = Number(cellText(value).replace(/[₩,\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '').replace(/_/g, '');
}

function mapColumns(headers: string[]): Partial<Record<CanonicalColumn, string>> {
  const normalized = new Map(headers.map((header) => [normalizeHeader(header), header]));
  const result: Partial<Record<CanonicalColumn, string>> = {};
  for (const [canonical, names] of Object.entries(aliases) as [CanonicalColumn, string[]][]) {
    for (const name of names) {
      const found = normalized.get(normalizeHeader(name));
      if (found) {
        result[canonical] = found;
        break;
      }
    }
  }
  return result;
}

function normalizeType(value: string, amount: number): TransactionType {
  const text = value.toLowerCase();
  if (text.includes('이체') || text.includes('transfer')) return 'transfer';
  if (text.includes('수입') || text.includes('income')) return 'income';
  if (text.includes('지출') || text.includes('expense')) return 'expense';
  return amount < 0 ? 'expense' : 'income';
}

function signedAmount(typeText: string, type: TransactionType, amount: number): number {
  const absoluteAmount = Math.abs(amount);
  const text = typeText.toLowerCase();
  if (text.includes('출금') || text.includes('withdraw') || text.includes('out')) return -absoluteAmount;
  if (text.includes('입금') || text.includes('deposit') || text.includes('in')) return absoluteAmount;
  if (type === 'expense') return -amount;
  return amount;
}

export async function parseEasyMoneyBookFile(file: File): Promise<Omit<Transaction, 'id'>[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.getWorksheet('Sheet1') ?? workbook.worksheets[0];
  if (!sheet) return [];

  const headerNames = (sheet.getRow(1).values as unknown[]).slice(1).map(cellText);
  const mapped = mapColumns(headerNames);
  if (!mapped.date || !mapped.amount) {
    throw new Error('날짜/금액 컬럼을 찾지 못했습니다. 편한가계부 백업 원본인지 확인해 주세요.');
  }
  const indexByHeader = new Map<string, number>();
  headerNames.forEach((header, index) => {
    if (!indexByHeader.has(header)) indexByHeader.set(header, index + 1);
  });
  const read = (row: ExcelJS.Row, header?: string) => (header ? row.getCell(indexByHeader.get(header) ?? 0).value : '');
  const rows: Omit<Transaction, 'id'>[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const rawType = cellText(read(row, mapped.type));
    const rawAmount = cellNumber(read(row, mapped.amount));
    const type = normalizeType(rawType, rawAmount);
    const dateValue = read(row, mapped.date);
    const dateText = dateValue instanceof Date ? formatExcelDate(dateValue) : dayjs(cellText(dateValue)).format('YYYY-MM-DD HH:mm:ss');
    const now = new Date().toISOString();
    rows.push({
      date: dateText,
      amount: signedAmount(rawType, type, rawAmount),
      type,
      category: cellText(read(row, mapped.category)),
      subcategory: cellText(read(row, mapped.subcategory)),
      asset: cellText(read(row, mapped.asset)),
      counterAsset: cellText(read(row, mapped.counterAsset)),
      memo: cellText(read(row, mapped.memo)),
      tag: cellText(read(row, mapped.tag)),
      balance: mapped.balance ? cellNumber(read(row, mapped.balance)) : null,
      merchant: cellText(read(row, mapped.merchant)),
      sourceFile: file.name,
      createdAt: now,
      updatedAt: now
    });
  });

  return rows
    .filter((row) => row.date && row.date !== 'Invalid Date' && row.amount !== 0)
    .filter((row) => !/자산\s*미반영/.test(row.asset))
    .filter((row, _index, all) => {
      const adjustment = row.type === 'income' && row.amount > 0 && /대출|담보/.test(row.asset) && (row.category.includes('잔액수정') || row.merchant.includes('차액'));
      if (!adjustment) return true;
      return !all.some((candidate) => candidate !== row && candidate.type === 'transfer' && candidate.amount === -row.amount && /대출|담보/.test(candidate.asset) && candidate.asset !== row.asset && candidate.asset.includes(row.asset));
    });
}
