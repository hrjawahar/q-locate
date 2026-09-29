import { LogoMark } from '../components/Logo'

export default function ComingSoon() {
  return (
    <main className="min-h-full flex flex-col items-center justify-center gap-5 px-6 text-center">
      <LogoMark size={96} />
      <h1 className="m-0 font-display text-5xl font-bold tracking-tight">
        <span className="text-forest">Q</span><span className="text-saffron">-</span>Locate
      </h1>
      <p className="m-0 text-sm font-semibold uppercase tracking-[0.28em] text-muted">Quick location guide</p>
      <p className="m-0 mt-4 text-lg">Places and temples, verified and easy to find. Coming soon.</p>
    </main>
  )
}
