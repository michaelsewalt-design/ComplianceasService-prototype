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
  let lastFocusedElement = null;

  if (!modal || !form) return;

  function getModuleTitles() {
    const titleNodes = document.querySelectorAll('#modules .module-card h3, #roadmap .module-card h3');
    const titles = Array.from(titleNodes)
      .map((node) => node.textContent.trim())
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

  async function handleSubmit(event) {
    event.preventDefault();
    updateConditionalFields();
    setStatus('', '');

    if (!form.reportValidity()) {
      setStatus('Please complete the required fields before submitting.', 'error');
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    const payload = {
      fullName: form.fullName.value.trim(),
      company: form.company.value.trim(),
      jobTitle: form.jobTitle.value.trim(),
      email: form.email.value.trim(),
      messageType: form.messageType.value,
      serviceModule: form.serviceModule ? form.serviceModule.value.trim() : '',
      details: form.details ? form.details.value.trim() : '',
      sourcePage: window.location.pathname,
      submittedAt: new Date().toISOString()
    };

    try {
      submitButton.disabled = true;
      submitButton.textContent = 'Submitting...';

      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || 'Unable to submit your request.');
      }

      setStatus('Your request has been submitted successfully.', 'success');
      form.reset();
      updateConditionalFields();
    } catch (error) {
      setStatus(error.message || 'Unable to submit your request.', 'error');
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'Submit request';
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
