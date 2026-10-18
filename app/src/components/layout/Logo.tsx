// MEK logo: white on the dark theme, navy on the light theme
export function Logo({ className = 'h-8 w-auto' }: { className?: string }) {
  return (
    <>
      <img src="/brand/mek-logo-wit.svg" alt="MEK" className={`${className} hidden dark:block`} />
      <img src="/brand/mek-logo-navy.svg" alt="MEK" className={`${className} block dark:hidden`} />
    </>
  );
}
