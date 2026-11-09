(() => {
  'use strict';
  const service = new URLSearchParams(window.location.search).get('service');
  const select = document.getElementById('loanType');
  if (!select || !['Home Loan','Business Loan','Mortgage Loan','OD / CC','BG / LRD','Personal Loan','Auto Loan'].includes(service)) return;
  if ([...select.options].some(option => option.value === service)) select.value = service;
})();
