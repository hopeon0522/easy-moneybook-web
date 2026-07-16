import dayjs from 'dayjs';
import ExcelJS from 'exceljs';
import { Transaction, TransactionType } from '../types/domain';
import { mapColumns } from './columnMapper';

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return formatExcelDate(value);
  if (typeof value === 'object' && 'text' in value) return String((value as { text: unknown }).text ?? '');
  return String(value).trim();
}

function cellNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  const text = cellText(value).replace(/[₩,\s]/g, '');
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
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

function normalizeDate(value: unknown): string {
  if (value instanceof Date) return formatExcelDate(value);
  const text = cellText(value);
  const parsed = dayjs(text);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm:ss') : text;
}

function isLoanName(value: string): boolean {
  return /대출|담보/.test(value);
}

function isUntrackedAssetName(value: string): boolean {
  return /자산\s*미반영/.test(value);
}

function removeDuplicateLoanBalanceAdjustments(transactions: Transaction[]): Transaction[] {
  return transactions.filter((transaction) => {
    const isBalanceAdjustment =
      transaction.type === 'income' &&
      transaction.amount > 0 &&
      isLoanName(transaction.asset) &&
      (transaction.category.includes('잔액수정') || transaction.merchant.includes('차액'));

    if (!isBalanceAdjustment) return true;

    const hasSpecificLoanTransfer = transactions.some(
      (candidate) =>
        candidate !== transaction &&
        candidate.type === 'transfer' &&
        candidate.amount === -transaction.amount &&
        isLoanName(candidate.asset) &&
        candidate.asset !== transaction.asset &&
        candidate.asset.includes(transaction.asset)
    );

    return !hasSpecificLoanTransfer;
  });
}

function removeUntrackedAssetTransactions(transactions: Transaction[]): Transaction[] {
  return transactions.filter((transaction) => !isUntrackedAssetName(transaction.asset));
}

function formatExcelDate(value: Date): string {
  const pad = (number: number) => String(number).padStart(2, '0');
  return [
    `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`,
    `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`
  ].join(' ');
}

/**
 * Parses the original Android "편한가계부" Excel backup while tolerating header aliases.
 */
export async function parseEasyMoneyBookExcel(
  filePath: string,
  sourceFile: string
): Promise<Transaction[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.getWorksheet('Sheet1') ?? workbook.worksheets[0];
  if (!sheet) return [];

  const headers = sheet.getRow(1).values as unknown[];
  const headerNames = headers.slice(1).map(cellText);
  const mapped = mapColumns(headerNames);
  if (!mapped.date || !mapped.amount) {
    throw new Error('날짜/금액 컬럼을 찾지 못했습니다. 편한가계부 백업 원본인지 확인해 주세요.');
  }

  const indexByHeader = new Map<string, number>();
  headerNames.forEach((header, index) => {
    if (!indexByHeader.has(header)) {
      indexByHeader.set(header, index + 1);
    }
  });

  const read = (row: ExcelJS.Row, header?: string): unknown => {
    if (!header) return '';
    const index = indexByHeader.get(header);
    return index ? row.getCell(index).value : '';
  };

  const transactions: Transaction[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const rawType = cellText(read(row, mapped.type));
    const amount = cellNumber(read(row, mapped.amount));
    const type = normalizeType(rawType, amount);
    const now = new Date().toISOString();

    transactions.push({
      date: normalizeDate(read(row, mapped.date)),
      amount: signedAmount(rawType, type, amount),
      type,
      category: cellText(read(row, mapped.category)),
      subcategory: cellText(read(row, mapped.subcategory)),
      asset: cellText(read(row, mapped.asset)),
      counterAsset: cellText(read(row, mapped.counterAsset)),
      memo: cellText(read(row, mapped.memo)),
      tag: cellText(read(row, mapped.tag)),
      balance: mapped.balance ? cellNumber(read(row, mapped.balance)) : null,
      merchant: cellText(read(row, mapped.merchant)),
      sourceFile,
      createdAt: now,
      updatedAt: now
    });
  });

  return removeUntrackedAssetTransactions(
    removeDuplicateLoanBalanceAdjustments(
      transactions.filter((transaction) => transaction.date && transaction.amount !== 0)
    )
  );
}
