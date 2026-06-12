(function () {
  const modal = document.getElementById('contact-modal');
  const form = document.getElementById('contact-request-form');
  const openButtons = document.querySelectorAll('[data-open-contact-modal]');
  const closeButtons = document.querySelectorAll('[data-close-contact-modal]');
  const messageTypeSelect = document.getElementById('message-type-select');
  const moduleRequestBlock = document.getElementById('module-request-block');
  const messageBoxBlock = document.getElementById('message-box-block');
  const serviceModuleSelect = document.getElementById('service-module-select');
  const detailsTextarea = document.getElementById('details-textarea');
  const messageBoxLabel = document.getElementById('message-box-label');
  const statusEl = document.getElementById('contact-form-status');

  if (!modal || !form || !messageTypeSelect || !moduleRequestBlock || !messageBoxBlock || !serviceModuleSelect || !detailsTextarea || !messageBoxLabel || !statusEl) {
    console.error('Contact form script: required DOM elements not found.');
    return;
  }

  const CONTACT_EMAIL = 'michael.sewalt@protiviti.com'; // <-- change this
  let lastFocusedElement = null;
  let jspdfLoadingPromise = null;

  function getModuleTitles() {
    const titleNodes = document.querySelectorAll('#modules .module-card h3, #roadmap .module-card h3');
    const titles = Array.from(titleNodes)
      .map((node) => (node.textContent || '').trim())
      .filter(Boolean);

    return Array.from(new Set(titles));
  }

  function populateModuleOptions() {
    const modules = getModuleTitles();
    const currentValue = serviceModuleSelect.value;

    serviceModuleSelect.innerHTML = '<option value="">Select a service module</option>';

    modules.forEach((moduleName) => {
      const option = document.createElement('option');
      option.value = moduleName;
      option.textContent = moduleName;
      serviceModuleSelect.appendChild(option);
    });

    if (modules.includes(currentValue)) {
      serviceModuleSelect.value = currentValue;
    }
  }

  function setStatus(message, type) {
    statusEl.textContent = message || '';
    statusEl.classList.remove('is-error', 'is-success');
    if (type === 'error') statusEl.classList.add('is-error');
    if (type === 'success') statusEl.classList.add('is-success');
  }

  function updateConditionalFields() {
    const value = messageTypeSelect.value;

    moduleRequestBlock.hidden = value !== 'access';
    messageBoxBlock.hidden = !(value === 'advisory' || value === 'suggestion');

    serviceModuleSelect.required = value === 'access';
    detailsTextarea.required = value === 'advisory' || value === 'suggestion';

    if (value === 'advisory') {
      messageBoxLabel.textContent = 'Advisory request details';
      detailsTextarea.placeholder = 'Please describe your advisory request.';
    } else if (value === 'suggestion') {
      messageBoxLabel.textContent = 'Suggestion details';
      detailsTextarea.placeholder = 'Please describe your service-module suggestion.';
    } else {
      messageBoxLabel.textContent = 'Request details';
      detailsTextarea.placeholder = 'Please provide the details of your request.';
    }
  }

  function openModal() {
    lastFocusedElement = document.activeElement;
    populateModuleOptions();
    updateConditionalFields();
    setStatus('', '');
    modal.hidden = false;
    document.body.classList.add('contact-modal-open');
    const firstInput = form.querySelector('input, select, textarea, button');
    if (firstInput) firstInput.focus();
  }

  function closeModal() {
    modal.hidden = true;
    document.body.classList.remove('contact-modal-open');
    setStatus('', '');
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus();
    }
  }

  function buildPayload() {
    return {
      fullName: (form.fullName?.value || '').trim(),
      company: (form.company?.value || '').trim(),
      jobTitle: (form.jobTitle?.value || '').trim(),
      email: (form.email?.value || '').trim(),
      messageType: (form.messageType?.value || '').trim(),
      serviceModule: (form.serviceModule?.value || '').trim(),
      details: (form.details?.value || '').trim(),
      sourcePage: window.location.pathname,
      submittedAt: new Date().toISOString()
    };
  }

  function validatePayload(payload) {
    if (!payload.fullName || !payload.company || !payload.jobTitle || !payload.email || !payload.messageType) {
      return 'Please complete the required fields before continuing.';
    }

    if (payload.messageType === 'access' && !payload.serviceModule) {
      return 'Please select a service module.';
    }

    if ((payload.messageType === 'advisory' || payload.messageType === 'suggestion') && !payload.details) {
      return 'Please provide the requested details.';
    }

    return '';
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function downloadTextFallback(payload) {
    const content = [
      'Compliance Request',
      '==================',
      '',
      `Full Name: ${payload.fullName}`,
      `Company: ${payload.company}`,
      `Job Title: ${payload.jobTitle}`,
      `Email: ${payload.email}`,
      `Message Type: ${payload.messageType}`,
      `Service Module: ${payload.serviceModule || '-'}`,
      '',
      'Details:',
      payload.details || '-',
      '',
      `Submitted At: ${payload.submittedAt}`,
      `Source Page: ${payload.sourcePage}`
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'compliance-request.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function loadJsPDF() {
    if (window.jspdf && window.jspdf.jsPDF) {
      return Promise.resolve(window.jspdf.jsPDF);
    }

    if (jspdfLoadingPromise) return jspdfLoadingPromise;

    jspdfLoadingPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-jspdf-loader="true"]');
      if (existing) {
        existing.addEventListener('load', () => {
          if (window.jspdf && window.jspdf.jsPDF) resolve(window.jspdf.jsPDF);
          else reject(new Error('jsPDF loaded but unavailable.'));
        }, { once: true });
        existing.addEventListener('error', () => reject(new Error('Unable to load jsPDF.')), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      script.async = true;
      script.dataset.jspdfLoader = 'true';
      script.onload = () => {
        if (window.jspdf && window.jspdf.jsPDF) resolve(window.jspdf.jsPDF);
        else reject(new Error('jsPDF loaded but unavailable.'));
      };
      script.onerror = () => reject(new Error('Unable to load jsPDF.'));
      document.head.appendChild(script);
    });

    return jspdfLoadingPromise;
  }

  async function generatePdf(payload) {
    const jsPDF = await loadJsPDF();
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 48;
    const maxWidth = pageWidth - (margin * 2);
    let y = 56;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('Compliance Request', margin, y);
    y += 28;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Submitted: ${payload.submittedAt}`, margin, y);
    y += 24;

    const rows = [
      ['Full Name', payload.fullName],
      ['Company', payload.company],
      ['Job Title', payload.jobTitle],
      ['Email', payload.email],
      ['Message Type', payload.messageType],
      ['Service Module', payload.serviceModule || '-'],
      ['Source Page', payload.sourcePage || '-']
    ];

    doc.setFontSize(11);
    rows.forEach(([label, value]) => {
      doc.setFont('helvetica', 'bold');
      doc.text(`${label}:`, margin, y);
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(String(value || '-'), maxWidth - 110);
      doc.text(lines, margin + 110, y);
      y += Math.max(18, lines.length * 14);
    });

    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.text('Details:', margin, y);
    y += 16;
    doc.setFont('helvetica', 'normal');
    const detailLines = doc.splitTextToSize(payload.details || '-', maxWidth);
    doc.text(detailLines, margin, y);

    doc.save('compliance-request.pdf');
  }

  function openEmailDraft(payload) {
    const subject = encodeURIComponent(`Compliance Request - ${payload.messageType}`);
    const body = encodeURIComponent([
      'Please find the attached request form.',
      '',
      'Summary',
      `Full Name: ${payload.fullName}`,
      `Company: ${payload.company}`,
      `Job Title: ${payload.jobTitle}`,
      `Email: ${payload.email}`,
      `Message Type: ${payload.messageType}`,
      `Service Module: ${payload.serviceModule || '-'}`,
      '',
      'Details',
      payload.details || '-',
      '',
      'The PDF has been downloaded locally and can be attached before sending.'
    ].join('\n'));

    window.location.href = `mailto:${encodeURIComponent(CONTACT_EMAIL)}?subject=${subject}&body=${body}`;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    updateConditionalFields();
    setStatus('', '');

    if (!form.reportValidity()) {
      setStatus('Please complete the required fields before continuing.', 'error');
      return;
    }

    const payload = buildPayload();
    const validationMessage = validatePayload(payload);

    if (validationMessage) {
      setStatus(validationMessage, 'error');
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Preparing...';
    }

    try {
      await generatePdf(payload);
      openEmailDraft(payload);
      setStatus('PDF downloaded and email draft opened. Attach the PDF and send the email.', 'success');
    } catch (error) {
      console.error(error);
      downloadTextFallback(payload);
      openEmailDraft(payload);
      setStatus('PDF generation was unavailable. A text file was downloaded and an email draft was opened instead.', 'error');
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Submit request';
      }
    }
  }

  openButtons.forEach((button) => button.addEventListener('click', openModal));
  closeButtons.forEach((button) => button.addEventListener('click', closeModal));
  messageTypeSelect.addEventListener('change', updateConditionalFields);
  form.addEventListener('submit', handleSubmit);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) {
      closeModal();
    }
  });
})();
