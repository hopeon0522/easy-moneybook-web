import { AssetRepository } from '../repositories/AssetRepository';
import { CategoryRepository } from '../repositories/CategoryRepository';
import { TagRepository } from '../repositories/TagRepository';
import { TransactionRepository } from '../repositories/TransactionRepository';
import { parseEasyMoneyBookExcel } from '../parsers/easyMoneyBookParser';
import { ImportFileRepository } from '../repositories/ImportFileRepository';

export class ImportService {
  constructor(
    private readonly transactions = new TransactionRepository(),
    private readonly assets = new AssetRepository(),
    private readonly categories = new CategoryRepository(),
    private readonly tags = new TagRepository(),
    private readonly importFiles = new ImportFileRepository()
  ) {}

  async importExcel(filePath: string, sourceFile: string): Promise<{ count: number; sourceFile: string }> {
    const parsed = await parseEasyMoneyBookExcel(filePath, sourceFile);
    const periods = new Set(parsed.map((tx) => tx.date.slice(0, 7)).filter(Boolean));
    if (periods.size > 1) {
      throw new Error(
        `업로드한 파일에 ${[...periods].join(', ')} 데이터가 함께 들어 있습니다. 월별 관리를 위해 한 파일에는 한 달 거래만 포함해 주세요.`
      );
    }
    this.transactions.replaceSourceFile(sourceFile, parsed);
    this.importFiles.upsert({
      sourceFile,
      storedPath: filePath,
      transactionCount: parsed.length,
      firstDate: parsed.at(-1)?.date ?? '',
      lastDate: parsed[0]?.date ?? ''
    });
    this.assets.upsertMany(parsed.flatMap((tx) => [tx.asset, tx.counterAsset]));
    if (parsed.some((tx) => /자산\s*미반영/.test(`${tx.asset} ${tx.counterAsset} ${tx.category}`))) {
      this.assets.ensureCalculationExcluded('자산미반영');
    }
    this.categories.upsertMany(
      parsed.map((tx) => ({ name: tx.category, parentName: tx.subcategory, type: tx.type }))
    );
    this.tags.upsertMany(parsed.flatMap((tx) => tx.tag.split(/[,\s#]+/).filter(Boolean)));
    this.assets.deleteUnusedZeroInitialAssets();
    this.categories.deleteUnused();
    this.tags.deleteUnused();
    return { count: parsed.length, sourceFile };
  }
}
