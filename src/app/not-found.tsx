import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center px-4 text-center">
      <div>
        <p className="text-sm font-semibold text-brand-600">404</p>
        <h1 className="mt-2 text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-ink-muted">The page or proposal you are looking for doesn&apos;t exist or you don&apos;t have access to it.</p>
        <Link href="/" className="mt-6 inline-block rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">Back to dashboard</Link>
      </div>
    </div>
  );
}
