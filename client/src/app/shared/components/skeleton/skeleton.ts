import { Component, input } from '@angular/core';

@Component({
  selector: 'app-skeleton',
  template: `
    <span
      class="skeleton d-block"
      [style.width]="width()"
      [style.height]="height()"
      [style.border-radius]="radius()"
      [attr.aria-hidden]="true"
    ></span>
  `,
})
export class SkeletonComponent {
  readonly width  = input<string>('100%');
  readonly height = input<string>('1rem');
  readonly radius = input<string>('0.25rem');
}
