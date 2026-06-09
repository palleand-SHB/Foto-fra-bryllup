// netlify/functions/photo-link.js
// Returnerer ét midlertidigt Dropbox-link for én enkelt fil.
// Kaldes lazy per billede efterhånden som brugeren scroller.
// Param: ?path=/bryllup-mette-og-palle/foto.jpg

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

  const path = (event.queryStringParameters || {}).path;
  if (!path) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Mangler ?path=' }) };
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

    // 2. Hent midlertidigt link for denne ene fil
    const linkRes  = await fetch('https://api.dropboxapi.com/2/files/get_temporary_link', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path })
    });
    if (!linkRes.ok) {
      const err = await linkRes.text();
      return { statusCode: linkRes.status, headers, body: JSON.stringify({ error: err }) };
    }
    const linkData = await linkRes.json();

    return { statusCode: 200, headers, body: JSON.stringify({ url: linkData.link }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
