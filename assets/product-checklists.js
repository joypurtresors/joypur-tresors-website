(() => {
  'use strict';
  for (const picker of document.querySelectorAll('.document-picker')) {
    const select = picker.querySelector('[data-profile-select]');
    const panels = [...picker.querySelectorAll('[data-profile]')];
    if (!select) continue;
    const update = () => {
      const value = ['salaried','business','professional'].includes(select.value) ? select.value : '';
      for (const panel of panels) panel.hidden = panel.dataset.profile !== value;
    };
    select.addEventListener('change', update);
    update();
  }
})();
