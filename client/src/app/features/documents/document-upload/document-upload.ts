import { Component, inject, signal, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { DocumentApiService } from '../../../core/services/api/document-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { FileUploadComponent } from '../../../shared/components/file-upload/file-upload';
import { SpinnerComponent } from '../../../shared/components/spinner/spinner';
import { environment } from '../../../../environments/environment';

interface Lookup { id: number; name: string; }

@Component({
  selector: 'app-document-upload',
  imports: [ReactiveFormsModule, RouterLink, FileUploadComponent, SpinnerComponent],
  templateUrl: './document-upload.html',
})
export class DocumentUpload implements OnInit {
  private readonly docApi = inject(DocumentApiService);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  readonly submitting = signal(false);
  readonly loadingLookups = signal(true);
  readonly documentTypes = signal<Lookup[]>([]);
  readonly departments = signal<Lookup[]>([]);
  selectedFile: File | null = null;

  readonly form = this.fb.group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    document_type_id: [null as number | null, Validators.required],
    department_id: [null as number | null, Validators.required],
    academic_year: [''],
    financial_amount: ['', [Validators.pattern(/^\d+(\.\d{1,2})?$/)]],
  });

  get title() { return this.form.controls.title; }
  get document_type_id() { return this.form.controls.document_type_id; }
  get department_id() { return this.form.controls.department_id; }
  get financial_amount() { return this.form.controls.financial_amount; }

  ngOnInit(): void {
    const base = environment.apiBaseUrl;
    this.http.get<{ data: Lookup[] }>(`${base}/lookups/document-types`).subscribe({
      next: (res) => { this.documentTypes.set(res.data); this.loadingLookups.set(false); },
      error: () => { this.toast.error('Failed to load document types.'); this.loadingLookups.set(false); },
    });
    this.http.get<{ data: Lookup[] }>(`${base}/lookups/departments`).subscribe({
      next: (res) => this.departments.set(res.data),
    });
  }

  onFileSelected(file: File): void {
    this.selectedFile = file;
  }

  submit(): void {
    if (this.form.invalid || !this.selectedFile || this.submitting()) return;
    this.submitting.set(true);

    const v = this.form.value;
    const form = new FormData();
    form.append('file', this.selectedFile);
    form.append('title', v.title!);
    form.append('document_type_id', String(v.document_type_id!));
    form.append('department_id', String(v.department_id!));
    if (v.academic_year) form.append('academic_year', v.academic_year);
    if (v.financial_amount) form.append('financial_amount', v.financial_amount);

    this.http.post<{ success: boolean; data: any }>(`${environment.apiBaseUrl}/documents`, form).subscribe({
      next: (res) => {
        this.toast.success(`Document submitted — ${res.data.reference_number}`);
        this.router.navigate(['/app/documents', res.data.id]);
      },
      error: (err) => {
        this.submitting.set(false);
        this.toast.error(err?.error?.error?.message ?? err?.error?.message ?? 'Upload failed. Please try again.');
      },
    });
  }
}
