import { checkCades, fetchCertificates, formatCertificateInfo, signFileWithCertificate } from './signing.js';

const statusEl = document.getElementById('plugin-status');
const certificateSelect = document.getElementById('certificate-select');
const certificateInfo = document.getElementById('certificate-info');
const refreshButton = document.getElementById('refresh-certificates');
const signButton = document.getElementById('sign-button');
const resetButton = document.getElementById('reset-button');
const fileInput = document.getElementById('file-input');
const detachedToggle = document.getElementById('detached-toggle');
const signatureOutput = document.getElementById('signature-output');
const downloadButton = document.getElementById('download-signature');
const statusDetails = document.getElementById('status-details');

let certificates = [];

function setStatus(text, level = 'neutral') {
  statusEl.textContent = text;
  statusEl.className = `status status--${level}`;
}

function setCertificateOptions(items) {
  certificateSelect.innerHTML = '';
  if (!items.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Сертификаты не найдены';
    certificateSelect.appendChild(option);
    return;
  }

  items.forEach((cert) => {
    const option = document.createElement('option');
    option.value = cert.thumbprint;
    option.textContent = `${cert.subject} (до ${cert.validTo.toLocaleDateString('ru-RU')})`;
    certificateSelect.appendChild(option);
  });
}

function renderStatusDetails(state) {
  if (!statusDetails) {
    return;
  }

  statusDetails.innerHTML = '';

  const items = state?.details?.length
    ? state.details
    : [{ label: 'Состояние', value: state?.message || 'Нет данных' }];

  items.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'status-item';

    const label = document.createElement('strong');
    label.textContent = item.label;
    const value = document.createElement('div');
    value.textContent = item.value;

    row.append(label, value);
    statusDetails.appendChild(row);
  });

  if (state?.hints?.length) {
    const hintsList = document.createElement('ul');
    hintsList.className = 'instructions';
    state.hints.forEach((hint) => {
      const li = document.createElement('li');
      li.textContent = hint;
      hintsList.appendChild(li);
    });
    statusDetails.appendChild(hintsList);
  }
}

function showCertificateInfo(thumbprint) {
  const cert = certificates.find((item) => item.thumbprint === thumbprint);
  certificateInfo.textContent = formatCertificateInfo(cert);
}

async function refreshCertificates() {
  setStatus('Читаем сертификаты...', 'neutral');
  certificateInfo.textContent = 'Нет данных';
  try {
    certificates = await fetchCertificates();
    setCertificateOptions(certificates);
    if (!certificates.length) {
      setStatus('Сертификаты не найдены', 'warn');
    } else {
      setStatus('Плагин готов. Выберите сертификат.', 'ok');
      showCertificateInfo(certificates[0].thumbprint);
    }
  } catch (error) {
    console.error(error);
    setStatus(error.message, 'error');
    setCertificateOptions([]);
  }
}

function resetForm() {
  fileInput.value = '';
  detachedToggle.checked = false;
  signatureOutput.value = '';
  downloadButton.disabled = true;
}

function ensureSignatureReady(signature, fileName) {
  signatureOutput.value = signature;
  downloadButton.disabled = false;
  downloadButton.dataset.fileName = fileName || 'signature.sig';
}

async function handleSign() {
  const thumbprint = certificateSelect.value;
  const [file] = fileInput.files;

  if (!thumbprint) {
    setStatus('Выберите сертификат для подписи', 'warn');
    return;
  }

  if (!file) {
    setStatus('Выберите файл для подписи', 'warn');
    return;
  }

  setStatus('Формируем подпись...', 'neutral');
  signButton.disabled = true;

  try {
    const signature = await signFileWithCertificate(file, thumbprint, detachedToggle.checked);
    ensureSignatureReady(signature, `${file.name}.sig`);
    setStatus('Подпись создана', 'ok');
  } catch (error) {
    console.error(error);
    setStatus(error.message, 'error');
  } finally {
    signButton.disabled = false;
  }
}

function downloadSignature() {
  const signature = signatureOutput.value;
  if (!signature) {
    return;
  }
  const fileName = downloadButton.dataset.fileName || 'signature.sig';
  const blob = new Blob([signature], { type: 'text/plain;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function init() {
  const pluginState = await checkCades();
  setStatus(pluginState.message, pluginState.ok ? 'ok' : 'error');
  renderStatusDetails(pluginState);

  if (pluginState.ok) {
    await refreshCertificates();
  }
}

certificateSelect.addEventListener('change', (event) => {
  showCertificateInfo(event.target.value);
});

refreshButton.addEventListener('click', () => refreshCertificates());
resetButton.addEventListener('click', resetForm);
signButton.addEventListener('click', () => handleSign());
downloadButton.addEventListener('click', downloadSignature);

init();
