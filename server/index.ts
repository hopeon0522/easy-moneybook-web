import express from 'express';
import { initDatabase } from './database/db';
import api from './routes/api';
import { AssetRepository } from './repositories/AssetRepository';

const app = express();
const port = Number(process.env.PORT ?? 4000);

initDatabase();
new AssetRepository().normalizeExistingKinds();

app.use(express.json());
app.use('/api', api);
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
  res.status(400).json({ error: message });
});

app.listen(port, '127.0.0.1', () => {
  console.log(`EasyMoneyBook API listening on http://127.0.0.1:${port}`);
});
