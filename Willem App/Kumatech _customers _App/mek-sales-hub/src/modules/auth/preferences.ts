'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

// Presentation mode: hides internal figures (margins, scores, notes) in front of a customer (B.2)
export async function setPresentationMode(on: boolean) {
  (await cookies()).set('mek-presentation', on ? 'on' : 'off', { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 });
  revalidatePath('/', 'layout');
}
