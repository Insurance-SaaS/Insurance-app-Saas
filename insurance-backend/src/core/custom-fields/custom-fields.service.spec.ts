import { CustomFieldsService } from './custom-fields.service';

describe('CustomFieldsService validation patterns', () => {
  // Only the pattern check is exercised; it needs none of the service's dependencies.
  const service = Object.create(CustomFieldsService.prototype) as CustomFieldsService;
  const compile = (pattern: string): RegExp | null => (service as any).compilePattern(pattern);

  it.each([
    ['a licence plate', '^[A-Z]{2}\\d{6}$'],
    ['a repeated group of fixed size', '^(\\d{3}-)+\\d{4}$'],
    ['repetition characters used as literals', '^([+*])+$'],
    ['a repeated choice', '^(ab|cd)+$'],
    ['escaped parentheses', '^\\(a+\\)+$'],
  ])('accepts %s', (_name, pattern) => {
    expect(compile(pattern)).toBeInstanceOf(RegExp);
  });

  it.each([
    ['a repeated group that repeats inside', '(a+)+'],
    ['the same hidden one level down', '((a+))+'],
    ['star in star', '(a*)*'],
    ['an open-ended count inside', '(a{1,})+'],
    ['a counted repetition of a repeating group', '(a+){2,}'],
    ['the classic word-list shape', '^(\\w+\\s?)*$'],
    ['a backreference', '(a)\\1'],
    ['something that is not a pattern', '('],
    ['a pattern longer than 200 characters', 'a'.repeat(201)],
  ])('refuses %s', (_name, pattern) => {
    expect(compile(pattern)).toBeNull();
  });

  it('stays fast on input built to stall a nested repetition', () => {
    // The pattern that was refused above would take minutes on this input.
    const started = Date.now();
    expect(compile('^(a|b)+$')!.test('ab'.repeat(500) + '!')).toBe(false);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
