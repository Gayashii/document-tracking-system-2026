import { Component, output, signal, HostListener } from '@angular/core';

const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

@Component({
  selector: 'app-file-upload',
  templateUrl: './file-upload.html',
})
export class FileUploadComponent {
  readonly fileSelected = output<File>();

  readonly dragOver = signal(false);
  readonly selectedFile = signal<File | null>(null);
  readonly error = signal<string | null>(null);

  @HostListener('dragover', ['$event'])
  onDragOver(e: DragEvent): void {
    e.preventDefault();
    this.dragOver.set(true);
  }

  @HostListener('dragleave')
  onDragLeave(): void {
    this.dragOver.set(false);
  }

  @HostListener('drop', ['$event'])
  onDrop(e: DragEvent): void {
    e.preventDefault();
    this.dragOver.set(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) this.processFile(file);
  }

  onFileInput(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.processFile(file);
  }

  private processFile(file: File): void {
    this.error.set(null);
    if (!ACCEPTED_TYPES.includes(file.type)) {
      this.error.set('Only PDF, JPEG, and PNG files are allowed.');
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      this.error.set('File size must not exceed 10 MB.');
      return;
    }
    this.selectedFile.set(file);
    this.fileSelected.emit(file);
  }

  clear(): void {
    this.selectedFile.set(null);
    this.error.set(null);
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
