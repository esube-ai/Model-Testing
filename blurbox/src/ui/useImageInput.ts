import { useCallback, useEffect, useRef } from 'react';

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
export const ACCEPT_ATTR = ACCEPTED.join(',');

function pickImage(files: FileList | null | undefined): File | null {
  if (!files) return null;
  for (const f of Array.from(files)) {
    if (ACCEPTED.includes(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name)) return f;
  }
  return files.length ? files[0] : null; // let the worker produce a clear "unsupported" error
}

/** Wires up the three ways to open an image: file picker, drop anywhere on the window, paste. */
export function useImageInput(onFile: (file: File) => void, onDragState: (over: boolean) => void) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onFileRef = useRef(onFile);
  const onDragRef = useRef(onDragState);
  useEffect(() => {
    onFileRef.current = onFile;
    onDragRef.current = onDragState;
  });

  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      onDragRef.current(true);
    };
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) onDragRef.current(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      onDragRef.current(false);
      const file = pickImage(e.dataTransfer?.files);
      if (file) onFileRef.current(file);
    };
    const paste = (e: ClipboardEvent) => {
      if (e.target instanceof Element && e.target.closest('input[type="text"], textarea')) return;
      const file = pickImage(e.clipboardData?.files);
      if (file) {
        e.preventDefault();
        onFileRef.current(file);
      }
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    window.addEventListener('paste', paste);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
      window.removeEventListener('paste', paste);
    };
  }, []);

  const openPicker = useCallback(() => inputRef.current?.click(), []);
  const onInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = pickImage(e.target.files);
    e.target.value = '';
    if (file) onFileRef.current(file);
  }, []);

  return { inputRef, openPicker, onInputChange };
}
