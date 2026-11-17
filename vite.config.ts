import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// 배포된 버전을 화면이 확인할 수 있도록 dist/version.json 을 만듭니다 (src/components/UpdateNotice.tsx 참고).
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
function emitVersion(): Plugin {
  return {
    name: 'emit-version-json',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: pkg.version, builtAt: new Date().toISOString() }) });
    }
  };
}

// 라이브러리를 앱 코드와 다른 파일로 나눕니다. 앱만 바뀐 배포에서는 브라우저가 라이브러리 파일을 캐시에서 재사용합니다.
// 묶음 사이에 순환 참조가 생기지 않도록 3개로만 나눕니다: react 코어(다른 라이브러리를 참조하지 않음), exceljs(독립 번들), 나머지 라이브러리.
const reactCore = /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/;
const excel = /[\\/]node_modules[\\/]exceljs[\\/]/;

export default defineConfig({
  base: './',
  plugins: [react(), emitVersion()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (excel.test(id)) return 'vendor-excel';
          if (reactCore.test(id)) return 'vendor-react';
          return 'vendor';
        }
      }
    }
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:4000'
    }
  }
});
