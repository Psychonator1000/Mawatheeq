// The app's lists are type-to-filter boxes (components/filter-select.tsx), not native <select> elements. This lets the
// UI tests keep using Playwright's selectOption() and inputValue() on them: a value picks the option with that value,
// {label} the option with that text and {index} the nth option; inputValue() returns the chosen value.
export function supportFilterSelects(anyLocator) {
  const proto = Object.getPrototypeOf(anyLocator);
  if (proto.__filterSelects) return;
  proto.__filterSelects = true;
  const nativeSelect = proto.selectOption, nativeValue = proto.inputValue;
  const isList = loc => loc.evaluate(e => e.tagName === 'INPUT' && e.getAttribute('role') === 'combobox' && e.hasAttribute('data-value'));
  proto.selectOption = async function (value, options) {
    if (!(await isList(this))) return nativeSelect.call(this, value, options);
    await this.click();
    // The open list is drawn outside the box (in its window or the page); the box names it in aria-controls.
    const box = this.page().locator('#' + (await this.getAttribute('aria-controls')).replace(/:/g, '\\:'));
    const all = box.locator('[role=option]');
    const quote = s => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
    const target = typeof value === 'object' && value && 'index' in value ? all.nth(value.index)
      : typeof value === 'object' && value && 'label' in value ? all.filter({ has: this.page().locator('b', { hasText: value.label }) }).first()
      : box.locator(`[role=option][data-value=${quote(typeof value === 'object' ? value.value : value)}]`);
    await target.click();
    return [await this.getAttribute('data-value')];
  };
  proto.inputValue = async function (options) {
    if (await isList(this).catch(() => false)) return (await this.getAttribute('data-value')) ?? '';
    return nativeValue.call(this, options);
  };
}
