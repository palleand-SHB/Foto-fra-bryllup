// netlify/functions/get-dropbox-photos.js
// Serverless function der henter billedlisten fra Dropbox og returnerer midlertidige links.
// Løser CORS-problemet: Dropbox's API tillader ikke direkte browser-kald til list_folder.

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

  // Hent hemmeligheder fra environment variables
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

    // 2. Hent filliste fra Dropbox
    const listRes = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        path: DROPBOX_FOLDER,
        recursive: false,
        include_media_info: false,
        limit: 200
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

    // 3. Filtrer til billeder og videoer, nyeste øverst
    const allEntries = listData.entries;
    const files = allEntries
      .filter(e => e['.tag'] === 'file' && /\.(jpg|jpeg|png|heic|gif|mov|mp4)$/i.test(e.name))
      .sort((a, b) => b.server_modified.localeCompare(a.server_modified));

    // Debug: gem info om hvad der faktisk er i mappen
    const debugInfo = {
      folder: DROPBOX_FOLDER,
      totalEntries: allEntries.length,
      allNames: allEntries.map(e => e.name),
      filteredCount: files.length
    };

    // 4. Hent midlertidigt link for hvert billede (parallelt)
    // Vi begrænser det til de 50 nyeste for at undgå timeout/throttling
    const filesToFetch = files.slice(0, 50);
    const photoErrors = [];

    const photoPromises = filesToFetch.map(async (file) => {
      try {
        const linkRes = await fetch('https://api.dropboxapi.com/2/files/get_temporary_link', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ path: file.path_lower })
        });

        if (!linkRes.ok) {
          const errText = await linkRes.text();
          photoErrors.push({ name: file.name, error: errText, status: linkRes.status });
          return null;
        }
        const linkData = await linkRes.json();

        return {
          name: file.name,
          url:  linkData.link,
          modified: file.server_modified
        };
      } catch (err) {
        photoErrors.push({ name: file.name, error: err.message });
        return null;
      }
    });

    const photos = (await Promise.all(photoPromises)).filter(Boolean);

    // Opdater debug info
    debugInfo.fetchErrors = photoErrors.slice(0, 5); // Kun de første par stykker for ikke at fylde for meget
    debugInfo.actualPhotoCount = photos.length;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        photos, 
        debug: debugInfo,
        error: photos.length === 0 && photoErrors.length > 0 ? photoErrors[0].error : null 
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
