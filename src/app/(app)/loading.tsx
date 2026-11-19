// Shown inside the app shell while a page's server data loads.
export default function AppLoading() {
  return (
    <div className="flex min-h-[40dvh] items-center justify-center" role="status" aria-live="polite">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-teal-400/30 border-t-teal-400" aria-hidden />
      <span className="sr-only">…</span>
    </div>
  );
}
