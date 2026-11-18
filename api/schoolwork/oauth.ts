import {
  loadAutomationConfig,
  resolveCredentials,
  runAutomatedSchoolworkPipeline,
  saveAutomationConfig,
} from '../../src/schoolwork/cloudSyncRunner.js';

function getRedirectUri(request: Request): string {
  const url = new URL(request.url);
  return `${url.origin}/api/schoolwork/oauth`;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  const code = url.searchParams.get('code');
  const oauthError = url.searchParams.get('error');

  const cfg = await loadAutomationConfig();
  const creds = resolveCredentials(cfg);
  const redirectUri = getRedirectUri(request);

  if (oauthError) {
    return Response.redirect(
      `${url.origin}/?schoolworkError=${encodeURIComponent(oauthError)}`,
      302
    );
  }

  if (action === 'start') {
    if (!creds.googleClientId || !creds.googleClientSecret) {
      return Response.json(
        {
          ok: false,
          error:
            'Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel Env Vars (or save them in Settings) before starting OAuth.',
        },
        { status: 400 }
      );
    }

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', creds.googleClientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set(
      'scope',
      [
        'https://www.googleapis.com/auth/presentations.readonly',
        'https://www.googleapis.com/auth/spreadsheets.readonly',
        'https://www.googleapis.com/auth/userinfo.email',
      ].join(' ')
    );

    return Response.redirect(authUrl.toString(), 302);
  }

  if (code) {
    if (!creds.googleClientId || !creds.googleClientSecret) {
      return Response.json(
        { ok: false, error: 'Missing Google Client ID/Secret during OAuth callback.' },
        { status: 400 }
      );
    }

    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: creds.googleClientId,
        client_secret: creds.googleClientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });

    const tokenData = (await tokenResp.json()) as {
      access_token?: string;
      refresh_token?: string;
      error_description?: string;
    };

    if (!tokenResp.ok || !tokenData.access_token) {
      return Response.json(
        {
          ok: false,
          error: tokenData.error_description || 'OAuth code exchange failed',
        },
        { status: 400 }
      );
    }

    if (tokenData.refresh_token) {
      cfg.googleRefreshToken = tokenData.refresh_token;
    }

    try {
      const userResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (userResp.ok) {
        const userJson = (await userResp.json()) as { email?: string };
        if (userJson.email) cfg.connectedEmail = userJson.email;
      }
    } catch {
      // Ignore email lookup failure
    }

    await saveAutomationConfig(cfg);

    // Run initial extraction immediately if Gemini key is ready
    if (creds.geminiApiKey) {
      try {
        await runAutomatedSchoolworkPipeline({ forceExtract: true });
      } catch {
        // Non-fatal on redirect
      }
    }

    return Response.redirect(`${url.origin}/?schoolworkConnected=1`, 302);
  }

  return Response.json({ ok: true, redirectUri });
}
