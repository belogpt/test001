const PLUGIN_SCRIPT_PATH = './vendor/cadesplugin_api.js';

function injectPluginScript() {
  if (document.querySelector('[data-plugin-loader]')) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = PLUGIN_SCRIPT_PATH;
    script.async = true;
    script.dataset.pluginLoader = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Не удалось загрузить cadesplugin_api.js из каталога vendor/.'));
    document.head.appendChild(script);
  });
}

export async function ensurePlugin() {
  if (!window.cadesplugin) {
    await injectPluginScript();
  }

  if (!window.cadesplugin) {
    throw new Error('Плагин CryptoPro не найден. Добавьте cadesplugin_api.js в vendor/.');
  }

  if (typeof window.cadesplugin.then === 'function') {
    await window.cadesplugin;
  }

  return window.cadesplugin;
}

export async function detectPlugin() {
  try {
    await ensurePlugin();
    return { ok: true, message: 'Плагин готов к работе' };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

export async function fetchCertificates() {
  const plugin = await ensurePlugin();
  const store = await plugin.CreateObject('CAdESCOM.Store');
  await store.Open(plugin.CAPICOM_CURRENT_USER_STORE, plugin.CAPICOM_MY_STORE, plugin.CAPICOM_STORE_OPEN_MAXIMUM_ALLOWED);

  const certificates = await store.Certificates;
  const count = await certificates.Count;
  const result = [];

  for (let i = 1; i <= count; i += 1) {
    const cert = await certificates.Item(i);
    const hasKey = await cert.HasPrivateKey();
    if (!hasKey) {
      continue;
    }

    const thumbprint = (await cert.Thumbprint).replace(/\s+/g, '').toUpperCase();
    const subject = await cert.SubjectName;
    const issuer = await cert.IssuerName;
    const validFrom = new Date(await cert.ValidFromDate);
    const validTo = new Date(await cert.ValidToDate);

    result.push({ thumbprint, subject, issuer, validFrom, validTo });
  }

  store.Close();

  return result.sort((a, b) => b.validFrom - a.validFrom);
}

async function findCertificateByThumbprint(thumbprint) {
  const plugin = await ensurePlugin();
  const store = await plugin.CreateObject('CAdESCOM.Store');
  await store.Open(plugin.CAPICOM_CURRENT_USER_STORE, plugin.CAPICOM_MY_STORE, plugin.CAPICOM_STORE_OPEN_MAXIMUM_ALLOWED);

  const certificates = await store.Certificates;
  const filtered = await certificates.Find(plugin.CAPICOM_CERTIFICATE_FIND_SHA1_HASH, thumbprint);
  const matched = (await filtered.Count) > 0 ? await filtered.Item(1) : null;
  store.Close();
  return matched;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function formatDate(date) {
  return date.toLocaleString('ru-RU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatCertificateInfo(cert) {
  if (!cert) {
    return 'Нет данных';
  }

  return [
    `Отпечаток: ${cert.thumbprint}`,
    `Субъект: ${cert.subject}`,
    `Издатель: ${cert.issuer}`,
    `Действителен с: ${formatDate(cert.validFrom)}`,
    `Действителен до: ${formatDate(cert.validTo)}`,
  ].join('\n');
}

export async function signFileWithCertificate(file, thumbprint, detached = false) {
  const plugin = await ensurePlugin();
  const certificate = await findCertificateByThumbprint(thumbprint);

  if (!certificate) {
    throw new Error('Сертификат с указанным отпечатком не найден.');
  }

  const signer = await plugin.CreateObject('CAdESCOM.CPSigner');
  signer.Certificate = certificate;

  const signedData = await plugin.CreateObject('CAdESCOM.CadesSignedData');
  const content = arrayBufferToBase64(await file.arrayBuffer());
  signedData.ContentEncoding = plugin.CADESCOM_BASE64_TO_BINARY;
  signedData.Content = content;

  const signatureType = plugin.CADESCOM_CADES_BES;
  const encodingType = plugin.CADESCOM_ENCODE_BASE64;

  return signedData.SignCades(signer, signatureType, detached, encodingType);
}
