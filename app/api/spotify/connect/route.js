import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/http';
import { spotifyAuthorizeUrl } from '@/services/spotify';
export async function GET(){const auth=await requireApiUser(['teacher','admin'],{permission:'music.manage'});if(auth.error)return auth.error;return NextResponse.redirect(spotifyAuthorizeUrl(auth.user.id));}
