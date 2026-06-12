(function () {
  const form = document.getElementById('contact-request-form');
  const messageTypeSelect = document.getElementById('message-type-select');

  if (!form) return;

  function loadJsPDF(callback) {
    const script = document.createElement('script');
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    script.onload = callback;
    document.body.appendChild(script);
  }

  function buildPayload() {
    return {
      fullName: form.fullName.value.trim(),
      company: form.company.value.trim(),
      jobTitle: form.jobTitle.value.trim(),
      email: form.email.value.trim(),
      messageType: form.messageType.value,
      serviceModule: form.serviceModule ? form.serviceModule.value.trim() : '',
      details: form.details ? form.details.value.trim() : ''
    };
  }

  function validate(payload) {
    return payload.fullName && payload.company && payload.jobTitle && payload.email && payload.messageType;
  }

  function generatePDF(payload) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.text("Compliance Request", 20, 20);

    doc.setFontSize(11);
    let y = 35;

    const addLine = (label, value) => {
      doc.text(`${label}: ${value || '-'}`, 20, y);
      y += 8;
    };

    addLine("Full Name", payload.fullName);
    addLine("Company", payload.company);
    addLine("Job Title", payload.jobTitle);
    addLine("Email", payload.email);
    addLine("Message Type", payload.messageType);
    addLine("Service Module", payload.serviceModule);

    y += 4;
    doc.text("Details:", 20, y);
    y += 6;

    const splitText = doc.splitTextToSize(payload.details || '-', 170);
    doc.text(splitText, 20, y);

    doc.save("compliance-request.pdf");
  }

  function openEmail(payload) {
    const to = "michael.sewalt@protiviti.com"; // change this

    const subject = encodeURIComponent("Compliance Request");

    const body = encodeURIComponent(
      `Please find the attached request form.

Summary:
${payload.fullName} - ${payload.company}`
    );

    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
  }

  function handleSubmit(e) {
    e.preventDefault();

    const payload = buildPayload();

    if (!validate(payload)) {
      alert("Please complete all required fields.");
      return;
    }

    if (!window.jspdf) {
      loadJsPDF(() => {
        generatePDF(payload);
        openEmail(payload);
      });
    } else {
      generatePDF(payload);
      openEmail(payload);
    }
  }

  form.addEventListener('submit', handleSubmit);
})();
