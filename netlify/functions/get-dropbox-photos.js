// netlify/functions/get-dropbox-photos.js  v4 – pagineret
// Serverless function der henter billedlisten fra Dropbox og returnerer midlertidige links.
// Understøtter paginering via ?offset=0&limit=30 så vi altid er indenfor Netlify's timeout.

const DROPBOX_FOLDER = '/Bryllup-Mette-og-Palle';

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const clientId     = process.env.DROPBOX_CLIENT_ID;
  const clientSecret = process.env.DROPBOX_CLIENT_SECRET;
  const refreshToken = process.env.DROPBOX_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Miljøvariable mangler på Netlify.' })
    };
  }

  // Paginerings-parametre
  const qs     = event.queryStringParameters || {};
  const offset = Math.max(0, parseInt(qs.offset || '0', 10));
  const limit  = Math.min(50, Math.max(1, parseInt(qs.limit || '30', 10)));

  try {
    // 1. Hent access token via refresh token
    const tokenParams = new URLSearchParams();
    tokenParams.append('grant_type', 'refresh_token');
    tokenParams.append('refresh_token', refreshToken);
    tokenParams.append('client_id', clientId);
    tokenParams.append('client_secret', clientSecret);

    const tokenRes = await fetch('https://api.dropbox.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString()
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      return {
        statusCode: tokenRes.status,
        headers,
        body: JSON.stringify({ error: tokenData.error_description || 'Token fejl' })
      };
    }

    const accessToken = tokenData.access_token;

    // 2. Hent ALLE fil-metadata (rekursivt, med paginering)
    let allEntries = [];
    let hasMoreFiles = true;
    let cursor = null;

    const listRes = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        path: DROPBOX_FOLDER,
        recursive: true,
        include_media_info: false,
        limit: 2000
      })
    });

    if (!listRes.ok) {
      const errText = await listRes.text();
      return {
        statusCode: listRes.status,
        headers,
        body: JSON.stringify({ error: `list_folder fejl: ${errText}` })
      };
    }

    const listData = await listRes.json();
    allEntries = listData.entries;
    hasMoreFiles = listData.has_more;
    cursor = listData.cursor;

    while (hasMoreFiles && cursor) {
      const contRes = await fetch('https://api.dropboxapi.com/2/files/list_folder/continue', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ cursor })
      });

      if (!contRes.ok) break;

      const contData = await contRes.json();
      allEntries = allEntries.concat(contData.entries);
      hasMoreFiles = contData.has_more;
      cursor = contData.cursor;
    }

    // 3. Filtrer til billeder og videoer, nyeste øverst
    const files = allEntries
      .filter(e => e['.tag'] === 'file' && /\.(jpg|jpeg|png|heic|gif|mov|mp4)$/i.test(e.name))
      .sort((a, b) => b.server_modified.localeCompare(a.server_modified));

    const total = files.length;

    // 4. Tag kun den ønskede side
    const pageFiles = files.slice(offset, offset + limit);

    // 5. Hent midlertidigt link KUN for denne sides billeder (parallelt – lille batch)
    const photos = (await Promise.all(pageFiles.map(async (file) => {
      try {
        const linkRes = await fetch('https://api.dropboxapi.com/2/files/get_temporary_link', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ path: file.path_lower })
        });

        if (!linkRes.ok) return null;
        const linkData = await linkRes.json();

        return {
          name:     file.name,
          url:      linkData.link,
          modified: file.server_modified
        };
      } catch {
        return null;
      }
    }))).filter(Boolean);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        photos,
        total,
        hasMore: offset + limit < total
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Serverfejl: ' + error.message })
    };
  }
};
