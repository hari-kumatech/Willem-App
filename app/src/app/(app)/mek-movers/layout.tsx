import { MoversWorkspace } from '@/components/movers/MoversWorkspace';
import { canWrite, requireUser } from '@/lib/auth';

// One workspace for all MEK Movers sections: the app frames stay loaded while you switch between menu items.
export default async function MekMoversLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <>
      {children}
      <MoversWorkspace canWrite={canWrite(user)} />
    </>
  );
}
