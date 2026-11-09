(() => {
  'use strict';
  const key = document.body.dataset.serviceKey;
  if (!['home_loans','business_loans','mortgage_loans','od_cc','bg_lrd','personal_auto'].includes(key)) return;
  fetch('/api/public-content', {cache:'no-store',headers:{Accept:'application/json'}})
    .then(response => response.ok && (response.headers.get('content-type') || '').includes('application/json') ? response.json() : null)
    .then(data => {
      if (!data?.success || !data.services) return;
      for (const [suffix,selector] of [['title','[data-product-title]'],['description','[data-product-description]']]) {
        const value = data.services[key + '_' + suffix];
        if (typeof value === 'string' && value.trim()) document.querySelector(selector).textContent = value.trim();
      }
    }).catch(() => {});
})();
