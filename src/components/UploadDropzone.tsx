import { useState } from 'react';

interface UploadDropzoneProps {
  onUpload: (file: File) => Promise<void>;
  compact?: boolean;
}

export function UploadDropzone({ onUpload, compact = false }: UploadDropzoneProps) {
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState('');

  async function handleFile(file?: File) {
    if (!file) return;
    setMessage('업로드 중...');
    try {
      await onUpload(file);
      setMessage(`${file.name} 업로드 완료`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '업로드 실패';
      setMessage(message);
      window.alert(message);
    }
  }

  if (compact) {
    return (
      <label
        className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 text-sm font-semibold transition ${
          dragging
            ? 'border-[#2f8cff] bg-blue-50 text-[#2f8cff] dark:bg-blue-950'
            : 'border-zinc-300 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200'
        }`}
        title={message || '편한가계부 xlsx 백업 업로드'}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void handleFile(event.dataTransfer.files[0]);
        }}
      >
        <input
          className="hidden"
          type="file"
          accept=".xlsx"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
        <span aria-hidden="true">⬆</span>
        <span>업로드</span>
      </label>
    );
  }

  return (
    <label
      className={`flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center transition ${
          dragging
          ? 'border-[#2f8cff] bg-blue-50 text-[#2f8cff] dark:bg-blue-950'
          : 'border-zinc-300 bg-white text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'
      }`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void handleFile(event.dataTransfer.files[0]);
      }}
    >
      <input
        className="hidden"
        type="file"
        accept=".xlsx"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />
      <span className="text-sm font-semibold">편한가계부 xlsx 백업 업로드</span>
      <span className="mt-1 text-xs text-zinc-500">클릭하거나 파일을 끌어다 놓으세요.</span>
      {message && <span className="mt-3 text-xs">{message}</span>}
    </label>
  );
}
