import { parseEasyMoneyBookExcel } from './easyMoneyBookParser';

const filePath = process.argv[2];
if (!filePath) {
  throw new Error('Usage: tsx server/parsers/easyMoneyBookParser.test-runner.ts <xlsx>');
}

const transactions = await parseEasyMoneyBookExcel(filePath, 'sample.xlsx');
console.log(
  JSON.stringify(
    {
      count: transactions.length,
      first: transactions[0],
      last: transactions.at(-1)
    },
    null,
    2
  )
);
