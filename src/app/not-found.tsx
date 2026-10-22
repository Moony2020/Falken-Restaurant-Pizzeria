import Link from "next/link";
import { buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="wrap flex flex-col items-center gap-5 py-28 text-center">
      <p className="font-display text-8xl font-medium text-gold">404</p>
      <h1 className="text-4xl font-medium uppercase">Sidan hittades inte</h1>
      <p className="max-w-md text-muted">Länken kan vara gammal eller felstavad. Gå tillbaka till startsidan eller se menyn.</p>
      <div className="flex gap-3">
        <Link href="/" className={buttonClass("ink")}>
          Startsidan
        </Link>
        <Link href="/meny" className={buttonClass("gold")}>
          Se menyn
        </Link>
      </div>
    </div>
  );
}
