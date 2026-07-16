import { readFileSync, writeFileSync } from 'node:fs';

const entries = [
  ['icp4', 'assets/app-icon/EasyMoneyBook.iconset/icon_16x16.png'],
  ['icp5', 'assets/app-icon/EasyMoneyBook.iconset/icon_32x32.png'],
  ['icp6', 'assets/app-icon/EasyMoneyBook.iconset/icon_32x32@2x.png'],
  ['ic07', 'assets/app-icon/EasyMoneyBook.iconset/icon_128x128.png'],
  ['ic08', 'assets/app-icon/EasyMoneyBook.iconset/icon_256x256.png'],
  ['ic09', 'assets/app-icon/EasyMoneyBook.iconset/icon_512x512.png'],
  ['ic10', 'assets/app-icon/EasyMoneyBook.iconset/icon_512x512@2x.png']
];

const chunks = entries.map(([type, path]) => {
  const data = readFileSync(path);
  const header = Buffer.alloc(8);
  header.write(type, 0, 4, 'ascii');
  header.writeUInt32BE(data.length + 8, 4);
  return Buffer.concat([header, data]);
});

const length = chunks.reduce((sum, chunk) => sum + chunk.length, 8);
const header = Buffer.alloc(8);
header.write('icns', 0, 4, 'ascii');
header.writeUInt32BE(length, 4);

writeFileSync('assets/app-icon/EasyMoneyBook.icns', Buffer.concat([header, ...chunks]));
