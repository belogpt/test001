function normalizeVersion(version) {
  if (!version) {
    return '';
  }

  if (typeof version === 'string') {
    return version;
  }

  if (typeof version.toString === 'function') {
    return version.toString();
  }

  const parts = ['Major', 'Minor', 'Build']
    .map((key) => version[key])
    .filter((value) => typeof value !== 'undefined');

  return parts.join('.');
}

export async function checkCades() {
  if (window.location.protocol === 'file:') {
    return {
      ok: false,
      message: 'Запуск через file:// отключает доступ к плагину. Запустите приложение через http://localhost.',
      details: [
        { label: 'Протокол', value: 'file://' },
        { label: 'Инициализация API', value: 'Не выполняется в file:// режиме' },
      ],
      hints: [
        'Запустите "npm install" и "npm start" чтобы открыть приложение по http://localhost:8080.',
        'В Chrome/Edge включите «Разрешить доступ к URL файлов» для расширения CryptoPro только в крайнем случае.',
      ],
    };
  }

  if (!window.cadesplugin) {
    return {
      ok: false,
      message: 'cadesplugin_api.js не загружен или API не создан.',
      details: [
        { label: 'Инициализация API', value: 'Не обнаружен window.cadesplugin' },
      ],
      hints: [
        'Проверьте, что расширение CryptoPro установлено и включено.',
        'Убедитесь, что cadesplugin_api.js лежит рядом с index.html и загружается без ошибок.',
      ],
    };
  }

  let plugin = window.cadesplugin;

  try {
    if (typeof plugin.then === 'function') {
      plugin = await plugin;
    }

    const about = await plugin.CreateObject('CAdESCOM.About');
    const version = normalizeVersion(await about.PluginVersion);

    return {
      ok: true,
      message: 'CryptoPro API доступен',
      details: [
        { label: 'Протокол', value: window.location.protocol },
        { label: 'Версия плагина', value: version || 'н/д' },
        { label: 'Origin', value: window.location.origin },
      ],
      plugin,
    };
  } catch (error) {
    const msg = window.cadesplugin && typeof window.cadesplugin.getLastError === 'function'
      ? window.cadesplugin.getLastError(error)
      : String(error);

    return {
      ok: false,
      message: `Ошибка инициализации CryptoPro: ${msg}`,
      details: [
        { label: 'Инициализация API', value: msg },
        { label: 'Origin', value: window.location.origin },
      ],
      hints: [
        'Убедитесь, что страница открыта с http://localhost, а не по file://.',
        'Проверьте, что cadesplugin_api.js загружен из того же каталога, что и index.html.',
      ],
    };
  }
}

export async function ensurePlugin() {
  const result = await checkCades();

  if (!result.ok) {
    throw new Error(result.message);
  }

  return result.plugin || window.cadesplugin;
}

export async function detectPlugin() {
  return checkCades();
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
