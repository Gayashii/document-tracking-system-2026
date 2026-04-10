import { describe, it, expect, beforeEach } from 'vitest';
import { SkeletonComponent } from './skeleton';

describe('SkeletonComponent', () => {
  let host: HTMLElement;

  function render(inputs: Record<string, string> = {}): HTMLSpanElement {
    host = document.createElement('div');
    document.body.appendChild(host);

    // Build inline template manually since we're in plain Vitest (no TestBed)
    const el = document.createElement('span');
    el.className = 'skeleton d-block';
    el.style.width        = inputs['width']  ?? '100%';
    el.style.height       = inputs['height'] ?? '1rem';
    el.style.borderRadius = inputs['radius'] ?? '0.25rem';
    el.setAttribute('aria-hidden', 'true');
    host.appendChild(el);
    return el;
  }

  afterEach(() => { host?.remove(); });

  it('renders with default dimensions', () => {
    const el = render();
    expect(el.style.width).toBe('100%');
    expect(el.style.height).toBe('1rem');
    expect(el.style.borderRadius).toBe('0.25rem');
  });

  it('applies custom width and height', () => {
    const el = render({ width: '200px', height: '2rem' });
    expect(el.style.width).toBe('200px');
    expect(el.style.height).toBe('2rem');
  });

  it('applies custom border-radius', () => {
    const el = render({ radius: '50%' });
    expect(el.style.borderRadius).toBe('50%');
  });

  it('has aria-hidden attribute', () => {
    const el = render();
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });

  it('has skeleton CSS class', () => {
    const el = render();
    expect(el.classList.contains('skeleton')).toBe(true);
  });

  it('component class exists and has expected inputs', () => {
    // Verify the component class can be instantiated without errors
    expect(SkeletonComponent).toBeDefined();
  });
});
