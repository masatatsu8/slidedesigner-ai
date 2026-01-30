
// Google Drive API Configuration
export const DEFAULT_CLIENT_ID = '402728492148-mthtiv56q69ea20p65c3rchh017opqeb.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

let tokenClient: any;
let accessToken: string | null = null;
let tokenExpirationTime: number = 0;
let appFolderId: string | null = null; // Cache for the dynamic folder ID

export const getStoredClientId = (): string => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('google_client_id') || DEFAULT_CLIENT_ID;
  }
  return DEFAULT_CLIENT_ID;
};

export const setStoredClientId = (id: string) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('google_client_id', id);
  }
};

/**
 * Initializes the Google Identity Services Token Client.
 * @param onTokenCallback Callback function to execute when a token is received.
 */
export const initGoogleAuth = (onTokenCallback: (token: string, expiresIn: number) => void) => {
  if (typeof window === 'undefined' || !(window as any).google) {
    console.error("Google Identity Services script not loaded.");
    return;
  }

  const clientId = getStoredClientId();

  tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    callback: (tokenResponse: any) => {
      if (tokenResponse && tokenResponse.access_token) {
        accessToken = tokenResponse.access_token;
        // expires_in is in seconds. Calculate absolute expiration time (minus 5 seconds buffer)
        const expiresIn = parseInt(tokenResponse.expires_in, 10);
        tokenExpirationTime = Date.now() + (expiresIn * 1000);
        
        onTokenCallback(accessToken!, expiresIn);
      }
    },
  });
};

/**
 * Triggers the OAuth flow to request an access token.
 */
export const requestAccessToken = () => {
  if (!tokenClient) {
    console.error("Token client not initialized. Call initGoogleAuth first.");
    return;
  }
  // Prompting behavior: force select account if needed, otherwise often skips if recently signed in
  tokenClient.requestAccessToken({ prompt: '' });
};

/**
 * Checks if the user is currently authenticated and the token is not expired.
 */
export const isAuthenticated = (): boolean => {
  return !!accessToken && Date.now() < tokenExpirationTime;
};

/**
 * Converts a Base64 string to a Blob.
 */
const base64ToBlob = (base64: string, mimeType: string): Blob => {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
};

/**
 * Finds or creates the 'InfographAI' folder in the user's Drive.
 * Uses the 'drive.file' scope, so it can only see folders created by this app.
 */
export const getAppFolderId = async (): Promise<string> => {
  if (appFolderId) return appFolderId;
  if (!isAuthenticated()) throw new Error("Drive connection expired.");

  // 1. Search for existing folder
  const q = "mimeType='application/vnd.google-apps.folder' and name='InfographAI' and trashed=false";
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}`;
  
  const res = await fetch(searchUrl, { 
    headers: { Authorization: `Bearer ${accessToken}` } 
  });
  
  if (!res.ok) {
    throw new Error("Failed to search Drive folders");
  }
  
  const data = await res.json();
  
  if (data.files && data.files.length > 0) {
    appFolderId = data.files[0].id;
    return appFolderId!;
  }

  // 2. Create folder if not found
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'InfographAI',
      mimeType: 'application/vnd.google-apps.folder'
    })
  });

  if (!createRes.ok) {
    throw new Error("Failed to create Drive folder");
  }

  const createData = await createRes.json();
  appFolderId = createData.id;
  return appFolderId!;
};

/**
 * Returns the URL to the app's folder or the root if not yet determined.
 */
export const getDriveFolderUrl = (): string => {
  return appFolderId 
    ? `https://drive.google.com/drive/folders/${appFolderId}` 
    : 'https://drive.google.com/drive/my-drive';
};

/**
 * Uploads an image to Google Drive using the multipart/related upload method.
 * @param base64Data The raw base64 data of the image.
 * @param fileName The desired file name.
 */
export const uploadImageToDrive = async (base64Data: string, fileName: string): Promise<any> => {
  if (!isAuthenticated()) {
    throw new Error("Drive connection expired. Please reconnect.");
  }

  // Dynamically get or create the folder
  const folderId = await getAppFolderId();

  const metadata = {
    name: fileName,
    parents: [folderId],
    mimeType: 'image/png'
  };

  const blob = base64ToBlob(base64Data, 'image/png');
  
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob);

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
    body: form
  });

  if (response.status === 401) {
    accessToken = null; // Clear invalid token
    throw new Error("Drive authorization expired. Please reconnect.");
  }

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Drive Upload Failed: ${errorData.error?.message || response.statusText}`);
  }

  return response.json();
};
