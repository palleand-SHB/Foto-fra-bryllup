// netlify/functions/list-photos.js
// Returnerer KUN metadata (navn, sti, dato) for alle filer i Dropbox-mappen.
// Ingen get_temporary_link kald → lynhurtigt og ingen timeout-risiko.

const DROPBOX_FOLDER = '/Bryllup-Mette-og-Palle';

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const clientId     = process.env.DROPBOX_CLIENT_ID;
  const clientSecret = process.env.DROPBOX_CLIENT_SECRET;
  const refreshToken = process.env.DROPBOX_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Miljøvariable mangler.' }) };
  }

  try {
    // 1. Hent access token
    const tokenParams = new URLSearchParams();
    tokenParams.append('grant_type', 'refresh_token');
    tokenParams.append('refresh_token', refreshToken);
    tokenParams.append('client_id', clientId);
    tokenParams.append('client_secret', clientSecret);

    const tokenRes  = await fetch('https://api.dropbox.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString()
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) return { statusCode: 500, headers, body: JSON.stringify({ error: tokenData.error_description }) };

    const accessToken = tokenData.access_token;

    // 2. List alle filer rekursivt med paginering
    let allEntries = [];
    let cursor = null;

    const firstRes  = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: DROPBOX_FOLDER, recursive: true, include_media_info: false, limit: 2000 })
    });
    if (!firstRes.ok) {
      const err = await firstRes.text();
      return { statusCode: firstRes.status, headers, body: JSON.stringify({ error: err }) };
    }
    const firstData = await firstRes.json();
    allEntries = firstData.entries;
    cursor     = firstData.cursor;

    while (firstData.has_more && cursor) {
      const contRes  = await fetch('https://api.dropboxapi.com/2/files/list_folder/continue', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cursor })
      });
      if (!contRes.ok) break;
      const contData = await contRes.json();
      allEntries = allEntries.concat(contData.entries);
      cursor     = contData.has_more ? contData.cursor : null;
      if (!contData.has_more) break;
    }

    // 3. Filtrer og sortér
    const photos = allEntries
      .filter(e => e['.tag'] === 'file' && /\.(jpg|jpeg|png|heic|gif|mov|mp4)$/i.test(e.name))
      .sort((a, b) => b.server_modified.localeCompare(a.server_modified))
      .map(e => ({ name: e.name, path: e.path_lower, modified: e.server_modified }));

    return { statusCode: 200, headers, body: JSON.stringify({ photos, total: photos.length }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
