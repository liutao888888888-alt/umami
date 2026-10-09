import { finishGoogleOAuth } from '@/lib/google-oauth';

export async function GET(request: Request) {
  return finishGoogleOAuth(request);
}
