import { Router } from 'express';
import multer from 'multer';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { AssetRepository } from '../repositories/AssetRepository';
import { CategoryRepository } from '../repositories/CategoryRepository';
import { TagRepository } from '../repositories/TagRepository';
import { TransactionRepository } from '../repositories/TransactionRepository';
import { ImportFileRepository } from '../repositories/ImportFileRepository';
import { ManualNetWorthRepository } from '../repositories/ManualNetWorthRepository';
import { SettingsRepository } from '../repositories/SettingsRepository';
import { AnalyticsService } from '../services/AnalyticsService';
import { ImportService } from '../services/ImportService';

const uploadDir = resolve(process.cwd(), 'uploads');
mkdirSync(uploadDir, { recursive: true });

const upload = multer({ dest: uploadDir });
const router = Router();
const importService = new ImportService();
const analytics = new AnalyticsService();
const transactions = new TransactionRepository();
const assets = new AssetRepository();
const categories = new CategoryRepository();
const tags = new TagRepository();
const importFiles = new ImportFileRepository();
const settings = new SettingsRepository();
const manualNetWorth = new ManualNetWorthRepository();

router.post('/imports/excel', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw new Error('xlsx 파일을 업로드해 주세요.');
    const result = await importService.importExcel(req.file.path, req.file.originalname);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/imports/:sourceFile/replace', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw new Error('수정할 xlsx 파일을 업로드해 주세요.');
    const sourceFile = decodeURIComponent(String(req.params.sourceFile));
    const result = await importService.importExcel(req.file.path, sourceFile);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/dashboard', (_req, res) => {
  res.json(analytics.dashboard());
});

router.get('/settings', (_req, res) => {
  res.json(settings.get());
});

router.patch('/settings', (req, res) => {
  res.json(settings.update(req.body));
});

router.get('/manual-net-worth', (_req, res) => {
  res.json(manualNetWorth.all());
});

router.post('/manual-net-worth', (req, res) => {
  res.json(manualNetWorth.create({ period: req.body.period?.toString() ?? '', amount: Number(req.body.amount) }));
});

router.delete('/manual-net-worth/:id', (req, res) => {
  manualNetWorth.delete(Number(req.params.id));
  res.json({ ok: true });
});

router.get('/transactions', (req, res) => {
  res.json(
    transactions.find({
      q: req.query.q?.toString(),
      from: req.query.from?.toString(),
      to: req.query.to?.toString(),
      category: req.query.category?.toString(),
      asset: req.query.asset?.toString(),
      tag: req.query.tag?.toString(),
      period: req.query.period?.toString(),
      sourceFile: req.query.sourceFile?.toString(),
      type: req.query.type?.toString() as 'income' | 'expense' | 'transfer',
      minAmount: req.query.minAmount ? Number(req.query.minAmount) : undefined,
      maxAmount: req.query.maxAmount ? Number(req.query.maxAmount) : undefined,
      sortBy: req.query.sortBy?.toString() as 'date' | 'amount' | 'createdAt' | 'updatedAt',
      sortDir: req.query.sortDir?.toString() as 'asc' | 'desc',
      limit: req.query.limit ? Number(req.query.limit) : undefined
    })
  );
});

router.get('/periods', (_req, res) => {
  res.json(transactions.periods());
});

router.get('/metadata', (_req, res) => {
  res.json({
    assets: assets.all(),
    categories: categories.all(),
    tags: tags.all()
  });
});

router.patch('/assets/:id', (req, res) => {
  assets.update({
    id: Number(req.params.id),
    kind: req.body.kind,
    initialValue: Number(req.body.initialValue ?? 0),
    isHidden: Boolean(req.body.isHidden),
    isArchived: Boolean(req.body.isArchived),
    linkedAsset: req.body.linkedAsset?.toString() ?? '',
    sortOrder: Number(req.body.sortOrder ?? 0)
  });
  res.json({ ok: true });
});

router.get('/statistics', (_req, res) => {
  res.json(analytics.statistics());
});

router.get('/categories/monthly', (req, res) => {
  const type = req.query.type === 'income' ? 'income' : 'expense';
  res.json(analytics.categoryExpense(req.query.period?.toString(), type));
});

router.get('/imports', (_req, res) => {
  res.json(importFiles.all());
});

router.delete('/imports/:sourceFile', (req, res) => {
  const sourceFile = decodeURIComponent(String(req.params.sourceFile));
  transactions.deleteSourceFile(sourceFile);
  importFiles.delete(sourceFile);
  assets.deleteUnusedZeroInitialAssets();
  categories.deleteUnused();
  tags.deleteUnused();
  res.json({ ok: true });
});

export default router;
